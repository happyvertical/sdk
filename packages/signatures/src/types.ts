export type SignatureProviderType = 'boldsign';

export type SignatureRequestStatus =
  | 'prepared'
  | 'sent'
  | 'delivered'
  | 'viewed'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'failed';

export type SignatureSignerStatus =
  | 'pending'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'expired'
  | 'failed';

export type SignatureAuthenticationMethod =
  | 'none'
  | 'access_code'
  | 'email_otp'
  | 'sms_otp'
  | 'identity_verification';

export type SignatureFieldType =
  | 'signature'
  | 'initial'
  | 'date_signed'
  | 'text';

export type SignatureArtifactKind = 'signed_document' | 'audit_trail';

export interface SignatureProviderCapabilities {
  id: string;
  displayName: string;
  region: string;
  supportsWebhooks: boolean;
  supportsCancellation: boolean;
  supportsExpiryExtension: boolean;
  supportsSignedDocument: boolean;
  supportsAuditTrail: boolean;
  /** Whether the remote API provides atomic request-creation idempotency. */
  providerEnforcedIdempotency: boolean;
  authenticationMethods: readonly SignatureAuthenticationMethod[];
}

export type SignatureByteSource =
  | Uint8Array
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;

export interface SignatureDocument {
  name: string;
  mediaType: string;
  data: SignatureByteSource;
}

export interface SignatureFieldBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SignatureField {
  id: string;
  type: SignatureFieldType;
  /** One-based page number in the provider's combined document. */
  page: number;
  bounds: SignatureFieldBounds;
  required?: boolean;
  value?: string;
}

export interface SignaturePhoneNumber {
  /** E.164 country calling code, including the leading `+`. */
  countryCode: string;
  /** National phone number, without the country calling code. */
  number: string;
}

export interface SignatureIdentityVerificationOptions {
  frequency?: 'every_access' | 'until_signed' | 'once_per_document';
  maximumRetryCount?: number;
  requireLiveCapture?: boolean;
  requireMatchingSelfie?: boolean;
  nameMatch?: 'strict' | 'moderate' | 'lenient';
  allowedDocumentTypes?: readonly (
    | 'passport'
    | 'identity_card'
    | 'driver_license'
  )[];
  allowedCountries?: readonly string[];
}

export interface SignatureAuthentication {
  method: SignatureAuthenticationMethod;
  /** Required only for `access_code`; never returned by provider reads/events. */
  accessCode?: string;
  /** Required only for `sms_otp`. */
  phone?: SignaturePhoneNumber;
  identityVerification?: SignatureIdentityVerificationOptions;
}

export interface SignatureSignerInput {
  name: string;
  email: string;
  role?: string;
  order?: number;
  privateMessage?: string;
  authentication?: SignatureAuthentication;
  fields: readonly SignatureField[];
}

export interface SignatureSigner {
  id?: string;
  name: string;
  email: string;
  role?: string;
  order?: number;
  status: SignatureSignerStatus;
  authenticationMethod?: SignatureAuthenticationMethod;
  viewed?: boolean;
  deliveryFailed?: boolean;
}

export interface CreateSignatureRequestInput {
  /** Tenant boundary for the credential-bearing provider instance. */
  tenantId: string;
  /** Stable caller key persisted with the remote request for reconciliation. */
  idempotencyKey: string;
  title: string;
  message?: string;
  documents: readonly SignatureDocument[];
  signers: readonly SignatureSignerInput[];
  signingOrder?: boolean;
  /** Provider document lifetime. BoldSign accepts 1–180 days. */
  expiresInDays?: number;
  metadata?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

export interface SignatureRequestReference {
  tenantId: string;
  requestId: string;
  signal?: AbortSignal;
}

export interface SignatureRequest {
  provider: string;
  tenantId: string;
  id: string;
  status: SignatureRequestStatus;
  title?: string;
  signers: readonly SignatureSigner[];
  createdAt?: Date;
  expiresAt?: Date;
  metadata?: Readonly<Record<string, string>>;
  raw?: unknown;
}

export interface CancelSignatureRequestInput extends SignatureRequestReference {
  reason: string;
}

export interface ExtendSignatureRequestExpiryInput
  extends SignatureRequestReference {
  expiresAt: Date | string;
  warnPrior?: boolean;
}

export interface DownloadSignatureArtifactInput
  extends SignatureRequestReference {
  kind: SignatureArtifactKind;
}

export interface SignatureArtifact {
  provider: string;
  tenantId: string;
  requestId: string;
  kind: SignatureArtifactKind;
  filename: string;
  mediaType: string;
  /** Single-use stream of the exact provider response bytes. */
  stream: ReadableStream<Uint8Array>;
  /** Resolves after `stream` is fully consumed with its lowercase SHA-256. */
  sha256: Promise<string>;
  retrievedAt: Date;
}

export interface SignatureWebhookReplayMetadata {
  /** Persist under a unique constraint before applying the event. */
  deduplicationKey: string;
  /** Partition ordering comparisons by this provider request key. */
  orderingKey: string;
}

export interface SignatureWebhookEvent {
  /** Provider event identifier; consumers must persist it as a unique key. */
  id: string;
  provider: string;
  tenantId: string;
  requestId: string;
  type: string;
  status: SignatureRequestStatus;
  createdAt: Date;
  environment?: string;
  signers: readonly SignatureSigner[];
  replay: SignatureWebhookReplayMetadata;
  raw: unknown;
}

export interface ParseSignatureWebhookInput {
  /** Exact, unmodified UTF-8 request body. */
  payload: string;
  signature: string;
}

export interface SignatureProvider {
  readonly capabilities: SignatureProviderCapabilities;

  createRequest(input: CreateSignatureRequestInput): Promise<SignatureRequest>;

  getRequest(input: SignatureRequestReference): Promise<SignatureRequest>;

  cancelRequest(input: CancelSignatureRequestInput): Promise<SignatureRequest>;

  extendExpiry(
    input: ExtendSignatureRequestExpiryInput,
  ): Promise<SignatureRequest>;

  downloadArtifact(
    input: DownloadSignatureArtifactInput,
  ): Promise<SignatureArtifact>;

  parseWebhook(input: ParseSignatureWebhookInput): SignatureWebhookEvent;
}
