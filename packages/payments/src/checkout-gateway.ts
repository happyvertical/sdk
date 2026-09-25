/**
 * A provider-neutral port for **hosted crypto checkouts priced in fiat**.
 *
 * Billing code (for example smrt-commerce) talks only to this interface. The
 * BTCPay implementation (`createBtcpayCheckoutGateway` in
 * `@happyvertical/payments/btcpay`) is one adapter; a dedicated crypto-payments
 * service client can implement the same port later without changing callers.
 *
 * Rules every implementation keeps:
 *
 * - **Settlement belongs to the gateway.** `status: 'settled'` means the
 *   gateway's own confirmation policy is met. Callers never count
 *   confirmations.
 * - **Fiat is exact.** `amount` and `amountPaid` are integer minor units of
 *   `currency`; `amountPaid` is rounded down.
 * - **Webhooks carry ids only.** `verifyWebhook` authenticates a delivery and
 *   names the checkout; callers act on `getCheckout()`, never on the body.
 * - **Creation is idempotent by `orderId`.** A live checkout for the order is
 *   returned instead of creating another; an expired or invalid one is not
 *   revived.
 */

/** Where a checkout is in its lifecycle. */
export type CryptoCheckoutStatus =
  /** Awaiting payment; the rate is locked until `expiresAt`. */
  | 'open'
  /** Enough has been paid but is not yet settled (for example 0-conf). */
  | 'confirming'
  /** Settled under the gateway's confirmation policy. */
  | 'settled'
  /** The rate lock ran out without a full, settled payment. */
  | 'expired'
  /** The gateway invalidated it (for example a payment was double-spent or reorganized away). */
  | 'invalid';

/** A qualifier that needs a decision beyond the status. */
export type CryptoCheckoutException =
  | 'none'
  /** Less than the price was received. */
  | 'underpaid'
  /** More than the price was received. */
  | 'overpaid'
  /** Payment arrived after the rate lock expired. */
  | 'paid_late'
  /** An operator marked it settled by hand at the gateway. */
  | 'manually_marked';

export interface CryptoCheckoutPayment {
  id: string;
  /** The asset paid, for example `BTC`. */
  asset: string;
  /** `onchain`, `lightning`, or a gateway-specific rail name. */
  rail: string;
  /** Decimal amount of `asset`. */
  amount: string;
  /** Decimal network or processing fee in `asset`, when reported. */
  fee?: string;
  status: 'confirming' | 'settled' | 'invalid';
  /** Chain transaction id, for on-chain payments. */
  transactionId?: string;
  receivedAt?: Date;
}

export interface CryptoCheckout {
  /** The gateway implementation id (`btcpay`, …). */
  gateway: string;
  id: string;
  orderId?: string;
  status: CryptoCheckoutStatus;
  exception: CryptoCheckoutException;
  /** Locked fiat price, integer minor units of `currency`. */
  amount: number;
  currency: string;
  /** Fiat value received at the locked rate, minor units, rounded down. */
  amountPaid: number;
  /** The asset the price was quoted in (`BTC`), when known. */
  settlementAsset?: string;
  /** Decimal amount of `settlementAsset` the price required. */
  nativeAmountDue?: string;
  /** Decimal amount of `settlementAsset` received across payments. */
  nativeAmountPaid?: string;
  /** Decimal price of one `settlementAsset` in `currency`, as locked. */
  rate?: string;
  /** Where the rate came from, when the gateway or its operator says. */
  rateSource?: string;
  checkoutUrl?: string;
  createdAt?: Date;
  expiresAt?: Date;
  metadata: Record<string, string>;
  payments: CryptoCheckoutPayment[];
  /** The gateway's own representation, for audit only. */
  raw: unknown;
}

export interface CreateCryptoCheckoutInput {
  /** Caller-owned order id; creation is idempotent by it. */
  orderId: string;
  /** Price in integer minor units of `currency`. */
  amount: number;
  currency: string;
  description?: string;
  buyerEmail?: string;
  /** String metadata stored on the checkout and returned verbatim. */
  metadata?: Record<string, string>;
  /** Where the payer is sent after paying. */
  redirectUrl?: string;
}

/** An authenticated webhook delivery. Re-read the checkout to act on it. */
export interface CryptoCheckoutEvent {
  /** Stable across redeliveries of the same event. */
  eventId: string;
  /** The checkout the event is about; `null` for events about no checkout (acknowledge and ignore). */
  checkoutId: string | null;
  /** The gateway's event type, for logging. */
  type: string;
  redelivery: boolean;
}

export interface CryptoCheckoutGateway {
  readonly id: string;
  /** Return the live checkout for `orderId`, or create one. */
  createCheckout(input: CreateCryptoCheckoutInput): Promise<CryptoCheckout>;
  getCheckout(checkoutId: string): Promise<CryptoCheckout>;
  listCheckouts(input: { orderId: string }): Promise<CryptoCheckout[]>;
  /**
   * Authenticate and parse a webhook delivery. Throws
   * `PaymentVerificationError` for a bad signature or a delivery that does
   * not belong to this gateway.
   */
  verifyWebhook(
    rawBody: string,
    headers: Headers | Record<string, string | undefined>,
  ): CryptoCheckoutEvent;
}
