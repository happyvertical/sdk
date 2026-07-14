// biome-ignore-all lint/style/useNamingConvention: BoldSign's documented JSON wire fields use PascalCase.
import { Buffer } from 'node:buffer';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  SignatureConfigurationError,
  SignatureInputError,
  SignatureProviderError,
  SignatureTenantMismatchError,
  SignatureVerificationError,
} from '../errors.js';
import {
  getSignatureFetch,
  normalizeDate,
  parseOptionalEpochSeconds,
  readBoolean,
  readNumber,
  readRecord,
  readRecords,
  readString,
  requireNonEmptyString,
  requireRecord,
  type SignatureFetch,
} from '../shared.js';
import type {
  CancelSignatureRequestInput,
  CreateSignatureRequestInput,
  DownloadSignatureArtifactInput,
  ExtendSignatureRequestExpiryInput,
  ParseSignatureWebhookInput,
  SignatureArtifact,
  SignatureAuthentication,
  SignatureAuthenticationMethod,
  SignatureField,
  SignatureProvider,
  SignatureProviderCapabilities,
  SignatureRequest,
  SignatureRequestReference,
  SignatureRequestStatus,
  SignatureSigner,
  SignatureSignerInput,
  SignatureSignerStatus,
  SignatureWebhookEvent,
} from '../types.js';

export const BOLDSIGN_PROVIDER_ID = 'boldsign';
export const BOLDSIGN_TENANT_METADATA_KEY = 'hvTenantId';
export const BOLDSIGN_IDEMPOTENCY_METADATA_KEY = 'hvIdempotencyKey';

const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;
const MAX_BOLDSIGN_METADATA_ENTRIES = 50;
const MAX_BOLDSIGN_METADATA_KEY_LENGTH = 50;
const MAX_BOLDSIGN_METADATA_VALUE_LENGTH = 500;
const MAX_BOLDSIGN_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MIN_EXPIRY_DAYS = 1;
const MAX_EXPIRY_DAYS = 180;

const SUPPORTED_BOLDSIGN_DOCUMENT_EVENTS = new Set([
  'sent',
  'signed',
  'completed',
  'declined',
  'revoked',
  'expired',
  'viewed',
  'deliveryfailed',
  'sendfailed',
]);

export type BoldSignRegion = 'us' | 'eu' | 'ca' | 'au';

const REGION_URLS: Readonly<Record<BoldSignRegion, string>> = {
  us: 'https://api.boldsign.com/v1',
  eu: 'https://api-eu.boldsign.com/v1',
  ca: 'https://api-ca.boldsign.com/v1',
  au: 'https://api-au.boldsign.com/v1',
};

export interface BoldSignAdapterOptions {
  /** Bind one adapter and its credential/webhook secret to one tenant. */
  tenantId: string;
  apiKey?: string;
  accessToken?: string;
  /** Defaults to Canada for HappyVertical's first deployment. */
  region?: BoldSignRegion;
  apiBaseUrl?: string;
  webhookSecrets?: string | readonly string[];
  webhookToleranceSeconds?: number;
  fetch?: SignatureFetch;
  /** Testable wall clock used for replay checks and evidence timestamps. */
  now?: () => Date;
}

interface BoldSignRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  operation?: 'create' | 'read' | 'mutate';
  expect?: 'json' | 'empty' | 'stream';
}

export class BoldSignAdapter implements SignatureProvider {
  readonly capabilities: SignatureProviderCapabilities;

  private readonly tenantId: string;
  private readonly apiKey?: string;
  private readonly accessToken?: string;
  private readonly apiBaseUrl: string;
  private readonly webhookSecrets: readonly string[];
  private readonly webhookToleranceSeconds: number;
  private readonly fetch: SignatureFetch;
  private readonly now: () => Date;

  constructor(options: BoldSignAdapterOptions) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new SignatureConfigurationError(
        'BoldSignAdapter options must be an object.',
      );
    }

    this.tenantId = configurationString(
      options.tenantId,
      'BoldSignAdapter tenantId',
    );
    this.apiKey = optionalConfigurationString(
      options.apiKey,
      'BoldSignAdapter apiKey',
    );
    this.accessToken = optionalConfigurationString(
      options.accessToken,
      'BoldSignAdapter accessToken',
    );

    if (Boolean(this.apiKey) === Boolean(this.accessToken)) {
      throw new SignatureConfigurationError(
        'BoldSignAdapter requires exactly one of apiKey or accessToken.',
      );
    }

    const region = options.region ?? 'ca';

    if (!(region in REGION_URLS)) {
      throw new SignatureConfigurationError(
        `BoldSignAdapter region must be one of ${Object.keys(REGION_URLS).join(', ')}.`,
      );
    }

    this.apiBaseUrl = normalizeBaseUrl(
      options.apiBaseUrl ?? REGION_URLS[region],
    );
    this.webhookSecrets = normalizeWebhookSecrets(options.webhookSecrets);
    this.webhookToleranceSeconds = normalizeWebhookTolerance(
      options.webhookToleranceSeconds,
    );
    this.fetch = getSignatureFetch(options.fetch);
    this.now = options.now ?? (() => new Date());

    if (typeof this.now !== 'function') {
      throw new SignatureConfigurationError(
        'BoldSignAdapter now must be a function.',
      );
    }

    this.capabilities = {
      id: BOLDSIGN_PROVIDER_ID,
      displayName: 'BoldSign',
      region,
      supportsWebhooks: true,
      supportsCancellation: true,
      supportsExpiryExtension: true,
      supportsSignedDocument: true,
      supportsAuditTrail: true,
      providerEnforcedIdempotency: false,
      authenticationMethods: [
        'none',
        'access_code',
        'email_otp',
        'sms_otp',
        'identity_verification',
      ],
    };
  }

  async createRequest(
    input: CreateSignatureRequestInput,
  ): Promise<SignatureRequest> {
    this.assertTenant(input.tenantId);
    const idempotencyKey = requireNonEmptyString(
      input.idempotencyKey,
      'BoldSign idempotencyKey',
    );
    const title = requireNonEmptyString(input.title, 'BoldSign title');
    const documents = await normalizeDocuments(input.documents, input.signal);
    const signers = normalizeSignerInputs(input.signers);
    const metadata = normalizeMetadata(input.metadata, {
      [BOLDSIGN_TENANT_METADATA_KEY]: this.tenantId,
      [BOLDSIGN_IDEMPOTENCY_METADATA_KEY]: idempotencyKey,
    });
    const expiresInDays = normalizeExpiryDays(input.expiresInDays);

    const response = (await this.request('/document/send', {
      method: 'POST',
      operation: 'create',
      signal: input.signal,
      body: {
        Title: title,
        Message: optionalTrimmedString(input.message),
        Files: documents.map((document) => ({
          base64: `data:${document.mediaType};base64,${Buffer.from(document.data).toString('base64')}`,
          fileName: document.name,
        })),
        Signers: signers.map(toBoldSignSigner),
        EnableSigningOrder: input.signingOrder ?? false,
        ExpiryDateType: 'Days',
        ExpiryDays: expiresInDays,
        ExpiryValue: expiresInDays,
        MetaData: metadata,
      },
    })) as Record<string, unknown>;

    const id = requireProviderString(
      readString(response, 'documentId'),
      'BoldSign send response documentId',
    );

    return {
      provider: BOLDSIGN_PROVIDER_ID,
      tenantId: this.tenantId,
      id,
      status: 'prepared',
      title,
      signers: signers.map(inputSignerToResult),
      expiresAt: new Date(
        this.now().getTime() + expiresInDays * 24 * 60 * 60 * 1_000,
      ),
      metadata,
      raw: response,
    };
  }

  async getRequest(
    input: SignatureRequestReference,
  ): Promise<SignatureRequest> {
    this.assertTenant(input.tenantId);
    const requestId = requireNonEmptyString(
      input.requestId,
      'BoldSign requestId',
    );
    const response = (await this.request(
      `/document/properties?documentId=${encodeURIComponent(requestId)}`,
      { signal: input.signal, operation: 'read' },
    )) as Record<string, unknown>;

    this.assertProviderTenant(response);

    return mapBoldSignRequest(response, this.tenantId);
  }

  async cancelRequest(
    input: CancelSignatureRequestInput,
  ): Promise<SignatureRequest> {
    const reason = requireNonEmptyString(
      input.reason,
      'BoldSign cancellation reason',
    );
    const current = await this.getRequest(input);

    if (isTerminalStatus(current.status)) {
      throw new SignatureInputError(
        `BoldSign request ${current.id} cannot be cancelled from ${current.status}.`,
      );
    }

    await this.request(
      `/document/revoke?documentId=${encodeURIComponent(current.id)}`,
      {
        method: 'POST',
        operation: 'mutate',
        expect: 'empty',
        signal: input.signal,
        body: { Message: reason },
      },
    );

    return { ...current, status: 'cancelled' };
  }

  async extendExpiry(
    input: ExtendSignatureRequestExpiryInput,
  ): Promise<SignatureRequest> {
    const current = await this.getRequest(input);
    const expiresAt = normalizeDate(input.expiresAt, 'BoldSign expiresAt');

    if (isTerminalStatus(current.status)) {
      throw new SignatureInputError(
        `BoldSign request ${current.id} expiry cannot be extended from ${current.status}.`,
      );
    }

    if (expiresAt.getTime() <= this.now().getTime()) {
      throw new SignatureInputError(
        'BoldSign expiresAt must be in the future.',
      );
    }

    if (
      current.expiresAt &&
      expiresAt.getTime() <= current.expiresAt.getTime()
    ) {
      throw new SignatureInputError(
        'BoldSign expiresAt must extend the current expiry date.',
      );
    }

    if (
      current.createdAt &&
      expiresAt.getTime() >
        current.createdAt.getTime() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1_000
    ) {
      throw new SignatureInputError(
        `BoldSign expiresAt cannot exceed ${MAX_EXPIRY_DAYS} days from document creation.`,
      );
    }

    await this.request(
      `/document/extendExpiry?documentId=${encodeURIComponent(current.id)}`,
      {
        method: 'PATCH',
        operation: 'mutate',
        expect: 'empty',
        signal: input.signal,
        body: {
          // We create requests with BoldSign's `Days` expiry type, whose
          // extendExpiry endpoint requires a yyyy-MM-dd value.
          NewExpiryValue: expiresAt.toISOString().slice(0, 10),
          WarnPrior: input.warnPrior,
        },
      },
    );

    return { ...current, expiresAt };
  }

  async downloadArtifact(
    input: DownloadSignatureArtifactInput,
  ): Promise<SignatureArtifact> {
    if (!['signed_document', 'audit_trail'].includes(input.kind)) {
      throw new SignatureInputError(
        'BoldSign artifact kind must be signed_document or audit_trail.',
      );
    }

    const current = await this.getRequest(input);

    if (current.status !== 'completed') {
      throw new SignatureInputError(
        'BoldSign execution artifacts may only be downloaded after completion.',
      );
    }

    const endpoint =
      input.kind === 'signed_document'
        ? '/document/download'
        : '/document/downloadAuditLog';
    const response = (await this.request(
      `${endpoint}?documentId=${encodeURIComponent(current.id)}`,
      {
        signal: input.signal,
        operation: 'read',
        expect: 'stream',
      },
    )) as ReadableStream<Uint8Array>;
    const suffix = input.kind === 'signed_document' ? 'signed' : 'audit';
    const hashed = createSha256Stream(response);

    return {
      provider: BOLDSIGN_PROVIDER_ID,
      tenantId: this.tenantId,
      requestId: current.id,
      kind: input.kind,
      filename: `${safeFilename(current.id)}-${suffix}.pdf`,
      mediaType: 'application/pdf',
      stream: hashed.stream,
      sha256: hashed.sha256,
      retrievedAt: new Date(this.now()),
    };
  }

  parseWebhook(input: ParseSignatureWebhookInput): SignatureWebhookEvent {
    if (this.webhookSecrets.length === 0) {
      throw new SignatureConfigurationError(
        'BoldSignAdapter parseWebhook requires webhookSecrets.',
      );
    }

    verifyBoldSignWebhookSignature({
      ...input,
      secrets: this.webhookSecrets,
      toleranceSeconds: this.webhookToleranceSeconds,
      now: this.now(),
    });

    let parsed: unknown;

    try {
      parsed = JSON.parse(input.payload);
    } catch (error) {
      throw new SignatureVerificationError(
        'BoldSign webhook payload is not valid JSON.',
        { cause: error },
      );
    }

    const body = verificationRecord(parsed, 'BoldSign webhook payload');
    const event = verificationRecord(
      body.event,
      'BoldSign webhook event metadata',
    );
    const data = verificationRecord(body.data, 'BoldSign webhook data');
    this.assertProviderTenant(data);

    const id = requireVerificationString(
      readString(event, 'id'),
      'BoldSign webhook event id',
    );
    const type = requireVerificationString(
      readString(event, 'eventType'),
      'BoldSign webhook event type',
    );
    const normalizedType = type.toLowerCase();

    if (!SUPPORTED_BOLDSIGN_DOCUMENT_EVENTS.has(normalizedType)) {
      throw new SignatureVerificationError(
        `Unsupported BoldSign webhook event type: ${type}`,
      );
    }
    const requestId = requireVerificationString(
      readString(data, 'documentId'),
      'BoldSign webhook documentId',
    );
    const created = readNumber(event, 'created');

    if (
      created === undefined ||
      !Number.isSafeInteger(created) ||
      created < 0 ||
      Number.isNaN(new Date(created * 1_000).getTime())
    ) {
      throw new SignatureVerificationError(
        'BoldSign webhook event created must be an epoch timestamp.',
      );
    }

    return {
      id,
      provider: BOLDSIGN_PROVIDER_ID,
      tenantId: this.tenantId,
      requestId,
      type,
      status: mapBoldSignWebhookStatus(type, readString(data, 'status')),
      createdAt: new Date(created * 1_000),
      environment: optionalTrimmedString(readString(event, 'environment')),
      signers: mapBoldSignSigners(data),
      replay: {
        deduplicationKey: `${BOLDSIGN_PROVIDER_ID}:${this.tenantId}:${id}`,
        orderingKey: `${BOLDSIGN_PROVIDER_ID}:${this.tenantId}:${requestId}`,
      },
      raw: body,
    };
  }

  private assertTenant(tenantId: string): void {
    const normalized = requireNonEmptyString(tenantId, 'BoldSign tenantId');

    if (normalized !== this.tenantId) {
      throw new SignatureTenantMismatchError(
        'Signature request tenant does not match the configured BoldSign tenant.',
      );
    }
  }

  private assertProviderTenant(value: Record<string, unknown>): void {
    const metadata = readBoldSignMetadata(value);
    const providerTenantId = metadata[BOLDSIGN_TENANT_METADATA_KEY];

    if (providerTenantId !== this.tenantId) {
      throw new SignatureTenantMismatchError(
        'BoldSign resource is missing the configured tenant binding or belongs to another tenant.',
      );
    }
  }

  private async request(
    path: string,
    options: BoldSignRequestOptions = {},
  ): Promise<Record<string, unknown> | ReadableStream<Uint8Array> | undefined> {
    const headers = new Headers({ Accept: 'application/json' });

    if (this.apiKey) {
      headers.set('X-API-KEY', this.apiKey);
    } else if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;

    try {
      response = await this.fetch(`${this.apiBaseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof SignatureProviderError) {
        throw error;
      }

      throw new SignatureProviderError('BoldSign API request failed.', {
        cause: error,
        retryable: true,
        requestMayHaveSucceeded: options.operation === 'create',
      });
    }

    if (!response.ok) {
      throw await boldSignResponseError(
        response,
        options.operation === 'create',
      );
    }

    if (options.expect === 'empty' || response.status === 204) {
      return undefined;
    }

    if (options.expect === 'stream') {
      if (!response.body) {
        throw new SignatureProviderError(
          'BoldSign API returned an empty artifact stream.',
        );
      }

      return response.body;
    }

    const text = await response.text();

    if (!text) {
      throw new SignatureProviderError(
        'BoldSign API returned an empty JSON response.',
      );
    }

    try {
      return requireRecord(JSON.parse(text), 'BoldSign API response');
    } catch (error) {
      if (error instanceof SignatureProviderError) {
        throw error;
      }

      throw new SignatureProviderError('BoldSign API returned invalid JSON.', {
        cause: error,
      });
    }
  }
}

export interface VerifyBoldSignWebhookSignatureInput
  extends ParseSignatureWebhookInput {
  secrets: string | readonly string[];
  toleranceSeconds?: number;
  now?: Date;
}

export function verifyBoldSignWebhookSignature(
  input: VerifyBoldSignWebhookSignatureInput,
): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SignatureVerificationError(
      'BoldSign webhook verification input must be an object.',
    );
  }

  if (typeof input.payload !== 'string') {
    throw new SignatureVerificationError(
      'BoldSign webhook payload must be a string.',
    );
  }

  const header = verificationString(
    input.signature,
    'BoldSign signature header',
  );
  const secrets = normalizeVerificationSecrets(input.secrets);
  const toleranceSeconds = normalizeWebhookTolerance(input.toleranceSeconds);
  const now = input.now ?? new Date();

  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new SignatureVerificationError(
      'BoldSign webhook verification now must be a valid Date.',
    );
  }

  const timestamps: string[] = [];
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawKey?.trim();
    const value = rawValue.join('=').trim();

    if (!key || !value) {
      continue;
    }

    if (key === 't') {
      timestamps.push(value);
    } else if (key === 's0' || key === 's1') {
      signatures.push(value);
    }
  }

  if (timestamps.length !== 1 || signatures.length === 0) {
    throw new SignatureVerificationError('Invalid BoldSign signature header.');
  }

  const timestampText = timestamps[0] ?? '';

  if (!/^\d+$/.test(timestampText)) {
    throw new SignatureVerificationError('Invalid BoldSign webhook timestamp.');
  }

  const timestamp = Number(timestampText);

  if (!Number.isSafeInteger(timestamp)) {
    throw new SignatureVerificationError('Invalid BoldSign webhook timestamp.');
  }

  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1_000) - timestamp);

  if (ageSeconds > toleranceSeconds) {
    throw new SignatureVerificationError(
      'BoldSign webhook timestamp is outside the allowed tolerance.',
    );
  }

  const signedPayload = `${timestampText}.${input.payload}`;
  const matched = secrets.some((secret) => {
    const expected = Buffer.from(
      createHmac('sha256', secret).update(signedPayload).digest('hex'),
      'utf8',
    );

    return signatures.some((signature) => {
      if (!/^[a-f\d]{64}$/i.test(signature)) {
        return false;
      }

      const received = Buffer.from(signature.toLowerCase(), 'utf8');

      return (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
      );
    });
  });

  if (!matched) {
    throw new SignatureVerificationError(
      'BoldSign webhook signature did not match.',
    );
  }
}

function configurationString(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SignatureConfigurationError(
      `${context} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function optionalConfigurationString(
  value: unknown,
  context: string,
): string | undefined {
  return value === undefined ? undefined : configurationString(value, context);
}

function normalizeBaseUrl(value: string): string {
  const raw = configurationString(value, 'BoldSignAdapter apiBaseUrl');
  let url: URL;

  try {
    url = new URL(raw);
  } catch (error) {
    throw new SignatureConfigurationError(
      'BoldSignAdapter apiBaseUrl must be a valid URL.',
      { cause: error },
    );
  }

  if (url.protocol !== 'https:') {
    throw new SignatureConfigurationError(
      'BoldSignAdapter apiBaseUrl must use HTTPS.',
    );
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new SignatureConfigurationError(
      'BoldSignAdapter apiBaseUrl must not contain credentials, query parameters, or a fragment.',
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function normalizeWebhookSecrets(
  value: string | readonly string[] | undefined,
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  try {
    return normalizeVerificationSecrets(value);
  } catch (error) {
    throw new SignatureConfigurationError(
      'BoldSignAdapter webhookSecrets must contain non-empty strings.',
      { cause: error },
    );
  }
}

function normalizeVerificationSecrets(
  value: string | readonly string[],
): readonly string[] {
  const candidates = typeof value === 'string' ? [value] : value;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new SignatureVerificationError(
      'BoldSign webhook secrets must contain at least one secret.',
    );
  }

  return candidates.map((secret) =>
    verificationString(secret, 'BoldSign webhook secret'),
  );
}

function normalizeWebhookTolerance(value: number | undefined): number {
  const tolerance = value ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;

  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new SignatureConfigurationError(
      'BoldSign webhook tolerance must be a positive finite number.',
    );
  }

  return tolerance;
}

async function normalizeDocuments(
  documents: readonly CreateSignatureRequestInput['documents'][number][],
  signal?: AbortSignal,
): Promise<readonly NormalizedSignatureDocument[]> {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new SignatureInputError(
      'BoldSign createRequest requires at least one document.',
    );
  }

  if (documents.length > 25) {
    throw new SignatureInputError(
      'BoldSign createRequest supports at most 25 documents.',
    );
  }

  const normalized: NormalizedSignatureDocument[] = [];
  let totalBytes = 0;

  for (const [index, document] of documents.entries()) {
    if (!document || typeof document !== 'object') {
      throw new SignatureInputError(
        `BoldSign document ${index + 1} must be an object.`,
      );
    }

    const name = requireNonEmptyString(
      document.name,
      `BoldSign document ${index + 1} name`,
    );
    const mediaType = requireNonEmptyString(
      document.mediaType,
      `BoldSign document ${index + 1} mediaType`,
    );
    const data = await readByteSource(
      document.data,
      `BoldSign document ${index + 1} data`,
      signal,
    );
    totalBytes += data.length;

    if (totalBytes > MAX_BOLDSIGN_DOCUMENT_BYTES) {
      throw new SignatureInputError(
        'BoldSign document files exceed the 25 MB aggregate limit.',
      );
    }

    normalized.push({ name, mediaType, data });
  }

  return normalized;
}

function normalizeSignerInputs(
  signers: readonly SignatureSignerInput[],
): readonly SignatureSignerInput[] {
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new SignatureInputError(
      'BoldSign createRequest requires at least one signer.',
    );
  }

  const normalized = signers.map((signer, index) => {
    if (!signer || typeof signer !== 'object') {
      throw new SignatureInputError(
        `BoldSign signer ${index + 1} must be an object.`,
      );
    }

    const name = requireNonEmptyString(
      signer.name,
      `BoldSign signer ${index + 1} name`,
    );
    const email = requireNonEmptyString(
      signer.email,
      `BoldSign signer ${index + 1} email`,
    );

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new SignatureInputError(
        `BoldSign signer ${index + 1} email must be valid.`,
      );
    }

    if (!Array.isArray(signer.fields) || signer.fields.length === 0) {
      throw new SignatureInputError(
        `BoldSign signer ${index + 1} requires at least one field.`,
      );
    }

    const fields = (signer.fields as readonly SignatureField[]).map(
      (field: SignatureField, fieldIndex: number) =>
        normalizeField(field, index, fieldIndex),
    );
    const order = normalizeOptionalPositiveInteger(
      signer.order,
      `BoldSign signer ${index + 1} order`,
    );

    return {
      ...signer,
      name,
      email,
      role: optionalTrimmedString(signer.role),
      privateMessage: optionalTrimmedString(signer.privateMessage),
      order,
      authentication: normalizeAuthentication(signer.authentication, index),
      fields,
    };
  });

  const emails = new Set<string>();

  for (const signer of normalized) {
    const email = signer.email.toLowerCase();

    if (emails.has(email)) {
      throw new SignatureInputError(
        'BoldSign createRequest signer emails must be unique.',
      );
    }

    emails.add(email);
  }

  return normalized;
}

function normalizeField(
  field: SignatureField,
  signerIndex: number,
  fieldIndex: number,
): SignatureField {
  const context = `BoldSign signer ${signerIndex + 1} field ${fieldIndex + 1}`;

  if (!field || typeof field !== 'object') {
    throw new SignatureInputError(`${context} must be an object.`);
  }

  const id = requireNonEmptyString(field.id, `${context} id`);

  if (!/^[A-Za-z_]\w*$/.test(id)) {
    throw new SignatureInputError(
      `${context} id must start with a letter or underscore and contain only letters, digits, and underscores.`,
    );
  }

  if (!['signature', 'initial', 'date_signed', 'text'].includes(field.type)) {
    throw new SignatureInputError(`${context} has an unsupported type.`);
  }

  const page = normalizePositiveInteger(field.page, `${context} page`);

  if (!field.bounds || typeof field.bounds !== 'object') {
    throw new SignatureInputError(`${context} bounds must be an object.`);
  }

  const bounds = {
    x: normalizeNonNegativeFinite(field.bounds.x, `${context} bounds.x`),
    y: normalizeNonNegativeFinite(field.bounds.y, `${context} bounds.y`),
    width: normalizePositiveFinite(
      field.bounds.width,
      `${context} bounds.width`,
    ),
    height: normalizePositiveFinite(
      field.bounds.height,
      `${context} bounds.height`,
    ),
  };

  return {
    id,
    type: field.type,
    page,
    bounds,
    required: field.required ?? true,
    value: optionalTrimmedString(field.value),
  };
}

function normalizeAuthentication(
  value: SignatureAuthentication | undefined,
  signerIndex: number,
): SignatureAuthentication {
  const authentication = value ?? { method: 'none' };
  const context = `BoldSign signer ${signerIndex + 1} authentication`;

  if (!authentication || typeof authentication !== 'object') {
    throw new SignatureInputError(`${context} must be an object.`);
  }

  if (
    ![
      'none',
      'access_code',
      'email_otp',
      'sms_otp',
      'identity_verification',
    ].includes(authentication.method)
  ) {
    throw new SignatureInputError(`${context} method is unsupported.`);
  }

  if (authentication.method === 'access_code') {
    return {
      method: 'access_code',
      accessCode: requireNonEmptyString(
        authentication.accessCode,
        `${context} accessCode`,
      ),
    };
  }

  if (authentication.method === 'sms_otp') {
    const phone = authentication.phone;

    if (!phone || typeof phone !== 'object') {
      throw new SignatureInputError(
        `${context} phone is required for sms_otp.`,
      );
    }

    const countryCode = requireNonEmptyString(
      phone.countryCode,
      `${context} phone.countryCode`,
    );
    const number = requireNonEmptyString(
      phone.number,
      `${context} phone.number`,
    );

    if (
      !/^\+\d{1,3}$/.test(countryCode) ||
      !/^\d{4,15}$/.test(number) ||
      countryCode.length - 1 + number.length > 15
    ) {
      throw new SignatureInputError(
        `${context} phone must contain an E.164 country code and national number.`,
      );
    }

    return { method: 'sms_otp', phone: { countryCode, number } };
  }

  if (authentication.method === 'identity_verification') {
    const settings = authentication.identityVerification ?? {};
    const frequency = normalizeOptionalEnum(
      settings.frequency,
      ['every_access', 'until_signed', 'once_per_document'] as const,
      `${context} frequency`,
    );
    const nameMatch = normalizeOptionalEnum(
      settings.nameMatch,
      ['strict', 'moderate', 'lenient'] as const,
      `${context} nameMatch`,
    );
    const maximumRetryCount = normalizeOptionalIntegerRange(
      settings.maximumRetryCount,
      1,
      10,
      `${context} maximumRetryCount`,
    );
    const allowedDocumentTypes = normalizeOptionalEnumArray(
      settings.allowedDocumentTypes,
      ['passport', 'identity_card', 'driver_license'] as const,
      `${context} allowedDocumentTypes`,
    );

    if (
      settings.allowedCountries !== undefined &&
      !Array.isArray(settings.allowedCountries)
    ) {
      throw new SignatureInputError(
        `${context} allowedCountries must be an array.`,
      );
    }

    const allowedCountries = settings.allowedCountries?.map((country) => {
      const normalized = requireNonEmptyString(
        country,
        `${context} allowed country`,
      ).toUpperCase();

      if (!/^[A-Z]{2}$/.test(normalized)) {
        throw new SignatureInputError(
          `${context} allowed countries must be ISO 3166-1 alpha-2 codes.`,
        );
      }

      return normalized;
    });

    return {
      method: 'identity_verification',
      identityVerification: {
        ...settings,
        frequency,
        nameMatch,
        maximumRetryCount,
        requireLiveCapture: normalizeOptionalBoolean(
          settings.requireLiveCapture,
          `${context} requireLiveCapture`,
        ),
        requireMatchingSelfie: normalizeOptionalBoolean(
          settings.requireMatchingSelfie,
          `${context} requireMatchingSelfie`,
        ),
        allowedDocumentTypes,
        allowedCountries,
      },
    };
  }

  return { method: authentication.method };
}

function normalizeMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
  reserved: Record<string, string>,
): Readonly<Record<string, string>> {
  if (
    metadata !== undefined &&
    (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
  ) {
    throw new SignatureInputError('BoldSign metadata must be an object.');
  }

  const result: Record<string, string> = {};
  const reservedKeys = new Set(Object.keys(reserved));

  for (const [key, value] of Object.entries(metadata ?? {})) {
    const normalizedKey = requireNonEmptyString(key, 'BoldSign metadata key');

    if (reservedKeys.has(normalizedKey)) {
      throw new SignatureInputError(
        `BoldSign metadata key ${normalizedKey} is reserved.`,
      );
    }

    if (normalizedKey.length > MAX_BOLDSIGN_METADATA_KEY_LENGTH) {
      throw new SignatureInputError(
        `BoldSign metadata key ${normalizedKey} exceeds ${MAX_BOLDSIGN_METADATA_KEY_LENGTH} characters.`,
      );
    }

    if (typeof value !== 'string') {
      throw new SignatureInputError(
        `BoldSign metadata value for ${normalizedKey} must be a string.`,
      );
    }

    if (value.length > MAX_BOLDSIGN_METADATA_VALUE_LENGTH) {
      throw new SignatureInputError(
        `BoldSign metadata value for ${normalizedKey} exceeds ${MAX_BOLDSIGN_METADATA_VALUE_LENGTH} characters.`,
      );
    }

    result[normalizedKey] = value;
  }

  for (const [key, value] of Object.entries(reserved)) {
    if (value.length > MAX_BOLDSIGN_METADATA_VALUE_LENGTH) {
      throw new SignatureInputError(
        `BoldSign ${key} exceeds ${MAX_BOLDSIGN_METADATA_VALUE_LENGTH} characters.`,
      );
    }

    result[key] = value;
  }

  if (Object.keys(result).length > MAX_BOLDSIGN_METADATA_ENTRIES) {
    throw new SignatureInputError(
      `BoldSign metadata supports at most ${MAX_BOLDSIGN_METADATA_ENTRIES} entries including tenant and idempotency bindings.`,
    );
  }

  return result;
}

function normalizeExpiryDays(value: number | undefined): number {
  const days = value ?? 60;

  if (
    !Number.isSafeInteger(days) ||
    days < MIN_EXPIRY_DAYS ||
    days > MAX_EXPIRY_DAYS
  ) {
    throw new SignatureInputError(
      `BoldSign expiresInDays must be an integer from ${MIN_EXPIRY_DAYS} to ${MAX_EXPIRY_DAYS}.`,
    );
  }

  return days;
}

function toBoldSignSigner(
  signer: SignatureSignerInput,
): Record<string, unknown> {
  const authentication = signer.authentication ?? { method: 'none' as const };
  const result: Record<string, unknown> = {
    Name: signer.name,
    EmailAddress: signer.email,
    SignerType: 'Signer',
    SignerRole: signer.role,
    Order: signer.order,
    PrivateMessage: signer.privateMessage,
    Locale: 'EN',
    FormFields: signer.fields.map((field) => ({
      Id: field.id,
      Name: field.id,
      FieldType: toBoldSignFieldType(field.type),
      PageNumber: field.page,
      Bounds: {
        X: field.bounds.x,
        Y: field.bounds.y,
        Width: field.bounds.width,
        Height: field.bounds.height,
      },
      IsRequired: field.required ?? true,
      Value: field.value,
    })),
    ...toBoldSignAuthentication(authentication),
  };

  return withoutUndefined(result);
}

function toBoldSignFieldType(type: SignatureField['type']): string {
  switch (type) {
    case 'signature':
      return 'Signature';
    case 'initial':
      return 'Initial';
    case 'date_signed':
      return 'DateSigned';
    case 'text':
      return 'TextBox';
  }
}

function toBoldSignAuthentication(
  authentication: SignatureAuthentication,
): Record<string, unknown> {
  switch (authentication.method) {
    case 'access_code':
      return {
        AuthenticationType: 'AccessCode',
        AuthenticationCode: authentication.accessCode,
      };
    case 'email_otp':
      return { AuthenticationType: 'EmailOTP', EnableEmailOTP: true };
    case 'sms_otp':
      return {
        AuthenticationType: 'SMSOTP',
        PhoneNumber: authentication.phone
          ? {
              CountryCode: authentication.phone.countryCode,
              Number: authentication.phone.number,
            }
          : undefined,
      };
    case 'identity_verification':
      return {
        AuthenticationType: 'IdVerification',
        IdentityVerificationSettings: toBoldSignIdentityVerification(
          authentication.identityVerification,
        ),
      };
    case 'none':
      return { AuthenticationType: 'None' };
  }
}

function toBoldSignIdentityVerification(
  settings: SignatureAuthentication['identityVerification'],
): Record<string, unknown> {
  return withoutUndefined({
    Type:
      settings?.frequency === undefined
        ? undefined
        : {
            every_access: 'EveryAccess',
            until_signed: 'UntilSignCompleted',
            once_per_document: 'OncePerDocument',
          }[settings.frequency],
    MaximumRetryCount: settings?.maximumRetryCount,
    RequireLiveCapture: settings?.requireLiveCapture,
    RequireMatchingSelfie: settings?.requireMatchingSelfie,
    NameMatcher:
      settings?.nameMatch === undefined
        ? undefined
        : {
            strict: 'Strict',
            moderate: 'Moderate',
            lenient: 'Lenient',
          }[settings.nameMatch],
    AllowedDocumentTypes: settings?.allowedDocumentTypes?.map(
      (type) =>
        ({
          passport: 'Passport',
          identity_card: 'IDCard',
          driver_license: 'DriverLicense',
        })[type],
    ),
    AllowedCountries: settings?.allowedCountries,
  });
}

function inputSignerToResult(signer: SignatureSignerInput): SignatureSigner {
  return {
    name: signer.name,
    email: signer.email,
    role: signer.role,
    order: signer.order,
    status: 'pending',
    authenticationMethod: signer.authentication?.method ?? 'none',
  };
}

function mapBoldSignRequest(
  value: Record<string, unknown>,
  tenantId: string,
): SignatureRequest {
  const id = requireProviderString(
    readString(value, 'documentId'),
    'BoldSign document properties documentId',
  );
  const createdAt = parseOptionalEpochSeconds(value.createdDate);
  const expiresAt = parseBoldSignExpiry(value, createdAt);

  return {
    provider: BOLDSIGN_PROVIDER_ID,
    tenantId,
    id,
    status: mapBoldSignStatus(readString(value, 'status')),
    title: optionalTrimmedString(readString(value, 'messageTitle')),
    signers: mapBoldSignSigners(value),
    createdAt,
    expiresAt,
    metadata: readBoldSignMetadata(value),
    raw: value,
  };
}

function mapBoldSignSigners(value: Record<string, unknown>): SignatureSigner[] {
  return readRecords(value, 'signerDetails').map((signer) => ({
    id: optionalTrimmedString(readString(signer, 'id')),
    name: requireProviderString(
      readString(signer, 'signerName'),
      'BoldSign signer name',
    ),
    email: requireProviderString(
      readString(signer, 'signerEmail'),
      'BoldSign signer email',
    ),
    role: optionalTrimmedString(readString(signer, 'signerRole')),
    order: readNumber(signer, 'order'),
    status: mapBoldSignSignerStatus(
      readString(signer, 'status'),
      readBoolean(signer, 'isDeliveryFailed'),
      readBoolean(signer, 'isViewed'),
      readBoolean(signer, 'isAuthenticationFailed') === true ||
        readString(readRecord(signer, 'idVerification'), 'status')
          ?.trim()
          .toLowerCase() === 'failed',
    ),
    authenticationMethod: mapBoldSignAuthentication(
      readString(signer, 'authenticationType'),
    ),
    viewed: readBoolean(signer, 'isViewed'),
    deliveryFailed: readBoolean(signer, 'isDeliveryFailed'),
  }));
}

function mapBoldSignStatus(value: string | undefined): SignatureRequestStatus {
  switch (value?.trim().toLowerCase()) {
    case 'draft':
      return 'prepared';
    case 'inprogress':
    case 'in_progress':
    case 'sent':
    case 'needsattention':
    case 'needs_attention':
    case 'needs attention':
      return 'sent';
    case 'viewed':
      return 'viewed';
    case 'partiallysigned':
    case 'partially_signed':
      return 'partially_signed';
    case 'completed':
      return 'completed';
    case 'declined':
      return 'declined';
    case 'revoked':
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'failed':
    case 'sendfailed':
      return 'failed';
    default:
      throw new SignatureProviderError(
        `Unsupported BoldSign document status: ${value ?? '<missing>'}`,
      );
  }
}

function mapBoldSignWebhookStatus(
  eventType: string,
  documentStatus: string | undefined,
): SignatureRequestStatus {
  switch (eventType.trim().toLowerCase()) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'viewed':
      return 'viewed';
    case 'signed':
      return documentStatus?.toLowerCase() === 'completed'
        ? 'completed'
        : 'partially_signed';
    case 'completed':
      return 'completed';
    case 'declined':
      return 'declined';
    case 'revoked':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'sendfailed':
      return 'failed';
    default:
      return mapBoldSignStatus(documentStatus);
  }
}

function mapBoldSignSignerStatus(
  value: string | undefined,
  deliveryFailed: boolean | undefined,
  viewed: boolean | undefined,
  authenticationFailed = false,
): SignatureSignerStatus {
  if (deliveryFailed || authenticationFailed) {
    return 'failed';
  }

  switch (value?.trim().toLowerCase()) {
    case 'notcompleted':
    case 'not_completed':
    case 'pending':
      return viewed ? 'viewed' : 'pending';
    case 'completed':
    case 'signed':
      return 'signed';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'failed':
    case 'authenticationfailed':
      return 'failed';
    default:
      throw new SignatureProviderError(
        `Unsupported BoldSign signer status: ${value ?? '<missing>'}`,
      );
  }
}

function mapBoldSignAuthentication(
  value: string | undefined,
): SignatureAuthenticationMethod | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'none':
      return 'none';
    case 'accesscode':
      return 'access_code';
    case 'emailotp':
      return 'email_otp';
    case 'smsotp':
      return 'sms_otp';
    case 'idverification':
      return 'identity_verification';
    default:
      return undefined;
  }
}

function readBoldSignMetadata(
  value: Record<string, unknown>,
): Record<string, string> {
  const metadata =
    readRecord(value, 'metaData') ??
    readRecord(value, 'metadata') ??
    readRecord(value, 'MetaData') ??
    {};
  const result: Record<string, string> = {};

  for (const [key, item] of Object.entries(metadata)) {
    if (typeof item === 'string') {
      result[key] = item;
    }
  }

  return result;
}

function parseBoldSignExpiry(
  value: Record<string, unknown>,
  createdAt: Date | undefined,
): Date | undefined {
  const raw = value.expiryDate;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return new Date(raw * 1_000);
  }

  if (typeof raw === 'string' && raw.trim()) {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const expiryDays = readNumber(value, 'expiryDays');

  return createdAt && expiryDays !== undefined
    ? new Date(createdAt.getTime() + expiryDays * 24 * 60 * 60 * 1_000)
    : undefined;
}

async function boldSignResponseError(
  response: Response,
  createOperation: boolean,
): Promise<SignatureProviderError> {
  const text = await response.text();
  let body: Record<string, unknown> | undefined;

  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown;
      body =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : undefined;
    } catch {
      body = undefined;
    }
  }

  const nestedError = body ? readRecord(body, 'error') : undefined;
  const message =
    optionalTrimmedString(readString(body, 'message')) ??
    optionalTrimmedString(readString(nestedError, 'message')) ??
    `HTTP ${response.status}`;
  const retryable =
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429 ||
    response.status >= 500;

  return new SignatureProviderError(`BoldSign API: ${message}`, {
    status: response.status,
    retryable,
    retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
    requestMayHaveSucceeded:
      createOperation && (response.status === 408 || response.status >= 500),
  });
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1_000);
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? undefined
    : Math.max(0, date.getTime() - Date.now());
}

function normalizePositiveInteger(value: number, context: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SignatureInputError(`${context} must be a positive integer.`);
  }

  return value;
}

function normalizeOptionalPositiveInteger(
  value: number | undefined,
  context: string,
): number | undefined {
  return value === undefined
    ? undefined
    : normalizePositiveInteger(value, context);
}

function normalizeOptionalIntegerRange(
  value: number | undefined,
  min: number,
  max: number,
  context: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new SignatureInputError(
      `${context} must be an integer from ${min} to ${max}.`,
    );
  }

  return value;
}

function normalizeOptionalBoolean(
  value: boolean | undefined,
  context: string,
): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new SignatureInputError(`${context} must be a boolean.`);
  }

  return value;
}

function normalizeOptionalEnum<const T extends string>(
  value: T | undefined,
  allowed: readonly T[],
  context: string,
): T | undefined {
  if (value !== undefined && !allowed.includes(value)) {
    throw new SignatureInputError(
      `${context} must be one of ${allowed.join(', ')}.`,
    );
  }

  return value;
}

function normalizeOptionalEnumArray<const T extends string>(
  value: readonly T[] | undefined,
  allowed: readonly T[],
  context: string,
): readonly T[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new SignatureInputError(`${context} must be an array.`);
  }

  return value.map((item) => {
    const normalized = normalizeOptionalEnum(item, allowed, context);

    if (normalized === undefined) {
      throw new SignatureInputError(`${context} must not contain undefined.`);
    }

    return normalized;
  });
}

function normalizeNonNegativeFinite(value: number, context: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new SignatureInputError(
      `${context} must be a non-negative finite number.`,
    );
  }

  return value;
}

function normalizePositiveFinite(value: number, context: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SignatureInputError(
      `${context} must be a positive finite number.`,
    );
  }

  return value;
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireProviderString(
  value: string | undefined,
  context: string,
): string {
  if (!value?.trim()) {
    throw new SignatureProviderError(`${context} must be a non-empty string.`);
  }

  return value.trim();
}

function verificationString(value: unknown, context: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new SignatureVerificationError(
      `${context} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function requireVerificationString(
  value: string | undefined,
  context: string,
): string {
  return verificationString(value, context);
}

function verificationRecord(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SignatureVerificationError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function withoutUndefined(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 120) || 'document';
}

interface NormalizedSignatureDocument {
  name: string;
  mediaType: string;
  data: Uint8Array;
}

async function readByteSource(
  source: CreateSignatureRequestInput['documents'][number]['data'],
  context: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    if (source.length === 0) {
      throw new SignatureInputError(`${context} must not be empty.`);
    }

    if (source.length > MAX_BOLDSIGN_DOCUMENT_BYTES) {
      throw new SignatureInputError(
        `${context} exceeds BoldSign's 25 MB limit.`,
      );
    }

    return source;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const append = (chunk: unknown) => {
    signal?.throwIfAborted();

    if (!(chunk instanceof Uint8Array) || chunk.length === 0) {
      throw new SignatureInputError(
        `${context} stream must yield non-empty Uint8Array chunks.`,
      );
    }

    total += chunk.length;

    if (total > MAX_BOLDSIGN_DOCUMENT_BYTES) {
      throw new SignatureInputError(
        `${context} exceeds BoldSign's 25 MB limit.`,
      );
    }

    chunks.push(chunk);
  };

  signal?.throwIfAborted();

  if (isReadableStream(source)) {
    const reader = source.getReader();

    try {
      while (true) {
        const result = await reader.read();

        if (result.done) {
          break;
        }

        append(result.value);
      }
    } finally {
      reader.releaseLock();
    }
  } else if (isAsyncIterable(source)) {
    for await (const chunk of source) {
      append(chunk);
    }
  } else {
    throw new SignatureInputError(
      `${context} must be a Uint8Array, ReadableStream, or AsyncIterable.`,
    );
  }

  if (total === 0) {
    throw new SignatureInputError(`${context} must not be empty.`);
  }

  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { getReader?: unknown }).getReader === 'function'
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    Symbol.asyncIterator in value
  );
}

function createSha256Stream(source: ReadableStream<Uint8Array>): {
  stream: ReadableStream<Uint8Array>;
  sha256: Promise<string>;
} {
  const reader = source.getReader();
  const hash = createHash('sha256');
  let settled = false;
  let resolveHash: (value: string) => void;
  let rejectHash: (reason?: unknown) => void;
  const sha256 = new Promise<string>((resolve, reject) => {
    resolveHash = resolve;
    rejectHash = reject;
  });
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();

        if (result.done) {
          settled = true;
          resolveHash(hash.digest('hex'));
          controller.close();
          return;
        }

        hash.update(result.value);
        controller.enqueue(result.value);
      } catch (error) {
        settled = true;
        rejectHash(error);
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        if (!settled) {
          settled = true;
          rejectHash(
            new SignatureProviderError(
              'BoldSign artifact stream was cancelled before hashing completed.',
            ),
          );
        }
      }
    },
  });

  return { stream, sha256 };
}

function isTerminalStatus(status: SignatureRequestStatus): boolean {
  return ['completed', 'declined', 'cancelled', 'expired', 'failed'].includes(
    status,
  );
}
