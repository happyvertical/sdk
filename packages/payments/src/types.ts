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
   * Whether the backend can save a reusable payment method (card on file)
   * via `createSetupSession` / `getSetupResult`. Card processors such as
   * Stripe set this; settlement-only rails (crypto) leave it unset.
   */
  supportsSavedPaymentMethods?: boolean;
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

export interface CreateSetupSessionInput {
  /** Where Stripe returns the buyer after saving the card. */
  successUrl?: string;
  cancelUrl?: string;
  /** Prefill / create the customer by email (ignored if providerCustomerId is set). */
  customerEmail?: string;
  /** Attach the saved method to an existing provider customer (e.g. cus_...). */
  providerCustomerId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface SetupSession {
  backendId: string;
  /** Provider session id (e.g. a Stripe Checkout Session cs_...). */
  sessionId: string;
  /** Hosted URL the buyer completes to save their card. */
  url: string;
  /** Provider customer id, when one was supplied or already created. */
  providerCustomerId?: string;
  raw?: unknown;
}

export interface GetSetupResultInput {
  /** The `sessionId` returned by createSetupSession. */
  sessionId: string;
}

export interface SavedPaymentMethod {
  backendId: string;
  status: 'complete' | 'pending' | 'expired';
  /** Reusable references to persist — never card data. */
  providerCustomerId?: string;
  providerPaymentMethodId?: string;
  /** Non-sensitive display fields. */
  type?: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
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
   * Start a hosted flow to save a reusable payment method (card on file)
   * without charging. Returns a redirect URL the buyer completes; the saved
   * method is then read back with {@link getSetupResult}. Card-processor
   * backends implement this; settlement-only rails do not.
   */
  createSetupSession?(input: CreateSetupSessionInput): Promise<SetupSession>;

  /**
   * Read the outcome of a {@link createSetupSession} flow — the saved
   * payment-method + customer references and non-sensitive card display
   * fields (brand / last4 / expiry). Never returns raw card data.
   */
  getSetupResult?(input: GetSetupResultInput): Promise<SavedPaymentMethod>;

  parseWebhookEvent?(payload: string, signature?: string): PaymentWebhookEvent;
}

export type PaymentBackendFactory<TOptions> = (
  options: TOptions,
) => PaymentBackend | Promise<PaymentBackend>;
