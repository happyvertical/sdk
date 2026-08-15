import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CredentialChildProcessOptions,
  CredentialCustody,
  type CredentialIssueRequest,
  type CredentialIssuer,
  type CredentialSecretSink,
  type CredentialVerifier,
  type CustodyAttribution,
  CustodyError,
  type CustodyEvent,
  type CustodyLedger,
  type CustodyReceipt,
  Ed25519CustodyReceiptAttestor,
  InMemoryCustodyLedger,
  type IssuedCredential,
  redactCredentialText,
  redactCredentialValues,
  SecretMaterial,
  type SecretSinkInventoryEntry,
  type SecretSinkRecord,
  verifyCustodyReceiptAttestation,
  withEnvironmentSecret,
} from '../index.js';

const SYNTHETIC_SECRET = ['synthetic', 'custody', 'value'].join('-');
const TEST_KEY_PAIR = generateKeyPairSync('ed25519');
const TEST_ATTESTOR = new Ed25519CustodyReceiptAttestor({
  privateKey: TEST_KEY_PAIR.privateKey,
  keyId: 'test-key-1',
  name: 'test-attestor',
});
const TEST_FINALIZER = {
  name: 'test-finalizer',
  async prepare(): Promise<{ prepared: boolean }> {
    return { prepared: true };
  },
  async commit(): Promise<void> {},
  async abort(): Promise<void> {},
  async status(): Promise<'committed'> {
    return 'committed';
  },
};
const ATTRIBUTION: CustodyAttribution = {
  actor: 'test-actor',
  runtime: 'test-runtime',
  session: 'test-session',
};

class FakeIssuer implements CredentialIssuer {
  readonly name = 'fake-issuer';
  readonly revoked: Array<{ credentialId: string; reason: string }> = [];
  issueFailure?: Error;
  revokeFailure?: Error;
  readonly revokeFailures = new Set<string>();
  expiresAtOverride?: string;
  onRevoke?: (credentialId: string) => void;
  next = 1;

  async issue(request: CredentialIssueRequest): Promise<IssuedCredential> {
    if (this.issueFailure) throw this.issueFailure;
    return {
      credentialId: `credential-${this.next++}`,
      secret: SecretMaterial.fromString(SYNTHETIC_SECRET),
      issuedAt: '2026-08-14T17:00:00.000Z',
      expiresAt: this.expiresAtOverride ?? request.expiresAt,
    };
  }

  async revoke(credentialId: string, reason: string): Promise<void> {
    this.onRevoke?.(credentialId);
    this.revoked.push({ credentialId, reason });
    if (this.revokeFailure || this.revokeFailures.has(credentialId)) {
      throw (
        this.revokeFailure ?? new Error('synthetic selective revoke failure')
      );
    }
  }
}

class FakeVerifier implements CredentialVerifier {
  readonly name = 'fake-verifier';
  verified = true;
  failure?: Error;

  async verify(input: {
    credentialId: string;
    secret: SecretMaterial;
  }): Promise<{ verified: boolean; verificationId?: string }> {
    if (this.failure) throw this.failure;
    let matches = false;
    await input.secret.use((value) => {
      matches = value === SYNTHETIC_SECRET;
    });
    return {
      verified: this.verified && matches,
      verificationId: 'verification-1',
    };
  }
}

class FakeSink implements CredentialSecretSink {
  readonly name = 'fake-sink';
  readonly values = new Map<string, string>();
  readonly credentialIds = new Map<string, string>();
  readonly removed: Array<{ reference: string; reason: string }> = [];
  storeFailure?: Error;
  storeFailureAfterWrite?: Error;
  retrieveFailure?: Error;
  removeFailure?: Error;
  next = 1;
  inventoryOverride?: SecretSinkInventoryEntry[];

  async store(input: {
    credentialId: string;
    secret: SecretMaterial;
    metadata: Readonly<Record<string, string>>;
  }): Promise<SecretSinkRecord> {
    if (this.storeFailure) throw this.storeFailure;
    const reference = `sink-record-${this.next++}`;
    let stored = '';
    await input.secret.use((value) => {
      stored = value;
    });
    this.values.set(reference, stored);
    this.credentialIds.set(reference, input.credentialId);
    if (this.storeFailureAfterWrite) throw this.storeFailureAfterWrite;
    return {
      sinkName: this.name,
      reference,
      version: '1',
      storedAt: '2026-08-14T17:00:01.000Z',
    };
  }

  async retrieve(record: SecretSinkRecord): Promise<SecretMaterial> {
    if (this.retrieveFailure) throw this.retrieveFailure;
    const value = this.values.get(record.reference);
    if (!value) throw new Error('synthetic sink record missing');
    return SecretMaterial.fromString(value);
  }

  async remove(record: SecretSinkRecord, reason: string): Promise<void> {
    this.removed.push({ reference: record.reference, reason });
    this.values.delete(record.reference);
    this.credentialIds.delete(record.reference);
    if (this.removeFailure) throw this.removeFailure;
  }

  async removeByCredentialId(
    credentialId: string,
    reason: string,
  ): Promise<void> {
    for (const [reference, storedCredentialId] of this.credentialIds) {
      if (storedCredentialId === credentialId) {
        await this.remove(
          {
            sinkName: this.name,
            reference,
            version: '1',
            storedAt: '2026-08-14T17:00:01.000Z',
          },
          reason,
        );
      }
    }
  }

  async inventory(): Promise<SecretSinkInventoryEntry[]> {
    if (this.inventoryOverride) return structuredClone(this.inventoryOverride);
    return [...this.values.keys()].map((reference) => ({
      sinkName: this.name,
      reference,
      version: '1',
      storedAt: '2026-08-14T17:00:01.000Z',
      credentialId: this.credentialIds.get(reference) ?? 'unknown-credential',
    }));
  }
}

class FlakyLedger implements CustodyLedger {
  readonly inner = new InMemoryCustodyLedger();
  failEventType?: CustodyEvent['type'];
  failEventAfterWriteType?: CustodyEvent['type'];
  conflictingReadbackOnce = false;

  async recordIssuance(
    receipt: CustodyReceipt,
    event: CustodyEvent,
  ): Promise<void> {
    await this.inner.recordIssuance(receipt, event);
  }

  async commitIssuance(
    receiptId: string,
    event: CustodyEvent,
    followup?: CustodyEvent,
  ): Promise<void> {
    await this.inner.commitIssuance(receiptId, event, followup);
  }

  async appendEvent(event: CustodyEvent): Promise<void> {
    if (event.type === this.failEventType) {
      this.failEventType = undefined;
      throw new Error('synthetic ledger failure');
    }
    if (event.type === this.failEventAfterWriteType) {
      this.failEventAfterWriteType = undefined;
      await this.inner.appendEvent(event);
      this.conflictingReadbackOnce = true;
      throw new Error('synthetic ledger acknowledgement loss');
    }
    await this.inner.appendEvent(event);
  }

  async listReceipts(): Promise<CustodyReceipt[]> {
    return this.inner.listReceipts();
  }

  async listEvents(): Promise<CustodyEvent[]> {
    const events = await this.inner.listEvents();
    if (!this.conflictingReadbackOnce) return events;
    this.conflictingReadbackOnce = false;
    return events.map((event) =>
      event.type === 'rollback-pending'
        ? { ...event, credentialId: 'conflicting-credential' }
        : event,
    );
  }
}

class TracingLedger extends InMemoryCustodyLedger {
  readonly calls: string[] = [];

  override async recordIssuance(
    receipt: CustodyReceipt,
    event: CustodyEvent,
  ): Promise<void> {
    this.calls.push(`record:${event.type}`);
    await super.recordIssuance(receipt, event);
  }

  override async commitIssuance(
    receiptId: string,
    event: CustodyEvent,
    followup?: CustodyEvent,
  ): Promise<void> {
    this.calls.push(`commit-ledger:${event.type}:${followup?.type ?? 'none'}`);
    await super.commitIssuance(receiptId, event, followup);
  }
}

describe('credential custody', () => {
  let issuer: FakeIssuer;
  let verifier: FakeVerifier;
  let sink: FakeSink;
  let ledger: InMemoryCustodyLedger;
  let custody: CredentialCustody;

  beforeEach(() => {
    issuer = new FakeIssuer();
    verifier = new FakeVerifier();
    sink = new FakeSink();
    ledger = new InMemoryCustodyLedger();
    custody = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.CUSTODY_TEST_TOKEN;
    delete process.env.UNRELATED_CUSTODY_TOKEN;
  });

  it('stores, retrieves, verifies, and returns only a safe durable receipt', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
      metadata: { purpose: 'integration-test' },
    });

    expect(lease.receipt).toMatchObject({
      mode: 'durable',
      credentialId: 'credential-1',
      verificationState: 'verified',
      verificationId: 'verification-1',
      rotationRootReceiptId: lease.receipt.receiptId,
    });
    expect(lease.receipt.sink?.reference).toBe('sink-record-1');
    expect(JSON.stringify(lease.receipt)).not.toContain(SYNTHETIC_SECRET);

    await lease.withEnvironment('CUSTODY_TEST_TOKEN', () => {
      expect(process.env.CUSTODY_TEST_TOKEN).toBe(SYNTHETIC_SECRET);
    });
    expect(process.env.CUSTODY_TEST_TOKEN).toBeUndefined();
  });

  it('cryptographically binds the receipt, sink locator, and submitted token', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const submitted = SecretMaterial.fromString(SYNTHETIC_SECRET);
    await expect(
      verifyCustodyReceiptAttestation(
        lease.receipt,
        submitted,
        TEST_KEY_PAIR.publicKey,
      ),
    ).resolves.toBe(true);

    const tampered = structuredClone(lease.receipt);
    if (!tampered.sink) throw new Error('durable receipt has no sink');
    tampered.sink.reference = 'different-locator';
    await expect(
      verifyCustodyReceiptAttestation(
        tampered,
        submitted,
        TEST_KEY_PAIR.publicKey,
      ),
    ).resolves.toBe(false);

    const noncanonical = structuredClone(lease.receipt);
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = noncanonical.attestation.signature.at(-1) ?? '';
    const index = alphabet.indexOf(last);
    noncanonical.attestation.signature = `${noncanonical.attestation.signature.slice(0, -1)}${alphabet[index ^ 1]}`;
    expect(
      Buffer.from(noncanonical.attestation.signature, 'base64url').equals(
        Buffer.from(lease.receipt.attestation.signature, 'base64url'),
      ),
    ).toBe(true);
    await expect(
      verifyCustodyReceiptAttestation(
        noncanonical,
        submitted,
        TEST_KEY_PAIR.publicKey,
      ),
    ).resolves.toBe(false);

    const identityTampered = structuredClone(lease.receipt);
    identityTampered.attestation.keyId = 'different-trusted-key';
    await expect(
      verifyCustodyReceiptAttestation(
        identityTampered,
        submitted,
        TEST_KEY_PAIR.publicKey,
      ),
    ).resolves.toBe(false);

    const different = SecretMaterial.fromString('synthetic-different-value');
    await expect(
      verifyCustodyReceiptAttestation(
        lease.receipt,
        different,
        TEST_KEY_PAIR.publicKey,
      ),
    ).resolves.toBe(false);
    submitted.destroy();
    different.destroy();
  });

  it('fails closed and revokes when durable storage fails', async () => {
    sink.storeFailure = new Error('synthetic store failure');

    await expect(
      custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_STORE_FAILED', stage: 'store' });

    expect(issuer.revoked).toEqual([
      {
        credentialId: 'credential-1',
        reason: 'rollback after store',
      },
    ]);
    expect(sink.values.size).toBe(0);
  });

  it('removes the sink record and revokes when retrieval fails', async () => {
    sink.retrieveFailure = new Error('synthetic retrieve failure');

    await expect(
      custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({
      code: 'CUSTODY_RETRIEVE_FAILED',
      stage: 'retrieve',
    });

    expect(sink.values.size).toBe(0);
    expect(sink.removed).toHaveLength(1);
    expect(issuer.revoked).toHaveLength(1);
  });

  it('exact-redacts arbitrary plaintext from retrieval CustodyErrors', async () => {
    sink.retrieveFailure = new CustodyError(
      SYNTHETIC_SECRET,
      'retrieve',
      SYNTHETIC_SECRET,
      { details: { returned: SYNTHETIC_SECRET } },
    );
    let caught: unknown;
    try {
      await custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      });
    } catch (error) {
      caught = error;
    }

    expect(JSON.stringify(caught)).not.toContain(SYNTHETIC_SECRET);
    expect(inspect(caught, { showHidden: true })).not.toContain(
      SYNTHETIC_SECRET,
    );
  });

  it('removes an ambiguous partial store write by credential identity', async () => {
    sink.storeFailureAfterWrite = new Error('synthetic response loss');

    await expect(
      custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_STORE_FAILED' });

    expect(issuer.revoked).toHaveLength(1);
    expect(sink.values.size).toBe(0);
  });

  it('removes the sink record and revokes on negative verification', async () => {
    verifier.verified = false;

    await expect(
      custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({
      code: 'CREDENTIAL_VERIFICATION_FAILED',
      stage: 'verify',
    });

    expect(sink.values.size).toBe(0);
    expect(issuer.revoked).toHaveLength(1);
  });

  it('revokes and removes custody when post-attestation activation rejects', async () => {
    const calls: string[] = [];
    const rejecting = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: {
        name: 'rejecting-finalizer',
        async prepare(input) {
          calls.push('prepare');
          expect(input.receipt.attestation.signature).not.toBe('');
          return { prepared: false };
        },
        async commit() {},
        async abort() {
          calls.push('abort');
        },
        async status() {
          return 'missing' as const;
        },
      },
    });

    await expect(
      rejecting.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_ACTIVATION_FAILED' });
    expect(issuer.revoked).toHaveLength(1);
    expect(sink.values.size).toBe(0);
    expect(await ledger.listReceipts()).toHaveLength(1);
    expect((await ledger.listEvents()).at(-1)?.type).toBe('revoked');
    expect(calls).toEqual(['prepare', 'abort']);
  });

  it('revokes and removes custody when post-attestation activation throws', async () => {
    const calls: string[] = [];
    const throwing = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: {
        name: 'throwing-finalizer',
        async prepare() {
          calls.push('prepare');
          throw new Error('synthetic activation failure');
        },
        async commit() {},
        async abort() {
          calls.push('abort');
        },
        async status() {
          return 'missing' as const;
        },
      },
    });

    await expect(
      throwing.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_ACTIVATE_FAILED' });
    expect(issuer.revoked).toHaveLength(1);
    expect(sink.values.size).toBe(0);
    expect(await ledger.listReceipts()).toHaveLength(1);
    expect((await ledger.listEvents()).at(-1)?.type).toBe('revoked');
    expect(calls).toEqual(['prepare', 'abort']);
  });

  it('aborts a prepared activation when commit fails after ledger recording', async () => {
    const calls: string[] = [];
    const staged = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: {
        name: 'staged-finalizer',
        async prepare() {
          calls.push('prepare');
          return { prepared: true };
        },
        async commit() {
          calls.push('commit');
          throw new Error('synthetic commit failure');
        },
        async abort() {
          calls.push('abort');
        },
        async status() {
          return 'prepared' as const;
        },
      },
    });

    await expect(
      staged.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_ACTIVATE_FAILED' });
    expect(calls).toEqual(['prepare', 'commit', 'abort']);
    expect(issuer.revoked).toHaveLength(1);
    expect(sink.values.size).toBe(0);
    expect((await ledger.listEvents()).at(-1)?.type).toBe('revoked');
  });

  it('requires a sink for durable issuance before invoking the issuer', async () => {
    const withoutSink = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });

    await expect(
      withoutSink.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'DURABLE_SINK_REQUIRED' });
    expect(issuer.next).toBe(1);
  });

  it('expires and cleans up ephemeral credentials automatically', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const backgroundErrors: CustodyError[] = [];
    const ephemeral = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralTtlMs: 1_000,
      onBackgroundError: (error) => backgroundErrors.push(error),
    });

    const lease = await ephemeral.issue({
      mode: 'ephemeral',
      subject: 'throwaway-agent',
      attribution: ATTRIBUTION,
    });
    expect(lease.receipt.sink).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(issuer.revoked).toEqual([
      { credentialId: 'credential-1', reason: 'expired' },
    ]);
    expect(backgroundErrors).toEqual([]);
    await expect(
      lease.withEnvironment('CUSTODY_TEST_TOKEN', () => undefined),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REVOKED' });
    expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
      'finalization-pending',
      'issued',
      'expired',
    ]);
  });

  it('reports and retries failed ephemeral expiry revocation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const backgroundErrors: CustodyError[] = [];
    const ephemeral = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralTtlMs: 1_000,
      ephemeralRevokeRetryMs: 500,
      onBackgroundError: (error) => backgroundErrors.push(error),
    });
    await ephemeral.issue({
      mode: 'ephemeral',
      subject: 'throwaway-agent',
      attribution: ATTRIBUTION,
    });
    issuer.revokeFailure = new Error('synthetic revoke failure');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(backgroundErrors).toHaveLength(1);
    issuer.revokeFailure = undefined;
    await vi.advanceTimersByTimeAsync(500);

    expect(issuer.revoked).toHaveLength(2);
    expect((await ledger.listEvents()).map((event) => event.type)).toContain(
      'expired',
    );
  });

  it('persists and automatically retries failed pre-receipt rollback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const ephemeral = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralRevokeRetryMs: 500,
    });
    verifier.verified = false;
    issuer.revokeFailure = new Error('synthetic revoke failure');

    await expect(
      ephemeral.issue({
        mode: 'ephemeral',
        subject: 'throwaway-agent',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_ROLLBACK_FAILED' });
    expect((await ledger.listEvents()).map((event) => event.type)).toContain(
      'rollback-pending',
    );

    issuer.revokeFailure = undefined;
    await vi.advanceTimersByTimeAsync(500);
    expect(issuer.revoked).toHaveLength(2);
    const completion = (await ledger.listEvents()).find(
      (event) => event.type === 'rollback-complete',
    );
    expect(completion?.recoveryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(completion?.receiptId).toBeUndefined();
  });

  it('recovers a committed finalization-pending receipt after restart', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const issuedLease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const restartLedger = new InMemoryCustodyLedger();
    await restartLedger.recordIssuance(issuedLease.receipt, {
      eventId: issuedLease.receipt.finalizationId,
      type: 'finalization-pending',
      occurredAt: new Date().toISOString(),
      receiptId: issuedLease.receipt.receiptId,
    });
    const restarted = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger: restartLedger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });

    await restarted.recoverPendingRollbacks();
    expect(
      (await restartLedger.listEvents()).map((event) => event.type),
    ).toEqual(['finalization-pending']);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(
      (await restartLedger.listEvents()).map((event) => event.type),
    ).toEqual(['finalization-pending', 'issued']);
  });

  it('accepts exact event replay and rejects conflicting event IDs', async () => {
    const event: CustodyEvent = {
      eventId: randomUUID(),
      type: 'orphan-detected',
      occurredAt: '2026-08-14T17:00:00.000Z',
      credentialId: 'orphan-credential',
    };
    await ledger.appendEvent(event);
    await ledger.appendEvent(structuredClone(event));
    expect(await ledger.listEvents()).toHaveLength(1);

    await expect(
      ledger.appendEvent({ ...event, credentialId: 'different-credential' }),
    ).rejects.toMatchObject({ code: 'CUSTODY_EVENT_ID_CONFLICT' });
    expect(await ledger.listEvents()).toHaveLength(1);
  });

  it('retries ambiguous finalization status without revoking custody', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const issuedLease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const restartLedger = new InMemoryCustodyLedger();
    await restartLedger.recordIssuance(issuedLease.receipt, {
      eventId: issuedLease.receipt.finalizationId,
      type: 'finalization-pending',
      occurredAt: new Date().toISOString(),
      receiptId: issuedLease.receipt.receiptId,
    });
    let statusAttempts = 0;
    const restarted = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger: restartLedger,
      attestor: TEST_ATTESTOR,
      finalizer: {
        ...TEST_FINALIZER,
        async status() {
          statusAttempts += 1;
          if (statusAttempts === 1) {
            throw new Error('synthetic transient status failure');
          }
          return 'committed';
        },
      },
      ephemeralRevokeRetryMs: 500,
    });

    await restarted.recoverPendingRollbacks();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(issuer.revoked).toEqual([]);
    expect(sink.values.size).toBe(1);
    expect(
      (await restartLedger.listEvents()).map((event) => event.type),
    ).toEqual(['finalization-pending']);

    await vi.advanceTimersByTimeAsync(500);
    expect(statusAttempts).toBe(2);
    expect(issuer.revoked).toEqual([]);
    expect(
      (await restartLedger.listEvents()).map((event) => event.type),
    ).toEqual(['finalization-pending', 'issued']);
  });

  it('resumes a persisted pre-receipt rollback after restart', async () => {
    vi.useFakeTimers();
    verifier.verified = false;
    issuer.revokeFailure = new Error('synthetic revoke failure');
    const firstProcess = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralRevokeRetryMs: 500,
    });
    await expect(
      firstProcess.issue({
        mode: 'ephemeral',
        subject: 'throwaway-agent',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_ROLLBACK_FAILED' });

    issuer.revokeFailure = undefined;
    const recoveredProcess = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    await recoveredProcess.recoverPendingRollbacks();

    expect(issuer.revoked).toHaveLength(2);
    expect((await ledger.listEvents()).map((event) => event.type)).toContain(
      'rollback-complete',
    );
  });

  it('requires the durable sink before completing persisted rollback recovery', async () => {
    vi.useFakeTimers();
    verifier.verified = false;
    issuer.revokeFailure = new Error('synthetic revoke failure');
    const firstProcess = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    await expect(
      firstProcess.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ).rejects.toMatchObject({ code: 'CUSTODY_ROLLBACK_FAILED' });
    issuer.revokeFailure = undefined;

    const missingSinkProcess = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    await expect(
      missingSinkProcess.recoverPendingRollbacks(),
    ).rejects.toMatchObject({ code: 'PENDING_ROLLBACK_RECOVERY_FAILED' });
    expect(sink.values.size).toBe(1);

    const recoveredProcess = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    await recoveredProcess.recoverPendingRollbacks();
    expect(sink.values.size).toBe(0);
  });

  it('continues recovering later pending credentials after one failure', async () => {
    vi.useFakeTimers();
    verifier.verified = false;
    issuer.revokeFailure = new Error('synthetic revoke failure');
    for (const subject of ['throwaway-one', 'throwaway-two']) {
      await expect(
        custody.issue({ mode: 'ephemeral', subject, attribution: ATTRIBUTION }),
      ).rejects.toMatchObject({ code: 'CUSTODY_ROLLBACK_FAILED' });
    }
    issuer.revokeFailure = undefined;
    issuer.revokeFailures.add('credential-1');

    await expect(custody.recoverPendingRollbacks()).rejects.toMatchObject({
      code: 'PENDING_ROLLBACK_RECOVERY_FAILED',
    });

    const events = await ledger.listEvents();
    expect(
      events.some(
        (event) =>
          event.type === 'rollback-complete' &&
          event.credentialId === 'credential-2',
      ),
    ).toBe(true);
  });

  it('retries expiry revocation even when the background observer throws', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const ephemeral = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralTtlMs: 1_000,
      ephemeralRevokeRetryMs: 500,
      onBackgroundError: () => {
        throw new Error('synthetic observer failure');
      },
    });
    await ephemeral.issue({
      mode: 'ephemeral',
      subject: 'throwaway-agent',
      attribution: ATTRIBUTION,
    });
    issuer.revokeFailure = new Error('synthetic revoke failure');

    await vi.advanceTimersByTimeAsync(1_000);
    issuer.revokeFailure = undefined;
    await vi.advanceTimersByTimeAsync(500);

    expect(issuer.revoked).toHaveLength(2);
  });

  it('invalidates a live ephemeral lease when revoked through custody', async () => {
    const ephemeral = new CredentialCustody({
      issuer,
      verifier,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    const lease = await ephemeral.issue({
      mode: 'ephemeral',
      subject: 'throwaway-agent',
      attribution: ATTRIBUTION,
    });

    await ephemeral.revoke(lease.receipt.receiptId);

    await expect(
      lease.withChildProcess({
        trust: 'cooperative-process-group',
        command: process.execPath,
        args: ['-e', 'process.exit(0)'],
        environmentVariable: 'CUSTODY_TEST_TOKEN',
      }),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REVOKED' });
  });

  it('restores an existing environment value after success', async () => {
    process.env.CUSTODY_TEST_TOKEN = 'previous-safe-value';
    const material = SecretMaterial.fromString(SYNTHETIC_SECRET);

    await withEnvironmentSecret(material, 'CUSTODY_TEST_TOKEN', () => {
      expect(process.env.CUSTODY_TEST_TOKEN).toBe(SYNTHETIC_SECRET);
    });

    expect(process.env.CUSTODY_TEST_TOKEN).toBe('previous-safe-value');
    material.destroy();
  });

  it('restores an absent environment value when the callback throws', async () => {
    const material = SecretMaterial.fromString(SYNTHETIC_SECRET);

    await expect(
      withEnvironmentSecret(material, 'CUSTODY_TEST_TOKEN', () => {
        throw new Error('synthetic callback failure');
      }),
    ).rejects.toMatchObject({ code: 'SECRET_MATERIAL_OPERATION_FAILED' });

    expect(process.env.CUSTODY_TEST_TOKEN).toBeUndefined();
    material.destroy();
  });

  it('serializes overlapping injection for the same environment variable', async () => {
    const first = SecretMaterial.fromString('synthetic-first-value');
    const second = SecretMaterial.fromString('synthetic-second-value');
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted: () => void = () => undefined;
    const firstReady = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let secondEntered = false;

    const firstOperation = withEnvironmentSecret(
      first,
      'CUSTODY_TEST_TOKEN',
      async () => {
        expect(process.env.CUSTODY_TEST_TOKEN).toBe('synthetic-first-value');
        firstStarted();
        await firstGate;
        expect(process.env.CUSTODY_TEST_TOKEN).toBe('synthetic-first-value');
      },
    );
    await firstReady;
    const secondOperation = withEnvironmentSecret(
      second,
      'CUSTODY_TEST_TOKEN',
      () => {
        secondEntered = true;
        expect(process.env.CUSTODY_TEST_TOKEN).toBe('synthetic-second-value');
      },
    );
    await Promise.resolve();
    expect(secondEntered).toBe(false);
    releaseFirst();
    await Promise.all([firstOperation, secondOperation]);

    expect(process.env.CUSTODY_TEST_TOKEN).toBeUndefined();
    first.destroy();
    second.destroy();
  });

  it('rejects nested environment or child injection instead of deadlocking', async () => {
    const outer = SecretMaterial.fromString('synthetic-outer-value');
    const inner = SecretMaterial.fromString('synthetic-inner-value');
    const nestedLease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    await withEnvironmentSecret(outer, 'CUSTODY_TEST_TOKEN', async () => {
      await expect(
        withEnvironmentSecret(
          inner,
          'UNRELATED_CUSTODY_TOKEN',
          () => undefined,
        ),
      ).rejects.toMatchObject({ code: 'REENTRANT_ENVIRONMENT_INJECTION' });
      await expect(
        nestedLease.withChildProcess({
          trust: 'cooperative-process-group',
          command: process.execPath,
          environmentVariable: 'UNRELATED_CUSTODY_TOKEN',
        }),
      ).rejects.toMatchObject({ code: 'REENTRANT_ENVIRONMENT_INJECTION' });
    });
    await nestedLease.revoke('test cleanup');
    outer.destroy();
    inner.destroy();
  });

  it('discards callback return values instead of returning plaintext', async () => {
    const material = SecretMaterial.fromString(SYNTHETIC_SECRET);
    const result = await withEnvironmentSecret(
      material,
      'CUSTODY_TEST_TOKEN',
      () => process.env.CUSTODY_TEST_TOKEN,
    );
    expect(result).toBeUndefined();
    material.destroy();
  });

  it('rejects uncancellable callbacks for expiring credentials', async () => {
    const material = SecretMaterial.fromString(SYNTHETIC_SECRET);
    await expect(
      withEnvironmentSecret(
        material,
        'CUSTODY_TEST_TOKEN',
        async () => undefined,
        { expiresAt: new Date(Date.now() + 1_000).toISOString() },
      ),
    ).rejects.toMatchObject({
      code: 'EXPIRING_ENVIRONMENT_CALLBACK_UNSAFE',
    });
    expect(process.env.CUSTODY_TEST_TOKEN).toBeUndefined();
    material.destroy();
  });

  it('retries a failed external revocation', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    issuer.revokeFailure = new Error('synthetic revoke failure');
    await expect(lease.revoke()).rejects.toMatchObject({
      code: 'CREDENTIAL_REVOCATION_FAILED',
    });

    issuer.revokeFailure = undefined;
    await lease.revoke();

    expect(issuer.revoked.map((item) => item.credentialId)).toEqual([
      'credential-1',
      'credential-1',
    ]);
  });

  it('bounds child-only injection and redacts child output', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    const result = await lease.withChildProcess({
      trust: 'cooperative-process-group',
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write(process.env.CUSTODY_TEST_TOKEN); process.stderr.write(process.env.CUSTODY_TEST_TOKEN)',
      ],
      environmentVariable: 'CUSTODY_TEST_TOKEN',
      timeoutMs: 5_000,
    });

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: '[REDACTED]',
      stderr: '[REDACTED]',
      timedOut: false,
    });
    expect(process.env.CUSTODY_TEST_TOKEN).toBeUndefined();
  });

  it.each([
    'durable',
    'ephemeral',
  ] as const)('invalidates and durably retries %s custody when child cleanup is unverified', async (mode) => {
    const lease = await custody.issue({
      mode,
      subject: mode === 'durable' ? 'service-account-1' : 'throwaway-agent',
      attribution: ATTRIBUTION,
    });
    issuer.revokeFailure = new Error('synthetic transient revoke failure');
    const originalKill = process.kill.bind(process);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: NodeJS.Signals | number,
    ) => {
      if (pid < 0 && signal === 0) return true;
      return originalKill(pid, signal);
    }) as typeof process.kill);

    try {
      await expect(
        lease.withChildProcess({
          trust: 'cooperative-process-group',
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
          environmentVariable: 'CUSTODY_TEST_TOKEN',
        }),
      ).rejects.toMatchObject({
        code: 'CREDENTIAL_CHILD_PROCESS_CLEANUP_FAILED',
      });
    } finally {
      killSpy.mockRestore();
    }

    await expect(
      lease.withEnvironment('CUSTODY_TEST_TOKEN', () => undefined),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REVOKED' });
    const pending = (await ledger.listEvents()).find(
      (event) =>
        event.type === 'rollback-pending' &&
        event.receiptId === lease.receipt.receiptId,
    );
    expect(pending?.recoveryId).toBeDefined();

    issuer.revokeFailure = undefined;
    await custody.recoverPendingRollbacks();
    expect(
      (await ledger.listEvents()).some(
        (event) =>
          event.type === 'rollback-complete' &&
          event.recoveryId === pending?.recoveryId,
      ),
    ).toBe(true);
    expect(
      issuer.revoked.filter(
        (entry) => entry.credentialId === lease.receipt.credentialId,
      ),
    ).toHaveLength(2);
    if (mode === 'durable') expect(sink.values.size).toBe(0);
  }, 10_000);

  it('persists child-cleanup recovery identity before returning', async () => {
    const retryLedger = new FlakyLedger();
    const backgroundErrors: CustodyError[] = [];
    const retryingCustody = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger: retryLedger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralRevokeRetryMs: 10,
      onBackgroundError: (error) => backgroundErrors.push(error),
    });
    const lease = await retryingCustody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    issuer.revokeFailure = new Error('synthetic transient revoke failure');
    retryLedger.failEventAfterWriteType = 'rollback-pending';
    const originalKill = process.kill.bind(process);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(((
      pid: number,
      signal?: NodeJS.Signals | number,
    ) => {
      if (pid < 0 && signal === 0) return true;
      return originalKill(pid, signal);
    }) as typeof process.kill);

    try {
      await expect(
        lease.withChildProcess({
          trust: 'cooperative-process-group',
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
          environmentVariable: 'CUSTODY_TEST_TOKEN',
        }),
      ).rejects.toMatchObject({
        code: 'CREDENTIAL_CHILD_PROCESS_CLEANUP_FAILED',
      });
    } finally {
      killSpy.mockRestore();
    }

    expect(
      backgroundErrors.some(
        (error) => error.code === 'ROLLBACK_INTENT_PERSISTENCE_FAILED',
      ),
    ).toBe(true);
    const pending = (await retryLedger.listEvents()).find(
      (event) =>
        event.type === 'rollback-pending' &&
        event.receiptId === lease.receipt.receiptId,
    );
    expect(pending?.recoveryId).toBeDefined();
    expect(
      (await retryLedger.listEvents()).filter(
        (event) => event.type === 'rollback-pending',
      ),
    ).toHaveLength(1);

    issuer.revokeFailure = undefined;
    await retryingCustody.recoverPendingRollbacks();
    expect(sink.values.size).toBe(0);
    expect(
      (await retryLedger.listEvents()).some(
        (event) =>
          event.type === 'rollback-complete' &&
          event.recoveryId === pending?.recoveryId,
      ),
    ).toBe(true);
  }, 10_000);

  it('does not snapshot another in-flight environment credential into a child', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const unrelated = SecretMaterial.fromString('synthetic-unrelated-value');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const injection = withEnvironmentSecret(
      unrelated,
      'UNRELATED_CUSTODY_TOKEN',
      async () => {
        started();
        await gate;
      },
    );
    await ready;
    const childResult = lease.withChildProcess({
      trust: 'cooperative-process-group',
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write(String(Boolean(process.env.UNRELATED_CUSTODY_TOKEN)))',
      ],
      environmentVariable: 'CUSTODY_TEST_TOKEN',
    });
    await Promise.resolve();
    release();
    await injection;

    await expect(childResult).resolves.toMatchObject({ stdout: 'false' });
    unrelated.destroy();
  });

  it('discards all captured output when the output bound is exceeded', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    const result = await lease.withChildProcess({
      trust: 'cooperative-process-group',
      command: process.execPath,
      args: ['-e', "process.stdout.write('synthetic-credential-fragment')"],
      environmentVariable: 'CUSTODY_TEST_TOKEN',
      maxOutputBytes: 8,
    });

    expect(result.stdout).toBe('[REDACTED]');
    expect(result.timedOut).toBe(true);
  });

  it('rejects non-finite child-process bounds', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    await expect(
      lease.withChildProcess({
        trust: 'cooperative-process-group',
        command: process.execPath,
        environmentVariable: 'CUSTODY_TEST_TOKEN',
        maxOutputBytes: Number.NaN,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CHILD_PROCESS_BOUNDS' });
  });

  it('requires explicit cooperative process-group trust', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    await expect(
      lease.withChildProcess({
        command: process.execPath,
        environmentVariable: 'CUSTODY_TEST_TOKEN',
      } as CredentialChildProcessOptions),
    ).rejects.toMatchObject({ code: 'INVALID_CHILD_PROCESS_OPTIONS' });
  });

  it('terminates an over-time child process group', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    const result = await lease.withChildProcess({
      trust: 'cooperative-process-group',
      command: process.execPath,
      args: [
        '-e',
        [
          "const { spawn } = require('node:child_process')",
          "spawn(process.execPath, ['-e', `process.on('SIGTERM', () => { console.log('descendant-stopped'); process.exit(0) }); setInterval(() => undefined, 1000)`], { stdio: ['ignore', 'inherit', 'inherit'] })",
          'setInterval(() => undefined, 1000)',
        ].join(';'),
      ],
      environmentVariable: 'CUSTODY_TEST_TOKEN',
      timeoutMs: 500,
    });

    expect(result.timedOut).toBe(true);
    expect(result.signal).not.toBeNull();
    expect(result.stdout).toContain('descendant-stopped');
  });

  it('kills a stubborn descendant before returning after normal leader exit', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const result = await lease.withChildProcess({
      trust: 'cooperative-process-group',
      command: process.execPath,
      args: [
        '-e',
        [
          "const { spawn } = require('node:child_process')",
          "const child = spawn(process.execPath, ['-e', `process.on('SIGTERM', () => undefined); setInterval(() => undefined, 1000)`], { stdio: 'ignore' })",
          'child.unref()',
          'process.stdout.write(String(child.pid))',
        ].join(';'),
      ],
      environmentVariable: 'CUSTODY_TEST_TOKEN',
      timeoutMs: 5_000,
    });
    const descendantPid = Number(result.stdout);
    expect(Number.isInteger(descendantPid)).toBe(true);
    expect(() => process.kill(descendantPid, 0)).toThrow();
  });

  it('rejects invalid and provider-extended expiry bounds fail closed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    await expect(
      custody.issue({
        mode: 'ephemeral',
        subject: 'throwaway-agent',
        attribution: ATTRIBUTION,
        expiresAt: 'not-a-timestamp',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CUSTODY_TIMESTAMP' });
    expect(issuer.next).toBe(1);

    issuer.expiresAtOverride = '2026-08-14T19:00:00.000Z';
    await expect(
      custody.issue({
        mode: 'ephemeral',
        subject: 'throwaway-agent',
        attribution: ATTRIBUTION,
        expiresAt: '2026-08-14T18:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'EXPIRY_BOUND_EXCEEDED' });
    expect(issuer.revoked).toHaveLength(1);
  });

  it('detects missing and orphaned sink records and safely removes orphans', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const issuedSink = lease.receipt.sink;
    expect(issuedSink).toBeDefined();
    if (!issuedSink) throw new Error('durable receipt has no sink');
    sink.values.delete(issuedSink.reference);
    sink.values.set('orphan-record-1', SYNTHETIC_SECRET);

    const report = await custody.reconcile();

    expect(report.missing.map((receipt) => receipt.receiptId)).toEqual([
      lease.receipt.receiptId,
    ]);
    expect(report.orphaned.map((entry) => entry.reference)).toEqual([
      'orphan-record-1',
    ]);

    await custody.recoverOrphans(report);
    expect(sink.values.has('orphan-record-1')).toBe(false);
    expect((await ledger.listEvents()).map((event) => event.type)).toEqual([
      'finalization-pending',
      'issued',
      'orphan-detected',
      'orphan-removed',
    ]);
  });

  it('records rotation lineage and retires the replaced credential', async () => {
    const first = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    const replacement = await custody.rotate(first.receipt.receiptId, {
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    expect(replacement.receipt.replacesReceiptId).toBe(first.receipt.receiptId);
    expect(replacement.receipt.rotationRootReceiptId).toBe(
      first.receipt.receiptId,
    );
    expect(issuer.revoked).toContainEqual({
      credentialId: first.receipt.credentialId,
      reason: 'replaced',
    });
    const firstSink = first.receipt.sink;
    expect(firstSink).toBeDefined();
    if (!firstSink) throw new Error('durable receipt has no sink');
    expect(sink.values.has(firstSink.reference)).toBe(false);
    expect(await ledger.listReceipts()).toHaveLength(2);
    await expect(
      first.withEnvironment('CUSTODY_TEST_TOKEN', () => undefined),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REVOKED' });
  });

  it('replaces a missing durable sink record and reconciles cleanly', async () => {
    const first = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const firstSink = first.receipt.sink;
    if (!firstSink) throw new Error('durable receipt has no sink');
    sink.values.delete(firstSink.reference);
    expect((await custody.reconcile()).missing).toHaveLength(1);

    const replacement = await custody.rotate(first.receipt.receiptId, {
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    expect(replacement.receipt.replacesReceiptId).toBe(first.receipt.receiptId);
    await expect(custody.reconcile()).resolves.toMatchObject({
      missing: [],
      orphaned: [],
    });
  });

  it('linearizes concurrent rotations through the ledger', async () => {
    const first = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    const results = await Promise.allSettled([
      custody.rotate(first.receipt.receiptId, {
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
      custody.rotate(first.receipt.receiptId, {
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('keeps a verified replacement when terminal event persistence retries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    const flakyLedger = new FlakyLedger();
    const rotatingCustody = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger: flakyLedger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      ephemeralRevokeRetryMs: 500,
    });
    const first = await rotatingCustody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    flakyLedger.failEventType = 'replaced';

    const replacement = await rotatingCustody.rotate(first.receipt.receiptId, {
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    expect(replacement.receipt.replacesReceiptId).toBe(first.receipt.receiptId);
    await vi.advanceTimersByTimeAsync(500);
    expect(
      (await flakyLedger.listEvents()).map((event) => event.type),
    ).toContain('replaced');
  });

  it('rejects direct replacement of an ephemeral predecessor', async () => {
    const ephemeral = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    const first = await ephemeral.issue({
      mode: 'ephemeral',
      subject: 'throwaway-agent',
      attribution: ATTRIBUTION,
    });

    await expect(
      ephemeral.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
        replacesReceiptId: first.receipt.receiptId,
      }),
    ).rejects.toMatchObject({ code: 'DURABLE_ROTATION_REQUIRED' });
    expect(issuer.next).toBe(2);
  });

  it('does not remove an owned record from a stale or fabricated orphan report', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const owned = lease.receipt.sink;
    if (!owned) throw new Error('durable receipt has no sink');

    await custody.recoverOrphans({
      checkedAt: '2026-08-14T17:05:00.000Z',
      missing: [],
      orphaned: [{ ...owned, credentialId: lease.receipt.credentialId }],
    });

    expect(sink.values.has(owned.reference)).toBe(true);
    expect(issuer.revoked).toEqual([]);
  });

  it('does not authorize orphan recovery from a stale storedAt identity', async () => {
    const orphan: SecretSinkInventoryEntry = {
      sinkName: sink.name,
      reference: 'orphan-record',
      version: '1',
      storedAt: '2026-08-14T17:00:01.000Z',
      credentialId: 'orphan-credential',
    };
    sink.values.set(orphan.reference, SYNTHETIC_SECRET);
    sink.credentialIds.set(orphan.reference, orphan.credentialId);
    sink.inventoryOverride = [
      { ...orphan, storedAt: '2026-08-14T17:00:02.000Z' },
    ];

    await custody.recoverOrphans({
      checkedAt: '2026-08-14T17:05:00.000Z',
      missing: [],
      orphaned: [orphan],
    });

    expect(sink.values.has(orphan.reference)).toBe(true);
    expect(sink.removed).toEqual([]);
    expect(issuer.revoked).toEqual([]);
    expect(
      (await ledger.listEvents()).some(
        (event) => event.type === 'orphan-removed',
      ),
    ).toBe(false);
  });

  it('treats sink tuple or credential ownership mismatches fail closed', async () => {
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const owned = lease.receipt.sink;
    if (!owned) throw new Error('durable receipt has no sink');
    sink.inventoryOverride = [
      { ...owned, version: '2', credentialId: 'credential-other' },
    ];

    const report = await custody.reconcile();
    expect(report.missing).toHaveLength(1);
    expect(report.orphaned).toHaveLength(1);

    sink.inventoryOverride = [
      {
        ...owned,
        storedAt: '2026-08-14T17:00:02.000Z',
        credentialId: lease.receipt.credentialId,
      },
    ];
    const timestampReport = await custody.reconcile();
    expect(timestampReport.missing).toHaveLength(1);
    expect(timestampReport.orphaned).toHaveLength(1);
  });

  it('retains an orphan until issuer revocation can be retried', async () => {
    const orphan: SecretSinkInventoryEntry = {
      sinkName: sink.name,
      reference: 'orphan-record',
      version: '1',
      storedAt: '2026-08-14T17:00:01.000Z',
      credentialId: 'orphan-credential',
    };
    sink.values.set(orphan.reference, SYNTHETIC_SECRET);
    sink.credentialIds.set(orphan.reference, orphan.credentialId);
    const report = await custody.reconcile();
    issuer.revokeFailures.add(orphan.credentialId);

    await expect(custody.recoverOrphans(report)).rejects.toMatchObject({
      code: 'ORPHAN_REVOCATION_FAILED',
    });
    expect(sink.values.has(orphan.reference)).toBe(true);

    issuer.revokeFailures.delete(orphan.credentialId);
    await custody.recoverOrphans(report);
    expect(sink.values.has(orphan.reference)).toBe(false);
    expect(
      issuer.revoked.filter(
        (item) => item.credentialId === orphan.credentialId,
      ),
    ).toHaveLength(2);
  });

  it('keeps the replacement active while predecessor retirement retries', async () => {
    const first = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    issuer.revokeFailures.add(first.receipt.credentialId);

    const replacement = await custody.rotate(first.receipt.receiptId, {
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    expect(issuer.revoked.map((entry) => entry.credentialId)).toEqual([
      'credential-1',
    ]);
    expect(sink.values.size).toBe(2);
    expect(replacement.receipt.replacesReceiptId).toBe(first.receipt.receiptId);
    expect(
      (await ledger.listEvents()).some(
        (event) => event.type === 'retirement-pending',
      ),
    ).toBe(true);

    issuer.revokeFailures.delete(first.receipt.credentialId);
    await custody.recoverPendingRollbacks();
    expect(sink.values.size).toBe(1);
  });

  it('orders staged rotation across finalizer, ledger, and issuer adapters', async () => {
    const tracingLedger = new TracingLedger();
    const calls = tracingLedger.calls;
    const tracingCustody = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger: tracingLedger,
      attestor: TEST_ATTESTOR,
      finalizer: {
        name: 'tracing-finalizer',
        async prepare() {
          calls.push('prepare');
          return { prepared: true };
        },
        async commit() {
          calls.push('commit-finalizer');
        },
        async abort() {
          calls.push('abort');
        },
        async status() {
          return 'committed' as const;
        },
      },
    });
    const first = await tracingCustody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    calls.length = 0;
    issuer.onRevoke = (credentialId) => {
      if (credentialId === first.receipt.credentialId) calls.push('retire');
    };

    await tracingCustody.rotate(first.receipt.receiptId, {
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });

    expect(calls).toEqual([
      'record:finalization-pending',
      'prepare',
      'commit-finalizer',
      'commit-ledger:issued:retirement-pending',
      'retire',
    ]);
  });

  it('recovers a committed pending rotation and then retires its predecessor', async () => {
    const first = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const replacement = await custody.rotate(first.receipt.receiptId, {
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
    });
    const restartLedger = new InMemoryCustodyLedger();
    await restartLedger.recordIssuance(first.receipt, {
      eventId: first.receipt.finalizationId,
      type: 'finalization-pending',
      occurredAt: '2026-08-14T17:00:00.000Z',
      receiptId: first.receipt.receiptId,
    });
    await restartLedger.commitIssuance(first.receipt.receiptId, {
      eventId: randomUUID(),
      type: 'issued',
      occurredAt: '2026-08-14T17:00:01.000Z',
      receiptId: first.receipt.receiptId,
    });
    await restartLedger.recordIssuance(replacement.receipt, {
      eventId: replacement.receipt.finalizationId,
      type: 'finalization-pending',
      occurredAt: '2026-08-14T17:00:02.000Z',
      receiptId: replacement.receipt.receiptId,
    });
    const restarted = new CredentialCustody({
      issuer,
      verifier,
      sink,
      ledger: restartLedger,
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
      finalizationTakeoverMs: 0,
    });

    await restarted.recoverPendingRollbacks();
    await restarted.recoverPendingRollbacks();
    const events = await restartLedger.listEvents();
    expect(
      events.some(
        (event) =>
          event.type === 'issued' &&
          event.receiptId === replacement.receipt.receiptId,
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === 'retirement-complete')).toBe(
      true,
    );
  });
});

describe('custody redaction', () => {
  it('replaces an unsafe structured error code', () => {
    const tokenLikeCode = ['hvwk', 'syntheticsegmentvalue'].join('_');
    const error = new CustodyError(tokenLikeCode, 'issue', 'safe message');
    expect(error.code).toBe('INVALID_CUSTODY_ERROR_CODE');
    expect(JSON.stringify(error)).not.toContain(tokenLikeCode);
    expect(inspect(error)).not.toContain(tokenLikeCode);
  });
  it('keeps secret material opaque across string, JSON, and inspection', () => {
    const material = SecretMaterial.fromString(SYNTHETIC_SECRET);

    expect(String(material)).toBe('[REDACTED]');
    expect(JSON.stringify(material)).toBe('"[REDACTED]"');
    expect(inspect(material)).toBe('[REDACTED]');
    expect(JSON.stringify({ material })).not.toContain(SYNTHETIC_SECRET);
    material.destroy();
  });

  it('redacts constructed token-shaped text without retaining it in source fixtures', () => {
    const shaped = ['gh', 'p', '_', 'x'.repeat(24)].join('');
    const jwt = ['a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.');

    expect(redactCredentialText(`credential=${shaped}`)).toBe(
      'credential=[REDACTED]',
    );
    expect(redactCredentialText(jwt)).toBe('[REDACTED]');
    expect(
      redactCredentialValues({ nested: [`Authorization: Bearer ${shaped}`] }),
    ).toEqual({ nested: ['Authorization: Bearer [REDACTED]'] });
  });

  it('redacts a segmented Work-token shape from results, errors, and receipts', async () => {
    const shaped = ['hv', 'wk', '_', 'x'.repeat(24)].join('');

    expect(redactCredentialText(shaped)).toBe('[REDACTED]');
    expect(redactCredentialValues({ result: shaped })).toEqual({
      result: '[REDACTED]',
    });
    expect(
      JSON.stringify(
        new CustodyError('SYNTHETIC', 'verify', `credential=${shaped}`),
      ),
    ).not.toContain(shaped);

    const custody = new CredentialCustody({
      issuer: new FakeIssuer(),
      verifier: new FakeVerifier(),
      sink: new FakeSink(),
      ledger: new InMemoryCustodyLedger(),
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
      metadata: { accidental: shaped },
    });
    expect(JSON.stringify(lease.receipt)).not.toContain(shaped);
    expect(lease.receipt.metadata.accidental).toBe('[REDACTED]');
  });

  it('serializes structured errors without causes or token-shaped details', () => {
    const shaped = ['sk', '_', 'x'.repeat(24)].join('');
    const error = new CustodyError(
      'SYNTHETIC_FAILURE',
      'verify',
      `token=${shaped}`,
      {
        cause: new Error(shaped),
        details: { authorization: `Bearer ${shaped}` },
      },
    );

    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(shaped);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain('cause');
    expect(inspect(error)).not.toContain(shaped);
  });

  it('does not retain token-shaped adapter causes for Node inspection', async () => {
    const shaped = ['hv', 'wk', '_', 'x'.repeat(24)].join('');
    const verifier = new FakeVerifier();
    verifier.failure = new Error(shaped);
    const custody = new CredentialCustody({
      issuer: new FakeIssuer(),
      verifier,
      sink: new FakeSink(),
      ledger: new InMemoryCustodyLedger(),
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });

    let caught: unknown;
    try {
      await custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      });
    } catch (error) {
      caught = error;
    }

    expect(inspect(caught)).not.toContain(shaped);
    expect(JSON.stringify(caught)).not.toContain(shaped);
  });

  it('exact-redacts arbitrary-format plaintext from adapter CustodyErrors', async () => {
    const verifier = new FakeVerifier();
    verifier.failure = new CustodyError(
      'SYNTHETIC_FAILURE',
      'verify',
      SYNTHETIC_SECRET,
      { details: { returned: SYNTHETIC_SECRET } },
    );
    const custody = new CredentialCustody({
      issuer: new FakeIssuer(),
      verifier,
      sink: new FakeSink(),
      ledger: new InMemoryCustodyLedger(),
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });

    let caught: unknown;
    try {
      await custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
      });
    } catch (error) {
      caught = error;
    }

    expect(JSON.stringify(caught)).not.toContain(SYNTHETIC_SECRET);
    expect(inspect(caught, { showHidden: true })).not.toContain(
      SYNTHETIC_SECRET,
    );
  });

  it('rejects token-shaped adapter names and metadata keys', async () => {
    const shaped = ['hv', 'wk', '_', 'x'.repeat(24)].join('');
    const unsafeIssuer = new FakeIssuer();
    Object.defineProperty(unsafeIssuer, 'name', { value: shaped });
    expect(
      () =>
        new CredentialCustody({
          issuer: unsafeIssuer,
          verifier: new FakeVerifier(),
          sink: new FakeSink(),
          ledger: new InMemoryCustodyLedger(),
          attestor: TEST_ATTESTOR,
          finalizer: TEST_FINALIZER,
        }),
    ).toThrow(CustodyError);

    const custody = new CredentialCustody({
      issuer: new FakeIssuer(),
      verifier: new FakeVerifier(),
      sink: new FakeSink(),
      ledger: new InMemoryCustodyLedger(),
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });
    await expect(
      custody.issue({
        mode: 'durable',
        subject: 'service-account-1',
        attribution: ATTRIBUTION,
        metadata: { [shaped]: 'safe-value' },
      }),
    ).rejects.toMatchObject({ code: 'UNSAFE_CUSTODY_METADATA_KEY' });
  });

  it('redacts token-shaped metadata before it reaches a receipt', async () => {
    const shaped = ['xox', 'b', '_', 'x'.repeat(24)].join('');
    const custody = new CredentialCustody({
      issuer: new FakeIssuer(),
      verifier: new FakeVerifier(),
      sink: new FakeSink(),
      ledger: new InMemoryCustodyLedger(),
      attestor: TEST_ATTESTOR,
      finalizer: TEST_FINALIZER,
    });

    const lease = await custody.issue({
      mode: 'durable',
      subject: 'service-account-1',
      attribution: ATTRIBUTION,
      metadata: { accidental: shaped },
    });

    expect(lease.receipt.metadata).toEqual({ accidental: '[REDACTED]' });
    expect(JSON.stringify(lease.receipt)).not.toContain(shaped);
  });
});
