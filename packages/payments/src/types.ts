export type PaymentSettlementShape = 'address' | 'url' | 'psbt';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'requires_action';

export interface PaymentConfirmationLatency {
  expectedSeconds: number;
  minConfirmations?: number;
  maxExpectedSeconds?: number;
  description?: string;
}

export interface PaymentBackendCapabilities {
  id: string;
  displayName: string;
  settlementCurrency: string;
  supportedSettlementCurrencies?: string[];
  chain: string;
  settlementShape: PaymentSettlementShape;
  x402Capable: boolean;
  confirmationLatency: PaymentConfirmationLatency;
  supportsRefunds: boolean;
  supportsPayouts: boolean;
  supportsWebhooks: boolean;
  /**
   * Whether the backend supports the manual-capture card lifecycle
   * (`authorizePayment` → `capturePayment` / `voidPayment`). Card processors
   * such as Stripe set this; settlement-only rails (crypto) leave it unset.
   */
  supportsManualCapture?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentOptionInput {
  quoteId: string;
  amount: number;
  currency: string;
  expiresAt: Date | string;
  idempotencyKey?: string;
  buyerEmail?: string;
  description?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface PaymentOption {
  backendId: string;
  quoteId: string;
  payTo: string;
  settlementShape: PaymentSettlementShape;
  settlementCurrency: string;
  settlementAmount: number;
  amount: number;
  currency: string;
  expiresAt: Date;
  memo?: string;
  providerPaymentId?: string;
  paymentUri?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentStatusResult {
  backendId: string;
  quoteId: string;
  payTo: string;
  status: PaymentStatus;
  settlementCurrency: string;
  settlementAmount?: number;
  receivedAmount?: number;
  amount?: number;
  currency?: string;
  requiredConfirmations?: number;
  confirmations?: number;
  transactionId?: string;
  providerPaymentId?: string;
  updatedAt: Date;
  raw?: unknown;
}

export interface PaymentStatusContext {
  settlementAmount?: number;
  amount?: number;
  currency?: string;
  expiresAt?: Date | string;
  providerPaymentId?: string;
  requiredConfirmations?: number;
  searchStartBlock?: string | number | bigint;
  metadata?: Record<string, unknown>;
}

export interface WatchPaymentInput {
  quoteId: string;
  payTo: string;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
  statusContext?: PaymentStatusContext;
}

export interface PaymentEvent extends PaymentStatusResult {
  event: 'status' | 'confirmed' | 'failed' | 'expired' | 'refunded' | 'timeout';
}

export interface PaymentWebhookEvent {
  id?: string;
  deliveryId?: string;
  invoiceId?: string;
  quoteId?: string;
  type?: string;
  status: PaymentStatus;
  providerPaymentId?: string;
  duplicate?: boolean;
  raw: unknown;
}

export interface VerifyX402ProofInput {
  paymentHeader: string;
  quoteId: string;
  payTo: string;
  amount: number;
  currency: string;
  resource?: string;
  method?: string;
  network?: string;
  scheme?: string;
  expiresAt?: Date | string;
}

export interface X402VerificationResult {
  valid: boolean;
  backendId: string;
  quoteId: string;
  payTo: string;
  transactionId?: string;
  payer?: string;
  amount?: number;
  currency?: string;
  network?: string;
  reason?: string;
  raw?: unknown;
}

export interface SendPayoutInput {
  destination: string;
  amount: number;
  currency?: string;
  quoteId?: string;
  idempotencyKey?: string;
  memo?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface PayoutResult {
  backendId: string;
  status: 'submitted' | 'pending_signature' | 'requires_action' | 'failed';
  payoutId?: string;
  transactionId?: string;
  psbt?: string;
  destination: string;
  amount: number;
  currency: string;
  raw?: unknown;
}

export interface RefundPaymentInput {
  paymentId?: string;
  transactionId?: string;
  destination?: string;
  amount?: number;
  currency?: string;
  idempotencyKey?: string;
  reason?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface RefundResult {
  backendId: string;
  status: 'submitted' | 'succeeded' | 'failed' | 'requires_action';
  refundId?: string;
  transactionId?: string;
  amount?: number;
  currency?: string;
  raw?: unknown;
}

export interface AuthorizePaymentInput {
  /** Amount to authorize, in the currency's smallest unit (e.g. cents). */
  amount: number;
  /** Currency (ISO 4217). Must be in the backend's configured supported set. */
  currency: string;
  /**
   * Provider payment-method reference to charge (e.g. a Stripe `pm_...` id) —
   * the `providerPaymentMethodId` a saved-card / setup flow returns.
   */
  providerPaymentMethodId: string;
  /**
   * Provider customer reference (e.g. a Stripe `cus_...` id). Required when the
   * payment method is attached to a customer — which a saved card always is, so
   * this is required for the save-card → charge flow — or the provider rejects
   * the charge. Optional only for a one-off, unattached payment method.
   */
  providerCustomerId?: string;
  description?: string;
  /**
   * Whether the customer is absent — an off-session, merchant-initiated charge
   * (e.g. charging a saved card at approval time). Defaults to `true`, the
   * primary use of this method. Set `false` for on-session authorizations where
   * the buyer is present to complete any authentication challenge.
   */
  offSession?: boolean;
  /**
   * Optional caller reference, surfaced to the provider as metadata. Also
   * correlates this intent's capture/void/fail webhooks: without it, those
   * PaymentIntent events surface as `processing` (non-terminal) rather than
   * `confirmed`/`failed`, since they can't be attributed.
   */
  quoteId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface AuthorizationResult {
  backendId: string;
  status:
    | 'requires_capture'
    | 'requires_action'
    | 'processing'
    | 'succeeded'
    | 'failed';
  /** Provider id of the authorized payment, needed to capture or void it. */
  providerPaymentId?: string;
  amount?: number;
  currency?: string;
  /**
   * Client secret to complete authentication when `status` is
   * `requires_action` (e.g. 3-D Secure). The buyer's client uses it to finish
   * the challenge, after which the intent moves to `requires_capture`.
   */
  clientSecret?: string;
  /**
   * Provider-specific next-action payload when `status` is `requires_action`
   * (e.g. the redirect/challenge details). Present only when action is needed.
   */
  nextAction?: unknown;
  raw?: unknown;
}

export interface CapturePaymentInput {
  /** Provider id returned by `authorizePayment`. */
  providerPaymentId: string;
  /** Partial capture amount in the smallest unit; omit to capture in full. */
  amount?: number;
  idempotencyKey?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface CaptureResult {
  backendId: string;
  // No `requires_action`: capturing an already-authorized intent does not
  // re-enter authentication, and CaptureResult carries no client secret to act
  // on one. Any unexpected provider action-required state maps to `processing`.
  status: 'succeeded' | 'processing' | 'failed';
  providerPaymentId?: string;
  amount?: number;
  currency?: string;
  raw?: unknown;
}

export interface VoidPaymentInput {
  /** Provider id returned by `authorizePayment`. */
  providerPaymentId: string;
  idempotencyKey?: string;
  /**
   * Optional cancellation reason. Constrained to the provider's accepted set —
   * Stripe rejects any other value, which would fail the cancel and leave the
   * authorization hold in place.
   */
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'abandoned';
}

// NOTE (void status vs webhooks): a successful `voidPayment` returns
// `VoidResult.status: 'canceled'`. The same event arriving via
// `parseWebhookEvent` (`payment_intent.canceled`) maps to the shared
// `PaymentStatus`, which has no `canceled` member, so it surfaces as the
// terminal `failed`. Consumers reconciling the two paths should disambiguate a
// benign void from a real failure using the webhook event `type`. (A dedicated
// `canceled` PaymentStatus would remove this asymmetry — a follow-up, since it
// widens the shared union and `PaymentEvent` for every backend.)

export interface VoidResult {
  backendId: string;
  status: 'canceled' | 'failed';
  providerPaymentId?: string;
  amount?: number;
  currency?: string;
  raw?: unknown;
}

export interface PaymentBackend {
  readonly capabilities: PaymentBackendCapabilities;

  createPaymentOption(input: CreatePaymentOptionInput): Promise<PaymentOption>;

  watchPayment(input: WatchPaymentInput): AsyncIterable<PaymentEvent>;

  getStatus(
    quoteId: string,
    payTo: string,
    context?: PaymentStatusContext,
  ): Promise<PaymentStatusResult>;

  verifyX402Proof?(
    input: VerifyX402ProofInput,
  ): Promise<X402VerificationResult>;

  sendPayout(input: SendPayoutInput): Promise<PayoutResult>;

  refundPayment?(input: RefundPaymentInput): Promise<RefundResult>;

  /**
   * Authorize (place a hold on) funds without capturing them, returning an
   * uncaptured payment that can later be captured or voided. Card-processor
   * backends implement this; settlement-only rails do not.
   */
  authorizePayment?(input: AuthorizePaymentInput): Promise<AuthorizationResult>;

  /**
   * Capture a previously authorized payment — in full, or a partial `amount`.
   */
  capturePayment?(input: CapturePaymentInput): Promise<CaptureResult>;

  /**
   * Void (cancel) an authorized-but-uncaptured payment. No funds move.
   */
  voidPayment?(input: VoidPaymentInput): Promise<VoidResult>;

  parseWebhookEvent?(payload: string, signature?: string): PaymentWebhookEvent;
}

export type PaymentBackendFactory<TOptions> = (
  options: TOptions,
) => PaymentBackend | Promise<PaymentBackend>;
