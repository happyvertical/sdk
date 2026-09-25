/**
 * A small, stateless client for the BTCPay Server Greenfield API (2.x).
 *
 * It covers what billing integrations need: store invoices (create, read,
 * list by `orderId`), an invoice's payment methods, and webhook signature
 * verification and parsing. It keeps no state between calls — idempotency and
 * webhook de-duplication belong to the caller's durable storage.
 *
 * Decimal amounts stay strings end to end; callers convert them to their own
 * minor units.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentConfigurationError, PaymentProviderError } from '../errors.js';
import { type FetchLike, getFetch } from '../shared.js';

/** Invoice status as reported by Greenfield. */
export type BtcpayInvoiceStatus =
  | 'New'
  | 'Processing'
  | 'Expired'
  | 'Invalid'
  | 'Settled';

/** Greenfield's `additionalStatus` qualifier on an invoice. */
export type BtcpayInvoiceAdditionalStatus =
  | 'None'
  | 'PaidLate'
  | 'PaidPartial'
  | 'Marked'
  | 'Invalid'
  | 'PaidOver';

/**
 * Confirmations before BTCPay settles an on-chain payment: `HighSpeed` 0
 * (1 for RBF-signalling transactions), `MediumSpeed` 1, `LowMediumSpeed` 2,
 * `LowSpeed` 6. These are the only values BTCPay supports.
 */
export type BtcpaySpeedPolicy =
  | 'HighSpeed'
  | 'MediumSpeed'
  | 'LowMediumSpeed'
  | 'LowSpeed';

export interface BtcpayInvoiceCheckoutOptions {
  speedPolicy?: BtcpaySpeedPolicy;
  /** Payment method ids, for example `['BTC-CHAIN']` or `['BTC-CHAIN', 'BTC-LN']`. */
  paymentMethods?: string[];
  defaultPaymentMethod?: string;
  /** Minutes the rate is locked and the invoice accepts new payments. */
  expirationMinutes?: number;
  /** Minutes after expiry during which late payments are still tracked. */
  monitoringMinutes?: number;
  /** Percentage underpayment BTCPay treats as paid (0–100). */
  paymentTolerance?: number;
  redirectURL?: string;
  redirectAutomatically?: boolean;
  defaultLanguage?: string;
}

export interface BtcpayCreateInvoiceInput {
  /** Decimal amount in `currency`, for example `'25.00'`. */
  amount: string;
  currency: string;
  /** Merchant order id; stored as `metadata.orderId` and filterable. */
  orderId?: string;
  metadata?: Record<string, unknown>;
  checkout?: BtcpayInvoiceCheckoutOptions;
  additionalSearchTerms?: string[];
}

export interface BtcpayInvoice {
  id: string;
  storeId?: string;
  status: BtcpayInvoiceStatus | string;
  additionalStatus: BtcpayInvoiceAdditionalStatus | string;
  /** Decimal amount in `currency`. */
  amount: string;
  currency: string;
  checkoutLink?: string;
  createdTime?: Date;
  expirationTime?: Date;
  monitoringExpiration?: Date;
  archived: boolean;
  metadata: Record<string, unknown>;
  checkout: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface BtcpayListInvoicesInput {
  orderId?: string | string[];
  status?: BtcpayInvoiceStatus | BtcpayInvoiceStatus[];
  textSearch?: string;
  skip?: number;
  take?: number;
}

export interface BtcpayInvoicePayment {
  /** On-chain payments use `<txid>-<vout>`. */
  id: string;
  /** The transaction id of an on-chain payment (parsed from `id`). */
  transactionId?: string;
  receivedDate?: Date;
  /** Decimal amount in the payment method's currency (BTC). */
  value: string;
  /** Decimal network/payment-method fee. */
  fee: string;
  status: 'Invalid' | 'Processing' | 'Settled' | string;
  destination?: string;
}

export interface BtcpayInvoicePaymentMethod {
  /** `BTC-CHAIN`, `BTC-LN`, … (Greenfield 2.x `paymentMethodId`). */
  paymentMethodId: string;
  /** The payment method's currency, for example `BTC`. */
  currency?: string;
  destination?: string;
  paymentLink?: string;
  /** Invoice-currency price of one unit of the payment currency, if reported. */
  rate?: string;
  /** Decimal amount due in the payment currency when created. */
  amount: string;
  /** Decimal amount paid through this method. */
  paymentMethodPaid: string;
  /** Decimal amount paid through all methods, in this method's currency. */
  totalPaid: string;
  /**
   * Decimal amount still due, in this method's currency. Undefined when
   * BTCPay did not report it — never read a missing value as "nothing due".
   */
  due?: string;
  payments: BtcpayInvoicePayment[];
  raw: Record<string, unknown>;
}

export interface BtcpayClientOptions {
  /** Server origin, for example `https://btcpay.example.com` (no path). */
  baseUrl: string;
  /** Greenfield API key (`Authorization: token …`). */
  apiKey: string;
  storeId: string;
  fetch?: FetchLike;
  /** Per-request timeout (default 30 seconds). */
  timeoutMs?: number;
}

/**
 * A Greenfield request failed. Never carries the API key.
 *
 * `retryable` is true only when repeating the same call cannot duplicate a
 * side effect: a read (`GET`) that failed on the network, with 429, or with
 * 5xx, or any request refused with 429. A `createInvoice` that failed on the
 * network or with 5xx may still have created the invoice, so it is not
 * retryable: resolve it with `listInvoices({ orderId })` instead.
 */
export class BtcpayApiError extends PaymentProviderError {
  readonly status: number;
  readonly apiCode?: string;

  constructor(
    message: string,
    status: number,
    apiCode?: string,
    options: { cause?: unknown; method?: 'GET' | 'POST' } = {},
  ) {
    const { method = 'GET', ...rest } = options;
    super(message, {
      ...rest,
      retryable:
        status === 429 || (method === 'GET' && (status === 0 || status >= 500)),
    });
    this.name = 'BtcpayApiError';
    this.status = status;
    this.apiCode = apiCode;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class BtcpayClient {
  readonly baseUrl: string;
  readonly storeId: string;
  private readonly apiKey: string;
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: BtcpayClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = requireString(options.apiKey, 'BtcpayClient apiKey');
    this.storeId = requireString(options.storeId, 'BtcpayClient storeId');
    this.fetch = getFetch(options.fetch);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new PaymentConfigurationError(
        'BtcpayClient timeoutMs must be a positive number.',
      );
    }
    this.timeoutMs = timeoutMs;
  }

  /**
   * `POST /api/v1/stores/{storeId}/invoices`. Not idempotent at BTCPay: after
   * a network or 5xx failure the invoice may exist, so the error is not
   * `retryable` — look it up with `listInvoices({ orderId })` before creating
   * another.
   */
  async createInvoice(input: BtcpayCreateInvoiceInput): Promise<BtcpayInvoice> {
    const amount = requirePositiveDecimal(
      input.amount,
      'BTCPay invoice amount',
    );
    const currency = requireString(input.currency, 'BTCPay invoice currency');
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.orderId !== undefined) {
      metadata.orderId = requireString(input.orderId, 'BTCPay orderId');
    }
    const body: Record<string, unknown> = { amount, currency, metadata };
    if (input.checkout) body.checkout = compact({ ...input.checkout });
    if (input.additionalSearchTerms?.length) {
      body.additionalSearchTerms = input.additionalSearchTerms;
    }
    const raw = await this.request('POST', this.storePath('/invoices'), body);
    return toInvoice(raw);
  }

  /** `GET /api/v1/stores/{storeId}/invoices/{invoiceId}`. */
  async getInvoice(invoiceId: string): Promise<BtcpayInvoice> {
    const id = requireString(invoiceId, 'BTCPay invoiceId');
    const raw = await this.request(
      'GET',
      this.storePath(`/invoices/${encodeURIComponent(id)}`),
    );
    return toInvoice(raw);
  }

  /** `GET /api/v1/stores/{storeId}/invoices` with Greenfield filters. */
  async listInvoices(
    input: BtcpayListInvoicesInput = {},
  ): Promise<BtcpayInvoice[]> {
    const query = new URLSearchParams();
    for (const orderId of toList(input.orderId)) {
      query.append('orderId', requireString(orderId, 'BTCPay orderId'));
    }
    for (const status of toList(input.status)) query.append('status', status);
    if (input.textSearch) query.set('textSearch', input.textSearch);
    if (input.skip !== undefined) {
      query.set('skip', String(requireCount(input.skip, 'skip')));
    }
    if (input.take !== undefined) {
      query.set('take', String(requireCount(input.take, 'take')));
    }
    const search = query.toString();
    const suffix = search ? `?${search}` : '';
    const raw = await this.request('GET', this.storePath(`/invoices${suffix}`));
    const items = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { items?: unknown })?.items)
        ? (raw as { items: unknown[] }).items
        : null;
    if (!items) {
      throw new BtcpayApiError(
        'BTCPay invoice list response was not an array.',
        200,
      );
    }
    return items.map(toInvoice);
  }

  /** `GET /api/v1/stores/{storeId}/invoices/{invoiceId}/payment-methods`. */
  async getInvoicePaymentMethods(
    invoiceId: string,
  ): Promise<BtcpayInvoicePaymentMethod[]> {
    const id = requireString(invoiceId, 'BTCPay invoiceId');
    const raw = await this.request(
      'GET',
      this.storePath(`/invoices/${encodeURIComponent(id)}/payment-methods`),
    );
    if (!Array.isArray(raw)) {
      throw new BtcpayApiError(
        'BTCPay payment-methods response was not an array.',
        200,
      );
    }
    return raw.filter(isRecord).map(toPaymentMethod);
  }

  private storePath(suffix: string): string {
    return `/api/v1/stores/${encodeURIComponent(this.storeId)}${suffix}`;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const headers = new Headers();
    headers.set('Authorization', `token ${this.apiKey}`);
    headers.set('Accept', 'application/json');
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new BtcpayApiError(
        `BTCPay ${method} ${redactPath(path)} failed: ${errorName(error)}.`,
        0,
        undefined,
        { cause: error, method },
      );
    }
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      // The server answered, so a POST may already have taken effect.
      throw new BtcpayApiError(
        `BTCPay ${method} ${redactPath(path)} failed reading the response: ${errorName(error)}.`,
        0,
        undefined,
        { cause: error, method },
      );
    }
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        if (response.ok) {
          throw new BtcpayApiError(
            `BTCPay ${method} ${redactPath(path)} returned invalid JSON.`,
            response.status,
            undefined,
            { cause: error },
          );
        }
      }
    }
    if (!response.ok) {
      const { code, message } = readGreenfieldError(parsed);
      throw new BtcpayApiError(
        `BTCPay ${method} ${redactPath(path)} failed with HTTP ${response.status}` +
          (message ? `: ${message}` : '.'),
        response.status,
        code,
        { method },
      );
    }
    return parsed;
  }
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** A parsed BTCPay webhook delivery (signature must be verified first). */
export interface BtcpayWebhookDelivery {
  deliveryId: string;
  webhookId?: string;
  /** Set on a redelivery: the id of the delivery it repeats. */
  originalDeliveryId?: string;
  isRedelivery: boolean;
  /** `InvoiceSettled`, `InvoiceExpired`, … */
  type: string;
  timestamp?: Date;
  storeId?: string;
  invoiceId?: string;
  metadata?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

/**
 * Check a `BTCPay-Sig` header (`sha256=<hex>`) against the raw request body
 * in constant time. Returns false for any missing or malformed input.
 */
export function isValidBtcpayWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): boolean {
  if (typeof rawBody !== 'string' || typeof header !== 'string') return false;
  if (typeof secret !== 'string' || !secret) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(header.trim());
  if (!match) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const actual = Buffer.from(match[1], 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Parse a webhook body. Throws `PaymentProviderError` when it is malformed. */
export function parseBtcpayWebhook(rawBody: string): BtcpayWebhookDelivery {
  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch (error) {
    throw new PaymentProviderError('BTCPay webhook body is not JSON.', {
      cause: error,
    });
  }
  if (!isRecord(raw)) {
    throw new PaymentProviderError('BTCPay webhook body is not an object.');
  }
  const deliveryId = readString(raw, 'deliveryId');
  const type = readString(raw, 'type');
  if (!deliveryId || !type) {
    throw new PaymentProviderError(
      'BTCPay webhook body needs deliveryId and type.',
    );
  }
  return {
    deliveryId,
    webhookId: readString(raw, 'webhookId'),
    originalDeliveryId: readString(raw, 'originalDeliveryId'),
    isRedelivery: raw.isRedelivery === true,
    type,
    timestamp: readDate(raw.timestamp),
    storeId: readString(raw, 'storeId'),
    invoiceId: readString(raw, 'invoiceId'),
    metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
    raw,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toInvoice(value: unknown): BtcpayInvoice {
  if (!isRecord(value)) {
    throw new BtcpayApiError('BTCPay invoice response was not an object.', 200);
  }
  const id = readString(value, 'id');
  if (!id) {
    throw new BtcpayApiError('BTCPay invoice response has no id.', 200);
  }
  return {
    id,
    storeId: readString(value, 'storeId'),
    status: readString(value, 'status') ?? 'New',
    additionalStatus: readString(value, 'additionalStatus') ?? 'None',
    amount: readDecimal(value.amount) ?? '0',
    currency: readString(value, 'currency') ?? '',
    checkoutLink: readString(value, 'checkoutLink'),
    createdTime: readDate(value.createdTime),
    expirationTime: readDate(value.expirationTime),
    monitoringExpiration: readDate(value.monitoringExpiration),
    archived: value.archived === true,
    metadata: isRecord(value.metadata) ? value.metadata : {},
    checkout: isRecord(value.checkout) ? value.checkout : {},
    raw: value,
  };
}

function toPaymentMethod(
  value: Record<string, unknown>,
): BtcpayInvoicePaymentMethod {
  // Greenfield 1.x used `paymentMethod` / `cryptoCode`; 2.x uses
  // `paymentMethodId` / `currency`.
  const paymentMethodId =
    readString(value, 'paymentMethodId') ??
    readString(value, 'paymentMethod') ??
    '';
  return {
    paymentMethodId,
    currency: readString(value, 'currency') ?? readString(value, 'cryptoCode'),
    destination: readString(value, 'destination'),
    paymentLink: readString(value, 'paymentLink'),
    rate: readDecimal(value.rate),
    amount: readDecimal(value.amount) ?? '0',
    paymentMethodPaid: readDecimal(value.paymentMethodPaid) ?? '0',
    totalPaid: readDecimal(value.totalPaid) ?? '0',
    due: readDecimal(value.due),
    payments: Array.isArray(value.payments)
      ? value.payments.filter(isRecord).map((payment) => ({
          id: readString(payment, 'id') ?? '',
          transactionId: onChainTransactionId(readString(payment, 'id')),
          receivedDate: readDate(payment.receivedDate),
          value: readDecimal(payment.value) ?? '0',
          fee: readDecimal(payment.fee) ?? '0',
          status: readString(payment, 'status') ?? '',
          destination: readString(payment, 'destination'),
        }))
      : [],
    raw: value,
  };
}

function readGreenfieldError(body: unknown): {
  code?: string;
  message?: string;
} {
  if (Array.isArray(body)) {
    // Validation errors: [{ path, message }]
    const messages = body
      .filter(isRecord)
      .map((item) =>
        [readString(item, 'path'), readString(item, 'message')]
          .filter(Boolean)
          .join(': '),
      )
      .filter(Boolean);
    return { code: 'validation-error', message: messages.join('; ') };
  }
  if (isRecord(body)) {
    return {
      code: readString(body, 'code'),
      message: readString(body, 'message'),
    };
  }
  return {};
}

/** Greenfield paths carry only store/invoice ids; strip the query string. */
function redactPath(path: string): string {
  return path.split('?')[0];
}

function errorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'TimeoutError' ? 'timed out' : error.name;
  }
  return 'network error';
}

function normalizeBaseUrl(value: string): string {
  const raw = requireString(value, 'BtcpayClient baseUrl');
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new PaymentConfigurationError(
      'BtcpayClient baseUrl must be an absolute URL.',
      { cause: error },
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new PaymentConfigurationError(
      'BtcpayClient baseUrl must use http or https.',
    );
  }
  if (
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    !['', '/'].includes(parsed.pathname)
  ) {
    throw new PaymentConfigurationError(
      'BtcpayClient baseUrl must be an origin without path, query, fragment, or credentials.',
    );
  }
  return parsed.origin;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PaymentConfigurationError(`${label} is required.`);
  }
  return value.trim();
}

function requirePositiveDecimal(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !/^\d+(\.\d+)?$/.test(value.trim()) ||
    !/[1-9]/.test(value)
  ) {
    throw new PaymentConfigurationError(
      `${label} must be a positive decimal string.`,
    );
  }
  return value.trim();
}

function requireCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PaymentConfigurationError(
      `BTCPay ${label} must be a non-negative integer.`,
    );
  }
  return value;
}

function toList<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

/** Keep decimals as strings; accept numbers Greenfield may emit. */
function readDecimal(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    const text = String(value);
    return /e/i.test(text)
      ? value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')
      : text;
  }
  return undefined;
}

function onChainTransactionId(id: string | undefined): string | undefined {
  const match = id ? /^([0-9a-f]{64})-\d+$/i.exec(id) : null;
  return match ? match[1].toLowerCase() : undefined;
}

/** Greenfield timestamps are unix seconds; ISO strings are accepted too. */
function readDate(value: unknown): Date | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}
