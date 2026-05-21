export type PaymentSettlementShape = 'address' | 'url';

export type PaymentStatus =
  | 'pending'
  | 'confirmed'
  | 'expired'
  | 'failed'
  | 'refunded';

export interface PaymentBackendCapabilities {
  /** Stable machine id, for example `base-usdc` or `stripe-checkout`. */
  id: string;
  /** Settlement currency shown to operators and invoices, for example `USDC`. */
  settlementCurrency: string;
  /** Chain/network id for crypto backends, or provider id for fiat backends. */
  chainId: string;
  /** Whether this backend can verify an x402 `X-Payment` proof. */
  x402Capable: boolean;
  /** Typical confirmation latency in milliseconds for UX and timeout hints. */
  typicalConfirmationLatencyMs: number;
  /** Whether this backend can return funds through `sendPayout`. */
  supportsRefunds: boolean;
  /** Crypto backends usually return an address; fiat backends may return URLs. */
  settlementShape: PaymentSettlementShape;
}

export interface CreatePaymentOptionInput {
  quoteId: string;
  usdAmount: number;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export interface PaymentOption {
  backendId: string;
  quoteId: string;
  settlementShape: PaymentSettlementShape;
  settlementCurrency: string;
  payTo: string;
  usdAmount: number;
  nativeAmount?: string;
  memo?: string;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
}

export interface WatchPaymentInput {
  quoteId: string;
  payTo: string;
  signal?: AbortSignal;
}

export interface PaymentUpdate {
  backendId: string;
  quoteId: string;
  payTo: string;
  status: PaymentStatus;
  txHash?: string;
  paidAmount?: string;
  paidAt?: Date;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface GetPaymentStatusInput {
  quoteId: string;
  payTo: string;
}

export interface VerifyX402ProofInput {
  quoteId: string;
  payTo: string;
  usdAmount: number;
  xPaymentHeader: string;
  metadata?: Record<string, unknown>;
}

export interface X402ProofVerification {
  valid: boolean;
  quoteId: string;
  payTo: string;
  txHash?: string;
  payer?: string;
  paidAmount?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface SendPayoutInput {
  destination: string;
  amount: string;
  currency: string;
  memo?: string;
  metadata?: Record<string, unknown>;
}

export interface PayoutResult {
  id: string;
  status: PaymentStatus;
  txHash?: string;
  destination: string;
  amount: string;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentBackend {
  readonly capabilities: PaymentBackendCapabilities;

  createPaymentOption(input: CreatePaymentOptionInput): Promise<PaymentOption>;

  watchPayment(input: WatchPaymentInput): AsyncIterable<PaymentUpdate>;

  getStatus(input: GetPaymentStatusInput): Promise<PaymentUpdate>;

  verifyX402Proof?(input: VerifyX402ProofInput): Promise<X402ProofVerification>;

  sendPayout(input: SendPayoutInput): Promise<PayoutResult>;
}
