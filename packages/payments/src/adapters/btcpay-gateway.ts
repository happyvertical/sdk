/**
 * The BTCPay Server implementation of {@link CryptoCheckoutGateway}.
 *
 * Each checkout is a BTCPay invoice priced in fiat. BTCPay locks the rate for
 * `expirationMinutes` and settles by the invoice `speedPolicy`; this adapter
 * only maps BTCPay's states and never counts confirmations.
 */
import type {
  CreateCryptoCheckoutInput,
  CryptoCheckout,
  CryptoCheckoutEvent,
  CryptoCheckoutException,
  CryptoCheckoutGateway,
  CryptoCheckoutPayment,
  CryptoCheckoutStatus,
} from '../checkout-gateway.js';
import {
  PaymentConfigurationError,
  PaymentProviderError,
  PaymentVerificationError,
} from '../errors.js';
import { currencyMinorUnitDecimals } from '../shared.js';
import {
  type BtcpayClient,
  type BtcpayInvoice,
  type BtcpayInvoicePaymentMethod,
  type BtcpaySpeedPolicy,
  isValidBtcpayWebhookSignature,
  parseBtcpayWebhook,
} from './btcpay-client.js';

export const BTCPAY_GATEWAY_ID = 'btcpay';

export interface BtcpayCheckoutGatewayOptions {
  client: BtcpayClient;
  /** The store webhook's secret (`BTCPay-Sig` HMAC key). */
  webhookSecret: string;
  /**
   * Confirmations before BTCPay settles an on-chain payment: `HighSpeed` 0,
   * `MediumSpeed` 1, `LowMediumSpeed` 2, `LowSpeed` 6. Required: settlement
   * policy is an explicit decision, not a store default.
   */
  speedPolicy: BtcpaySpeedPolicy;
  /** BTCPay payment method ids (default `['BTC-CHAIN']`; add `BTC-LN` for Lightning). */
  paymentMethods?: string[];
  /** Rate lock in minutes (default 15). */
  expirationMinutes?: number;
  /** Minutes after expiry BTCPay still tracks late payments (default 1440). */
  monitoringMinutes?: number;
  /** Underpayment percentage BTCPay treats as paid (default 0). */
  paymentTolerance?: number;
  /** A label for the store's rate source, recorded on every checkout. */
  rateSource?: string;
}

const LIVE_STATUSES = new Set(['New', 'Processing', 'Settled']);

const STATUS = new Map<string, CryptoCheckoutStatus>([
  ['New', 'open'],
  ['Processing', 'confirming'],
  ['Settled', 'settled'],
  ['Expired', 'expired'],
  ['Invalid', 'invalid'],
]);

const EXCEPTION = new Map<string, CryptoCheckoutException>([
  ['None', 'none'],
  ['Invalid', 'none'],
  ['PaidPartial', 'underpaid'],
  ['PaidOver', 'overpaid'],
  ['PaidLate', 'paid_late'],
  ['Marked', 'manually_marked'],
]);

/**
 * Marks invoices this adapter created. Reuse and listing consider only those,
 * so an invoice made by hand (or by another integration) that happens to
 * share an order id is never reused or read as one of this port's checkouts.
 */
const OWNER_KEY = 'hvCheckoutGateway';
const OWNER_VALUE = 'crypto-checkout:v1';

/** Keys this adapter writes into BTCPay invoice metadata itself. */
const RESERVED_METADATA = new Set([
  'orderId',
  'itemDesc',
  'buyerEmail',
  OWNER_KEY,
]);

const PAYMENT_STATUS = new Map<string, CryptoCheckoutPayment['status']>([
  ['Processing', 'confirming'],
  ['Settled', 'settled'],
  ['Invalid', 'invalid'],
]);

export function createBtcpayCheckoutGateway(
  options: BtcpayCheckoutGatewayOptions,
): CryptoCheckoutGateway {
  const { client } = options;
  if (!client) {
    throw new PaymentConfigurationError('BTCPay gateway requires a client.');
  }
  if (typeof options.webhookSecret !== 'string' || !options.webhookSecret) {
    throw new PaymentConfigurationError(
      'BTCPay gateway requires a webhookSecret.',
    );
  }
  if (
    !['HighSpeed', 'MediumSpeed', 'LowMediumSpeed', 'LowSpeed'].includes(
      options.speedPolicy,
    )
  ) {
    throw new PaymentConfigurationError(
      'BTCPay gateway speedPolicy must be HighSpeed, MediumSpeed, LowMediumSpeed, or LowSpeed.',
    );
  }
  const paymentMethods = options.paymentMethods ?? ['BTC-CHAIN'];
  if (
    !Array.isArray(paymentMethods) ||
    paymentMethods.length === 0 ||
    paymentMethods.some((method) => typeof method !== 'string' || !method)
  ) {
    throw new PaymentConfigurationError(
      'BTCPay gateway paymentMethods must be a non-empty list of ids.',
    );
  }
  const assets = new Set(
    paymentMethods.map((method) => assetOfMethodId(method)),
  );
  if (assets.size !== 1) {
    throw new PaymentConfigurationError(
      'BTCPay gateway paymentMethods must all settle in one asset (for example BTC-CHAIN and BTC-LN).',
    );
  }
  const expirationMinutes = positiveInteger(
    options.expirationMinutes ?? 15,
    'expirationMinutes',
  );
  const monitoringMinutes = positiveInteger(
    options.monitoringMinutes ?? 1440,
    'monitoringMinutes',
  );
  const paymentTolerance = options.paymentTolerance ?? 0;
  if (
    !Number.isFinite(paymentTolerance) ||
    paymentTolerance < 0 ||
    paymentTolerance > 100
  ) {
    throw new PaymentConfigurationError(
      'BTCPay gateway paymentTolerance must be a percentage from 0 to 100.',
    );
  }

  async function load(invoice: BtcpayInvoice): Promise<CryptoCheckout> {
    const methods = await client.getInvoicePaymentMethods(invoice.id);
    return toCheckout(invoice, methods, options.rateSource);
  }

  async function liveInvoices(orderId: string): Promise<BtcpayInvoice[]> {
    const invoices = await client.listInvoices({
      orderId,
      includeArchived: true,
    });
    return invoices
      .filter(
        (invoice) =>
          ownedBy(invoice, orderId) && LIVE_STATUSES.has(invoice.status),
      )
      .sort(
        (a, b) =>
          (a.createdTime?.getTime() ?? 0) - (b.createdTime?.getTime() ?? 0) ||
          a.id.localeCompare(b.id),
      );
  }

  return {
    id: BTCPAY_GATEWAY_ID,

    async createCheckout(input: CreateCryptoCheckoutInput) {
      const orderId = requireText(input.orderId, 'orderId');
      const currency = requireText(input.currency, 'currency').toUpperCase();
      if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
        throw new PaymentConfigurationError(
          'Checkout amount must be positive integer minor units.',
        );
      }
      const [existing] = await liveInvoices(orderId);
      if (existing) {
        const checkout = await load(existing);
        if (
          checkout.currency !== currency ||
          checkout.amount !== input.amount
        ) {
          throw new PaymentConfigurationError(
            `Order ${orderId} already has a checkout for ${checkout.amount} ${checkout.currency}; ` +
              `refusing to reuse it for ${input.amount} ${currency}.`,
          );
        }
        return checkout;
      }
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input.metadata ?? {})) {
        if (RESERVED_METADATA.has(key)) {
          throw new PaymentConfigurationError(
            `Checkout metadata key '${key}' is reserved.`,
          );
        }
        if (typeof value !== 'string') {
          throw new PaymentConfigurationError(
            `Checkout metadata '${key}' must be a string.`,
          );
        }
        metadata[key] = value;
      }
      metadata[OWNER_KEY] = OWNER_VALUE;
      if (input.description) metadata.itemDesc = input.description;
      if (input.buyerEmail) metadata.buyerEmail = input.buyerEmail;
      const invoice = await client.createInvoice({
        amount: formatMinorUnits(
          input.amount,
          currencyMinorUnitDecimals(currency),
        ),
        currency,
        orderId,
        metadata,
        checkout: {
          speedPolicy: options.speedPolicy,
          paymentMethods,
          expirationMinutes,
          monitoringMinutes,
          paymentTolerance,
          redirectURL: input.redirectUrl,
          redirectAutomatically: input.redirectUrl ? true : undefined,
        },
      });
      const checkout = await load(invoice);
      if (checkout.currency !== currency || checkout.amount !== input.amount) {
        // The invoice exists (findable by orderId) but is not the price asked.
        throw new PaymentProviderError(
          `BTCPay created invoice ${checkout.id} for ${checkout.amount} ${checkout.currency}; ` +
            `requested ${input.amount} ${currency}.`,
        );
      }
      return checkout;
    },

    async getCheckout(checkoutId: string) {
      return load(await client.getInvoice(requireText(checkoutId, 'id')));
    },

    async listCheckouts(input: { orderId: string }) {
      const orderId = requireText(input.orderId, 'orderId');
      const invoices = (
        await client.listInvoices({ orderId, includeArchived: true })
      ).filter((invoice) => ownedBy(invoice, orderId));
      return Promise.all(invoices.map(load));
    },

    verifyWebhook(rawBody, headers): CryptoCheckoutEvent {
      const signature = readHeader(headers, 'btcpay-sig');
      if (
        !isValidBtcpayWebhookSignature(
          rawBody,
          signature,
          options.webhookSecret,
        )
      ) {
        throw new PaymentVerificationError(
          'BTCPay webhook signature is invalid.',
        );
      }
      let delivery: ReturnType<typeof parseBtcpayWebhook>;
      try {
        delivery = parseBtcpayWebhook(rawBody);
      } catch (error) {
        throw new PaymentVerificationError('BTCPay webhook body is invalid.', {
          cause: error,
        });
      }
      if (delivery.storeId !== client.storeId) {
        throw new PaymentVerificationError(
          'BTCPay webhook belongs to another store.',
        );
      }
      return {
        eventId: delivery.originalDeliveryId ?? delivery.deliveryId,
        checkoutId: delivery.invoiceId ?? null,
        type: delivery.type,
        redelivery: delivery.isRedelivery,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toCheckout(
  invoice: BtcpayInvoice,
  methods: BtcpayInvoicePaymentMethod[],
  rateSource: string | undefined,
): CryptoCheckout {
  const status = STATUS.get(invoice.status);
  if (!status) {
    throw new PaymentProviderError(
      `BTCPay invoice ${invoice.id} has unknown status '${invoice.status}'.`,
    );
  }
  const exception = EXCEPTION.get(invoice.additionalStatus);
  if (!exception) {
    throw new PaymentProviderError(
      `BTCPay invoice ${invoice.id} has unknown additionalStatus '${invoice.additionalStatus}'.`,
    );
  }
  const currency = invoice.currency.toUpperCase();
  const fiatDecimals = currencyMinorUnitDecimals(currency);
  const amount = decimalToMinor(invoice.amount, fiatDecimals, 'invoice');

  // Fiat received: each method's own paid amount at its locked rate, summed
  // exactly and rounded down once.
  let paidScaled = Decimal.zero();
  for (const method of methods) {
    const hasPayments = method.payments.some(
      (payment) => paymentStatus(invoice.id, payment.status) !== 'invalid',
    );
    if (method.paymentMethodPaid === undefined) {
      if (hasPayments) {
        throw new PaymentProviderError(
          `BTCPay invoice ${invoice.id} payment method ${method.paymentMethodId} has payments but no paid amount.`,
        );
      }
      continue;
    }
    const paid = Decimal.parse(method.paymentMethodPaid, 'paymentMethodPaid');
    if (paid.isZero()) {
      if (hasPayments) {
        throw new PaymentProviderError(
          `BTCPay invoice ${invoice.id} payment method ${method.paymentMethodId} reports payments but zero paid.`,
        );
      }
      continue;
    }
    if (method.rate === undefined) {
      throw new PaymentProviderError(
        `BTCPay invoice ${invoice.id} payment method ${method.paymentMethodId} has payments but no rate.`,
      );
    }
    paidScaled = paidScaled.add(paid.mul(Decimal.parse(method.rate, 'rate')));
  }

  const primary =
    methods.find((method) => railOf(method.paymentMethodId) === 'onchain') ??
    methods[0];
  const settlementAsset = primary
    ? assetOf(primary.currency, primary.paymentMethodId)
    : undefined;
  const payments: CryptoCheckoutPayment[] = [];
  let nativePaid = Decimal.zero();
  for (const method of methods) {
    const asset = assetOf(method.currency, method.paymentMethodId);
    for (const payment of method.payments) {
      const mapped: CryptoCheckoutPayment = {
        id: payment.id,
        asset,
        rail: railOf(method.paymentMethodId),
        amount: payment.value,
        fee: Decimal.parse(payment.fee, 'fee').isZero()
          ? undefined
          : payment.fee,
        status: paymentStatus(invoice.id, payment.status),
        transactionId: payment.transactionId,
        receivedAt: payment.receivedDate,
      };
      payments.push(mapped);
      if (mapped.status !== 'invalid' && asset === settlementAsset) {
        nativePaid = nativePaid.add(Decimal.parse(payment.value, 'payment'));
      }
    }
  }

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(invoice.metadata)) {
    if (typeof value === 'string') metadata[key] = value;
  }

  return {
    gateway: BTCPAY_GATEWAY_ID,
    id: invoice.id,
    orderId: metadata.orderId,
    status,
    exception,
    amount,
    currency,
    amountPaid: paidScaled.floorToScale(fiatDecimals),
    settlementAsset: settlementAsset || undefined,
    nativeAmountDue: primary?.amount,
    nativeAmountPaid: methods.length ? nativePaid.toString() : undefined,
    rate: primary?.rate,
    rateSource,
    checkoutUrl: invoice.checkoutLink,
    createdAt: invoice.createdTime,
    expiresAt: invoice.expirationTime,
    metadata,
    payments,
    raw: invoice.raw,
  };
}

/** `2500, 2` → `'25.00'`: fixed decimals, exact. */
function formatMinorUnits(amount: number, decimals: number): string {
  const text = String(amount).padStart(decimals + 1, '0');
  return decimals === 0
    ? text
    : `${text.slice(0, -decimals)}.${text.slice(-decimals)}`;
}

function ownedBy(invoice: BtcpayInvoice, orderId: string): boolean {
  return (
    invoice.metadata.orderId === orderId &&
    invoice.metadata[OWNER_KEY] === OWNER_VALUE
  );
}

function paymentStatus(
  invoiceId: string,
  status: string,
): CryptoCheckoutPayment['status'] {
  const mapped = PAYMENT_STATUS.get(status);
  if (!mapped) {
    throw new PaymentProviderError(
      `BTCPay invoice ${invoiceId} has a payment with unknown status '${status}'.`,
    );
  }
  return mapped;
}

function assetOfMethodId(paymentMethodId: string): string {
  return (paymentMethodId.split('-')[0] ?? '').toUpperCase();
}

function assetOf(currency: string | undefined, paymentMethodId: string) {
  return (currency ?? assetOfMethodId(paymentMethodId)).toUpperCase();
}

function railOf(paymentMethodId: string): string {
  const id = paymentMethodId.toUpperCase();
  if (id === 'BTC' || id.endsWith('-CHAIN')) return 'onchain';
  if (id.endsWith('-LN') || id.endsWith('-LNURL')) return 'lightning';
  return paymentMethodId.toLowerCase();
}

function decimalToMinor(value: string, decimals: number, label: string) {
  const parsed = Decimal.parse(value, label);
  const minor = parsed.floorToScale(decimals);
  if (!parsed.equalsScaled(minor, decimals)) {
    throw new PaymentProviderError(
      `BTCPay ${label} amount ${value} has more precision than its currency.`,
    );
  }
  return minor;
}

/** Exact non-negative decimal arithmetic on BigInt (value = units / 10^scale). */
class Decimal {
  private constructor(
    readonly units: bigint,
    readonly scale: number,
  ) {}

  static zero(): Decimal {
    return new Decimal(0n, 0);
  }

  static parse(value: string, label: string): Decimal {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value?.trim?.() ?? '');
    if (!match) {
      throw new PaymentProviderError(
        `BTCPay ${label} '${String(value)}' is not a non-negative decimal.`,
      );
    }
    const fraction = match[2] ?? '';
    return new Decimal(BigInt(`${match[1]}${fraction}`), fraction.length);
  }

  isZero(): boolean {
    return this.units === 0n;
  }

  add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return new Decimal(
      this.units * 10n ** BigInt(scale - this.scale) +
        other.units * 10n ** BigInt(scale - other.scale),
      scale,
    );
  }

  mul(other: Decimal): Decimal {
    return new Decimal(this.units * other.units, this.scale + other.scale);
  }

  /** Integer count of 10^-decimals units, rounded down. */
  floorToScale(decimals: number): number {
    const shifted =
      decimals >= this.scale
        ? this.units * 10n ** BigInt(decimals - this.scale)
        : this.units / 10n ** BigInt(this.scale - decimals);
    if (shifted > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new PaymentProviderError(
        'BTCPay amount exceeds the safe integer range.',
      );
    }
    return Number(shifted);
  }

  equalsScaled(minor: number, decimals: number): boolean {
    const scale = Math.max(this.scale, decimals);
    return (
      this.units * 10n ** BigInt(scale - this.scale) ===
      BigInt(minor) * 10n ** BigInt(scale - decimals)
    );
  }

  toString(): string {
    if (this.scale === 0) return this.units.toString();
    const text = this.units.toString().padStart(this.scale + 1, '0');
    return `${text.slice(0, -this.scale)}.${text.slice(-this.scale)}`;
  }
}

function readHeader(
  headers: Headers | Record<string, string | undefined>,
  name: string,
): string | undefined {
  if (typeof (headers as Headers)?.get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PaymentConfigurationError(`Checkout ${label} is required.`);
  }
  return value.trim();
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentConfigurationError(
      `BTCPay gateway ${label} must be a positive integer.`,
    );
  }
  return value;
}
