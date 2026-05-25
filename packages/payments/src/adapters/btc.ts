import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentConfigurationError, PaymentProviderError } from '../errors.js';
import {
  applyExpiryToPendingStatus,
  currencyMinorUnitDecimals,
  decimalToMinorUnitAmount,
  type FetchLike,
  getFetch,
  minorUnitsToDecimal,
  normalizeAmount,
  normalizeDate,
  normalizeFutureDate,
  normalizeMaxStoredPaymentOptions,
  normalizeMinorUnitAmount,
  normalizeNonEmptyString,
  normalizePositiveMinorUnitAmount,
  normalizePositivePaymentAmount,
  normalizeUrlString,
  pollPaymentStatus,
  readJsonResponse,
  rememberPaymentOption,
} from '../shared.js';
import type {
  CreatePaymentOptionInput,
  PaymentBackend,
  PaymentBackendCapabilities,
  PaymentEvent,
  PaymentOption,
  PaymentStatus,
  PaymentStatusContext,
  PaymentStatusResult,
  PaymentWebhookEvent,
  PayoutResult,
  RefundPaymentInput,
  RefundResult,
  SendPayoutInput,
  WatchPaymentInput,
} from '../types.js';

export const BTC_BACKEND_ID = 'btc';
const DEFAULT_MAX_STORED_WEBHOOK_DELIVERY_IDS = 50_000;

export type BtcConfirmationPolicy = (input: {
  amount: number;
  currency: string;
  quoteId?: string;
}) => number;

export interface BtcAdapterOptions {
  baseUrl: string;
  apiKey: string;
  storeId: string;
  fetch?: FetchLike;
  currency?: string;
  paymentMethod?: string;
  pollIntervalMs?: number;
  confirmationPolicy?: BtcConfirmationPolicy;
  webhookSecret?: string;
  managedProviderName?: string;
  maxStoredPaymentOptions?: number;
  maxStoredWebhookDeliveryIds?: number;
}

interface StoredBtcOption extends PaymentOption {
  requiredConfirmations: number;
}

interface BtcpayPaymentMethod {
  decimalAmount?: string;
  destination?: string;
  paymentLink?: string;
  paymentMethod?: string;
  paymentMethodId?: string;
  cryptoCode?: string;
  rate?: string;
  networkFee?: string;
  confirmations?: number;
}

export interface BtcpayWebhookEvent extends PaymentWebhookEvent {
  deliveryId: string;
  invoiceId?: string;
  quoteId?: string;
  type?: string;
  status: PaymentStatus;
  raw: unknown;
}

export class BtcAdapter implements PaymentBackend {
  readonly capabilities: PaymentBackendCapabilities;

  private readonly fetch: FetchLike;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly storeId: string;
  private readonly currency: string;
  private readonly paymentMethod: string;
  private readonly webhookSecret: string | undefined;
  private readonly maxStoredPaymentOptions: number;
  private readonly maxStoredWebhookDeliveryIds: number;
  private readonly optionsByQuote = new Map<string, StoredBtcOption>();
  private readonly seenWebhookDeliveryIds = new Set<string>();

  constructor(private readonly options: BtcAdapterOptions) {
    if (typeof options.baseUrl !== 'string' || !options.baseUrl.trim()) {
      throw new PaymentConfigurationError('BtcAdapter requires baseUrl.');
    }

    if (typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
      throw new PaymentConfigurationError('BtcAdapter requires apiKey.');
    }

    if (typeof options.storeId !== 'string' || !options.storeId.trim()) {
      throw new PaymentConfigurationError('BtcAdapter requires storeId.');
    }

    if (options.webhookSecret !== undefined) {
      if (typeof options.webhookSecret !== 'string') {
        throw new PaymentConfigurationError(
          'BtcAdapter webhookSecret must be a string when configured.',
        );
      }

      if (!options.webhookSecret.trim()) {
        throw new PaymentConfigurationError(
          'BtcAdapter webhookSecret must not be empty when configured.',
        );
      }
    }

    this.fetch = getFetch(options.fetch);
    this.maxStoredPaymentOptions = normalizeMaxStoredPaymentOptions(
      options.maxStoredPaymentOptions,
      'BtcAdapter maxStoredPaymentOptions',
    );
    this.maxStoredWebhookDeliveryIds = normalizeMaxStoredPaymentOptions(
      options.maxStoredWebhookDeliveryIds ??
        DEFAULT_MAX_STORED_WEBHOOK_DELIVERY_IDS,
      'BtcAdapter maxStoredWebhookDeliveryIds',
    );
    this.baseUrl = normalizeBtcpayBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.storeId = options.storeId.trim();
    this.currency = normalizeCurrencyCode(options.currency ?? 'USD');
    this.paymentMethod = normalizePaymentMethod(
      options.paymentMethod ?? 'BTC-CHAIN',
    );
    this.webhookSecret = options.webhookSecret?.trim();
    const managedProviderName = normalizeOptionalProviderString(
      options.managedProviderName,
    );
    this.capabilities = {
      id: BTC_BACKEND_ID,
      displayName: 'Bitcoin via BTCPay Server',
      settlementCurrency: 'BTC',
      supportedSettlementCurrencies: ['BTC'],
      chain: 'bitcoin',
      settlementShape: 'address',
      x402Capable: false,
      confirmationLatency: {
        expectedSeconds: 600,
        maxExpectedSeconds: 1_800,
        minConfirmations: 1,
        description:
          'Tiered Bitcoin confirmation policy: 1 confirmation below $100, 2 below $1,000, 3 at $1,000 and above.',
      },
      supportsRefunds: true,
      supportsPayouts: true,
      supportsWebhooks: true,
      metadata: {
        provider: 'btcpay-server',
        managedProviderName,
      },
    };
  }

  async createPaymentOption(
    input: CreatePaymentOptionInput,
  ): Promise<PaymentOption> {
    const quoteId = normalizeNonEmptyString(input.quoteId, 'BTC quoteId');
    const expiresAt = normalizeFutureDate(
      input.expiresAt,
      'BTCPay invoice expiry',
    );
    const currency = normalizeCurrencyCode(input.currency);
    const amount = normalizePositivePaymentAmount(
      input.amount,
      currency,
      'BTCPay invoice amount',
    );
    const invoiceAmount = minorUnitsToDecimal(
      amount,
      currencyMinorUnitDecimals(currency),
    );
    const invoice = await this.request<Record<string, unknown>>(
      `/api/v1/stores/${encodeURIComponent(this.storeId)}/invoices`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: invoiceAmount,
          currency,
          metadata: {
            ...input.metadata,
            quoteId,
            buyerEmail: input.buyerEmail,
            description: input.description,
          },
          checkout: {
            expirationMinutes: Math.max(
              1,
              Math.ceil((expiresAt.getTime() - Date.now()) / 60_000),
            ),
          },
          additionalSearchTerms: [quoteId],
        }),
      },
    );
    const invoiceId = normalizeOptionalProviderString(
      readProviderString(invoice, 'id'),
    );
    const methods =
      extractPaymentMethods(invoice) ??
      (invoiceId
        ? await this.getPaymentMethods(invoiceId)
        : ([] as BtcpayPaymentMethod[]));
    const method = selectBtcPaymentMethod(methods, this.paymentMethod);
    const settlementAmountDecimal =
      method?.decimalAmount === undefined
        ? undefined
        : normalizeAmount(method.decimalAmount);
    const settlementAmount =
      settlementAmountDecimal === undefined
        ? undefined
        : decimalToMinorUnitAmount(
            settlementAmountDecimal,
            currencyMinorUnitDecimals('BTC'),
            'BTC settlement',
          );
    const payTo = method?.destination?.trim();

    if (!invoiceId) {
      throw new PaymentProviderError(
        'BTCPay invoice response did not include an invoice id.',
      );
    }

    if (
      !method ||
      !payTo ||
      settlementAmount === undefined ||
      settlementAmount === 0
    ) {
      throw new PaymentProviderError(
        `BTCPay invoice response did not include a ${this.paymentMethod} payment address and amount.`,
      );
    }

    const requiredConfirmations = this.getRequiredConfirmations({
      quoteId,
      amount,
      currency,
    });
    const option: StoredBtcOption = {
      backendId: this.capabilities.id,
      quoteId,
      payTo,
      settlementShape: 'address',
      settlementCurrency: 'BTC',
      settlementAmount,
      amount,
      currency,
      expiresAt,
      providerPaymentId: invoiceId,
      paymentUri: normalizeOptionalProviderString(method?.paymentLink),
      metadata: {
        invoiceId,
        checkoutLink: normalizeOptionalProviderString(
          readString(invoice, 'checkoutLink'),
        ),
        requiredConfirmations,
        rate: method?.rate,
        networkFee: method?.networkFee,
      },
      requiredConfirmations,
    };

    rememberPaymentOption(
      this.optionsByQuote,
      quoteId,
      option,
      this.maxStoredPaymentOptions,
    );

    return option;
  }

  watchPayment(input: WatchPaymentInput): AsyncIterable<PaymentEvent> {
    return pollPaymentStatus(
      {
        ...input,
        pollIntervalMs:
          input.pollIntervalMs ?? this.options.pollIntervalMs ?? 30_000,
      },
      () => this.getStatus(input.quoteId, input.payTo, input.statusContext),
    );
  }

  async getStatus(
    quoteId: string,
    payTo: string,
    context: PaymentStatusContext = {},
  ): Promise<PaymentStatusResult> {
    const normalizedQuoteId = normalizeNonEmptyString(quoteId, 'BTC quoteId');
    const normalizedPayTo = normalizeNonEmptyString(payTo, 'BTC payTo');
    const contextProviderPaymentId =
      context.providerPaymentId === undefined
        ? undefined
        : normalizeNonEmptyString(
            context.providerPaymentId,
            'BTC providerPaymentId',
          );
    const option = this.optionsByQuote.get(normalizedQuoteId);
    const contextAmount =
      context.amount === undefined
        ? undefined
        : normalizeMinorUnitAmount(context.amount, 'BTC status');
    const contextCurrency =
      context.currency === undefined
        ? undefined
        : normalizeCurrencyCode(context.currency);
    const contextSettlementAmount =
      context.settlementAmount === undefined
        ? undefined
        : normalizeMinorUnitAmount(
            context.settlementAmount,
            'BTC settlement status',
          );
    const invoice =
      option?.providerPaymentId !== undefined ||
      contextProviderPaymentId !== undefined
        ? await this.getInvoice(
            option?.providerPaymentId ?? contextProviderPaymentId ?? '',
          )
        : await this.findInvoice(normalizedQuoteId);
    const invoiceId =
      normalizeOptionalProviderString(readProviderString(invoice, 'id')) ??
      option?.providerPaymentId;
    const status = mapBtcpayStatus(
      readString(invoice, 'status'),
      readString(invoice, 'additionalStatus'),
    );
    const expiresAt =
      option?.expiresAt ??
      (context.expiresAt === undefined
        ? undefined
        : normalizeDate(context.expiresAt));
    const statusWithExpiry = applyExpiryToPendingStatus(status, expiresAt);
    let confirmations = findNestedNonNegativeInteger(invoice, [
      'confirmations',
      'confirmationCount',
    ]);
    const contextRequiredConfirmations =
      context.requiredConfirmations === undefined
        ? undefined
        : normalizeConfirmationCount(
            context.requiredConfirmations,
            'BTC requiredConfirmations',
          );
    const requiredConfirmations =
      option?.requiredConfirmations ??
      contextRequiredConfirmations ??
      this.getRequiredConfirmations({
        quoteId: normalizedQuoteId,
        amount:
          option?.amount ??
          contextAmount ??
          decimalToMinorUnitAmount(
            readDecimalString(invoice, 'amount') ?? '0',
            currencyMinorUnitDecimals(
              option?.currency ?? contextCurrency ?? this.currency,
            ),
            'BTCPay invoice',
          ),
        currency: option?.currency ?? contextCurrency ?? this.currency,
      });

    if (
      statusWithExpiry === 'confirmed' &&
      confirmations === undefined &&
      invoiceId
    ) {
      try {
        confirmations = maxConfirmationCount(
          await this.getPaymentMethods(invoiceId, { requireUsable: false }),
        );
      } catch (error) {
        if (!(error instanceof PaymentProviderError)) {
          throw error;
        }
      }
    }

    const effectiveStatus = enforceBtcConfirmations(
      statusWithExpiry,
      confirmations,
      requiredConfirmations,
    );
    const invoiceSettlementAmount = findNestedDecimalString(invoice, [
      'btcDue',
      'amountDue',
    ]);
    const receivedSettlementAmount =
      readDecimalString(invoice, 'amountPaid') ??
      findNestedDecimalString(invoice, ['paid']);

    return {
      backendId: this.capabilities.id,
      quoteId: normalizedQuoteId,
      payTo: normalizedPayTo,
      status: effectiveStatus,
      settlementCurrency: 'BTC',
      settlementAmount:
        option?.settlementAmount ??
        contextSettlementAmount ??
        (invoiceSettlementAmount === undefined
          ? undefined
          : decimalToMinorUnitAmount(
              invoiceSettlementAmount,
              currencyMinorUnitDecimals('BTC'),
              'BTC settlement',
            )),
      receivedAmount:
        receivedSettlementAmount === undefined
          ? undefined
          : decimalToMinorUnitAmount(
              receivedSettlementAmount,
              currencyMinorUnitDecimals('BTC'),
              'BTC received',
            ),
      amount: option?.amount ?? contextAmount,
      currency: option?.currency ?? contextCurrency,
      requiredConfirmations,
      confirmations,
      providerPaymentId: invoiceId,
      transactionId: normalizeOptionalProviderString(
        findNestedProviderString(invoice, ['transactionId', 'txid']),
      ),
      updatedAt: new Date(),
      raw: invoice,
    };
  }

  async sendPayout(input: SendPayoutInput): Promise<PayoutResult> {
    if (input.currency !== undefined) {
      const currency = normalizeNonEmptyString(
        input.currency,
        'BTC payout currency',
      );

      if (currency.toUpperCase() !== 'BTC') {
        throw new PaymentConfigurationError(
          `BtcAdapter can only send BTC payouts, received ${input.currency}.`,
        );
      }
    }

    const destination = normalizeNonEmptyString(
      input.destination,
      'BTC payout destination',
    );
    const quoteId =
      input.quoteId === undefined
        ? undefined
        : normalizeNonEmptyString(input.quoteId, 'BTC payout quoteId');
    const idempotencyKey =
      input.idempotencyKey === undefined
        ? quoteId
        : normalizeNonEmptyString(
            input.idempotencyKey,
            'BTC payout idempotencyKey',
          );
    const amount = normalizePositiveMinorUnitAmount(
      input.amount,
      'BTC payout amount',
    );
    const payoutAmount = minorUnitsToDecimal(
      amount,
      currencyMinorUnitDecimals('BTC'),
    );
    const result = await this.request<Record<string, unknown>>(
      `/api/v1/stores/${encodeURIComponent(
        this.storeId,
      )}/payment-methods/onchain/${encodeURIComponent(
        this.paymentMethod,
      )}/wallet/transactions`,
      {
        method: 'POST',
        body: JSON.stringify({
          destinations: [
            {
              destination,
              amount: payoutAmount,
            },
          ],
          subtractFromAmount: false,
          metadata: {
            ...input.metadata,
            ...(quoteId === undefined ? {} : { quoteId }),
            ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
            ...(input.memo === undefined ? {} : { memo: input.memo }),
          },
        }),
      },
    );

    return {
      backendId: this.capabilities.id,
      status: 'pending_signature',
      payoutId: normalizeOptionalProviderString(
        readProviderString(result, 'id'),
      ),
      psbt:
        normalizeOptionalProviderString(readProviderString(result, 'psbt')) ??
        normalizeOptionalProviderString(
          readProviderString(result, 'psbtBase64'),
        ) ??
        normalizeOptionalProviderString(
          readProviderString(result, 'unsignedPsbt'),
        ),
      transactionId: normalizeOptionalProviderString(
        readProviderString(result, 'transactionId'),
      ),
      destination,
      amount,
      currency: 'BTC',
      raw: result,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    if (
      input.currency !== undefined &&
      normalizeCurrencyCode(input.currency) !== 'BTC'
    ) {
      throw new PaymentConfigurationError(
        `BTC refunds require BTC currency when specified, received ${input.currency}.`,
      );
    }

    if (!input.destination) {
      throw new PaymentConfigurationError(
        'BTC refunds require a destination address.',
      );
    }

    if (input.amount === undefined) {
      throw new PaymentConfigurationError('BTC refunds require an amount.');
    }

    const payout = await this.sendPayout({
      destination: input.destination,
      amount: input.amount,
      currency: 'BTC',
      idempotencyKey: input.idempotencyKey,
      memo: input.reason,
      metadata: input.metadata,
    });

    return {
      backendId: this.capabilities.id,
      status: 'requires_action',
      refundId: payout.payoutId,
      transactionId: payout.transactionId,
      amount: payout.amount,
      currency: payout.currency,
      raw: payout.raw,
    };
  }

  parseWebhookEvent(payload: string, signature?: string): BtcpayWebhookEvent {
    if (!this.webhookSecret) {
      throw new PaymentConfigurationError(
        'BtcAdapter parseWebhookEvent requires webhookSecret.',
      );
    }

    if (!signature) {
      throw new PaymentProviderError('Missing BTCPay webhook signature.');
    }

    verifyBtcpayWebhookSignature(payload, signature, this.webhookSecret);

    const event = parseBtcpayWebhookPayload(payload);
    const type = normalizeOptionalWebhookString(
      readProviderString(event, 'type'),
    );
    const deliveryId = normalizeOptionalWebhookString(
      readProviderString(event, 'deliveryId'),
    );

    if (!deliveryId) {
      throw new PaymentProviderError('BTCPay webhook deliveryId is required.');
    }

    const duplicate = this.seenWebhookDeliveryIds.has(deliveryId);

    if (!duplicate) {
      this.seenWebhookDeliveryIds.add(deliveryId);
      while (
        this.seenWebhookDeliveryIds.size > this.maxStoredWebhookDeliveryIds
      ) {
        const oldest = this.seenWebhookDeliveryIds.values().next().value;

        if (oldest === undefined) {
          break;
        }

        this.seenWebhookDeliveryIds.delete(oldest);
      }
    }

    const invoiceId =
      readProviderString(event, 'invoiceId') ??
      findNestedProviderString(event, ['invoiceId', 'id']);

    return {
      deliveryId,
      invoiceId: normalizeOptionalWebhookString(invoiceId),
      quoteId: normalizeOptionalWebhookString(
        findNestedProviderString(event, ['quoteId']),
      ),
      duplicate,
      type,
      status: mapBtcpayStatus(
        readString(event, 'status'),
        readString(event, 'additionalStatus'),
        type,
      ),
      raw: event,
    };
  }

  private getRequiredConfirmations(input: {
    amount: number;
    currency: string;
    quoteId?: string;
  }): number {
    return normalizeConfirmationCount(
      (this.options.confirmationPolicy ?? defaultBtcConfirmationPolicy)(input),
      'BTC confirmationPolicy result',
    );
  }

  private async getInvoice(
    invoiceId: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/api/v1/stores/${encodeURIComponent(
        this.storeId,
      )}/invoices/${encodeURIComponent(invoiceId)}`,
    );
  }

  private async findInvoice(quoteId: string): Promise<Record<string, unknown>> {
    const invoices = await this.request<unknown>(
      `/api/v1/stores/${encodeURIComponent(
        this.storeId,
      )}/invoices?textSearch=${encodeURIComponent(quoteId)}`,
    );
    const list = Array.isArray(invoices)
      ? invoices
      : Array.isArray((invoices as { items?: unknown[] }).items)
        ? (invoices as { items: unknown[] }).items
        : [];
    const matches = list.filter((invoice) =>
      invoiceMatchesQuote(invoice, quoteId),
    );

    if (matches.length > 1) {
      throw new PaymentProviderError(
        `BTCPay invoice lookup for quote ${quoteId} returned multiple matches.`,
      );
    }

    const [match] = matches;

    if (!match || typeof match !== 'object') {
      throw new PaymentProviderError(
        `BTCPay invoice for quote ${quoteId} was not found.`,
      );
    }

    return match as Record<string, unknown>;
  }

  private async getPaymentMethods(
    invoiceId: string,
    options: { requireUsable?: boolean } = {},
  ): Promise<BtcpayPaymentMethod[]> {
    const response = await this.request<unknown>(
      `/api/v1/stores/${encodeURIComponent(
        this.storeId,
      )}/invoices/${encodeURIComponent(invoiceId)}/payment-methods`,
    );

    return extractPaymentMethods(response, options.requireUsable) ?? [];
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `token ${this.apiKey}`);
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');

    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    return readJsonResponse<T>(response, `BTCPay ${path}`);
  }
}

function invoiceMatchesQuote(invoice: unknown, quoteId: string): boolean {
  if (!invoice || typeof invoice !== 'object') {
    return false;
  }

  const record = invoice as Record<string, unknown>;
  const metadata =
    record.metadata && typeof record.metadata === 'object'
      ? (record.metadata as Record<string, unknown>)
      : undefined;

  if (readProviderString(metadata, 'quoteId')?.trim() === quoteId) {
    return true;
  }

  return false;
}

export function defaultBtcConfirmationPolicy(input: {
  amount: number;
  currency: string;
}): number {
  const decimals = currencyMinorUnitDecimals(input.currency);
  const highValueThreshold = decimalToMinorUnitAmount(
    '1000',
    decimals,
    'BTC confirmation threshold',
  );
  const mediumValueThreshold = decimalToMinorUnitAmount(
    '100',
    decimals,
    'BTC confirmation threshold',
  );

  if (input.amount >= highValueThreshold) {
    return 3;
  }

  if (input.amount >= mediumValueThreshold) {
    return 2;
  }

  return 1;
}

export function verifyBtcpayWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): void {
  if (typeof payload !== 'string') {
    throw new PaymentProviderError('BTCPay webhook payload must be a string.');
  }

  const normalizedSignature = normalizeNonEmptyString(
    signature,
    'BTCPay webhook signature',
  );
  const normalizedSecret = normalizeNonEmptyString(
    secret,
    'BTCPay webhook secret',
  );
  const expected = createHmac('sha256', normalizedSecret)
    .update(payload)
    .digest('hex');
  const actual = normalizedSignature.replace(/^sha256=/, '');

  if (!/^[a-f0-9]{64}$/i.test(actual)) {
    throw new PaymentProviderError('Invalid BTCPay webhook signature.');
  }

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new PaymentProviderError('Invalid BTCPay webhook signature.');
  }
}

function parseBtcpayWebhookPayload(payload: string): Record<string, unknown> {
  try {
    const event = JSON.parse(payload);

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new PaymentProviderError('Invalid BTCPay webhook JSON payload.');
    }

    return event as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw error;
    }

    throw new PaymentProviderError('Invalid BTCPay webhook JSON payload.', {
      cause: error,
    });
  }
}

function normalizeOptionalWebhookString(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function normalizeOptionalProviderString(
  value: string | undefined,
): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function mapBtcpayStatus(
  status: string | undefined,
  additionalStatus?: string,
  type?: string,
): PaymentStatus {
  const statusToken = normalizeBtcpayToken(status);
  const additionalStatusToken = normalizeBtcpayToken(additionalStatus);
  const typeToken = normalizeBtcpayToken(type);
  const tokens = [statusToken, additionalStatusToken, typeToken];

  if (
    tokens.some((token) =>
      ['incomplete', 'invoiceincomplete', 'new', 'unpaid'].includes(token),
    )
  ) {
    return 'pending';
  }

  if (
    tokens.some((token) =>
      [
        'settled',
        'complete',
        'confirmed',
        'invoicesettled',
        'invoicepaymentsettled',
      ].includes(token),
    )
  ) {
    return 'confirmed';
  }

  if (tokens.some((token) => ['expired', 'invoiceexpired'].includes(token))) {
    return 'expired';
  }

  if (
    tokens.some((token) =>
      ['invalid', 'failed', 'invoiceinvalid'].includes(token),
    )
  ) {
    return 'failed';
  }

  if (
    tokens.some((token) =>
      [
        'processing',
        'paid',
        'paidlate',
        'paidpartial',
        'invoiceprocessing',
        'invoicereceivedpayment',
        'invoicepaymentsettling',
      ].includes(token),
    )
  ) {
    return 'processing';
  }

  return 'pending';
}

function normalizeBtcpayToken(value: string | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') ?? ''
  );
}

function enforceBtcConfirmations(
  status: PaymentStatus,
  confirmations: number | undefined,
  requiredConfirmations: number,
): PaymentStatus {
  if (status !== 'confirmed') {
    return status;
  }

  if (requiredConfirmations <= 0) {
    return status;
  }

  if (confirmations === undefined) {
    return 'processing';
  }

  return confirmations >= requiredConfirmations ? 'confirmed' : 'processing';
}

function normalizeConfirmationCount(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new PaymentConfigurationError(
      `${label} must be a non-negative integer, received ${String(value)}.`,
    );
  }

  return value;
}

function normalizeCurrencyCode(value: string): string {
  if (typeof value !== 'string') {
    throw new PaymentConfigurationError(
      `BtcAdapter currency must be a three-letter currency code, received ${String(value)}.`,
    );
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new PaymentConfigurationError(
      `BtcAdapter currency must be a three-letter currency code, received ${String(value)}.`,
    );
  }

  return normalized;
}

function normalizePaymentMethod(value: string): string {
  if (typeof value !== 'string') {
    throw new PaymentConfigurationError(
      'BtcAdapter paymentMethod must be a string.',
    );
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new PaymentConfigurationError(
      'BtcAdapter paymentMethod must not be empty when configured.',
    );
  }

  return normalized;
}

function normalizeBtcpayBaseUrl(value: string): string {
  const normalized = normalizeUrlString(value, 'BtcAdapter baseUrl')
    .trim()
    .replace(/\/$/, '');
  const parsed = new URL(normalized);

  if (parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new PaymentConfigurationError(
      'BtcAdapter baseUrl must be an origin URL without path, query, or fragment.',
    );
  }

  return parsed.origin;
}

function extractPaymentMethods(
  value: unknown,
  requireUsable = true,
): BtcpayPaymentMethod[] | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const methods = value
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map(readPaymentMethod);

    return requireUsable ? methods.filter(isUsablePaymentMethod) : methods;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of ['paymentMethods', 'paymentMethodDetails', 'methods']) {
    const nested = extractPaymentMethods(record[key], requireUsable);

    if (nested?.length) {
      return nested;
    }
  }

  const methods = Object.entries(record)
    .filter(([key, item]) => key.toUpperCase().includes('BTC') && item)
    .map(([key, item]) => {
      const method = readPaymentMethod(item as Record<string, unknown>);

      return {
        ...method,
        paymentMethod: method.paymentMethod ?? key,
      };
    });

  return requireUsable ? methods.filter(isUsablePaymentMethod) : methods;
}

function selectBtcPaymentMethod(
  methods: BtcpayPaymentMethod[],
  paymentMethod: string,
): BtcpayPaymentMethod | undefined {
  const target = paymentMethod.toUpperCase();
  const aliases =
    target === 'BTC' || target === 'BTC-CHAIN'
      ? ['BTC-CHAIN', 'BTC', 'BITCOIN']
      : [target];

  return methods.find((method) => paymentMethodMatchesAlias(method, aliases));
}

function paymentMethodMatchesAlias(
  method: BtcpayPaymentMethod,
  aliases: string[],
): boolean {
  const methodIdentifiers = [method.paymentMethod, method.paymentMethodId]
    .map((value) => value?.trim().toUpperCase())
    .filter((value): value is string => Boolean(value));

  if (methodIdentifiers.length > 0) {
    return methodIdentifiers.some((value) => aliases.includes(value));
  }

  const cryptoCode = method.cryptoCode?.trim().toUpperCase();

  return cryptoCode !== undefined && aliases.includes(cryptoCode);
}

function readPaymentMethod(
  value: Record<string, unknown>,
): BtcpayPaymentMethod {
  return {
    decimalAmount:
      readDecimalString(value, 'amount') ?? readDecimalString(value, 'due'),
    destination:
      readProviderString(value, 'destination') ??
      readProviderString(value, 'address') ??
      readProviderString(value, 'paymentAddress'),
    paymentLink:
      readProviderString(value, 'paymentLink') ??
      readProviderString(value, 'paymentUrl'),
    paymentMethod:
      readProviderString(value, 'paymentMethod') ??
      readProviderString(value, 'paymentMethodId'),
    paymentMethodId: readProviderString(value, 'paymentMethodId'),
    cryptoCode: readProviderString(value, 'cryptoCode'),
    rate: readDecimalString(value, 'rate'),
    networkFee: readDecimalString(value, 'networkFee'),
    confirmations: findNestedNonNegativeInteger(value, [
      'confirmations',
      'confirmationCount',
    ]),
  };
}

function isUsablePaymentMethod(method: BtcpayPaymentMethod): boolean {
  return Boolean(method.destination && method.decimalAmount);
}

function maxConfirmationCount(
  methods: BtcpayPaymentMethod[],
): number | undefined {
  const confirmations = methods
    .map((method) => method.confirmations)
    .filter((value): value is number => value !== undefined);

  return confirmations.length === 0 ? undefined : Math.max(...confirmations);
}

function readString(
  value: Record<string, unknown> | unknown,
  key: string,
): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const item = (value as Record<string, unknown>)[key];

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item === 'number') {
    return String(item);
  }

  return undefined;
}

function readProviderString(
  value: Record<string, unknown> | unknown,
  key: string,
): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const item = (value as Record<string, unknown>)[key];

  return typeof item === 'string' ? item : undefined;
}

function findNestedString(
  value: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (!value || typeof value !== 'object' || depth > 16) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const direct = readString(record, key);
    if (direct) {
      return direct;
    }
  }

  for (const child of Object.values(record)) {
    const match = findNestedString(child, keys, depth + 1);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function findNestedProviderString(
  value: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (!value || typeof value !== 'object' || depth > 16) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const direct = readProviderString(record, key);
    if (direct) {
      return direct;
    }
  }

  for (const child of Object.values(record)) {
    const match = findNestedProviderString(child, keys, depth + 1);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function findNestedNonNegativeInteger(
  value: unknown,
  keys: string[],
): number | undefined {
  const raw = findNestedString(value, keys);

  if (raw === undefined || !/^\d+$/.test(raw)) {
    return undefined;
  }

  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function findNestedDecimalString(
  value: unknown,
  keys: string[],
  depth = 0,
): string | undefined {
  if (!value || typeof value !== 'object' || depth > 16) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const direct = readDecimalString(record, key);
    if (direct) {
      return direct;
    }
  }

  for (const child of Object.values(record)) {
    const match = findNestedDecimalString(child, keys, depth + 1);

    if (match) {
      return match;
    }
  }

  return undefined;
}

function readDecimalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const item = value[key];

  if (typeof item !== 'string') {
    return undefined;
  }

  try {
    return normalizeAmount(item);
  } catch {
    return undefined;
  }
}
