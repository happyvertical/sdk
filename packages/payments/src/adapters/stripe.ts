import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentConfigurationError,
  PaymentNotOwnedError,
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
  normalizePositiveMinorUnitAmount,
  normalizePositivePaymentAmount,
  normalizeUrlString,
  pollPaymentStatus,
  readJsonResponse,
  rememberPaymentOption,
} from '../shared.js';
import type {
  AuthorizationResult,
  AuthorizePaymentInput,
  CapturePaymentInput,
  CaptureResult,
  CreatePaymentOptionInput,
  CreateSetupSessionInput,
  GetSetupResultInput,
  PaymentBackend,
  PaymentBackendCapabilities,
  PaymentDispute,
  PaymentDisputeStatus,
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
  VoidPaymentInput,
  VoidResult,
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
  /**
   * Signing secret of the Stripe Connect webhook endpoint. Stripe signs
   * connected-account events with a different secret from the platform
   * endpoint; see {@link StripeAdapter.parseConnectWebhookEvent}.
   */
  connectWebhookSecret?: string;
  pollIntervalMs?: number;
  maxStoredPaymentOptions?: number;
  maxStoredWebhookEventIds?: number;
  /** Default Stripe Connect account for this adapter's provider requests. */
  stripeAccount?: string;
}

/** Stripe Connect account scope for a request; omit it for the platform. */
export interface StripeAccountScope {
  stripeAccount?: string;
}

export interface StripeCreatePaymentOptionInput
  extends CreatePaymentOptionInput,
    StripeAccountScope {
  /** Stripe application fee in integer minor units for this direct charge. */
  applicationFeeAmount?: number;
}

export interface StripePaymentStatusContext
  extends PaymentStatusContext,
    StripeAccountScope {}

export interface StripeRefundPaymentInput
  extends RefundPaymentInput,
    StripeAccountScope {
  /** Refund a Stripe application fee collected with the charge. */
  refundApplicationFee?: boolean;
  /** Reverse a destination transfer when the provider supports one. */
  reverseTransfer?: boolean;
}

export interface StripeAuthorizePaymentInput
  extends AuthorizePaymentInput,
    StripeAccountScope {
  /** Stripe application fee in integer minor units for this PaymentIntent. */
  applicationFeeAmount?: number;
}

export interface StripeCapturePaymentInput
  extends CapturePaymentInput,
    StripeAccountScope {}

export interface StripeVoidPaymentInput
  extends VoidPaymentInput,
    StripeAccountScope {}

export interface StripeCreateSetupSessionInput
  extends CreateSetupSessionInput,
    StripeAccountScope {}

export interface StripeGetSetupResultInput
  extends GetSetupResultInput,
    StripeAccountScope {}

export interface StripeWatchPaymentInput
  extends Omit<WatchPaymentInput, 'statusContext'> {
  statusContext?: StripePaymentStatusContext;
}

export interface StripeWebhookEvent extends PaymentWebhookEvent {
  id: string;
  type: string;
  status: PaymentStatus;
  quoteId?: string;
  providerPaymentId?: string;
  /**
   * Connected account (`acct_...`) the event originated from. Set only on
   * events verified through {@link StripeAdapter.parseConnectWebhookEvent};
   * platform-endpoint events never carry it.
   */
  account?: string;
  /** Verified event environment and timestamp (required for dispute events). */
  livemode?: boolean;
  createdAt?: Date;
  dispute?: StripeDispute;
  /** Typed Connect account, application-fee, and dispute payloads. */
  connect?: StripeConnectEventDetail;
  raw: unknown;
}

/** A Connect endpoint event: always scoped to a connected account. */
export interface StripeConnectWebhookEvent extends StripeWebhookEvent {
  account: string;
}

export type StripeConnectEventDetail =
  | {
      type: 'account.updated';
      account: StripeConnectAccountStatus;
    }
  | {
      type: 'application_fee.created' | 'application_fee.refunded';
      applicationFee: StripeApplicationFee;
    }
  | { type: StripeDisputeEventType; dispute: StripeDispute };

export type StripeDisputeEventType =
  | 'charge.dispute.created'
  | 'charge.dispute.updated'
  | 'charge.dispute.closed'
  | 'charge.dispute.funds_withdrawn'
  | 'charge.dispute.funds_reinstated';

export interface StripeDispute extends PaymentDispute {
  /** Verified webhook origin or authenticated request scope; absent for platform. */
  account?: string;
  raw: unknown;
}

export interface StripeGetDisputeOptions extends StripeAccountScope {
  /** Reject an authoritative reread from a different environment. */
  expectedLivemode?: boolean;
}

/** Connected account onboarding and capability state. */
export interface StripeConnectAccountStatus {
  accountId: string;
  /** Stripe account type (`standard`, `express`, `custom`) when reported. */
  type?: string;
  /** Stripe `charges_enabled`. */
  chargesEnabled: boolean;
  /** Stripe `details_submitted`. */
  detailsSubmitted: boolean;
  /** Stripe `payouts_enabled`. */
  payoutsEnabled: boolean;
  /** Per-capability state, e.g. `{ card_payments: 'active' }`. */
  capabilities: Record<string, string>;
  requirements: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
    disabledReason?: string;
  };
  country?: string;
  defaultCurrency?: string;
  raw: unknown;
}

export interface StripeApplicationFee {
  id: string;
  /** Connected account the fee was collected from. */
  account?: string;
  /** Fee amount in integer minor units. */
  amount?: number;
  /** Refunded portion in integer minor units. */
  amountRefunded?: number;
  currency?: string;
  refunded: boolean;
  charge?: string;
  livemode?: boolean;
  raw: unknown;
}

export interface StripeCreateStandardAccountInput {
  /** Two-letter ISO country code of the account holder. */
  country?: string;
  /** Prefills the account holder's email in Stripe onboarding. */
  email?: string;
  businessType?: 'individual' | 'company' | 'non_profit' | 'government_entity';
  metadata?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey?: string;
}

export interface StripeOnboardingLink {
  /** Single-use Stripe-hosted onboarding URL; treat it as a bearer secret. */
  url: string;
  expiresAt?: Date;
  raw: unknown;
}

export interface StripeCreateOnboardingLinkOptions {
  /** Which requirements to collect up front; Stripe defaults to `currently_due`. */
  collect?: 'currently_due' | 'eventually_due';
  idempotencyKey?: string;
}

/**
 * Host mapping from a connected account to its owner. Return `undefined` or
 * `null` for an account the host does not recognize; the event is then
 * rejected with {@link PaymentNotOwnedError}.
 */
export type StripeConnectAccountResolver<TOwner> = (
  account: string,
  event: StripeWebhookEvent,
) => TOwner | null | undefined | Promise<TOwner | null | undefined>;

export interface StripeResolveConnectWebhookOptions<TOwner> {
  resolveAccount: StripeConnectAccountResolver<TOwner>;
  /**
   * Endpoint the delivery arrived on. `connect` (default) verifies with
   * `connectWebhookSecret` and routes by the event's `account`. `platform`
   * verifies with `webhookSecret` and routes `application_fee.*` events by the
   * fee's connected account; other platform events are rejected.
   */
  endpoint?: 'connect' | 'platform';
}

export interface StripeResolvedConnectWebhookEvent<TOwner> {
  event: StripeWebhookEvent;
  /** Connected account the event was routed by. */
  account: string;
  owner: TOwner;
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
  private readonly connectWebhookSecret: string | undefined;
  private readonly stripeAccount: string | undefined;
  private readonly maxStoredPaymentOptions: number;
  private readonly maxStoredWebhookEventIds: number;
  private readonly optionsByQuote = new Map<string, PaymentOption>();
  private readonly seenWebhookEventIds = new Set<string>();

  constructor(private readonly options: StripeAdapterOptions) {
    if (typeof options.secretKey !== 'string' || !options.secretKey.trim()) {
      throw new PaymentConfigurationError('StripeAdapter requires secretKey.');
    }

    assertOptionalSecret(options.webhookSecret, 'webhookSecret');
    assertOptionalSecret(options.connectWebhookSecret, 'connectWebhookSecret');

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
    this.connectWebhookSecret = options.connectWebhookSecret?.trim();
    this.stripeAccount = normalizeOptionalStripeAccount(
      options.stripeAccount,
      'StripeAdapter stripeAccount',
    );
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
      supportsManualCapture: true,
      supportsSavedPaymentMethods: true,
      metadata: {
        provider: 'stripe',
      },
    };
  }

  async createPaymentOption(
    input: StripeCreatePaymentOptionInput,
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
    const applicationFeeAmount = normalizeApplicationFeeAmount(
      input.applicationFeeAmount,
      amount,
      'Stripe Checkout applicationFeeAmount',
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
      ...(applicationFeeAmount === undefined
        ? {}
        : {
            'payment_intent_data[application_fee_amount]': applicationFeeAmount,
          }),
      ...flattenStripeMetadata(input.metadata),
      'metadata[quoteId]': quoteId,
    };

    const stripeAccount = this.resolveStripeAccount(input.stripeAccount);
    const session = await this.stripeRequest<Record<string, unknown>>(
      '/checkout/sessions',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        stripeAccount,
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
        stripeAccount,
        paymentIntent: normalizeOptionalProviderString(
          readProviderString(session, 'payment_intent'),
        ),
      },
    };

    rememberPaymentOption(
      this.optionsByQuote,
      stripePaymentOptionKey(quoteId, stripeAccount),
      option,
      this.maxStoredPaymentOptions,
    );

    return option;
  }

  watchPayment(input: StripeWatchPaymentInput): AsyncIterable<PaymentEvent> {
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
    context: StripePaymentStatusContext = {},
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
    const contextStripeAccount = normalizeOptionalStripeAccount(
      context.stripeAccount,
      'Stripe stripeAccount',
    );
    const scopedOption = this.optionsByQuote.get(
      stripePaymentOptionKey(
        normalizedQuoteId,
        contextStripeAccount ?? this.stripeAccount,
      ),
    );
    const sessionId =
      contextProviderPaymentId ??
      extractStripeSessionId(normalizedPayTo) ??
      scopedOption?.providerPaymentId;

    if (!sessionId) {
      throw new PaymentConfigurationError(
        'Stripe getStatus requires a Checkout Session id or URL.',
      );
    }

    const storedOption = this.findStoredOptionBySessionId(sessionId);
    const stripeAccount =
      contextStripeAccount ??
      readStripeOptionAccount(storedOption) ??
      this.stripeAccount;
    const cachedOption = this.optionsByQuote.get(
      stripePaymentOptionKey(normalizedQuoteId, stripeAccount),
    );

    // A caller-supplied session id can deliberately select a later checkout
    // for the same quote. Cache-derived amount, currency, and expiry describe
    // only the session we created, never an explicitly selected replacement.
    const option =
      cachedOption?.providerPaymentId === sessionId ? cachedOption : undefined;

    const session = await this.stripeRequest<Record<string, unknown>>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { stripeAccount },
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

  async refundPayment(input: StripeRefundPaymentInput): Promise<RefundResult> {
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
    const stripeAccount = this.resolveStripeAccount(input.stripeAccount);
    const refundReferenceParam = await this.resolveStripeRefundReferenceParam(
      paymentReference,
      stripeAccount,
    );
    const refundParams: Record<string, unknown> = {
      ...refundReferenceParam,
      amount: amount === undefined ? undefined : amount,
      reason: input.reason,
      refund_application_fee: input.refundApplicationFee,
      reverse_transfer: input.reverseTransfer,
      ...flattenStripeMetadata(input.metadata),
    };

    const refund = await this.stripeRequest<Record<string, unknown>>(
      '/refunds',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        stripeAccount,
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
      // Read the settled amount and currency back from the refund object
      // (mirrors capturePayment) so a full refund — no `input.amount` supplied,
      // and possibly a currency differing from the adapter default when
      // `input.currency` is omitted — surfaces what Stripe actually refunded
      // instead of the request defaults.
      amount: readSafeInteger(refund, 'amount') ?? amount,
      currency: readStripeResultCurrency(refund) ?? currency.toUpperCase(),
      raw: refund,
    };
  }

  async authorizePayment(
    input: StripeAuthorizePaymentInput,
  ): Promise<AuthorizationResult> {
    const currency = normalizeStripeCurrency(input.currency);
    this.assertSupportedCurrency(currency);
    const amount = normalizePositivePaymentAmount(
      input.amount,
      currency,
      'Stripe authorize amount',
    );
    const paymentMethod = normalizeNonEmptyString(
      input.providerPaymentMethodId,
      'Stripe authorize providerPaymentMethodId',
    );
    const providerCustomerId =
      input.providerCustomerId === undefined
        ? undefined
        : normalizeNonEmptyString(
            input.providerCustomerId,
            'Stripe authorize providerCustomerId',
          );
    const quoteId =
      input.quoteId === undefined
        ? undefined
        : normalizeNonEmptyString(input.quoteId, 'Stripe authorize quoteId');
    const applicationFeeAmount = normalizeApplicationFeeAmount(
      input.applicationFeeAmount,
      amount,
      'Stripe PaymentIntent applicationFeeAmount',
    );

    const intent = await this.stripeRequest<Record<string, unknown>>(
      '/payment_intents',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        stripeAccount: this.resolveStripeAccount(input.stripeAccount),
        body: formEncode({
          amount,
          currency,
          confirm: true,
          'payment_method_types[]': 'card',
          description: input.description,
          application_fee_amount: applicationFeeAmount,
          ...Object.fromEntries([
            ['payment_method', paymentMethod],
            ['capture_method', 'manual'],
            // Off-session (merchant-initiated) by default — the primary use is
            // charging a saved card while the buyer is absent. Without this,
            // Stripe treats it as on-session and may raise an SCA challenge the
            // absent buyer can't complete, so the hold is never placed.
            ['off_session', input.offSession ?? true],
          ]),
          ...(providerCustomerId === undefined
            ? {}
            : { customer: providerCustomerId }),
          ...flattenStripeMetadata(input.metadata),
          ...(quoteId === undefined ? {} : { 'metadata[quoteId]': quoteId }),
        }),
      },
    );

    const providerPaymentId = normalizeOptionalProviderString(
      readProviderString(intent, 'id'),
    );

    if (!providerPaymentId) {
      throw new PaymentProviderError(
        'Stripe PaymentIntent response did not include an id.',
      );
    }

    const status = mapStripeAuthorizationStatus(readString(intent, 'status'));
    // Only surface the SCA fields when authentication is actually required — the
    // documented contract — even though Stripe returns client_secret regardless.
    // (Authorization progress is observed via `parseWebhookEvent`, which surfaces
    // the ready-to-capture transition as `processing` — there is no distinct
    // `requires_capture` webhook status; `getStatus` handles Checkout sessions,
    // not PaymentIntents.)
    const actionRequired = status === 'requires_action';

    return {
      backendId: this.capabilities.id,
      status,
      providerPaymentId,
      amount: readSafeInteger(intent, 'amount') ?? amount,
      currency: (readString(intent, 'currency') ?? currency).toUpperCase(),
      clientSecret: actionRequired
        ? normalizeOptionalProviderString(
            readProviderString(intent, 'client_secret'),
          )
        : undefined,
      nextAction: actionRequired
        ? (intent.next_action ?? undefined)
        : undefined,
      raw: intent,
    };
  }

  async capturePayment(
    input: StripeCapturePaymentInput,
  ): Promise<CaptureResult> {
    const providerPaymentId = normalizeNonEmptyString(
      input.providerPaymentId,
      'Stripe capture providerPaymentId',
    );
    const amount =
      input.amount === undefined
        ? undefined
        : normalizePositiveMinorUnitAmount(
            input.amount,
            'Stripe capture amount',
          );

    const intent = await this.stripeRequest<Record<string, unknown>>(
      `/payment_intents/${encodeURIComponent(providerPaymentId)}/capture`,
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        stripeAccount: this.resolveStripeAccount(input.stripeAccount),
        body: formEncode({
          ...Object.fromEntries([['amount_to_capture', amount]]),
          ...flattenStripeMetadata(input.metadata),
        }),
      },
    );

    return {
      backendId: this.capabilities.id,
      status: mapStripeCaptureStatus(readString(intent, 'status')),
      providerPaymentId:
        normalizeOptionalProviderString(readProviderString(intent, 'id')) ??
        providerPaymentId,
      amount:
        readSafeInteger(intent, 'amount_received') ??
        readSafeInteger(intent, 'amount') ??
        amount,
      currency: readStripeResultCurrency(intent),
      raw: intent,
    };
  }

  async voidPayment(input: StripeVoidPaymentInput): Promise<VoidResult> {
    const providerPaymentId = normalizeNonEmptyString(
      input.providerPaymentId,
      'Stripe void providerPaymentId',
    );
    const reason =
      input.reason === undefined
        ? undefined
        : normalizeNonEmptyString(input.reason, 'Stripe void reason');

    const intent = await this.stripeRequest<Record<string, unknown>>(
      `/payment_intents/${encodeURIComponent(providerPaymentId)}/cancel`,
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        stripeAccount: this.resolveStripeAccount(input.stripeAccount),
        body: formEncode(Object.fromEntries([['cancellation_reason', reason]])),
      },
    );

    return {
      backendId: this.capabilities.id,
      status: mapStripeVoidStatus(readString(intent, 'status')),
      providerPaymentId:
        normalizeOptionalProviderString(readProviderString(intent, 'id')) ??
        providerPaymentId,
      amount: readSafeInteger(intent, 'amount'),
      currency: readStripeResultCurrency(intent),
      raw: intent,
    };
  }

  async createSetupSession(
    input: StripeCreateSetupSessionInput,
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
    // Currency for the setup-mode session (defaults to the backend currency).
    // Redundant now that payment_method_types is always set, but harmless and
    // kept so the session is well-formed if that restriction is ever relaxed.
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
      // Restrict to cards: SavedPaymentMethod exposes card display fields
      // (brand/last4/expiry), so allowing SEPA/Bacs/etc. would yield saved
      // methods with no usable display detail.
      'payment_method_types[]': 'card',
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
        stripeAccount: this.resolveStripeAccount(input.stripeAccount),
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
    input: StripeGetSetupResultInput,
  ): Promise<SavedPaymentMethod> {
    const sessionId = normalizeNonEmptyString(
      input.sessionId,
      'Stripe setup sessionId',
    );

    const query = new URLSearchParams();
    query.append('expand[]', 'setup_intent.payment_method');

    const session = await this.stripeRequest<Record<string, unknown>>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`,
      { stripeAccount: this.resolveStripeAccount(input.stripeAccount) },
    );

    const setupIntent = readObject(session, 'setup_intent');
    const paymentMethod = readObject(setupIntent, 'payment_method');
    const card = readObject(paymentMethod, 'card');

    // `customer` is a bare `cus_` string on the request path (only
    // setup_intent.payment_method is expanded), but read tolerantly of an
    // expanded object so a future `expand[]=customer` can't wrongly downgrade a
    // completed setup to a permanent `pending`.
    const providerCustomerId = normalizeOptionalProviderString(
      readProviderString(session, 'customer') ??
        readProviderString(readObject(session, 'customer'), 'id'),
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

  /**
   * Verify and parse a delivery to the platform webhook endpoint. Events that
   * carry a connected `account` are rejected: they belong to the Connect
   * endpoint and must never be processed as platform-account events.
   */
  parseWebhookEvent(payload: string, signature?: string): StripeWebhookEvent {
    const event = this.verifyWebhookEvent(payload, signature, 'platform');
    this.recordWebhookEvent(event);
    return event;
  }

  /**
   * Verify a Stripe Connect endpoint delivery with `connectWebhookSecret`,
   * then parse it. The signature is checked before the payload is parsed, and
   * an event without a connected `account` is rejected. When this adapter is
   * scoped to a `stripeAccount`, events for any other account are rejected.
   * The payload, including `quoteId`, is controlled by the connected account:
   * bind `quoteId` to `account` before acting on it.
   */
  parseConnectWebhookEvent(
    payload: string,
    signature?: string,
  ): StripeConnectWebhookEvent {
    const event = this.verifyWebhookEvent(payload, signature, 'connect');
    this.recordWebhookEvent(event);
    return event as StripeConnectWebhookEvent;
  }

  /**
   * Verify a webhook delivery, then map its connected account to an owner
   * (for example a tenant) with the host's resolver. An account the resolver
   * does not recognize is rejected with {@link PaymentNotOwnedError}; there is
   * no fallback to the platform account. The event is recorded for duplicate
   * detection only after it resolves, so a retried delivery that failed to
   * resolve is not reported as a duplicate.
   *
   * Security: a connected account controls the objects it creates, so a
   * Connect event's `quoteId` (and every other payload field) is chosen by
   * that account. Resolving the account proves only who sent the event. The
   * host must check that `event.quoteId` belongs to the resolved owner (for
   * example inside `resolveAccount`, which receives the event, or before
   * settling) and must never settle another owner's quote from it.
   */
  async resolveConnectWebhookEvent<TOwner>(
    payload: string,
    signature: string | undefined,
    options: StripeResolveConnectWebhookOptions<TOwner>,
  ): Promise<StripeResolvedConnectWebhookEvent<TOwner>> {
    if (typeof options?.resolveAccount !== 'function') {
      throw new PaymentConfigurationError(
        'Stripe resolveConnectWebhookEvent requires a resolveAccount function.',
      );
    }

    const endpoint = options.endpoint ?? 'connect';

    if (endpoint !== 'connect' && endpoint !== 'platform') {
      throw new PaymentConfigurationError(
        'Stripe resolveConnectWebhookEvent endpoint must be connect or platform.',
      );
    }

    const event = this.verifyWebhookEvent(payload, signature, endpoint);
    const account =
      endpoint === 'connect'
        ? event.account
        : event.connect?.type === 'application_fee.created' ||
            event.connect?.type === 'application_fee.refunded'
          ? event.connect.applicationFee.account
          : undefined;

    if (account === undefined) {
      throw new PaymentNotOwnedError(
        `Stripe webhook event ${event.id} (${event.type}) has no connected account to route by.`,
      );
    }

    this.assertAdapterAccount(account);
    const owner = await options.resolveAccount(account, event);

    if (owner === undefined || owner === null) {
      throw new PaymentNotOwnedError(
        `Stripe connected account ${account} is not mapped to an owner.`,
      );
    }

    this.recordWebhookEvent(event);
    return { event, account, owner };
  }

  /**
   * Create a Stripe Connect **Standard** account. The account holder owns the
   * Stripe relationship and dashboard; the platform only connects to it.
   * Always issued on the platform account, never on a connected account.
   */
  async createStandardAccount(
    input: StripeCreateStandardAccountInput = {},
  ): Promise<StripeConnectAccountStatus> {
    const country =
      input.country === undefined
        ? undefined
        : normalizeStripeCountry(input.country);
    const email =
      input.email === undefined
        ? undefined
        : normalizeNonEmptyString(input.email, 'Stripe account email');
    const account = await this.stripeRequest<Record<string, unknown>>(
      '/accounts',
      {
        method: 'POST',
        idempotencyKey: input.idempotencyKey,
        body: formEncode({
          type: 'standard',
          country,
          email,
          ...Object.fromEntries([['business_type', input.businessType]]),
          ...flattenStripeMetadata(input.metadata),
        }),
      },
    );

    return mapStripeConnectAccount(account, 'Stripe account response');
  }

  /**
   * Create a single-use Account Link that sends the account holder through
   * Stripe-hosted onboarding. `refreshUrl` is visited when the link expires or
   * is reused, and should mint a new link; `returnUrl` does not mean
   * onboarding finished, so read {@link getAccountCapabilities} afterwards.
   */
  async createOnboardingLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string,
    options: StripeCreateOnboardingLinkOptions = {},
  ): Promise<StripeOnboardingLink> {
    const account = normalizeStripeConnectedAccountId(accountId);
    const link = await this.stripeRequest<Record<string, unknown>>(
      '/account_links',
      {
        method: 'POST',
        idempotencyKey: options.idempotencyKey,
        body: formEncode({
          account,
          type: 'account_onboarding',
          collect: options.collect,
          ...Object.fromEntries([
            ['return_url', normalizeUrlString(returnUrl, 'Stripe returnUrl')],
            [
              'refresh_url',
              normalizeUrlString(refreshUrl, 'Stripe refreshUrl'),
            ],
          ]),
        }),
      },
    );
    const url = normalizeOptionalProviderString(
      readProviderString(link, 'url'),
    );

    if (!url) {
      throw new PaymentProviderError(
        'Stripe Account Link response did not include a url.',
      );
    }

    const expiresAtSeconds = readSafeInteger(link, 'expires_at');

    return {
      url,
      expiresAt:
        expiresAtSeconds === undefined
          ? undefined
          : new Date(expiresAtSeconds * 1_000),
      raw: link,
    };
  }

  /**
   * Read a connected account's onboarding and capability state
   * (`charges_enabled`, `details_submitted`, `payouts_enabled`, per-capability
   * status, and outstanding requirements).
   */
  async getAccountCapabilities(
    accountId: string,
  ): Promise<StripeConnectAccountStatus> {
    const account = normalizeStripeConnectedAccountId(accountId);
    const response = await this.stripeRequest<Record<string, unknown>>(
      `/accounts/${encodeURIComponent(account)}`,
    );
    const status = mapStripeConnectAccount(response, 'Stripe account response');

    if (status.accountId !== account) {
      throw new PaymentVerificationError(
        `Stripe account response ${status.accountId} did not match ${account}.`,
      );
    }

    return status;
  }

  /** Authoritative read. No request or adapter account scope means platform. */
  async getDispute(
    disputeId: string,
    options: StripeGetDisputeOptions = {},
  ): Promise<StripeDispute> {
    const id = normalizeNonEmptyString(disputeId, 'Stripe dispute id');
    if (!/^du_[A-Za-z0-9_]+$/.test(id)) {
      throw new PaymentConfigurationError('Stripe dispute id is invalid.');
    }
    const scope = this.resolveStripeAccount(options.stripeAccount);
    const account =
      scope === undefined
        ? undefined
        : normalizeStripeConnectedAccountId(scope);
    if (account !== undefined) this.assertAdapterAccount(account);
    if (
      options.expectedLivemode !== undefined &&
      typeof options.expectedLivemode !== 'boolean'
    ) {
      throw new PaymentConfigurationError(
        'Stripe expectedLivemode must be boolean.',
      );
    }
    const response = await this.stripeRequest<Record<string, unknown>>(
      `/disputes/${encodeURIComponent(id)}?expand[]=charge`,
      { stripeAccount: account },
    );
    const dispute = mapStripeDispute(response, account);
    if (
      dispute.id !== id ||
      (options.expectedLivemode !== undefined &&
        dispute.livemode !== options.expectedLivemode)
    ) {
      throw new PaymentVerificationError(
        'Stripe dispute response identity or environment did not match the request.',
      );
    }
    return dispute;
  }

  private verifyWebhookEvent(
    payload: string,
    signature: string | undefined,
    endpoint: 'connect' | 'platform',
  ): StripeWebhookEvent {
    const secret =
      endpoint === 'connect' ? this.connectWebhookSecret : this.webhookSecret;

    if (!secret) {
      throw new PaymentConfigurationError(
        endpoint === 'connect'
          ? 'StripeAdapter parseConnectWebhookEvent requires connectWebhookSecret.'
          : 'StripeAdapter parseWebhookEvent requires webhookSecret.',
      );
    }

    if (!signature) {
      throw new PaymentProviderError('Missing Stripe webhook signature.');
    }

    // Authenticate the raw bytes before anything reads the payload.
    verifyStripeWebhookSignature(payload, signature, secret);

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
    const rawAccount = event.account;
    let account: string | undefined;

    if (endpoint === 'connect') {
      account = typeof rawAccount === 'string' ? rawAccount.trim() : undefined;

      if (!account || !STRIPE_CONNECTED_ACCOUNT_ID.test(account)) {
        throw new PaymentVerificationError(
          'Stripe Connect webhook event did not include a valid connected account.',
        );
      }

      this.assertAdapterAccount(account);
    } else if (rawAccount !== undefined && rawAccount !== null) {
      throw new PaymentVerificationError(
        'Stripe connected-account event received on the platform webhook endpoint; verify it with parseConnectWebhookEvent.',
      );
    }

    const data = (
      event.data as { object?: Record<string, unknown> } | undefined
    )?.object;
    const dispute = type.startsWith('charge.dispute.')
      ? mapStripeDispute(data, account)
      : undefined;
    let disputeType: StripeDisputeEventType | undefined;
    if (dispute !== undefined) {
      disputeType = readStripeDisputeEventType(type);
      if (
        typeof event.livemode !== 'boolean' ||
        event.livemode !== dispute.livemode
      ) {
        throw new PaymentVerificationError(
          'Stripe dispute event environment is missing or inconsistent.',
        );
      }
    }
    const createdAt =
      dispute === undefined ? undefined : disputeDate(event.created);
    const connect: StripeConnectEventDetail | undefined =
      disputeType && dispute
        ? { type: disputeType, dispute }
        : mapStripeConnectEventDetail(type, data);

    if (
      account !== undefined &&
      connect?.type === 'account.updated' &&
      connect.account.accountId !== account
    ) {
      throw new PaymentVerificationError(
        'Stripe account.updated webhook object did not match the event account.',
      );
    }

    return {
      id,
      type,
      status: mapStripeWebhookStatus(type, data),
      quoteId: normalizeOptionalWebhookString(
        // `client_reference_id` is a Checkout Session-only field; honor it only
        // for session events so a non-session object (a PaymentIntent / Charge /
        // Transfer, possibly from a malicious Connect account) can't spoof
        // correlation to another quote's id. Non-session events correlate only
        // via our own `metadata.quoteId`.
        (type.startsWith('checkout.session.')
          ? readString(data, 'client_reference_id')
          : undefined) ??
          readString(
            (data?.metadata as Record<string, unknown>) ?? {},
            'quoteId',
          ),
      ),
      providerPaymentId: normalizeOptionalWebhookString(readString(data, 'id')),
      duplicate: this.seenWebhookEventIds.has(id),
      ...(account === undefined ? {} : { account }),
      ...(connect === undefined ? {} : { connect }),
      ...(dispute === undefined
        ? {}
        : { dispute, livemode: dispute.livemode, createdAt }),
      raw: event,
    };
  }

  private recordWebhookEvent(event: StripeWebhookEvent): void {
    if (this.seenWebhookEventIds.has(event.id)) {
      event.duplicate = true;
      return;
    }

    event.duplicate = false;
    this.seenWebhookEventIds.add(event.id);
    while (this.seenWebhookEventIds.size > this.maxStoredWebhookEventIds) {
      const oldest = this.seenWebhookEventIds.values().next().value;

      if (oldest === undefined) {
        break;
      }

      this.seenWebhookEventIds.delete(oldest);
    }
  }

  private assertAdapterAccount(account: string): void {
    if (this.stripeAccount !== undefined && account !== this.stripeAccount) {
      throw new PaymentNotOwnedError(
        `Stripe connected account ${account} does not match this adapter's account scope.`,
      );
    }
  }

  private async stripeRequest<T>(
    path: string,
    init: RequestInit & {
      idempotencyKey?: string;
      stripeAccount?: string;
    } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.secretKey}`);
    headers.set('Content-Type', 'application/x-www-form-urlencoded');
    headers.set('Accept', 'application/json');
    headers.set('Stripe-Version', this.apiVersion);

    if (init.stripeAccount !== undefined) {
      headers.set('Stripe-Account', init.stripeAccount);
    }

    if (init.idempotencyKey !== undefined) {
      headers.set(
        'Idempotency-Key',
        normalizeNonEmptyString(init.idempotencyKey, 'Stripe idempotencyKey'),
      );
    }

    const {
      idempotencyKey: _idempotencyKey,
      stripeAccount: _stripeAccount,
      ...requestInit
    } = init;
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
    stripeAccount: string | undefined,
  ): Promise<Record<string, string>> {
    if (paymentReference.startsWith('cs_')) {
      const session = await this.stripeRequest<Record<string, unknown>>(
        `/checkout/sessions/${encodeURIComponent(paymentReference)}`,
        { stripeAccount },
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

  private resolveStripeAccount(
    override: string | undefined,
  ): string | undefined {
    return (
      normalizeOptionalStripeAccount(override, 'Stripe stripeAccount') ??
      this.stripeAccount
    );
  }

  private findStoredOptionBySessionId(
    sessionId: string,
  ): PaymentOption | undefined {
    for (const option of this.optionsByQuote.values()) {
      if (option.providerPaymentId === sessionId) return option;
    }
    return undefined;
  }
}

function assertOptionalSecret(value: unknown, name: string): void {
  if (value === undefined) return;

  if (typeof value !== 'string') {
    throw new PaymentConfigurationError(
      `StripeAdapter ${name} must be a string when configured.`,
    );
  }

  if (!value.trim()) {
    throw new PaymentConfigurationError(
      `StripeAdapter ${name} must not be empty when configured.`,
    );
  }
}

const STRIPE_CONNECTED_ACCOUNT_ID = /^acct_[A-Za-z0-9]+$/;

function normalizeStripeConnectedAccountId(value: unknown): string {
  const account = typeof value === 'string' ? value.trim() : undefined;

  if (!account || !STRIPE_CONNECTED_ACCOUNT_ID.test(account)) {
    throw new PaymentConfigurationError(
      'Stripe connected account id must look like acct_...',
    );
  }

  return account;
}

function normalizeStripeCountry(value: string): string {
  const country = typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (!/^[A-Z]{2}$/.test(country)) {
    throw new PaymentConfigurationError(
      'Stripe account country must be a two-letter ISO country code.',
    );
  }

  return country;
}

function readStringArray(
  value: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const item = value?.[key];

  return Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function mapStripeConnectAccount(
  account: Record<string, unknown> | undefined,
  context: string,
): StripeConnectAccountStatus {
  const accountId = readProviderString(account, 'id')?.trim();

  if (!account || !accountId || !STRIPE_CONNECTED_ACCOUNT_ID.test(accountId)) {
    throw new PaymentProviderError(`${context} did not include an account id.`);
  }

  const capabilities: Record<string, string> = {};

  for (const [name, state] of Object.entries(
    readObject(account, 'capabilities') ?? {},
  )) {
    if (typeof state === 'string') {
      capabilities[name] = state;
    }
  }

  const requirements = readObject(account, 'requirements');
  const disabledReason = normalizeOptionalProviderString(
    readProviderString(requirements, 'disabled_reason'),
  );
  const defaultCurrency = readProviderString(account, 'default_currency');

  return {
    accountId,
    type: normalizeOptionalProviderString(readProviderString(account, 'type')),
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    payoutsEnabled: account.payouts_enabled === true,
    capabilities,
    requirements: {
      currentlyDue: readStringArray(requirements, 'currently_due'),
      eventuallyDue: readStringArray(requirements, 'eventually_due'),
      pastDue: readStringArray(requirements, 'past_due'),
      ...(disabledReason === undefined ? {} : { disabledReason }),
    },
    country: normalizeOptionalProviderString(
      readProviderString(account, 'country'),
    ),
    defaultCurrency: defaultCurrency?.toUpperCase(),
    raw: account,
  };
}

function mapStripeApplicationFee(
  fee: Record<string, unknown> | undefined,
): StripeApplicationFee {
  const id = normalizeOptionalProviderString(readProviderString(fee, 'id'));

  if (!fee || !id) {
    throw new PaymentProviderError(
      'Stripe application_fee webhook object did not include an id.',
    );
  }

  const account = normalizeOptionalProviderString(
    readProviderString(fee, 'account'),
  );

  if (account !== undefined && !STRIPE_CONNECTED_ACCOUNT_ID.test(account)) {
    throw new PaymentProviderError(
      'Stripe application_fee webhook object has an invalid account id.',
    );
  }
  const livemode = fee.livemode;

  return {
    id,
    account,
    amount: readSafeInteger(fee, 'amount'),
    amountRefunded: readSafeInteger(fee, 'amount_refunded'),
    currency: readStripeResultCurrency(fee),
    refunded: fee.refunded === true,
    charge: normalizeOptionalProviderString(
      readProviderString(fee, 'charge') ??
        readProviderString(readObject(fee, 'charge'), 'id'),
    ),
    livemode: typeof livemode === 'boolean' ? livemode : undefined,
    raw: fee,
  };
}

const STRIPE_DISPUTE_STATUSES: ReadonlySet<string> = new Set([
  'warning_needs_response',
  'warning_under_review',
  'warning_closed',
  'needs_response',
  'under_review',
  'won',
  'lost',
  'prevented',
]);

function readStripeDisputeEventType(type: string): StripeDisputeEventType {
  switch (type) {
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated':
      return type;
    default:
      throw new PaymentProviderError('Unsupported Stripe dispute event type.');
  }
}

function disputeError(field: string): never {
  throw new PaymentProviderError(
    `Stripe dispute has invalid or missing ${field}.`,
  );
}

function disputeRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return disputeError(field);
  return value as Record<string, unknown>;
}

function disputeString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim())
    return disputeError(field);
  return value;
}

function disputeId(value: unknown, prefix: string): string {
  const id = disputeString(
    typeof value === 'object' && value !== null
      ? disputeRecord(value, prefix).id
      : value,
    prefix,
  );
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(id))
    return disputeError(prefix);
  return id;
}

function disputeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    return disputeError(field);
  return value;
}

function disputeDate(value: unknown): Date {
  const seconds = disputeInteger(value, 'created');
  const date = new Date(seconds * 1000);
  if (
    seconds < 0 ||
    !Number.isSafeInteger(seconds * 1000) ||
    !Number.isFinite(date.getTime())
  )
    return disputeError('created');
  return date;
}

function disputeCurrency(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z]{3}$/.test(value))
    return disputeError('currency');
  return value.toUpperCase();
}

function mapStripeDispute(value: unknown, account?: string): StripeDispute {
  const object = disputeRecord(value, 'object');
  if (object.object !== 'dispute') return disputeError('object');
  const id = disputeId(object.id, 'du');
  const chargeId = disputeId(object.charge, 'ch');
  const expandedCharge =
    typeof object.charge === 'object'
      ? disputeRecord(object.charge, 'charge')
      : undefined;
  const paymentIntent = object.payment_intent ?? expandedCharge?.payment_intent;
  const paymentIntentId =
    paymentIntent == null ? undefined : disputeId(paymentIntent, 'pi');
  if (
    object.payment_intent != null &&
    expandedCharge?.payment_intent != null &&
    paymentIntentId !== disputeId(expandedCharge.payment_intent, 'pi')
  )
    return disputeError('payment_intent');
  const amount = disputeInteger(object.amount, 'amount');
  if (amount < 0) return disputeError('amount');
  const currency = disputeCurrency(object.currency);
  const providerStatus = disputeString(object.status, 'status');
  const status: PaymentDisputeStatus = STRIPE_DISPUTE_STATUSES.has(
    providerStatus,
  )
    ? (providerStatus as PaymentDisputeStatus)
    : 'unknown';
  if (typeof object.livemode !== 'boolean') return disputeError('livemode');
  // Stripe objects normally omit account; when supplied it must agree with the
  // authenticated scope, never replace it with a payload-provided account.
  if (object.account !== undefined && object.account !== account)
    return disputeError('account');
  if (
    expandedCharge?.livemode !== undefined &&
    expandedCharge.livemode !== object.livemode
  )
    return disputeError('charge.livemode');
  if (!Array.isArray(object.balance_transactions))
    return disputeError('balance_transactions');
  const ids = new Set<string>();
  const balanceTransactions = object.balance_transactions.map(
    (value: unknown) => {
      const transaction = disputeRecord(value, 'balance_transaction');
      if (transaction.object !== 'balance_transaction')
        return disputeError('balance_transaction.object');
      const id = disputeId(transaction.id, 'txn');
      if (ids.has(id)) return disputeError('duplicate balance_transaction');
      ids.add(id);
      const amount = disputeInteger(
        transaction.amount,
        'balance_transaction.amount',
      );
      const fee = disputeInteger(transaction.fee, 'balance_transaction.fee');
      const net = disputeInteger(transaction.net, 'balance_transaction.net');
      if (!Number.isSafeInteger(amount - fee) || amount - fee !== net)
        return disputeError('balance_transaction.net');
      return {
        id,
        amount,
        fee,
        net,
        currency: disputeCurrency(transaction.currency),
        createdAt: disputeDate(transaction.created),
        type: disputeString(transaction.type, 'balance_transaction.type'),
        reportingCategory:
          transaction.reporting_category === undefined
            ? undefined
            : disputeString(
                transaction.reporting_category,
                'balance_transaction.reporting_category',
              ),
      };
    },
  );
  return {
    id,
    chargeId,
    paymentIntentId,
    amount,
    currency,
    status,
    providerStatus,
    livemode: object.livemode,
    createdAt: disputeDate(object.created),
    balanceTransactions,
    ...(account === undefined ? {} : { account }),
    raw: object,
  };
}

function mapStripeConnectEventDetail(
  type: string,
  object: Record<string, unknown> | undefined,
): StripeConnectEventDetail | undefined {
  if (type === 'account.updated') {
    return {
      type,
      account: mapStripeConnectAccount(
        object,
        'Stripe account.updated webhook object',
      ),
    };
  }

  if (
    type === 'application_fee.created' ||
    type === 'application_fee.refunded'
  ) {
    return { type, applicationFee: mapStripeApplicationFee(object) };
  }

  return undefined;
}

function readStripeOptionAccount(
  option: PaymentOption | undefined,
): string | undefined {
  const value = option?.metadata?.stripeAccount;
  return typeof value === 'string' ? value : undefined;
}

function normalizeOptionalStripeAccount(
  value: string | undefined,
  context: string,
): string | undefined {
  return value === undefined
    ? undefined
    : normalizeNonEmptyString(value, context);
}

function normalizeApplicationFeeAmount(
  value: number | undefined,
  chargeAmount: number,
  context: string,
): number | undefined {
  if (value === undefined) return undefined;

  const fee = normalizePositiveMinorUnitAmount(value, context);
  if (fee > chargeAmount) {
    throw new PaymentConfigurationError(
      `${context} must not exceed the charge amount.`,
    );
  }
  return fee;
}

function stripePaymentOptionKey(
  quoteId: string,
  stripeAccount: string | undefined,
): string {
  // Platform entries retain their old quote-only keys. Connected-account ids
  // cannot contain NUL in an HTTP header, so it safely separates account scope
  // from the caller's quote id without collapsing tenant-local quote ids.
  return stripeAccount === undefined ? quoteId : `${stripeAccount}\0${quoteId}`;
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

  // Manual-capture PaymentIntent lifecycle (authorize → capture / void). Only
  // treat these as terminal for intents WE created and can correlate — i.e.
  // ones carrying our `quoteId` in metadata. Checkout Sessions create their own
  // PaymentIntents (which fire these same events with no quoteId on the intent);
  // those are handled via the `checkout.session.*` events above, so here they
  // stay non-terminal (`processing`) rather than emitting a spurious,
  // uncorrelatable terminal event. Handled before the generic `failed` catch
  // below so an un-owned `payment_intent.payment_failed` isn't reclassified.
  if (
    type === 'payment_intent.succeeded' ||
    type === 'payment_intent.canceled' ||
    type === 'payment_intent.payment_failed'
  ) {
    const metadata = (object?.metadata as Record<string, unknown>) ?? {};
    // Match parseWebhookEvent's normalization so an empty/blank quoteId is
    // treated as un-owned by both — gate and reporter must agree on ownership.
    const owned =
      normalizeOptionalWebhookString(readString(metadata, 'quoteId')) !==
      undefined;
    if (owned) {
      if (type === 'payment_intent.succeeded') {
        return 'confirmed';
      }
      // A manual-capture hold Stripe released automatically (it lapsed) is
      // `expired`, distinct from a deliberate void or hard decline (`failed`);
      // the shared PaymentStatus union has no `canceled`.
      if (
        type === 'payment_intent.canceled' &&
        readString(object, 'cancellation_reason') === 'automatic'
      ) {
        return 'expired';
      }
      return 'failed';
    }
    return 'processing';
  }

  // Terminal failure/refund only for payment-in objects (Checkout Session,
  // PaymentIntent, Charge). Money-out / unrelated events (transfer.failed,
  // payout.failed, refund.failed, application_fee.refunded, …) also match a
  // naive substring scan — and a failed Transfer even carries our quoteId
  // (sendPayout stamps it), which would miscorrelate a payout failure as a
  // payment failure — so they must not surface as a terminal payment status.
  const isPaymentInEvent =
    type?.startsWith('checkout.session.') === true ||
    type?.startsWith('payment_intent.') === true ||
    type?.startsWith('charge.') === true;

  if (isPaymentInEvent && type?.includes('refunded')) {
    return 'refunded';
  }

  if (isPaymentInEvent && type?.includes('failed')) {
    return 'failed';
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

function mapStripeAuthorizationStatus(
  status: string | undefined,
): AuthorizationResult['status'] {
  switch (status) {
    case 'requires_capture':
      return 'requires_capture';
    case 'succeeded':
      return 'succeeded';
    case 'requires_action':
      return 'requires_action';
    case 'processing':
      return 'processing';
    default:
      return 'failed';
  }
}

function mapStripeCaptureStatus(
  status: string | undefined,
): CaptureResult['status'] {
  switch (status) {
    case 'succeeded':
      return 'succeeded';
    // Capturing an authorized intent shouldn't re-enter authentication; treat
    // any in-flight/action state as still processing rather than a failure.
    case 'processing':
    case 'requires_action':
      return 'processing';
    default:
      return 'failed';
  }
}

function mapStripeVoidStatus(status: string | undefined): VoidResult['status'] {
  return status === 'canceled' ? 'canceled' : 'failed';
}

function readStripeResultCurrency(
  value: Record<string, unknown>,
): string | undefined {
  const currency = readString(value, 'currency');

  return currency === undefined ? undefined : currency.toUpperCase();
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
