import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentConfigurationError,
  PaymentProviderError,
  PaymentVerificationError,
} from '../errors.js';
import {
  applyExpiryToPendingStatus,
  type FetchLike,
  formEncode,
  getFetch,
  normalizeDate,
  normalizeMaxStoredPaymentOptions,
  normalizeMinorUnitAmount,
  normalizeNonEmptyString,
  normalizePositivePaymentAmount,
  normalizeUrlString,
  pollPaymentStatus,
  readJsonResponse,
  rememberPaymentOption,
} from '../shared.js';
import type {
  CreatePaymentOptionInput,
  CreateSetupSessionInput,
  GetSetupResultInput,
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
  SavedPaymentMethod,
  SendPayoutInput,
  SetupSession,
  WatchPaymentInput,
} from '../types.js';

export const STRIPE_BACKEND_ID = 'stripe';
const STRIPE_CHECKOUT_MIN_EXPIRY_MS = 30 * 60 * 1_000;
const STRIPE_CHECKOUT_MAX_EXPIRY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_STRIPE_API_VERSION = '2024-06-20';
const DEFAULT_MAX_STORED_WEBHOOK_EVENT_IDS = 50_000;

export interface StripeAdapterOptions {
  secretKey: string;
  fetch?: FetchLike;
  apiBaseUrl?: string;
  apiVersion?: string;
  defaultCurrency?: string;
  supportedCurrencies?: string[];
  successUrl?: string;
  cancelUrl?: string;
  checkoutMode?: string;
  webhookSecret?: string;
  pollIntervalMs?: number;
  maxStoredPaymentOptions?: number;
  maxStoredWebhookEventIds?: number;
}

export interface StripeWebhookEvent extends PaymentWebhookEvent {
  id: string;
  type: string;
  status: PaymentStatus;
  quoteId?: string;
  providerPaymentId?: string;
  raw: unknown;
}

export class StripeAdapter implements PaymentBackend {
  readonly capabilities: PaymentBackendCapabilities;

  private readonly fetch: FetchLike;
  private readonly secretKey: string;
  private readonly apiBaseUrl: string;
  private readonly apiVersion: string;
  private readonly defaultCurrency: string;
  private readonly supportedCurrencies: Set<string>;
  private readonly checkoutMode: string;
  private readonly webhookSecret: string | undefined;
  private readonly maxStoredPaymentOptions: number;
  private readonly maxStoredWebhookEventIds: number;
  private readonly optionsByQuote = new Map<string, PaymentOption>();
  private readonly seenWebhookEventIds = new Set<string>();

  constructor(private readonly options: StripeAdapterOptions) {
    if (typeof options.secretKey !== 'string' || !options.secretKey.trim()) {
      throw new PaymentConfigurationError('StripeAdapter requires secretKey.');
    }

    if (options.webhookSecret !== undefined) {
      if (typeof options.webhookSecret !== 'string') {
        throw new PaymentConfigurationError(
          'StripeAdapter webhookSecret must be a string when configured.',
        );
      }

      if (!options.webhookSecret.trim()) {
        throw new PaymentConfigurationError(
          'StripeAdapter webhookSecret must not be empty when configured.',
        );
      }
    }

    if (options.apiBaseUrl !== undefined) {
      if (typeof options.apiBaseUrl !== 'string') {
        throw new PaymentConfigurationError(
          'StripeAdapter apiBaseUrl must be a string when configured.',
        );
      }

      if (!options.apiBaseUrl.trim()) {
        throw new PaymentConfigurationError(
          'StripeAdapter apiBaseUrl must not be empty when configured.',
        );
      }
    }

    this.fetch = getFetch(options.fetch);
    this.maxStoredPaymentOptions = normalizeMaxStoredPaymentOptions(
      options.maxStoredPaymentOptions,
      'StripeAdapter maxStoredPaymentOptions',
    );
    this.maxStoredWebhookEventIds = normalizeMaxStoredPaymentOptions(
      options.maxStoredWebhookEventIds ?? DEFAULT_MAX_STORED_WEBHOOK_EVENT_IDS,
      'StripeAdapter maxStoredWebhookEventIds',
    );
    this.secretKey = options.secretKey.trim();
    this.apiBaseUrl = normalizeUrlString(
      options.apiBaseUrl ?? 'https://api.stripe.com/v1',
      'StripeAdapter apiBaseUrl',
    ).replace(/\/$/, '');
    this.apiVersion = normalizeNonEmptyString(
      options.apiVersion ?? DEFAULT_STRIPE_API_VERSION,
      'StripeAdapter apiVersion',
    );
    this.defaultCurrency = normalizeStripeCurrency(
      options.defaultCurrency ?? 'usd',
    );
    this.supportedCurrencies = normalizeSupportedStripeCurrencies(
      options.supportedCurrencies,
      this.defaultCurrency,
    );
    this.checkoutMode = options.checkoutMode ?? 'payment';

    if (this.checkoutMode !== 'payment') {
      throw new PaymentConfigurationError(
        'StripeAdapter only supports payment Checkout mode.',
      );
    }

    this.webhookSecret = options.webhookSecret?.trim();
    this.capabilities = {
      id: STRIPE_BACKEND_ID,
      displayName: 'Stripe Checkout',
      settlementCurrency: this.defaultCurrency.toUpperCase(),
      supportedSettlementCurrencies: [...this.supportedCurrencies].map(
        (currency) => currency.toUpperCase(),
      ),
      chain: 'stripe',
      settlementShape: 'url',
      x402Capable: false,
      confirmationLatency: {
        expectedSeconds: 5,
        maxExpectedSeconds: 600,
        description:
          'Card payments usually confirm in seconds; bank debits can remain processing while Stripe settles them.',
      },
      supportsRefunds: true,
      supportsPayouts: true,
      supportsWebhooks: true,
      supportsSavedPaymentMethods: true,
      metadata: {
        provider: 'stripe',
      },
    };
  }

  async createPaymentOption(
    input: CreatePaymentOptionInput,
  ): Promise<PaymentOption> {
    const quoteId = normalizeNonEmptyString(input.quoteId, 'Stripe quoteId');
    const rawSuccessUrl = input.successUrl ?? this.options.successUrl;
    const rawCancelUrl = input.cancelUrl ?? this.options.cancelUrl;

    if (rawSuccessUrl === undefined || rawCancelUrl === undefined) {
      throw new PaymentConfigurationError(
        'StripeAdapter createPaymentOption requires successUrl and cancelUrl.',
      );
    }

    const successUrl = normalizeUrlString(rawSuccessUrl, 'Stripe successUrl');
    const cancelUrl = normalizeUrlString(rawCancelUrl, 'Stripe cancelUrl');
    const currency = normalizeStripeCurrency(input.currency);
    this.assertSupportedCurrency(currency);
    const amount = normalizePositivePaymentAmount(
      input.amount,
      currency,
      'Stripe Checkout amount',
    );
    const expiresAt = normalizeDate(input.expiresAt);
    const stripeExpiresAt = normalizeStripeCheckoutExpiresAt(expiresAt);
    const params: Record<string, unknown> = {
      mode: this.checkoutMode,
      ...Object.fromEntries([
        ['success_url', successUrl],
        ['cancel_url', cancelUrl],
        ['client_reference_id', quoteId],
        ['customer_email', input.buyerEmail],
        ['expires_at', Math.floor(stripeExpiresAt.getTime() / 1_000)],
      ]),
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][unit_amount]': amount,
      'line_items[0][price_data][product_data][name]':
        input.description ?? `Quote ${quoteId}`,
      ...flattenStripeMetadata(input.metadata),
      'metadata[quoteId]': quoteId,
    };

    const session = await this.stripeRequest<Record<string, unknown>>(
      '/checkout/sessions',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: formEncode(params),
      },
    );
    const sessionId = normalizeOptionalProviderString(
      readProviderString(session, 'id'),
    );
    const checkoutUrl = normalizeOptionalProviderString(
      readProviderString(session, 'url'),
    );

    if (!sessionId || !checkoutUrl) {
      throw new PaymentProviderError(
        'Stripe Checkout Session response did not include id and url.',
      );
    }

    const option: PaymentOption = {
      backendId: this.capabilities.id,
      quoteId,
      payTo: checkoutUrl,
      settlementShape: 'url',
      settlementCurrency: currency.toUpperCase(),
      settlementAmount: amount,
      amount,
      currency: currency.toUpperCase(),
      expiresAt: stripeExpiresAt,
      providerPaymentId: sessionId,
      paymentUri: checkoutUrl,
      metadata: {
        sessionId,
        paymentIntent: normalizeOptionalProviderString(
          readProviderString(session, 'payment_intent'),
        ),
      },
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
          input.pollIntervalMs ?? this.options.pollIntervalMs ?? 5_000,
      },
      () => this.getStatus(input.quoteId, input.payTo, input.statusContext),
    );
  }

  async getStatus(
    quoteId: string,
    payTo: string,
    context: PaymentStatusContext = {},
  ): Promise<PaymentStatusResult> {
    const normalizedQuoteId = normalizeNonEmptyString(
      quoteId,
      'Stripe quoteId',
    );
    const normalizedPayTo = normalizeNonEmptyString(payTo, 'Stripe payTo');
    const contextProviderPaymentId =
      context.providerPaymentId === undefined
        ? undefined
        : normalizeNonEmptyString(
            context.providerPaymentId,
            'Stripe providerPaymentId',
          );
    const sessionId =
      this.optionsByQuote.get(normalizedQuoteId)?.providerPaymentId ??
      contextProviderPaymentId ??
      extractStripeSessionId(normalizedPayTo);

    if (!sessionId) {
      throw new PaymentConfigurationError(
        'Stripe getStatus requires a Checkout Session id or URL.',
      );
    }

    const session = await this.stripeRequest<Record<string, unknown>>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    );
    const sessionQuoteId = readStripeSessionQuoteId(session);

    if (sessionQuoteId !== undefined && sessionQuoteId !== normalizedQuoteId) {
      throw new PaymentVerificationError(
        `Stripe Checkout Session quoteId ${sessionQuoteId} did not match ${normalizedQuoteId}.`,
      );
    }

    const paymentStatus = readString(session, 'payment_status');
    const status = mapStripeStatus(
      readString(session, 'status'),
      paymentStatus,
    );

    const option = this.optionsByQuote.get(normalizedQuoteId);
    const contextAmount =
      context.amount === undefined
        ? undefined
        : normalizeMinorUnitAmount(context.amount, 'Stripe status');
    const contextCurrency =
      context.currency === undefined
        ? undefined
        : normalizeStripeCurrency(context.currency).toUpperCase();
    const sessionCurrency =
      readString(session, 'currency') === undefined
        ? undefined
        : normalizeStripeCurrency(
            readString(session, 'currency') ?? '',
          ).toUpperCase();
    const sessionAmount = readSafeInteger(session, 'amount_total');
    const expiresAt =
      option?.expiresAt ??
      (context.expiresAt === undefined
        ? undefined
        : normalizeDate(context.expiresAt));
    const effectiveStatus = applyExpiryToPendingStatus(status, expiresAt);

    return {
      backendId: this.capabilities.id,
      quoteId: normalizedQuoteId,
      payTo: normalizedPayTo,
      status: effectiveStatus,
      settlementCurrency:
        sessionCurrency ??
        option?.settlementCurrency ??
        contextCurrency ??
        this.defaultCurrency.toUpperCase(),
      settlementAmount:
        sessionAmount ?? option?.settlementAmount ?? contextAmount,
      receivedAmount:
        paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
          ? (sessionAmount ?? option?.settlementAmount ?? contextAmount)
          : undefined,
      amount: option?.amount ?? contextAmount,
      currency: option?.currency ?? contextCurrency,
      providerPaymentId: sessionId,
      transactionId: normalizeOptionalProviderString(
        readProviderString(session, 'payment_intent'),
      ),
      updatedAt: new Date(),
      raw: session,
    };
  }

  async sendPayout(input: SendPayoutInput): Promise<PayoutResult> {
    const currency = normalizeStripeCurrency(
      input.currency ?? this.defaultCurrency,
    );
    this.assertSupportedCurrency(currency);
    const destination = normalizeNonEmptyString(
      input.destination,
      'Stripe payout destination',
    );
    const quoteId =
      input.quoteId === undefined
        ? undefined
        : normalizeNonEmptyString(input.quoteId, 'Stripe payout quoteId');
    const amount = normalizePositivePaymentAmount(
      input.amount,
      currency,
      'Stripe payout amount',
    );
    const transfer = await this.stripeRequest<Record<string, unknown>>(
      '/transfers',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: formEncode({
          amount,
          currency,
          destination,
          description: input.memo,
          ...flattenStripeMetadata(input.metadata),
          ...(quoteId === undefined ? {} : { 'metadata[quoteId]': quoteId }),
        }),
      },
    );

    return {
      backendId: this.capabilities.id,
      status: 'submitted',
      payoutId: normalizeOptionalProviderString(
        readProviderString(transfer, 'id'),
      ),
      destination,
      amount,
      currency: currency.toUpperCase(),
      raw: transfer,
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const rawPaymentReference = input.paymentId ?? input.transactionId;

    if (!rawPaymentReference) {
      throw new PaymentConfigurationError(
        'Stripe refunds require paymentId or transactionId.',
      );
    }

    const paymentReference = normalizeNonEmptyString(
      rawPaymentReference,
      'Stripe refund payment reference',
    );
    const currency = normalizeStripeCurrency(
      input.currency ?? this.defaultCurrency,
    );
    this.assertSupportedCurrency(currency);
    const amount =
      input.amount === undefined
        ? undefined
        : normalizePositivePaymentAmount(
            input.amount,
            currency,
            'Stripe refund amount',
          );
    const refundReferenceParam =
      await this.resolveStripeRefundReferenceParam(paymentReference);
    const refundParams: Record<string, unknown> = {
      ...refundReferenceParam,
      amount: amount === undefined ? undefined : amount,
      reason: input.reason,
      ...flattenStripeMetadata(input.metadata),
    };

    const refund = await this.stripeRequest<Record<string, unknown>>(
      '/refunds',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: formEncode(refundParams),
      },
    );

    return {
      backendId: this.capabilities.id,
      status: mapStripeRefundStatus(readString(refund, 'status')),
      refundId: normalizeOptionalProviderString(
        readProviderString(refund, 'id'),
      ),
      transactionId: paymentReference,
      amount,
      currency: currency.toUpperCase(),
      raw: refund,
    };
  }

  async createSetupSession(
    input: CreateSetupSessionInput,
  ): Promise<SetupSession> {
    const rawSuccessUrl = input.successUrl ?? this.options.successUrl;
    const rawCancelUrl = input.cancelUrl ?? this.options.cancelUrl;

    if (rawSuccessUrl === undefined || rawCancelUrl === undefined) {
      throw new PaymentConfigurationError(
        'StripeAdapter createSetupSession requires successUrl and cancelUrl.',
      );
    }

    const successUrl = normalizeUrlString(rawSuccessUrl, 'Stripe successUrl');
    const cancelUrl = normalizeUrlString(rawCancelUrl, 'Stripe cancelUrl');
    // Stripe requires a currency for setup-mode Checkout Sessions when
    // payment_method_types is not set; default to the backend currency.
    const currency = normalizeStripeCurrency(
      input.currency ?? this.defaultCurrency,
    );
    this.assertSupportedCurrency(currency);
    const providerCustomerId =
      input.providerCustomerId === undefined
        ? undefined
        : normalizeNonEmptyString(
            input.providerCustomerId,
            'Stripe setup customer',
          );

    // Either attach to an existing customer, or force Stripe to create one so
    // the saved method comes back with a reusable `cus_` reference. Setup-mode
    // sessions do NOT create a customer on their own — `customer_creation` must
    // be `always`. All snake_case keys go through Object.fromEntries.
    const customerParams: [string, unknown][] = [];
    if (providerCustomerId !== undefined) {
      customerParams.push(['customer', providerCustomerId]);
    } else {
      customerParams.push(['customer_creation', 'always']);
      if (input.customerEmail !== undefined) {
        customerParams.push([
          'customer_email',
          normalizeNonEmptyString(
            input.customerEmail,
            'Stripe setup customerEmail',
          ),
        ]);
      }
    }

    const params: Record<string, unknown> = {
      mode: 'setup',
      currency,
      ...Object.fromEntries([
        ['success_url', successUrl],
        ['cancel_url', cancelUrl],
        ...customerParams,
      ]),
      ...flattenStripeMetadata(input.metadata),
    };

    const session = await this.stripeRequest<Record<string, unknown>>(
      '/checkout/sessions',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: formEncode(params),
      },
    );

    const sessionId = normalizeOptionalProviderString(
      readProviderString(session, 'id'),
    );
    const url = normalizeOptionalProviderString(
      readProviderString(session, 'url'),
    );

    if (!sessionId || !url) {
      throw new PaymentProviderError(
        'Stripe setup Checkout Session response did not include id and url.',
      );
    }

    return {
      backendId: this.capabilities.id,
      sessionId,
      url,
      providerCustomerId:
        providerCustomerId ??
        normalizeOptionalProviderString(
          readProviderString(session, 'customer'),
        ),
      raw: session,
    };
  }

  async getSetupResult(
    input: GetSetupResultInput,
  ): Promise<SavedPaymentMethod> {
    const sessionId = normalizeNonEmptyString(
      input.sessionId,
      'Stripe setup sessionId',
    );

    const query = new URLSearchParams();
    query.append('expand[]', 'setup_intent.payment_method');

    const session = await this.stripeRequest<Record<string, unknown>>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`,
    );

    const setupIntent = readObject(session, 'setup_intent');
    const paymentMethod = readObject(setupIntent, 'payment_method');
    const card = readObject(paymentMethod, 'card');

    const providerCustomerId = normalizeOptionalProviderString(
      readProviderString(session, 'customer'),
    );
    const providerPaymentMethodId = normalizeOptionalProviderString(
      readProviderString(paymentMethod, 'id'),
    );

    let status = mapStripeSetupStatus(
      readString(session, 'status'),
      readString(setupIntent, 'status'),
    );
    // Never report `complete` without the reusable references a caller needs to
    // charge the method later — a `pm_` with no `cus_` can't be charged
    // off-session, so treat that as not-yet-ready rather than a false success.
    if (
      status === 'complete' &&
      (!providerCustomerId || !providerPaymentMethodId)
    ) {
      status = 'pending';
    }

    return {
      backendId: this.capabilities.id,
      status,
      providerCustomerId,
      providerPaymentMethodId,
      type: readString(paymentMethod, 'type'),
      brand: readString(card, 'brand'),
      last4: readString(card, 'last4'),
      expMonth: readSafeInteger(card, 'exp_month'),
      expYear: readSafeInteger(card, 'exp_year'),
      raw: session,
    };
  }

  parseWebhookEvent(payload: string, signature?: string): StripeWebhookEvent {
    if (!this.webhookSecret) {
      throw new PaymentConfigurationError(
        'StripeAdapter parseWebhookEvent requires webhookSecret.',
      );
    }

    if (!signature) {
      throw new PaymentProviderError('Missing Stripe webhook signature.');
    }

    verifyStripeWebhookSignature(payload, signature, this.webhookSecret);

    const event = parseStripeWebhookPayload(payload);
    const id = readRequiredWebhookString(
      event,
      'id',
      'Stripe webhook event id',
    );
    const type = readRequiredWebhookString(
      event,
      'type',
      'Stripe webhook event type',
    );

    const duplicate = this.seenWebhookEventIds.has(id);

    if (!duplicate) {
      this.seenWebhookEventIds.add(id);
      while (this.seenWebhookEventIds.size > this.maxStoredWebhookEventIds) {
        const oldest = this.seenWebhookEventIds.values().next().value;

        if (oldest === undefined) {
          break;
        }

        this.seenWebhookEventIds.delete(oldest);
      }
    }

    const data = (
      event.data as { object?: Record<string, unknown> } | undefined
    )?.object;

    return {
      id,
      type,
      status: mapStripeWebhookStatus(type, data),
      quoteId: normalizeOptionalWebhookString(
        readString(data, 'client_reference_id') ??
          readString(
            (data?.metadata as Record<string, unknown>) ?? {},
            'quoteId',
          ),
      ),
      providerPaymentId: normalizeOptionalWebhookString(readString(data, 'id')),
      duplicate,
      raw: event,
    };
  }

  private async stripeRequest<T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.secretKey}`);
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
    headers.set('Accept', 'application/json');
    headers.set('Stripe-Version', this.apiVersion);

    if (init.idempotencyKey !== undefined) {
      headers.set(
        'Idempotency-Key',
        normalizeNonEmptyString(init.idempotencyKey, 'Stripe idempotencyKey'),
      );
    }

    const { idempotencyKey: _idempotencyKey, ...requestInit } = init;
    const response = await this.fetch(`${this.apiBaseUrl}${path}`, {
      ...requestInit,
      method: init.method ?? 'GET',
      headers,
    });

    return readJsonResponse<T>(response, `Stripe ${path}`);
  }

  private assertSupportedCurrency(currency: string): void {
    if (!this.supportedCurrencies.has(currency)) {
      throw new PaymentConfigurationError(
        `StripeAdapter currency ${currency.toUpperCase()} is not configured as supported.`,
      );
    }
  }

  private async resolveStripeRefundReferenceParam(
    paymentReference: string,
  ): Promise<Record<string, string>> {
    if (paymentReference.startsWith('cs_')) {
      const session = await this.stripeRequest<Record<string, unknown>>(
        `/checkout/sessions/${encodeURIComponent(paymentReference)}`,
      );
      const paymentIntent = normalizeOptionalProviderString(
        readProviderString(session, 'payment_intent'),
      );

      if (!paymentIntent) {
        throw new PaymentProviderError(
          'Stripe Checkout Session did not include payment_intent for refund.',
        );
      }

      return Object.fromEntries([['payment_intent', paymentIntent]]);
    }

    return stripeRefundReferenceParam(paymentReference);
  }
}

function stripeRefundReferenceParam(
  paymentReference: string,
): Record<string, string> {
  if (paymentReference.startsWith('pi_')) {
    return Object.fromEntries([['payment_intent', paymentReference]]);
  }

  if (paymentReference.startsWith('ch_')) {
    return { charge: paymentReference };
  }

  throw new PaymentConfigurationError(
    'Stripe refunds require a Checkout Session (cs_), payment_intent (pi_), or charge (ch_) reference.',
  );
}

function normalizeStripeCurrency(value: string): string {
  if (typeof value !== 'string') {
    throw new PaymentConfigurationError(
      `StripeAdapter currency must be a three-letter ISO currency code, received ${String(value)}.`,
    );
  }

  const normalized = value.trim().toLowerCase();

  if (!/^[a-z]{3}$/.test(normalized)) {
    throw new PaymentConfigurationError(
      `StripeAdapter currency must be a three-letter ISO currency code, received ${String(value)}.`,
    );
  }

  return normalized;
}

function normalizeSupportedStripeCurrencies(
  configuredCurrencies: string[] | undefined,
  defaultCurrency: string,
): Set<string> {
  const normalized = new Set(
    (configuredCurrencies ?? ['usd', 'eur', 'gbp', 'cad']).map(
      normalizeStripeCurrency,
    ),
  );
  normalized.add(defaultCurrency);

  return normalized;
}

function normalizeStripeCheckoutExpiresAt(
  expiresAt: Date,
  now = Date.now(),
): Date {
  if (expiresAt.getTime() <= now) {
    throw new PaymentProviderError('Stripe Checkout expiry is in the past.');
  }

  const min = now + STRIPE_CHECKOUT_MIN_EXPIRY_MS;
  const max = now + STRIPE_CHECKOUT_MAX_EXPIRY_MS;

  if (expiresAt.getTime() < min || expiresAt.getTime() > max) {
    throw new PaymentConfigurationError(
      'Stripe Checkout expiry must be at least 30 minutes and no more than 24 hours from now.',
    );
  }

  return expiresAt;
}

export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): void {
  if (typeof payload !== 'string') {
    throw new PaymentProviderError('Stripe webhook payload must be a string.');
  }

  const normalizedSignatureHeader = normalizeNonEmptyString(
    signatureHeader,
    'Stripe signature header',
  );
  const normalizedSecret = normalizeNonEmptyString(
    secret,
    'Stripe webhook secret',
  );

  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    throw new PaymentConfigurationError(
      `Stripe webhook toleranceSeconds must be a non-negative finite number, received ${String(toleranceSeconds)}.`,
    );
  }

  const timestampCandidates: string[] = [];
  const signatures: string[] = [];

  for (const part of normalizedSignatureHeader.split(',')) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawKey?.trim();
    const value = rawValue.join('=').trim();

    if (!key || !value) {
      continue;
    }

    if (key === 't') {
      timestampCandidates.push(value);
    }

    if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (timestampCandidates.length !== 1 || signatures.length === 0) {
    throw new PaymentProviderError('Invalid Stripe signature header.');
  }

  const timestamp = timestampCandidates[0] ?? '';

  if (!/^\d+$/.test(timestamp)) {
    throw new PaymentProviderError('Invalid Stripe signature header.');
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isSafeInteger(timestampSeconds)) {
    throw new PaymentProviderError('Invalid Stripe signature header.');
  }

  const nowSeconds = Date.now() / 1_000;
  const ageSeconds = nowSeconds - timestampSeconds;

  if (ageSeconds < -5) {
    throw new PaymentProviderError(
      'Stripe webhook signature timestamp is in the future.',
    );
  }

  if (ageSeconds > toleranceSeconds) {
    throw new PaymentProviderError('Stripe webhook signature is too old.');
  }

  const expected = createHmac('sha256', normalizedSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  for (const signature of signatures) {
    if (!/^[0-9a-f]+$/i.test(signature)) {
      throw new PaymentProviderError('Invalid Stripe signature header.');
    }

    const actualBuffer = Buffer.from(signature, 'hex');

    if (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return;
    }
  }

  throw new PaymentProviderError('Invalid Stripe webhook signature.');
}

function parseStripeWebhookPayload(payload: string): Record<string, unknown> {
  try {
    const event = JSON.parse(payload);

    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new PaymentProviderError('Invalid Stripe webhook JSON payload.');
    }

    return event as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw error;
    }

    throw new PaymentProviderError('Invalid Stripe webhook JSON payload.', {
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

function readProviderString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const item = value[key];

  return typeof item === 'string' ? item : undefined;
}

function readRequiredWebhookString(
  value: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const item = value[key];

  if (typeof item !== 'string') {
    throw new PaymentProviderError(`${context} must be a string.`);
  }

  return normalizeNonEmptyString(item, context);
}

function readStripeSessionQuoteId(
  session: Record<string, unknown>,
): string | undefined {
  return normalizeOptionalWebhookString(
    readString(session, 'client_reference_id') ??
      readString(
        (session.metadata as Record<string, unknown>) ?? {},
        'quoteId',
      ),
  );
}

function mapStripeStatus(
  checkoutStatus: string | undefined,
  paymentStatus: string | undefined,
): PaymentStatus {
  if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
    return 'confirmed';
  }

  if (checkoutStatus === 'expired') {
    return 'expired';
  }

  if (paymentStatus === 'unpaid' || checkoutStatus === 'open') {
    return 'pending';
  }

  if (checkoutStatus === 'complete') {
    return 'processing';
  }

  return 'pending';
}

function mapStripeWebhookStatus(
  type: string | undefined,
  object: Record<string, unknown> | undefined,
): PaymentStatus {
  if (type === 'checkout.session.completed') {
    return mapStripeStatus(
      readString(object, 'status'),
      readString(object, 'payment_status'),
    );
  }

  if (type === 'checkout.session.async_payment_succeeded') {
    return 'confirmed';
  }

  if (type === 'checkout.session.async_payment_failed') {
    return 'failed';
  }

  if (type === 'checkout.session.expired') {
    return 'expired';
  }

  if (type?.includes('failed')) {
    return 'failed';
  }

  if (type?.includes('refunded')) {
    return 'refunded';
  }

  return 'processing';
}

function mapStripeRefundStatus(
  status: string | undefined,
): RefundResult['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    case 'failed':
    case 'canceled':
      return 'failed';
    case 'requires_action':
      return 'requires_action';
    default:
      return 'submitted';
  }
}

function mapStripeSetupStatus(
  sessionStatus: string | undefined,
  setupIntentStatus: string | undefined,
): SavedPaymentMethod['status'] {
  if (sessionStatus === 'expired') {
    return 'expired';
  }

  if (sessionStatus === 'complete') {
    // The method is reusable only once the SetupIntent itself has succeeded —
    // the Session can be `complete` while the intent is still `processing`
    // (async setup methods via dynamic payment methods).
    if (setupIntentStatus === 'succeeded') {
      return 'complete';
    }
    // A finished session whose SetupIntent didn't succeed is a terminal
    // failure (card declined → `requires_payment_method`, or `canceled`), so
    // callers can stop polling instead of waiting on a `pending` that will
    // never resolve. Still-in-flight states (`processing`, `requires_action`)
    // remain `pending`.
    if (
      setupIntentStatus === 'canceled' ||
      setupIntentStatus === 'requires_payment_method'
    ) {
      return 'failed';
    }
  }

  return 'pending';
}

function readObject(
  value: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const item = value?.[key];

  return item && typeof item === 'object' && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : undefined;
}

function extractStripeSessionId(payTo: string): string | undefined {
  if (/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(payTo)) {
    return payTo;
  }

  try {
    const url = new URL(payTo);
    const match = url.pathname.match(/\/pay\/([^/?#]+)/);

    const sessionId = match?.[1];

    return sessionId && /^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)
      ? sessionId
      : undefined;
  } catch {
    return undefined;
  }
}

function flattenStripeMetadata(
  metadata:
    | Record<string, string | number | boolean | null | undefined>
    | undefined,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (value !== undefined && value !== null) {
      result[`metadata[${key}]`] = value;
    }
  }

  return result;
}

function readString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  const item = value[key];

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item === 'number') {
    return String(item);
  }

  return undefined;
}

function readSafeInteger(
  value: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const item = value[key];

  return typeof item === 'number' && Number.isSafeInteger(item) && item >= 0
    ? item
    : undefined;
}
