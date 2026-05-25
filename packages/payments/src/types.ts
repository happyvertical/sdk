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

  parseWebhookEvent?(payload: string, signature?: string): PaymentWebhookEvent;
}

export type PaymentBackendFactory<TOptions> = (
  options: TOptions,
) => PaymentBackend | Promise<PaymentBackend>;
