import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn } from 'node:child_process';
import {
  createHash,
  type KeyObject,
  randomUUID,
  sign as signPayload,
  verify as verifyPayload,
} from 'node:crypto';

const REDACTED = '[REDACTED]';
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const ENVIRONMENT_VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CREDENTIAL_PATTERNS: Array<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern:
      /\b(?:gh[pousr]|github_pat|hvwk|sk|xox[baprs])_[A-Za-z0-9_-]{16,}\b/gi,
    replacement: REDACTED,
  },
  {
    pattern: /\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
    replacement: REDACTED,
  },
  {
    pattern:
      /((?:authorization|credential|password|secret|token)\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi,
    replacement: `$1${REDACTED}`,
  },
];
let environmentLock: Promise<void> = Promise.resolve();
const environmentLockContext = new AsyncLocalStorage<boolean>();

async function withEnvironmentLock<T>(
  operation: () => T | Promise<T>,
): Promise<T> {
  if (environmentLockContext.getStore()) {
    throw new CustodyError(
      'REENTRANT_ENVIRONMENT_INJECTION',
      'inject',
      'Nested environment credential injection is not allowed',
    );
  }
  const previous = environmentLock;
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  environmentLock = queued;
  await previous;
  try {
    return await environmentLockContext.run(true, operation);
  } finally {
    release();
    if (environmentLock === queued) environmentLock = Promise.resolve();
  }
}

export type CredentialIssuanceMode = 'ephemeral' | 'durable';
export type CustodyStage =
  | 'issue'
  | 'store'
  | 'retrieve'
  | 'verify'
  | 'activate'
  | 'record'
  | 'inject'
  | 'revoke'
  | 'reconcile';

export class CustodyError extends Error {
  readonly code: string;
  readonly stage: CustodyStage;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    stage: CustodyStage,
    message: string,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(redactCredentialText(message));
    this.name = 'CustodyError';
    this.code =
      SAFE_IDENTIFIER.test(code) && redactCredentialText(code) === code
        ? code
        : 'INVALID_CUSTODY_ERROR_CODE';
    this.stage = stage;
    this.details = options?.details
      ? (redactCredentialValues(options.details) as Record<string, unknown>)
      : undefined;
    // Raw provider causes are deliberately not retained: Node's Error
    // inspection prints non-enumerable causes and can expose credentials.
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      stage: this.stage,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class SecretMaterial {
  #bytes: Buffer;
  #destroyed = false;

  private constructor(value: string) {
    this.#bytes = Buffer.from(value, 'utf8');
  }

  static fromString(value: string): SecretMaterial {
    if (!value) {
      throw new CustodyError(
        'EMPTY_SECRET_MATERIAL',
        'issue',
        'Secret material must not be empty',
      );
    }
    return new SecretMaterial(value);
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  async use(operation: (value: string) => void | Promise<void>): Promise<void> {
    if (this.#destroyed) {
      throw new CustodyError(
        'SECRET_MATERIAL_DESTROYED',
        'inject',
        'Secret material is no longer available',
      );
    }
    const plaintext = this.#bytes.toString('utf8');
    try {
      await operation(plaintext);
    } catch (cause) {
      if (cause instanceof CustodyError) {
        throw new CustodyError(
          redactCredentialText(cause.code, [plaintext]) === cause.code
            ? cause.code
            : 'INVALID_CUSTODY_ERROR_CODE',
          cause.stage,
          redactCredentialText(cause.message, [plaintext]),
          {
            details: redactCredentialValues(cause.details, [plaintext]) as
              | Record<string, unknown>
              | undefined,
          },
        );
      }
      throw new CustodyError(
        'SECRET_MATERIAL_OPERATION_FAILED',
        'inject',
        'Secret material operation failed',
        { cause },
      );
    }
  }

  destroy(): void {
    this.#bytes.fill(0);
    this.#destroyed = true;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

export interface CredentialIssueRequest {
  mode: CredentialIssuanceMode;
  subject: string;
  expiresAt?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface IssuedCredential {
  credentialId: string;
  secret: SecretMaterial;
  issuedAt?: string;
  expiresAt?: string;
}

export interface CredentialIssuer {
  readonly name: string;
  issue(request: CredentialIssueRequest): Promise<IssuedCredential>;
  /** Must be idempotent so failed custody transitions can be retried. */
  revoke(credentialId: string, reason: string): Promise<void>;
}

export interface CredentialVerifier {
  readonly name: string;
  verify(input: {
    credentialId: string;
    secret: SecretMaterial;
  }): Promise<{ verified: boolean; verificationId?: string }>;
}

export interface SecretSinkRecord {
  sinkName: string;
  reference: string;
  version: string;
  storedAt: string;
}

export interface SecretSinkInventoryEntry extends SecretSinkRecord {
  credentialId: string;
}

export interface CredentialSecretSink {
  readonly name: string;
  store(input: {
    credentialId: string;
    secret: SecretMaterial;
    metadata: Readonly<Record<string, string>>;
  }): Promise<SecretSinkRecord>;
  retrieve(record: SecretSinkRecord): Promise<SecretMaterial>;
  /**
   * Removes any write for this credential, including a store that persisted
   * data but failed before returning its record. Must be idempotent.
   */
  removeByCredentialId(credentialId: string, reason: string): Promise<void>;
  /** Must conditionally remove this exact version and be idempotent. */
  remove(record: SecretSinkRecord, reason: string): Promise<void>;
  inventory(): Promise<SecretSinkInventoryEntry[]>;
}

export interface CustodyAttribution {
  actor: string;
  runtime: string;
  session: string;
}

export interface CustodyReceipt {
  receiptId: string;
  mode: CredentialIssuanceMode;
  credentialId: string;
  subject: string;
  issuer: string;
  verifier: string;
  verificationId?: string;
  verificationState: 'verified';
  issuedAt: string;
  verifiedAt: string;
  expiresAt?: string;
  sink?: SecretSinkRecord;
  replacesReceiptId?: string;
  rotationRootReceiptId: string;
  attribution: CustodyAttribution;
  metadata: Readonly<Record<string, string>>;
  finalizer: string;
  finalizationId: string;
  attestation: CustodyReceiptAttestation;
}

export interface CustodyReceiptAttestation {
  algorithm: 'Ed25519';
  attestor: string;
  keyId: string;
  signature: string;
}

export interface CredentialReceiptAttestor {
  readonly name: string;
  readonly keyId: string;
  attest(payload: string): Promise<string>;
}

export interface CredentialCustodyFinalizer {
  readonly name: string;
  prepare(input: {
    receipt: CustodyReceipt;
    secret: SecretMaterial;
  }): Promise<{ prepared: boolean }>;
  commit(input: { receipt: CustodyReceipt }): Promise<void>;
  abort(input: { receipt: CustodyReceipt; reason: string }): Promise<void>;
  status(input: {
    receipt: CustodyReceipt;
  }): Promise<'missing' | 'prepared' | 'committed' | 'aborted'>;
}

export class Ed25519CustodyReceiptAttestor
  implements CredentialReceiptAttestor
{
  readonly name: string;
  readonly keyId: string;
  readonly #privateKey: KeyObject;

  constructor(options: {
    privateKey: KeyObject;
    keyId: string;
    name?: string;
  }) {
    if (
      options.privateKey.type !== 'private' ||
      options.privateKey.asymmetricKeyType !== 'ed25519'
    ) {
      throw new CustodyError(
        'INVALID_ATTESTATION_KEY',
        'record',
        'Custody attestation requires a private signing key',
      );
    }
    this.#privateKey = options.privateKey;
    this.name = options.name ?? 'ed25519';
    this.keyId = options.keyId;
    assertSafeIdentifier(this.name, 'attestor.name', 'record');
    assertSafeIdentifier(this.keyId, 'attestor.keyId', 'record');
  }

  async attest(payload: string): Promise<string> {
    return signPayload(null, Buffer.from(payload), this.#privateKey).toString(
      'base64url',
    );
  }
}

export type CustodyEventType =
  | 'issued'
  | 'revoked'
  | 'expired'
  | 'replaced'
  | 'rollback-pending'
  | 'rollback-complete'
  | 'finalization-pending'
  | 'retirement-pending'
  | 'retirement-complete'
  | 'orphan-detected'
  | 'orphan-removed';

export interface CustodyEvent {
  eventId: string;
  type: CustodyEventType;
  occurredAt: string;
  receiptId?: string;
  recoveryId?: string;
  credentialId?: string;
  requiresSink?: boolean;
  finalizationReceipt?: CustodyReceipt;
  recoveryReceipt?: CustodyReceipt;
  replacementReceiptId?: string;
  sinkReference?: string;
  reason?: string;
}

export interface CustodyLedger {
  /**
   * Atomically records a receipt and its finalization-pending event.
   * Implementations must reject duplicate receipt IDs, terminal predecessors,
   * a second child for the same replacesReceiptId, and any other event type.
   */
  recordIssuance(receipt: CustodyReceipt, event: CustodyEvent): Promise<void>;
  /**
   * Idempotently appends the issued event and optional retirement-pending
   * followup in one transaction. No other event types are accepted.
   */
  commitIssuance(
    receiptId: string,
    event: CustodyEvent,
    followup?: CustodyEvent,
  ): Promise<void>;
  appendEvent(event: CustodyEvent): Promise<void>;
  listReceipts(): Promise<CustodyReceipt[]>;
  listEvents(): Promise<CustodyEvent[]>;
}

export class InMemoryCustodyLedger implements CustodyLedger {
  readonly #receipts: CustodyReceipt[] = [];
  readonly #events: CustodyEvent[] = [];

  async recordIssuance(
    receipt: CustodyReceipt,
    event: CustodyEvent,
  ): Promise<void> {
    if (event.type !== 'finalization-pending') {
      throw new CustodyError(
        'INVALID_CUSTODY_EVENT',
        'record',
        'Prepared receipt requires a finalization-pending event',
      );
    }
    if (this.#receipts.some((item) => item.receiptId === receipt.receiptId)) {
      throw new CustodyError(
        'DUPLICATE_CUSTODY_RECEIPT',
        'record',
        'Custody receipt already exists',
      );
    }
    if (receipt.replacesReceiptId) {
      const predecessor = this.#receipts.find(
        (item) => item.receiptId === receipt.replacesReceiptId,
      );
      const predecessorTerminal = this.#events.some(
        (item) =>
          item.receiptId === receipt.replacesReceiptId &&
          ['revoked', 'expired', 'replaced'].includes(item.type),
      );
      const predecessorIssued = this.#events.some(
        (item) =>
          item.receiptId === receipt.replacesReceiptId &&
          item.type === 'issued',
      );
      const existingChild = this.#receipts.some(
        (item) =>
          item.replacesReceiptId === receipt.replacesReceiptId &&
          !this.#events.some(
            (event) =>
              event.receiptId === item.receiptId &&
              ['revoked', 'expired', 'replaced'].includes(event.type),
          ),
      );
      if (
        !predecessor ||
        !predecessorIssued ||
        predecessorTerminal ||
        existingChild
      ) {
        throw new CustodyError(
          'CUSTODY_ROTATION_CONFLICT',
          'record',
          'Custody predecessor is not active and replaceable',
        );
      }
    }
    this.#receipts.push(structuredClone(receipt));
    this.#events.push(structuredClone(event));
  }

  async appendEvent(event: CustodyEvent): Promise<void> {
    this.#events.push(structuredClone(event));
  }

  async commitIssuance(
    receiptId: string,
    event: CustodyEvent,
    followup?: CustodyEvent,
  ): Promise<void> {
    if (
      event.type !== 'issued' ||
      (followup !== undefined && followup.type !== 'retirement-pending')
    ) {
      throw new CustodyError(
        'INVALID_CUSTODY_EVENT',
        'record',
        'Issuance commit requires issued and optional retirement-pending events',
      );
    }
    if (!this.#receipts.some((receipt) => receipt.receiptId === receiptId)) {
      throw new CustodyError(
        'CUSTODY_RECEIPT_NOT_FOUND',
        'record',
        'Prepared custody receipt was not found',
      );
    }
    if (
      !this.#events.some(
        (item) => item.receiptId === receiptId && item.type === 'issued',
      )
    ) {
      this.#events.push(structuredClone(event));
      if (followup) this.#events.push(structuredClone(followup));
    }
  }

  async listReceipts(): Promise<CustodyReceipt[]> {
    return structuredClone(this.#receipts);
  }

  async listEvents(): Promise<CustodyEvent[]> {
    return structuredClone(this.#events);
  }
}

export interface CredentialLease {
  readonly receipt: CustodyReceipt;
  withEnvironment(
    variableName: string,
    operation: () => void | Promise<void>,
  ): Promise<void>;
  withChildProcess(
    options: CredentialChildProcessOptions,
  ): Promise<CredentialChildProcessResult>;
  revoke(reason?: string): Promise<void>;
}

export interface CredentialChildProcessOptions {
  /**
   * Acknowledges that the command and every credential-bearing descendant are
   * trusted to remain in the SDK-owned POSIX process group.
   */
  trust: 'cooperative-process-group';
  command: string;
  args?: readonly string[];
  environmentVariable: string;
  environment?: Readonly<Record<string, string>>;
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface CredentialChildProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface CustodyReconciliation {
  checkedAt: string;
  orphaned: SecretSinkInventoryEntry[];
  missing: CustodyReceipt[];
}

export interface CredentialCustodyOptions {
  issuer: CredentialIssuer;
  verifier: CredentialVerifier;
  ledger: CustodyLedger;
  attestor: CredentialReceiptAttestor;
  finalizer: CredentialCustodyFinalizer;
  sink?: CredentialSecretSink;
  ephemeralTtlMs?: number;
  ephemeralRevokeRetryMs?: number;
  orphanGraceMs?: number;
  finalizationTakeoverMs?: number;
  now?: () => Date;
  onBackgroundError?: (error: CustodyError) => void;
}

export interface CustodyIssuanceRequest {
  mode: CredentialIssuanceMode;
  subject: string;
  attribution: CustodyAttribution;
  expiresAt?: string;
  metadata?: Readonly<Record<string, string>>;
  replacesReceiptId?: string;
}

export class CredentialCustody {
  readonly #issuer: CredentialIssuer;
  readonly #verifier: CredentialVerifier;
  readonly #ledger: CustodyLedger;
  readonly #attestor: CredentialReceiptAttestor;
  readonly #finalizer: CredentialCustodyFinalizer;
  readonly #sink?: CredentialSecretSink;
  readonly #ephemeralTtlMs: number;
  readonly #ephemeralRevokeRetryMs: number;
  readonly #orphanGraceMs: number;
  readonly #finalizationTakeoverMs: number;
  readonly #now: () => Date;
  readonly #onBackgroundError?: (error: CustodyError) => void;
  readonly #leaseInvalidators = new Map<string, () => void>();
  readonly #pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(options: CredentialCustodyOptions) {
    assertSafeIdentifier(options.issuer.name, 'issuer.name', 'issue');
    assertSafeIdentifier(options.verifier.name, 'verifier.name', 'verify');
    assertSafeIdentifier(options.attestor.name, 'attestor.name', 'record');
    assertSafeIdentifier(options.attestor.keyId, 'attestor.keyId', 'record');
    assertSafeIdentifier(options.finalizer.name, 'finalizer.name', 'activate');
    if (options.sink) {
      assertSafeIdentifier(options.sink.name, 'sink.name', 'store');
    }
    this.#issuer = options.issuer;
    this.#verifier = options.verifier;
    this.#ledger = options.ledger;
    this.#attestor = options.attestor;
    this.#finalizer = options.finalizer;
    this.#sink = options.sink;
    this.#ephemeralTtlMs = options.ephemeralTtlMs ?? 5 * 60_000;
    this.#ephemeralRevokeRetryMs = options.ephemeralRevokeRetryMs ?? 1_000;
    this.#orphanGraceMs = options.orphanGraceMs ?? 5 * 60_000;
    this.#finalizationTakeoverMs = options.finalizationTakeoverMs ?? 30_000;
    if (
      !Number.isFinite(this.#ephemeralTtlMs) ||
      !Number.isFinite(this.#ephemeralRevokeRetryMs) ||
      !Number.isFinite(this.#orphanGraceMs) ||
      !Number.isFinite(this.#finalizationTakeoverMs) ||
      this.#ephemeralTtlMs <= 0 ||
      this.#ephemeralRevokeRetryMs <= 0 ||
      this.#orphanGraceMs < 0 ||
      this.#finalizationTakeoverMs < 0
    ) {
      throw new CustodyError(
        'INVALID_CUSTODY_DURATION',
        'issue',
        'Custody durations must be positive',
      );
    }
    this.#now = options.now ?? (() => new Date());
    this.#onBackgroundError = options.onBackgroundError;
  }

  async issue(request: CustodyIssuanceRequest): Promise<CredentialLease> {
    if (request.mode === 'durable' && !this.#sink) {
      throw new CustodyError(
        'DURABLE_SINK_REQUIRED',
        'store',
        'Durable credential issuance requires a secret sink',
      );
    }
    if (request.replacesReceiptId && request.mode !== 'durable') {
      throw new CustodyError(
        'DURABLE_ROTATION_REQUIRED',
        'issue',
        'Credential replacement requires durable mode',
      );
    }
    assertSafeIdentifier(request.subject, 'subject', 'issue');
    assertAttribution(request.attribution);
    const replacedReceipt = request.replacesReceiptId
      ? await this.#findReceipt(request.replacesReceiptId)
      : undefined;
    if (
      replacedReceipt?.mode !== undefined &&
      replacedReceipt.mode !== 'durable'
    ) {
      throw new CustodyError(
        'DURABLE_ROTATION_REQUIRED',
        'issue',
        'Only durable credentials can be replaced',
      );
    }

    const now = this.#now();
    const expiresAt =
      request.expiresAt ??
      (request.mode === 'ephemeral'
        ? new Date(now.getTime() + this.#ephemeralTtlMs).toISOString()
        : undefined);
    const requestedExpiryMs = expiresAt
      ? parseTimestamp(expiresAt, 'expiresAt', 'issue')
      : undefined;
    if (requestedExpiryMs !== undefined && requestedExpiryMs <= now.getTime())
      throw new CustodyError(
        'INVALID_EXPIRY',
        'issue',
        'Credential expiry must be in the future',
      );

    const metadata = sanitizeMetadata(request.metadata);
    let issued: IssuedCredential | undefined;
    let sinkRecord: SecretSinkRecord | undefined;
    let retrieved: SecretMaterial | undefined;
    let preparedReceipt: CustodyReceipt | undefined;
    let receiptRecorded = false;
    let stage: CustodyStage = 'issue';

    try {
      issued = await this.#issuer.issue({
        mode: request.mode,
        subject: request.subject,
        expiresAt,
        metadata,
      });
      assertSafeIdentifier(issued.credentialId, 'credentialId', 'issue');
      if (issued.issuedAt) parseTimestamp(issued.issuedAt, 'issuedAt', 'issue');
      if (issued.expiresAt) {
        const providerExpiryMs = parseTimestamp(
          issued.expiresAt,
          'provider expiresAt',
          'issue',
        );
        if (providerExpiryMs <= now.getTime()) {
          throw new CustodyError(
            'INVALID_EXPIRY',
            'issue',
            'Credential provider returned an expired credential',
          );
        }
        if (
          requestedExpiryMs !== undefined &&
          providerExpiryMs > requestedExpiryMs
        ) {
          throw new CustodyError(
            'EXPIRY_BOUND_EXCEEDED',
            'issue',
            'Credential provider exceeded the requested expiry bound',
          );
        }
      }

      let material = issued.secret;
      if (request.mode === 'durable') {
        const sink = this.#sink;
        if (!sink) {
          throw new CustodyError(
            'DURABLE_SINK_REQUIRED',
            'store',
            'Durable credential issuance requires a secret sink',
          );
        }
        stage = 'store';
        sinkRecord = await sink.store({
          credentialId: issued.credentialId,
          secret: issued.secret,
          metadata,
        });
        assertSinkRecord(sinkRecord, sink.name);

        stage = 'retrieve';
        retrieved = await sink.retrieve(sinkRecord);
        material = retrieved;
      }

      stage = 'verify';
      const verification = await this.#verifier.verify({
        credentialId: issued.credentialId,
        secret: material,
      });
      if (!verification.verified) {
        throw new CustodyError(
          'CREDENTIAL_VERIFICATION_FAILED',
          'verify',
          'Credential verification failed',
        );
      }
      if (verification.verificationId) {
        assertSafeIdentifier(
          verification.verificationId,
          'verificationId',
          'verify',
        );
      }
      const receiptId = randomUUID();
      const finalizationId = randomUUID();
      const unsignedReceipt: Omit<CustodyReceipt, 'attestation'> = {
        receiptId,
        mode: request.mode,
        credentialId: issued.credentialId,
        subject: request.subject,
        issuer: this.#issuer.name,
        verifier: this.#verifier.name,
        ...(verification.verificationId
          ? { verificationId: verification.verificationId }
          : {}),
        verificationState: 'verified',
        issuedAt: issued.issuedAt ?? now.toISOString(),
        verifiedAt: this.#now().toISOString(),
        ...((issued.expiresAt ?? expiresAt)
          ? { expiresAt: issued.expiresAt ?? expiresAt }
          : {}),
        ...(sinkRecord ? { sink: sinkRecord } : {}),
        ...(request.replacesReceiptId
          ? { replacesReceiptId: request.replacesReceiptId }
          : {}),
        rotationRootReceiptId:
          replacedReceipt?.rotationRootReceiptId ?? receiptId,
        attribution: { ...request.attribution },
        metadata,
        finalizer: this.#finalizer.name,
        finalizationId,
      };

      stage = 'record';
      let signature = '';
      await material.use(async (plaintext) => {
        signature = await this.#attestor.attest(
          custodyAttestationPayload(
            unsignedReceipt,
            credentialCommitment(plaintext),
            {
              algorithm: 'Ed25519',
              attestor: this.#attestor.name,
              keyId: this.#attestor.keyId,
            },
          ),
        );
      });
      if (
        !/^[A-Za-z0-9_-]{86}$/.test(signature) ||
        Buffer.from(signature, 'base64url').byteLength !== 64 ||
        Buffer.from(signature, 'base64url').toString('base64url') !==
          signature ||
        redactCredentialText(signature) !== signature
      ) {
        throw new CustodyError(
          'INVALID_CUSTODY_ATTESTATION',
          'record',
          'Custody attestor returned an invalid signature',
        );
      }
      const receipt: CustodyReceipt = {
        ...unsignedReceipt,
        attestation: {
          algorithm: 'Ed25519',
          attestor: this.#attestor.name,
          keyId: this.#attestor.keyId,
          signature,
        },
      };
      stage = 'record';
      await this.#ledger.recordIssuance(
        receipt,
        this.#event('finalization-pending', receiptId),
      );
      receiptRecorded = true;
      stage = 'activate';
      preparedReceipt = receipt;
      const activation = await this.#finalizer.prepare({
        receipt: structuredClone(receipt),
        secret: material,
      });
      if (!activation.prepared) {
        throw new CustodyError(
          'CREDENTIAL_ACTIVATION_FAILED',
          'activate',
          'Credential post-attestation activation failed',
        );
      }
      retrieved?.destroy();
      retrieved = undefined;
      if (request.mode === 'durable') issued.secret.destroy();
      stage = 'activate';
      await this.#finalizer.commit({ receipt: structuredClone(receipt) });
      stage = 'record';
      const retirementRecoveryId = replacedReceipt ? randomUUID() : undefined;
      const retirementPending =
        replacedReceipt && retirementRecoveryId
          ? {
              ...this.#event(
                'retirement-pending' as const,
                replacedReceipt.receiptId,
              ),
              eventId: retirementRecoveryId,
              recoveryId: retirementRecoveryId,
              credentialId: replacedReceipt.credentialId,
              recoveryReceipt: structuredClone(replacedReceipt),
              replacementReceiptId: receipt.receiptId,
            }
          : undefined;
      await this.#ledger.commitIssuance(
        receipt.receiptId,
        this.#event('issued', receipt.receiptId),
        retirementPending,
      );
      const lease = this.#createLease(
        receipt,
        request.mode === 'ephemeral' ? issued.secret : undefined,
      );
      if (replacedReceipt) {
        try {
          this.#leaseInvalidators.get(replacedReceipt.receiptId)?.();
          await this.#revokeReceipt(replacedReceipt, 'replaced', 'replaced');
          this.#leaseInvalidators.delete(replacedReceipt.receiptId);
          await this.#ledger.appendEvent({
            ...this.#event('retirement-complete', replacedReceipt.receiptId),
            recoveryId: retirementRecoveryId,
          });
        } catch (cause) {
          if (retirementRecoveryId) {
            this.#scheduleRetirement(
              retirementRecoveryId,
              replacedReceipt,
              receipt.receiptId,
            );
          }
          try {
            this.#onBackgroundError?.(
              new CustodyError(
                'PREDECESSOR_RETIREMENT_PENDING',
                'revoke',
                'Replacement is active while predecessor retirement retries',
                { cause, details: { recoveryId: retirementRecoveryId } },
              ),
            );
          } catch {
            // Observability cannot interrupt the active replacement.
          }
        }
      }
      preparedReceipt = undefined;
      return lease;
    } catch (cause) {
      const safeCause = await sanitizeCustodyCause(cause, [
        retrieved,
        issued?.secret,
      ]);
      retrieved?.destroy();
      issued?.secret.destroy();
      if (issued) {
        const requiresSink = request.mode === 'durable';
        try {
          if (receiptRecorded && preparedReceipt) {
            await this.#abortAndRevoke(
              preparedReceipt,
              `rollback after ${stage}`,
            );
          } else {
            await this.#rollback(
              issued.credentialId,
              sinkRecord,
              stage,
              requiresSink,
            );
          }
        } catch (rollbackCause) {
          const recoveryId = randomUUID();
          const pendingEvent: CustodyEvent = {
            ...this.#event(
              'rollback-pending',
              receiptRecorded ? preparedReceipt?.receiptId : undefined,
              sinkRecord?.reference,
              `rollback after ${stage}`,
            ),
            eventId: recoveryId,
            recoveryId,
            credentialId: issued.credentialId,
            requiresSink,
            finalizationReceipt: preparedReceipt
              ? structuredClone(preparedReceipt)
              : undefined,
          };
          try {
            await this.#ledger.appendEvent(pendingEvent);
          } catch {
            // Automatic in-process retry still proceeds if persistence fails.
          }
          this.#scheduleRollback(
            recoveryId,
            issued.credentialId,
            sinkRecord,
            stage,
            requiresSink,
            preparedReceipt,
            receiptRecorded,
          );
          throw new CustodyError(
            'CUSTODY_ROLLBACK_FAILED',
            'revoke',
            'Credential rollback is pending automatic retry',
            {
              cause: rollbackCause,
              details: {
                recoveryId,
                credentialId: issued.credentialId,
                requiresSink,
                failedStage: stage,
              },
            },
          );
        }
      }
      if (safeCause instanceof CustodyError) throw safeCause;
      throw new CustodyError(
        `CUSTODY_${stage.toUpperCase()}_FAILED`,
        stage,
        `Credential custody failed during ${stage}`,
        { cause: safeCause },
      );
    }
  }

  async rotate(
    receiptId: string,
    request: Omit<CustodyIssuanceRequest, 'mode' | 'replacesReceiptId'>,
  ): Promise<CredentialLease> {
    const previous = await this.#findReceipt(receiptId);
    if (previous.mode !== 'durable') {
      throw new CustodyError(
        'DURABLE_ROTATION_REQUIRED',
        'issue',
        'Only durable credentials can be rotated',
      );
    }
    return this.issue({
      ...request,
      mode: 'durable',
      replacesReceiptId: receiptId,
    });
  }

  async revoke(receiptId: string, reason = 'recovery'): Promise<void> {
    const receipt = await this.#findReceipt(receiptId);
    this.#leaseInvalidators.get(receiptId)?.();
    await this.#revokeReceipt(receipt, reason);
    this.#leaseInvalidators.delete(receiptId);
  }

  async recoverPendingRollbacks(): Promise<void> {
    const events = await this.#ledger.listEvents();
    const receipts = await this.#ledger.listReceipts();
    const activeIds = new Set(
      events
        .filter((event) => event.type === 'issued')
        .map((event) => event.receiptId),
    );
    const terminalIds = new Set(
      events
        .filter((event) =>
          ['revoked', 'expired', 'replaced'].includes(event.type),
        )
        .map((event) => event.receiptId),
    );
    const completedRollbackIds = new Set(
      events
        .filter((event) => event.type === 'rollback-complete')
        .map((event) => event.recoveryId),
    );
    const rollbackReceiptIds = new Set(
      events
        .filter(
          (event) =>
            event.type === 'rollback-pending' &&
            !completedRollbackIds.has(event.recoveryId),
        )
        .map((event) => event.receiptId),
    );
    const pendingByReceipt = new Map(
      events
        .filter(
          (event) => event.type === 'finalization-pending' && event.receiptId,
        )
        .map((event) => [event.receiptId, event]),
    );
    const takeoverCutoff = this.#now().getTime() - this.#finalizationTakeoverMs;
    const failures: string[] = [];
    for (const receipt of receipts.filter(
      (item) =>
        !activeIds.has(item.receiptId) &&
        !terminalIds.has(item.receiptId) &&
        !rollbackReceiptIds.has(item.receiptId) &&
        (() => {
          const pending = pendingByReceipt.get(item.receiptId);
          if (pending) {
            const pendingAt = parseTimestamp(
              pending.occurredAt,
              'occurredAt',
              'reconcile',
            );
            if (pendingAt > takeoverCutoff) {
              this.#scheduleFinalizationTakeover(
                item.finalizationId,
                pendingAt + this.#finalizationTakeoverMs,
              );
              return false;
            }
          }
          return (
            pending !== undefined &&
            parseTimestamp(pending.occurredAt, 'occurredAt', 'reconcile') <=
              takeoverCutoff
          );
        })(),
    )) {
      try {
        const status = await this.#finalizer.status({
          receipt: structuredClone(receipt),
        });
        if (status === 'committed') {
          const predecessor = receipt.replacesReceiptId
            ? receipts.find(
                (item) => item.receiptId === receipt.replacesReceiptId,
              )
            : undefined;
          const recoveryId = predecessor ? randomUUID() : undefined;
          await this.#ledger.commitIssuance(
            receipt.receiptId,
            this.#event('issued', receipt.receiptId),
            predecessor && recoveryId
              ? {
                  ...this.#event('retirement-pending', predecessor.receiptId),
                  eventId: recoveryId,
                  recoveryId,
                  credentialId: predecessor.credentialId,
                  recoveryReceipt: structuredClone(predecessor),
                  replacementReceiptId: receipt.receiptId,
                }
              : undefined,
          );
          activeIds.add(receipt.receiptId);
          if (predecessor && recoveryId) {
            this.#scheduleRetirement(
              recoveryId,
              predecessor,
              receipt.receiptId,
            );
          }
        } else {
          await this.#abortAndRevoke(
            receipt,
            'incomplete finalization recovery',
          );
        }
      } catch {
        failures.push(receipt.finalizationId);
        this.#scheduleRollback(
          receipt.finalizationId,
          receipt.credentialId,
          receipt.sink,
          'revoke',
          receipt.mode === 'durable',
          receipt,
          true,
        );
      }
    }
    for (const receipt of receipts.filter(
      (item) =>
        item.mode === 'ephemeral' &&
        activeIds.has(item.receiptId) &&
        !terminalIds.has(item.receiptId) &&
        item.expiresAt !== undefined,
    )) {
      try {
        const deadline = parseTimestamp(
          receipt.expiresAt ?? '',
          'expiresAt',
          'revoke',
        );
        if (deadline <= this.#now().getTime()) {
          await this.#revokeReceipt(
            receipt,
            'restart expiry recovery',
            'expired',
          );
        } else {
          this.#scheduleReceiptExpiry(receipt, deadline);
        }
      } catch {
        failures.push(receipt.receiptId);
      }
    }
    const completed = new Set(
      events
        .filter((event) => event.type === 'rollback-complete')
        .map((event) => event.recoveryId),
    );
    for (const pending of events.filter(
      (event) =>
        event.type === 'rollback-pending' &&
        event.recoveryId &&
        !completed.has(event.recoveryId),
    )) {
      if (!pending.credentialId || !pending.recoveryId) continue;
      const timer = this.#pendingTimers.get(pending.recoveryId);
      if (timer) clearTimeout(timer);
      this.#pendingTimers.delete(pending.recoveryId);
      try {
        assertSafeIdentifier(pending.credentialId, 'credentialId', 'revoke');
        if (pending.receiptId && pending.finalizationReceipt) {
          await this.#abortAndRevoke(
            pending.finalizationReceipt,
            'pending rollback recovery',
          );
        } else {
          await this.#rollback(
            pending.credentialId,
            undefined,
            'revoke',
            pending.requiresSink === true,
          );
        }
        await this.#completeRollback(
          pending.recoveryId,
          pending.credentialId,
          pending.sinkReference,
        );
        if (pending.receiptId) terminalIds.add(pending.receiptId);
      } catch {
        failures.push(pending.recoveryId);
        this.#scheduleRollback(
          pending.recoveryId,
          pending.credentialId,
          undefined,
          'revoke',
          pending.requiresSink === true,
          pending.finalizationReceipt,
          Boolean(pending.receiptId),
        );
      }
    }
    const retired = new Set(
      events
        .filter((event) => event.type === 'retirement-complete')
        .map((event) => event.recoveryId),
    );
    for (const pending of events.filter(
      (event) =>
        event.type === 'retirement-pending' &&
        event.recoveryId &&
        !retired.has(event.recoveryId),
    )) {
      if (!pending.recoveryId || !pending.recoveryReceipt) continue;
      if (
        pending.replacementReceiptId &&
        (!activeIds.has(pending.replacementReceiptId) ||
          terminalIds.has(pending.replacementReceiptId))
      ) {
        await this.#ledger.appendEvent({
          ...this.#event(
            'retirement-complete',
            pending.recoveryReceipt.receiptId,
          ),
          recoveryId: pending.recoveryId,
          reason: 'replacement is not active',
        });
        continue;
      }
      try {
        await this.#revokeReceipt(
          pending.recoveryReceipt,
          'replacement retirement recovery',
          'replaced',
        );
        await this.#ledger.appendEvent({
          ...this.#event(
            'retirement-complete',
            pending.recoveryReceipt.receiptId,
          ),
          recoveryId: pending.recoveryId,
        });
        this.#leaseInvalidators.delete(pending.recoveryReceipt.receiptId);
      } catch {
        failures.push(pending.recoveryId);
        this.#scheduleRetirement(
          pending.recoveryId,
          pending.recoveryReceipt,
          pending.replacementReceiptId,
        );
      }
    }
    if (failures.length) {
      throw new CustodyError(
        'PENDING_ROLLBACK_RECOVERY_FAILED',
        'revoke',
        'One or more pending credential rollbacks could not be recovered',
        { details: { recoveryIds: failures } },
      );
    }
  }

  async recoverCredential(
    credentialId: string,
    options: { requiresSink?: boolean } = {},
  ): Promise<void> {
    assertSafeIdentifier(credentialId, 'credentialId', 'revoke');
    await this.#rollback(
      credentialId,
      undefined,
      'revoke',
      options.requiresSink === true,
    );
  }

  async reconcile(): Promise<CustodyReconciliation> {
    if (!this.#sink) {
      throw new CustodyError(
        'DURABLE_SINK_REQUIRED',
        'reconcile',
        'Reconciliation requires a secret sink',
      );
    }
    const [receipts, events, inventory] = await Promise.all([
      this.#ledger.listReceipts(),
      this.#ledger.listEvents(),
      this.#sink.inventory(),
    ]);
    for (const entry of inventory) {
      assertSinkRecord(entry, this.#sink.name);
      assertSafeIdentifier(entry.credentialId, 'credentialId', 'reconcile');
    }
    const terminal = new Set(
      events
        .filter((event) =>
          ['revoked', 'expired', 'replaced'].includes(event.type),
        )
        .map((event) => event.receiptId),
    );
    const issued = new Set(
      events
        .filter((event) => event.type === 'issued')
        .map((event) => event.receiptId),
    );
    for (const replacement of receipts) {
      if (
        replacement.replacesReceiptId &&
        issued.has(replacement.receiptId) &&
        !terminal.has(replacement.receiptId)
      ) {
        terminal.add(replacement.replacesReceiptId);
      }
    }
    const active = receipts.filter(
      (receipt): receipt is CustodyReceipt & { sink: SecretSinkRecord } =>
        receipt.mode === 'durable' &&
        receipt.sink !== undefined &&
        issued.has(receipt.receiptId) &&
        !terminal.has(receipt.receiptId),
    );
    const orphanCutoff = this.#now().getTime() - this.#orphanGraceMs;
    return {
      checkedAt: this.#now().toISOString(),
      orphaned: inventory.filter(
        (entry) =>
          parseTimestamp(entry.storedAt, 'storedAt', 'reconcile') <=
            orphanCutoff &&
          !active.some(
            (receipt) =>
              sameSinkRecord(receipt.sink, entry) &&
              entry.credentialId === receipt.credentialId,
          ),
      ),
      missing: active.filter(
        (receipt) =>
          !inventory.some(
            (entry) =>
              sameSinkRecord(receipt.sink, entry) &&
              entry.credentialId === receipt.credentialId,
          ),
      ),
    };
  }

  async recoverOrphans(report: CustodyReconciliation): Promise<void> {
    if (!this.#sink) {
      throw new CustodyError(
        'DURABLE_SINK_REQUIRED',
        'reconcile',
        'Orphan recovery requires a secret sink',
      );
    }
    const current = await this.reconcile();
    const requested = new Set(
      report.orphaned.map((entry) => sinkIdentity(entry, entry.credentialId)),
    );
    const confirmed = current.orphaned.filter((entry) =>
      requested.has(sinkIdentity(entry, entry.credentialId)),
    );
    for (const orphan of confirmed) {
      assertSinkRecord(orphan, this.#sink.name);
      await this.#ledger.appendEvent(
        this.#event('orphan-detected', undefined, orphan.reference),
      );
      assertSafeIdentifier(orphan.credentialId, 'credentialId', 'reconcile');
      try {
        await this.#issuer.revoke(orphan.credentialId, 'orphan recovery');
      } catch {
        throw new CustodyError(
          'ORPHAN_REVOCATION_FAILED',
          'reconcile',
          'Orphan credential revocation failed',
        );
      }
      await this.#sink.remove(orphan, 'orphan recovery');
      await this.#ledger.appendEvent(
        this.#event('orphan-removed', undefined, orphan.reference),
      );
    }
  }

  #createLease(
    receipt: CustodyReceipt,
    ephemeralMaterial?: SecretMaterial,
  ): CredentialLease {
    let unavailable = false;
    let revocationComplete = false;
    let revocationInFlight: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const revoke = async (
      reason = 'requested',
      terminalType: 'revoked' | 'expired' = 'revoked',
    ): Promise<void> => {
      unavailable = true;
      if (timer) clearTimeout(timer);
      ephemeralMaterial?.destroy();
      if (revocationComplete) return;
      if (revocationInFlight) return revocationInFlight;
      revocationInFlight = this.#revokeReceipt(receipt, reason, terminalType)
        .then(() => {
          revocationComplete = true;
          this.#leaseInvalidators.delete(receipt.receiptId);
        })
        .finally(() => {
          revocationInFlight = undefined;
        });
      return revocationInFlight;
    };
    const invalidate = (): void => {
      unavailable = true;
      if (timer) clearTimeout(timer);
      ephemeralMaterial?.destroy();
    };
    this.#leaseInvalidators.set(receipt.receiptId, invalidate);

    if (receipt.mode === 'ephemeral' && receipt.expiresAt) {
      const deadline = parseTimestamp(receipt.expiresAt, 'expiresAt', 'issue');
      const schedule = (delay: number): void => {
        timer = setTimeout(
          () => {
            const remaining = deadline - this.#now().getTime();
            if (remaining > 0) {
              schedule(Math.min(remaining, MAX_TIMER_DELAY_MS));
              return;
            }
            revoke('expired', 'expired').catch((cause) => {
              try {
                this.#onBackgroundError?.(
                  cause instanceof CustodyError
                    ? cause
                    : new CustodyError(
                        'EPHEMERAL_CLEANUP_FAILED',
                        'revoke',
                        'Ephemeral credential cleanup failed',
                        { cause },
                      ),
                );
              } catch {
                // Observability hooks must never interrupt revocation retry.
              } finally {
                schedule(this.#ephemeralRevokeRetryMs);
              }
            });
          },
          Math.min(Math.max(0, delay), MAX_TIMER_DELAY_MS),
        );
        timer.unref?.();
      };
      schedule(deadline - this.#now().getTime());
    }

    return {
      receipt: structuredClone(receipt),
      withEnvironment: async (
        variableName: string,
        operation: () => void | Promise<void>,
      ): Promise<void> => {
        this.#assertLeaseAvailable(receipt, unavailable);
        if (!ENVIRONMENT_VARIABLE.test(variableName)) {
          throw new CustodyError(
            'INVALID_ENVIRONMENT_VARIABLE',
            'inject',
            'Environment variable name is invalid',
          );
        }
        let material = ephemeralMaterial;
        if (!material) {
          if (!this.#sink || !receipt.sink) {
            throw new CustodyError(
              'DURABLE_SINK_REQUIRED',
              'retrieve',
              'Durable credential retrieval requires a secret sink record',
            );
          }
          material = await this.#sink.retrieve(receipt.sink);
        }
        try {
          this.#assertLeaseAvailable(receipt, unavailable);
          await withEnvironmentSecret(material, variableName, operation, {
            expiresAt: receipt.expiresAt,
          });
        } finally {
          if (!ephemeralMaterial) material.destroy();
        }
      },
      withChildProcess: async (
        options: CredentialChildProcessOptions,
      ): Promise<CredentialChildProcessResult> => {
        this.#assertLeaseAvailable(receipt, unavailable);
        let material = ephemeralMaterial;
        if (!material) {
          if (!this.#sink || !receipt.sink) {
            throw new CustodyError(
              'DURABLE_SINK_REQUIRED',
              'retrieve',
              'Durable credential retrieval requires a secret sink record',
            );
          }
          material = await this.#sink.retrieve(receipt.sink);
        }
        try {
          this.#assertLeaseAvailable(receipt, unavailable);
          return await runCredentialChildProcess(material, options, {
            expiresAt: receipt.expiresAt,
          });
        } finally {
          if (!ephemeralMaterial) material.destroy();
        }
      },
      revoke: (reason?: string) => revoke(reason),
    };
  }

  #assertLeaseAvailable(receipt: CustodyReceipt, unavailable: boolean): void {
    const expired =
      receipt.expiresAt !== undefined &&
      parseTimestamp(receipt.expiresAt, 'expiresAt', 'inject') <=
        this.#now().getTime();
    if (unavailable || expired) {
      throw new CustodyError(
        'CREDENTIAL_REVOKED',
        'inject',
        'Credential is no longer available',
      );
    }
  }

  async #revokeReceipt(
    receipt: CustodyReceipt,
    reason: string,
    terminalType: 'revoked' | 'expired' | 'replaced' = 'revoked',
  ): Promise<void> {
    const failures: string[] = [];
    try {
      await this.#issuer.revoke(receipt.credentialId, reason);
    } catch {
      failures.push('issuer');
    }
    if (!failures.length && receipt.sink && this.#sink) {
      try {
        await this.#sink.remove(receipt.sink, reason);
      } catch {
        failures.push('sink');
      }
    }
    if (failures.length) {
      throw new CustodyError(
        'CREDENTIAL_REVOCATION_FAILED',
        'revoke',
        'Credential revocation did not complete',
        { details: { failedOperations: failures } },
      );
    }
    await this.#appendEventEventually(
      this.#event(terminalType, receipt.receiptId, undefined, reason),
    );
  }

  async #rollback(
    credentialId: string,
    sinkRecord: SecretSinkRecord | undefined,
    failedStage: CustodyStage,
    requiresSink = false,
  ): Promise<void> {
    const failures: string[] = [];
    try {
      await this.#issuer.revoke(credentialId, `rollback after ${failedStage}`);
    } catch {
      failures.push('issuer');
    }
    if (!failures.length && requiresSink && !this.#sink) {
      failures.push('sink');
    }
    if (!failures.length && requiresSink && this.#sink) {
      try {
        if (sinkRecord) {
          await this.#sink.remove(sinkRecord, `rollback after ${failedStage}`);
        } else {
          await this.#sink.removeByCredentialId(
            credentialId,
            `rollback after ${failedStage}`,
          );
        }
      } catch {
        failures.push('sink');
      }
    }
    if (failures.length) {
      throw new CustodyError(
        'CUSTODY_ROLLBACK_FAILED',
        'revoke',
        'Credential rollback did not complete',
        { details: { failedOperations: failures, failedStage } },
      );
    }
  }

  async #abortAndRevoke(
    receipt: CustodyReceipt,
    reason: string,
  ): Promise<void> {
    const failures: string[] = [];
    try {
      await this.#finalizer.abort({
        receipt: structuredClone(receipt),
        reason,
      });
    } catch {
      failures.push('finalizer');
    }
    try {
      await this.#revokeReceipt(receipt, reason);
    } catch {
      failures.push('credential');
    }
    if (failures.length) {
      throw new CustodyError(
        'CUSTODY_ROLLBACK_FAILED',
        'revoke',
        'Finalization rollback did not complete',
        { details: { failedOperations: failures } },
      );
    }
  }

  #scheduleRollback(
    recoveryId: string,
    credentialId: string,
    sinkRecord: SecretSinkRecord | undefined,
    failedStage: CustodyStage,
    requiresSink: boolean,
    finalizationReceipt?: CustodyReceipt,
    receiptRecorded = false,
  ): void {
    if (this.#pendingTimers.has(recoveryId)) return;
    const timer = setTimeout(() => {
      this.#pendingTimers.delete(recoveryId);
      Promise.resolve()
        .then(async () => {
          if (receiptRecorded && finalizationReceipt) {
            await this.#abortAndRevoke(
              finalizationReceipt,
              `rollback after ${failedStage}`,
            );
          } else {
            await this.#rollback(
              credentialId,
              sinkRecord,
              failedStage,
              requiresSink,
            );
          }
        })
        .then(() =>
          this.#completeRollback(
            recoveryId,
            credentialId,
            sinkRecord?.reference,
          ),
        )
        .catch((cause) => {
          try {
            this.#onBackgroundError?.(
              cause instanceof CustodyError
                ? cause
                : new CustodyError(
                    'CUSTODY_ROLLBACK_FAILED',
                    'revoke',
                    'Credential rollback retry failed',
                    { cause },
                  ),
            );
          } catch {
            // Observability hooks must never interrupt cleanup retry.
          } finally {
            this.#scheduleRollback(
              recoveryId,
              credentialId,
              sinkRecord,
              failedStage,
              requiresSink,
              finalizationReceipt,
              receiptRecorded,
            );
          }
        });
    }, this.#ephemeralRevokeRetryMs);
    this.#pendingTimers.set(recoveryId, timer);
    timer.unref?.();
  }

  #scheduleRetirement(
    recoveryId: string,
    receipt: CustodyReceipt,
    replacementReceiptId?: string,
  ): void {
    if (this.#pendingTimers.has(recoveryId)) return;
    const timer = setTimeout(() => {
      this.#pendingTimers.delete(recoveryId);
      this.#ledger
        .listEvents()
        .then(async (events) => {
          if (
            replacementReceiptId &&
            (!events.some(
              (event) =>
                event.receiptId === replacementReceiptId &&
                event.type === 'issued',
            ) ||
              events.some(
                (event) =>
                  event.receiptId === replacementReceiptId &&
                  ['revoked', 'expired', 'replaced'].includes(event.type),
              ))
          ) {
            return;
          }
          await this.#revokeReceipt(
            receipt,
            'replacement retirement retry',
            'replaced',
          );
          this.#leaseInvalidators.delete(receipt.receiptId);
        })
        .then(() =>
          this.#ledger.appendEvent({
            ...this.#event('retirement-complete', receipt.receiptId),
            recoveryId,
          }),
        )
        .catch(() =>
          this.#scheduleRetirement(recoveryId, receipt, replacementReceiptId),
        );
    }, this.#ephemeralRevokeRetryMs);
    this.#pendingTimers.set(recoveryId, timer);
    timer.unref?.();
  }

  #scheduleReceiptExpiry(receipt: CustodyReceipt, deadline: number): void {
    if (this.#pendingTimers.has(receipt.receiptId)) return;
    const delay = Math.min(
      Math.max(0, deadline - this.#now().getTime()),
      MAX_TIMER_DELAY_MS,
    );
    const timer = setTimeout(() => {
      this.#pendingTimers.delete(receipt.receiptId);
      if (deadline > this.#now().getTime()) {
        this.#scheduleReceiptExpiry(receipt, deadline);
        return;
      }
      this.#revokeReceipt(receipt, 'restart expiry recovery', 'expired').catch(
        () => this.#scheduleReceiptExpiry(receipt, deadline),
      );
    }, delay);
    this.#pendingTimers.set(receipt.receiptId, timer);
    timer.unref?.();
  }

  #scheduleFinalizationTakeover(recoveryId: string, deadline: number): void {
    if (this.#pendingTimers.has(recoveryId)) return;
    const timer = setTimeout(
      () => {
        this.#pendingTimers.delete(recoveryId);
        this.recoverPendingRollbacks().catch((cause) => {
          try {
            this.#onBackgroundError?.(
              cause instanceof CustodyError
                ? cause
                : new CustodyError(
                    'PENDING_ROLLBACK_RECOVERY_FAILED',
                    'revoke',
                    'Finalization takeover recovery failed',
                    { cause },
                  ),
            );
          } catch {
            // Observability cannot interrupt takeover recovery.
          }
        });
      },
      Math.min(
        Math.max(0, deadline - this.#now().getTime()),
        MAX_TIMER_DELAY_MS,
      ),
    );
    this.#pendingTimers.set(recoveryId, timer);
    timer.unref?.();
  }

  async #completeRollback(
    recoveryId: string,
    credentialId: string,
    sinkReference?: string,
  ): Promise<void> {
    await this.#ledger.appendEvent({
      ...this.#event(
        'rollback-complete',
        undefined,
        sinkReference,
        'credential rollback completed',
      ),
      recoveryId,
      credentialId,
    });
  }

  async #appendEventEventually(event: CustodyEvent): Promise<void> {
    try {
      await this.#ledger.appendEvent(event);
    } catch (cause) {
      const recoveryId = `event-${event.eventId}`;
      if (this.#pendingTimers.has(recoveryId)) return;
      const timer = setTimeout(() => {
        this.#pendingTimers.delete(recoveryId);
        this.#appendEventEventually(event).catch(() => undefined);
      }, this.#ephemeralRevokeRetryMs);
      this.#pendingTimers.set(recoveryId, timer);
      try {
        this.#onBackgroundError?.(
          new CustodyError(
            'CUSTODY_EVENT_RECORD_FAILED',
            'record',
            'Custody terminal event recording is pending retry',
            { cause },
          ),
        );
      } catch {
        // Observability hooks must never interrupt event retry.
      }
    }
  }

  async #findReceipt(receiptId: string): Promise<CustodyReceipt> {
    assertSafeIdentifier(receiptId, 'receiptId', 'record');
    const receipt = (await this.#ledger.listReceipts()).find(
      (candidate) => candidate.receiptId === receiptId,
    );
    if (!receipt) {
      throw new CustodyError(
        'CUSTODY_RECEIPT_NOT_FOUND',
        'record',
        'Custody receipt was not found',
      );
    }
    return receipt;
  }

  #event(
    type: CustodyEventType,
    receiptId?: string,
    sinkReference?: string,
    reason?: string,
  ): CustodyEvent {
    return {
      eventId: randomUUID(),
      type,
      occurredAt: this.#now().toISOString(),
      ...(receiptId ? { receiptId } : {}),
      ...(sinkReference ? { sinkReference } : {}),
      ...(reason ? { reason: redactCredentialText(reason) } : {}),
    };
  }
}

export async function withEnvironmentSecret(
  material: SecretMaterial,
  variableName: string,
  operation: () => void | Promise<void>,
  bounds?: { expiresAt?: string },
): Promise<void> {
  if (!ENVIRONMENT_VARIABLE.test(variableName)) {
    throw new CustodyError(
      'INVALID_ENVIRONMENT_VARIABLE',
      'inject',
      'Environment variable name is invalid',
    );
  }
  if (bounds?.expiresAt) {
    parseTimestamp(bounds.expiresAt, 'expiresAt', 'inject');
    throw new CustodyError(
      'EXPIRING_ENVIRONMENT_CALLBACK_UNSAFE',
      'inject',
      'Expiring credentials require bounded child-process injection',
    );
  }
  await withEnvironmentLock(async () => {
    const existed = Object.hasOwn(process.env, variableName);
    const previous = process.env[variableName];
    try {
      await material.use(async (value) => {
        process.env[variableName] = value;
        await operation();
      });
    } catch (cause) {
      if (cause instanceof CustodyError) throw cause;
      throw new CustodyError(
        'SECRET_OPERATION_FAILED',
        'inject',
        'Bounded secret operation failed',
        { cause },
      );
    } finally {
      if (existed) process.env[variableName] = previous;
      else delete process.env[variableName];
    }
  });
}

export async function runCredentialChildProcess(
  material: SecretMaterial,
  options: CredentialChildProcessOptions,
  bounds?: { expiresAt?: string },
): Promise<CredentialChildProcessResult> {
  if (
    options.trust !== 'cooperative-process-group' ||
    !options.command ||
    !ENVIRONMENT_VARIABLE.test(options.environmentVariable)
  ) {
    throw new CustodyError(
      'INVALID_CHILD_PROCESS_OPTIONS',
      'inject',
      'Credential child-process options are invalid',
    );
  }
  if (process.platform === 'win32') {
    throw new CustodyError(
      'CREDENTIAL_CHILD_PROCESS_UNSUPPORTED',
      'inject',
      'Credential child-process group custody is unavailable on this platform',
    );
  }
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 1024 * 1024;
  if (
    !Number.isFinite(timeoutMs) ||
    !Number.isFinite(maxOutputBytes) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_TIMER_DELAY_MS ||
    maxOutputBytes <= 0
  ) {
    throw new CustodyError(
      'INVALID_CHILD_PROCESS_BOUNDS',
      'inject',
      'Credential child-process bounds must be positive',
    );
  }

  let result: CredentialChildProcessResult | undefined;
  await material.use(async (secret) => {
    const expiryLimit = bounds?.expiresAt
      ? parseTimestamp(bounds.expiresAt, 'expiresAt', 'inject') - Date.now()
      : Number.POSITIVE_INFINITY;
    const effectiveTimeout = Math.min(timeoutMs, expiryLimit);
    if (effectiveTimeout <= 0) {
      throw new CustodyError(
        'CREDENTIAL_EXPIRED',
        'inject',
        'Credential expired before child-process launch',
      );
    }

    const childEnvironment = await withEnvironmentLock(() => ({
      ...process.env,
      ...options.environment,
      [options.environmentVariable]: secret,
    }));
    result = await new Promise<CredentialChildProcessResult>(
      (resolve, reject) => {
        const child = spawn(options.command, [...(options.args ?? [])], {
          cwd: options.cwd,
          detached: true,
          env: childEnvironment,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let outputBytes = 0;
        let outputExceeded = false;
        let timedOut = false;
        let settled = false;
        let escalationTimer: ReturnType<typeof setTimeout> | undefined;

        const terminateGroup = (signal: NodeJS.Signals): void => {
          if (child.pid) {
            try {
              process.kill(-child.pid, signal);
              return;
            } catch {
              // The group may already have exited; use the child handle.
            }
          }
          child.kill(signal);
        };
        const waitForGroupExit = async (): Promise<boolean> => {
          if (!child.pid) return true;
          const deadline = Date.now() + 2_000;
          while (Date.now() < deadline) {
            try {
              process.kill(-child.pid, 0);
            } catch (cause) {
              if ((cause as NodeJS.ErrnoException).code === 'ESRCH')
                return true;
            }
            await new Promise((next) => setTimeout(next, 10));
          }
          return false;
        };
        const beginTermination = (): void => {
          terminateGroup('SIGTERM');
          if (!escalationTimer) {
            escalationTimer = setTimeout(() => {
              escalationTimer = undefined;
              terminateGroup('SIGKILL');
            }, 1_000);
            escalationTimer.unref?.();
          }
        };
        const timer = setTimeout(() => {
          timedOut = true;
          beginTermination();
        }, effectiveTimeout);
        timer.unref?.();

        const capture =
          (target: Buffer[]) =>
          (chunk: Buffer): void => {
            outputBytes += chunk.length;
            if (outputBytes > maxOutputBytes) {
              timedOut = true;
              outputExceeded = true;
              target.length = 0;
              beginTermination();
              return;
            }
            if (outputExceeded) return;
            target.push(Buffer.from(chunk));
          };
        child.stdout.on('data', capture(stdout));
        child.stderr.on('data', capture(stderr));
        child.once('error', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (escalationTimer) clearTimeout(escalationTimer);
          terminateGroup('SIGKILL');
          reject(
            new CustodyError(
              'CREDENTIAL_CHILD_PROCESS_FAILED',
              'inject',
              'Credential child process could not start',
            ),
          );
        });
        child.once('close', async (exitCode, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (escalationTimer) clearTimeout(escalationTimer);
          // The leader may have exited while descendants retained the secret.
          // Kill the original process group before returning any output.
          terminateGroup('SIGTERM');
          terminateGroup('SIGKILL');
          if (!(await waitForGroupExit())) {
            reject(
              new CustodyError(
                'CREDENTIAL_CHILD_PROCESS_CLEANUP_FAILED',
                'inject',
                'Credential child process group cleanup could not be verified',
              ),
            );
            return;
          }
          resolve({
            exitCode,
            signal,
            stdout: outputExceeded
              ? REDACTED
              : redactCredentialText(Buffer.concat(stdout).toString('utf8'), [
                  secret,
                ]),
            stderr: outputExceeded
              ? REDACTED
              : redactCredentialText(Buffer.concat(stderr).toString('utf8'), [
                  secret,
                ]),
            timedOut,
          });
        });
      },
    );
  });

  if (!result) {
    throw new CustodyError(
      'CREDENTIAL_CHILD_PROCESS_FAILED',
      'inject',
      'Credential child process did not return a result',
    );
  }
  return result;
}

export async function verifyCustodyReceiptAttestation(
  receipt: CustodyReceipt,
  material: SecretMaterial,
  publicKey: KeyObject,
): Promise<boolean> {
  if (
    receipt.attestation.algorithm !== 'Ed25519' ||
    publicKey.type !== 'public' ||
    publicKey.asymmetricKeyType !== 'ed25519' ||
    !/^[A-Za-z0-9_-]{86}$/.test(receipt.attestation.signature) ||
    Buffer.from(receipt.attestation.signature, 'base64url').byteLength !== 64 ||
    Buffer.from(receipt.attestation.signature, 'base64url').toString(
      'base64url',
    ) !== receipt.attestation.signature
  ) {
    return false;
  }
  let verified = false;
  await material.use((plaintext) => {
    const payload = custodyAttestationPayload(
      receipt,
      credentialCommitment(plaintext),
    );
    try {
      verified = verifyPayload(
        null,
        Buffer.from(payload),
        publicKey,
        Buffer.from(receipt.attestation.signature, 'base64url'),
      );
    } catch {
      verified = false;
    }
  });
  return verified;
}

export function redactCredentialText(
  input: string,
  knownSecrets: readonly string[] = [],
): string {
  let output = input;
  for (const secret of knownSecrets.filter(Boolean)) {
    output = output.replaceAll(secret, REDACTED);
  }
  for (const { pattern, replacement } of CREDENTIAL_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function redactCredentialValues(
  value: unknown,
  knownSecrets: readonly string[] = [],
): unknown {
  if (value instanceof SecretMaterial) return REDACTED;
  if (typeof value === 'string') {
    return redactCredentialText(value, knownSecrets);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactCredentialValues(entry, knownSecrets));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        redactCredentialText(key, knownSecrets),
        redactCredentialValues(entry, knownSecrets),
      ]),
    );
  }
  return value;
}

async function sanitizeCustodyCause(
  cause: unknown,
  materials: ReadonlyArray<SecretMaterial | undefined>,
): Promise<unknown> {
  if (!(cause instanceof CustodyError)) return cause;
  const knownSecrets: string[] = [];
  for (const material of materials) {
    if (!material || material.destroyed) continue;
    await material.use((value) => {
      knownSecrets.push(value);
    });
  }
  const safeCode =
    redactCredentialText(cause.code, knownSecrets) === cause.code
      ? cause.code
      : 'INVALID_CUSTODY_ERROR_CODE';
  return new CustodyError(
    safeCode,
    cause.stage,
    redactCredentialText(cause.message, knownSecrets),
    cause.details
      ? {
          details: redactCredentialValues(
            cause.details,
            knownSecrets,
          ) as Record<string, unknown>,
        }
      : undefined,
  );
}

function credentialCommitment(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('base64url');
}

function custodyAttestationPayload(
  receipt: Omit<CustodyReceipt, 'attestation'> | CustodyReceipt,
  commitment: string,
  identity?: Omit<CustodyReceiptAttestation, 'signature'>,
): string {
  const { attestation, ...unsigned } = receipt as CustodyReceipt;
  return JSON.stringify(
    canonicalize({
      schema: 'happyvertical.credential-custody-attestation.v1',
      receipt: unsigned,
      attestation: identity ?? {
        algorithm: attestation.algorithm,
        attestor: attestation.attestor,
        keyId: attestation.keyId,
      },
      credentialCommitment: commitment,
    }),
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function assertAttribution(attribution: CustodyAttribution): void {
  assertSafeIdentifier(attribution.actor, 'attribution.actor', 'issue');
  assertSafeIdentifier(attribution.runtime, 'attribution.runtime', 'issue');
  assertSafeIdentifier(attribution.session, 'attribution.session', 'issue');
}

function assertSinkRecord(record: SecretSinkRecord, sinkName: string): void {
  if (record.sinkName !== sinkName) {
    throw new CustodyError(
      'SINK_IDENTITY_MISMATCH',
      'store',
      'Secret sink returned a mismatched identity',
    );
  }
  assertSafeIdentifier(record.sinkName, 'sinkName', 'store');
  assertSafeIdentifier(record.reference, 'sinkReference', 'store');
  assertSafeIdentifier(record.version, 'sinkVersion', 'store');
  if (!Number.isFinite(new Date(record.storedAt).getTime())) {
    throw new CustodyError(
      'INVALID_SINK_TIMESTAMP',
      'store',
      'Secret sink returned an invalid timestamp',
    );
  }
}

function assertSafeIdentifier(
  value: string,
  field: string,
  stage: CustodyStage,
): void {
  if (!SAFE_IDENTIFIER.test(value) || redactCredentialText(value) !== value) {
    throw new CustodyError(
      'UNSAFE_CUSTODY_IDENTIFIER',
      stage,
      `Custody ${field} must be a non-secret identifier`,
    );
  }
}

function sanitizeMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(metadata ?? {}).map(([key, value]) => {
        if (redactCredentialText(key) !== key) {
          throw new CustodyError(
            'UNSAFE_CUSTODY_METADATA_KEY',
            'issue',
            'Custody metadata key must not contain credential material',
          );
        }
        return [key, redactCredentialText(value)];
      }),
    ),
  );
}

function parseTimestamp(
  value: string,
  field: string,
  stage: CustodyStage,
): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new CustodyError(
      'INVALID_CUSTODY_TIMESTAMP',
      stage,
      `Custody ${field} timestamp is invalid`,
    );
  }
  return timestamp;
}

function sameSinkRecord(
  left: SecretSinkRecord,
  right: SecretSinkRecord,
): boolean {
  return (
    left.sinkName === right.sinkName &&
    left.reference === right.reference &&
    left.version === right.version
  );
}

function sinkIdentity(record: SecretSinkRecord, credentialId?: string): string {
  return [
    record.sinkName,
    record.reference,
    record.version,
    credentialId ?? '',
  ].join('\u0000');
}
