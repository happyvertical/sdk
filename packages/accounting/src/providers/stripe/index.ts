/**
 * Stripe Provider
 *
 * Implements Stripe AR, payment, webhook, and billing operations using the
 * Stripe HTTP API directly. The SDK keeps Stripe as an optional runtime
 * dependency by relying on the platform fetch implementation.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { StripeApiError } from '../../errors.js';
import type {
  AccountingProviderType,
  AuditMatch,
  AuditOperations,
  AuditReport,
  BillInput,
  BillOperations,
  CustomerInput,
  CustomerOperations,
  DateRange,
  ExternalBill,
  ExternalCustomer,
  ExternalInvoice,
  ExternalPayment,
  ExternalRecord,
  ExternalVendor,
  FieldDiff,
  InvoiceInput,
  InvoiceOperations,
  ListOptions,
  PaymentInput,
  PaymentOperations,
  StripeAccountingProvider,
  StripeBillingOperations,
  StripeCheckoutLineItem,
  StripeCheckoutSession,
  StripeCheckoutSessionDetails,
  StripeCheckoutSessionInput,
  StripeCustomerPortalSession,
  StripeCustomerPortalSessionInput,
  StripeOptions,
  StripeSubscriptionStatus,
  StripeSubscriptionStatusResult,
  SyncResult,
  VendorInput,
  VendorOperations,
  WebhookEvent,
  WebhookOperations,
} from '../../types.js';

type StripePrimitive = string | number | boolean | Date | null | undefined;
type StripeFormValue =
  | StripePrimitive
  | StripeFormValue[]
  | { [key: string]: StripeFormValue };

interface StripeListResponse<T> {
  object: 'list';
  data: T[];
  has_more?: boolean;
}

interface StripeCustomer {
  id: string;
  created?: number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: StripeAddress | null;
  balance?: number | null;
  currency?: string | null;
  metadata?: Record<string, string> | null;
  invoice_settings?: {
    default_payment_method?: string | { id: string } | null;
  } | null;
}

interface StripeSearchResponse<T> {
  object: 'search_result';
  data: T[];
  has_more?: boolean;
  next_page?: string | null;
}

interface StripeCoupon {
  id: string;
  amount_off?: number | null;
  currency?: string | null;
  percent_off?: number | null;
  valid?: boolean | null;
}

interface StripeAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

interface StripeInvoice {
  id: string;
  number?: string | null;
  customer?: string | StripeCustomer | null;
  created?: number | null;
  due_date?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  total_taxes?: Array<{ amount?: number | null }> | null;
  total?: number | null;
  amount_paid?: number | null;
  amount_remaining?: number | null;
  status?: string | null;
  currency?: string | null;
  collection_method?: string | null;
  auto_advance?: boolean | null;
  metadata?: Record<string, string> | null;
}

interface StripeInvoiceItem {
  id: string;
  metadata?: Record<string, string> | null;
}

interface StripePaymentIntent {
  id: string;
  amount?: number | null;
  currency?: string | null;
  created?: number | null;
  status?: string | null;
  invoice?: string | null;
  payment_method_types?: string[] | null;
  latest_charge?: string | null;
interface StripeSetupIntent {
  id: string;
  payment_method?: string | { id: string } | null;
}

interface StripeCheckoutSessionResponse {
  id: string;
  url?: string | null;
  mode?: string | null;
  status?: string | null;
  payment_status?: string | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null;
  payment_intent?: string | StripePaymentIntent | null;
  setup_intent?: string | StripeSetupIntent | null;
  currency?: string | null;
  amount_subtotal?: number | null;
  amount_total?: number | null;
  total_details?: { amount_tax?: number | null } | null;
  metadata?: Record<string, string> | null;
}

interface StripePortalSessionResponse {
  id: string;
  url: string;
}

interface StripeSubscription {
  id: string;
  status: StripeSubscriptionStatus;
  customer: string | StripeCustomer;
  current_period_start?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  canceled_at?: number | null;
  trial_end?: number | null;
}

interface StripeWebhookPayload {
  id?: string | null;
  type?: string | null;
  created?: number | null;
  data?: {
    object?: {
      id?: string | null;
      object?: string | null;
    } | null;
  } | null;
}

/**
 * Stripe accounting provider.
 */
export class StripeProvider implements StripeAccountingProvider {
  readonly type = 'stripe' as const;

  private readonly options: StripeOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly couponIds = new Map<string, string>();

  readonly customers: CustomerOperations;
  readonly invoices: InvoiceOperations;
  readonly vendors: VendorOperations;
  readonly bills: BillOperations;
  readonly payments: PaymentOperations;
  readonly audit: AuditOperations;
  readonly webhooks: WebhookOperations;
  readonly billing: StripeBillingOperations;

  constructor(options: StripeOptions) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      apiBaseUrl: 'https://api.stripe.com',
      webhookTolerance: 300,
      ...options,
    };
    this.fetchImpl = options.fetch || fetch;

    this.customers = new StripeCustomerOperations(this);
    this.invoices = new StripeInvoiceOperations(this);
    this.vendors = new UnsupportedVendorOperations();
    this.bills = new UnsupportedBillOperations();
    this.payments = new StripePaymentOperations(this);
    this.audit = new StripeAuditOperations(this);
    this.webhooks = new StripeWebhookOperations(this.options);
    this.billing = new StripeBillingOperationsImpl(this);
  }

  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    params?: Record<string, StripeFormValue>,
    options: { idempotencyKey?: string } = {},
  ): Promise<T> {
    const timeout = this.options.timeout || 30000;
    const maxRetries = this.options.maxRetries ?? 3;
    const idempotencyKey =
      method === 'POST'
        ? (options.idempotencyKey ?? `sdk-${randomUUID()}`)
        : null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const url = this.buildUrl(endpoint, method === 'GET' ? params : {});
        const body =
          method === 'POST' && params
            ? encodeStripeForm(params).toString()
            : undefined;

        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.options.secretKey}`,
          Accept: 'application/json',
        };
        if (method === 'POST') {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
          }
        }
        if (this.options.apiVersion) {
          headers['Stripe-Version'] = this.options.apiVersion;
        }

        const response = await this.fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new StripeApiError(response.status, errorText);

          if (response.status < 500 && response.status !== 429) {
            throw error;
          }

          lastError = error;
        } else {
          const text = await response.text();
          return (text ? JSON.parse(text) : {}) as T;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const statusMatch = lastError.message.match(
          /Stripe API error \((\d+)\)/,
        );
        if (statusMatch) {
          const status = Number.parseInt(statusMatch[1], 10);
          if (status >= 400 && status < 500 && status !== 429) {
            throw lastError;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (attempt < maxRetries) {
        await sleep(2 ** attempt * 500);
      }
    }

    throw lastError || new Error('Stripe request failed after retries');
  }

  /**
   * @internal
   * A reusable amount-off coupon for a line discount, created on first use.
   * Its id is derived from the currency and amount, so every replay and every
   * invoice with the same discount shares one coupon instead of creating one
   * per line.
   */
  async amountOffCoupon(currency: string, amount: number): Promise<string> {
    const normalized = currency.toLowerCase();
    const id = `hv_amount_off_${normalized}_${amount}`;
    const cached = this.couponIds.get(id);
    if (cached) {
      return cached;
    }

    const path = `/v1/coupons/${encodeURIComponent(id)}`;
    let coupon: StripeCoupon;
    try {
      coupon = await this.request<StripeCoupon>('GET', path);
    } catch (error) {
      if (!(error instanceof StripeApiError) || error.status !== 404) {
        throw error;
      }
      try {
        coupon = await this.request<StripeCoupon>('POST', '/v1/coupons', {
          id,
          amount_off: amount,
          currency: normalized,
          duration: 'forever',
          name: 'Discount',
          metadata: { hv_purpose: 'invoice_line_discount' },
        });
      } catch (createError) {
        // A concurrent push created it first.
        if (
          !(createError instanceof StripeApiError) ||
          createError.code !== 'resource_already_exists'
        ) {
          throw createError;
        }
        coupon = await this.request<StripeCoupon>('GET', path);
      }
    }

    if (
      coupon.amount_off !== amount ||
      (coupon.currency || '').toLowerCase() !== normalized ||
      coupon.percent_off ||
      coupon.valid === false
    ) {
      throw new Error(
        `Stripe coupon ${id} exists but is not a valid ${amount} ${normalized} amount-off coupon`,
      );
    }
    this.couponIds.set(id, coupon.id);
    return coupon.id;
  }

  private buildUrl(
    endpoint: string,
    params?: Record<string, StripeFormValue>,
  ): string {
    const baseUrl = this.options.apiBaseUrl || 'https://api.stripe.com';
    const url = new URL(endpoint, baseUrl);

    if (params && Object.keys(params).length > 0) {
      for (const [key, value] of encodeStripeForm(params).entries()) {
        url.searchParams.append(key, value);
      }
    }

    return url.toString();
  }
}

class StripeCustomerOperations implements CustomerOperations {
  constructor(private readonly provider: StripeProvider) {}

  async push(customer: CustomerInput): Promise<SyncResult> {
    if (customer.idempotencyKey !== undefined) {
      assertIdempotencyKey(customer.idempotencyKey);
      // After Stripe's idempotency window a replayed key creates a new
      // customer, so first look for the one an earlier attempt created.
      const existing = await this.findByLocalId(customer.id);
      if (existing) {
        return {
          action: 'created',
          externalId: existing.id,
          syncedAt: new Date(),
        };
      }
    }

    const response = await this.provider.request<StripeCustomer>(
      'POST',
      '/v1/customers',
      mapCustomerToStripe(customer),
      {
        idempotencyKey: customer.idempotencyKey
          ? `${customer.idempotencyKey}:customer`
          : undefined,
      },
    );

    return {
      action: 'created',
      externalId: response.id,
      syncedAt: new Date(),
    };
  }

  /**
   * The oldest customer tagged with this local id. Stripe search is
   * eventually consistent (normally under a minute); inside that lag the
   * idempotency key, retained for at least 24 hours, covers the replay.
   */
  private async findByLocalId(
    localId: string,
  ): Promise<StripeCustomer | undefined> {
    const matches: StripeCustomer[] = [];
    let page: string | undefined;
    do {
      const response = await this.provider.request<
        StripeSearchResponse<StripeCustomer>
      >('GET', '/v1/customers/search', {
        query: `metadata['local_id']:'${escapeSearchValue(localId)}'`,
        limit: 100,
        page,
      });
      matches.push(
        ...response.data.filter(
          (customer) => customer.metadata?.local_id === localId,
        ),
      );
      page = response.has_more ? response.next_page || undefined : undefined;
    } while (page);

    return matches.sort(
      (left, right) =>
        (left.created ?? 0) - (right.created ?? 0) ||
        left.id.localeCompare(right.id),
    )[0];
  }

  async pull(externalId: string): Promise<ExternalCustomer> {
    const customer = await this.provider.request<StripeCustomer>(
      'GET',
      `/v1/customers/${encodeURIComponent(externalId)}`,
    );
    return mapStripeCustomer(customer);
  }

  async list(options: ListOptions = {}): Promise<ExternalCustomer[]> {
    const response = await this.provider.request<
      StripeListResponse<StripeCustomer>
    >('GET', '/v1/customers', mapListOptions(options));
    return response.data.map(mapStripeCustomer);
  }

  async sync(customer: CustomerInput): Promise<SyncResult> {
    if (!customer.externalId) {
      return this.push(customer);
    }

    await this.provider.request<StripeCustomer>(
      'POST',
      `/v1/customers/${encodeURIComponent(customer.externalId)}`,
      mapCustomerToStripe(customer),
    );

    return {
      action: 'updated',
      externalId: customer.externalId,
      syncedAt: new Date(),
    };
  }
}

class StripeInvoiceOperations implements InvoiceOperations {
  constructor(private readonly provider: StripeProvider) {}

  async push(invoice: InvoiceInput): Promise<SyncResult> {
    if (!invoice.customerExternalId) {
      throw new Error('Stripe invoices require customerExternalId');
    }

    const currency = invoice.currency || 'usd';
    const collectionMethod = resolveCollectionMethod(invoice);
    // Validate every line before any provider request.
    const lines = invoice.lineItems.map((lineItem) => ({
      lineItem,
      unitAmount: moneyToStripeMinorUnits(lineItem.unitPrice, currency),
      discount: lineDiscountToStripe(lineItem, currency),
      period: lineServicePeriod(lineItem),
    }));

    const existingInvoice = invoice.idempotencyKey
      ? await this.findInvoiceByLocalId(invoice.customerExternalId, invoice.id)
      : undefined;
    if (existingInvoice) {
      return {
        action: 'created',
        externalId: existingInvoice.id,
        syncedAt: new Date(),
      };
    }

    const existingLineItemIndexes = invoice.idempotencyKey
      ? await this.findPendingLineItemIndexes(
          invoice.customerExternalId,
          invoice.id,
        )
      : new Set<number>();

    for (const [index, line] of lines.entries()) {
      if (existingLineItemIndexes.has(index)) {
        continue;
      }
      const { lineItem, unitAmount, discount, period } = line;
      const coupon = discount
        ? await this.provider.amountOffCoupon(currency, discount)
        : undefined;
      await this.provider.request(
        'POST',
        '/v1/invoiceitems',
        {
          customer: invoice.customerExternalId,
          currency,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unit_amount_decimal: String(unitAmount),
          period,
          discounts: coupon ? [{ coupon }] : undefined,
          tax_behavior: invoice.automaticTax ? 'exclusive' : undefined,
          metadata: normalizeMetadata({
            local_invoice_id: invoice.id,
            local_line_index: index,
            local_sku: lineItem.sku,
            local_discount: lineItem.discount,
            local_tax_rate: lineItem.taxRate,
          }),
        },
        {
          idempotencyKey: invoice.idempotencyKey
            ? `${invoice.idempotencyKey}:item:${index}`
            : undefined,
        },
      );
    }

    const response = await this.provider.request<StripeInvoice>(
      'POST',
      '/v1/invoices',
      mapInvoiceToStripe(invoice, collectionMethod),
      {
        idempotencyKey: invoice.idempotencyKey
          ? `${invoice.idempotencyKey}:invoice`
          : undefined,
      },
    );

    return {
      action: 'created',
      externalId: response.id,
      syncedAt: new Date(),
    };
  }

  async pull(externalId: string): Promise<ExternalInvoice> {
    const invoice = await this.provider.request<StripeInvoice>(
      'GET',
      `/v1/invoices/${encodeURIComponent(externalId)}`,
    );
    return mapStripeInvoice(invoice);
  }

  async list(options: ListOptions = {}): Promise<ExternalInvoice[]> {
    const response = await this.provider.request<
      StripeListResponse<StripeInvoice>
    >('GET', '/v1/invoices', mapListOptions(options));
    return response.data.map(mapStripeInvoice);
  }

  async sync(invoice: InvoiceInput): Promise<SyncResult> {
    if (!invoice.externalId) {
      return this.push(invoice);
    }

    await this.provider.request<StripeInvoice>(
      'POST',
      `/v1/invoices/${encodeURIComponent(invoice.externalId)}`,
      mapInvoiceUpdateToStripe(invoice, resolveCollectionMethod(invoice)),
    );

    return {
      action: 'updated',
      externalId: invoice.externalId,
      syncedAt: new Date(),
    };
  }

  /**
   * `send_invoice` invoices are emailed through Stripe's send endpoint.
   * `charge_automatically` invoices are finalized with automatic collection
   * on, so Stripe charges the customer's default payment method and applies
   * its retry settings; the outcome arrives as `invoice.paid` or
   * `invoice.payment_failed`.
   */
  async send(externalId: string): Promise<void> {
    const path = `/v1/invoices/${encodeURIComponent(externalId)}`;
    const invoice = await this.provider.request<StripeInvoice>('GET', path);
    if (invoice.collection_method !== 'charge_automatically') {
      await this.provider.request('POST', `${path}/send`);
      return;
    }
    if (invoice.status === 'draft') {
      await this.provider.request(
        'POST',
        `${path}/finalize`,
        { auto_advance: true },
        { idempotencyKey: `${externalId}:finalize` },
      );
      return;
    }
    if (invoice.status === 'open' && invoice.auto_advance === false) {
      await this.provider.request(
        'POST',
        path,
        { auto_advance: true },
        { idempotencyKey: `${externalId}:auto_advance` },
      );
    }
  }

  async markUncollectible(externalId: string): Promise<void> {
    await this.provider.request(
      'POST',
      `/v1/invoices/${encodeURIComponent(externalId)}/mark_uncollectible`,
      undefined,
      { idempotencyKey: `${externalId}:mark_uncollectible` },
    );
  }

  async void(externalId: string): Promise<void> {
    await this.provider.request(
      'POST',
      `/v1/invoices/${encodeURIComponent(externalId)}/void`,
    );
  }

  private async findInvoiceByLocalId(
    customerExternalId: string,
    localInvoiceId: string,
  ): Promise<StripeInvoice | undefined> {
    let startingAfter: string | undefined;
    do {
      const response = await this.provider.request<
        StripeListResponse<StripeInvoice>
      >('GET', '/v1/invoices', {
        customer: customerExternalId,
        limit: 100,
        starting_after: startingAfter,
      });
      const existing = response.data.find(
        (invoice) => invoice.metadata?.local_id === localInvoiceId,
      );
      if (existing) {
        return existing;
      }
      startingAfter = response.has_more ? response.data.at(-1)?.id : undefined;
    } while (startingAfter);

    return undefined;
  }

  private async findPendingLineItemIndexes(
    customerExternalId: string,
    localInvoiceId: string,
  ): Promise<Set<number>> {
    const indexes = new Set<number>();
    let startingAfter: string | undefined;
    do {
      const response = await this.provider.request<
        StripeListResponse<StripeInvoiceItem>
      >('GET', '/v1/invoiceitems', {
        customer: customerExternalId,
        pending: true,
        limit: 100,
        starting_after: startingAfter,
      });
      for (const item of response.data) {
        if (item.metadata?.local_invoice_id !== localInvoiceId) {
          continue;
        }
        const index = Number(item.metadata.local_line_index);
        if (Number.isSafeInteger(index) && index >= 0) {
          indexes.add(index);
        }
      }
      startingAfter = response.has_more ? response.data.at(-1)?.id : undefined;
    } while (startingAfter);

    return indexes;
  }
}

class StripePaymentOperations implements PaymentOperations {
  constructor(private readonly provider: StripeProvider) {}

  async pull(externalId: string): Promise<ExternalPayment> {
    const paymentIntent = await this.provider.request<StripePaymentIntent>(
      'GET',
      `/v1/payment_intents/${encodeURIComponent(externalId)}`,
    );
    return mapStripePaymentIntent(paymentIntent);
  }

  async list(options: ListOptions = {}): Promise<ExternalPayment[]> {
    const response = await this.provider.request<
      StripeListResponse<StripePaymentIntent>
    >('GET', '/v1/payment_intents', mapListOptions(options));
    return response.data.map(mapStripePaymentIntent);
  }
}

class StripeBillingOperationsImpl implements StripeBillingOperations {
  constructor(private readonly provider: StripeProvider) {}

  async createCheckoutSession(
    input: StripeCheckoutSessionInput,
  ): Promise<StripeCheckoutSession> {
    const response = await this.provider.request<StripeCheckoutSessionResponse>(
      'POST',
      '/v1/checkout/sessions',
      mapCheckoutSessionToStripe(input),
      { idempotencyKey: input.idempotencyKey },
    );

    return mapCheckoutSessionResponse(response);
  }

  async retrieveCheckoutSession(
    sessionExternalId: string,
  ): Promise<StripeCheckoutSessionDetails> {
    const session = await this.provider.request<StripeCheckoutSessionResponse>(
      'GET',
      `/v1/checkout/sessions/${encodeURIComponent(sessionExternalId)}`,
      { expand: ['setup_intent', 'payment_intent'] },
    );
    const intent =
      typeof session.setup_intent === 'object' && session.setup_intent
        ? session.setup_intent
        : typeof session.payment_intent === 'object' && session.payment_intent
          ? session.payment_intent
          : undefined;
    const currency = session.currency
      ? session.currency.toUpperCase()
      : undefined;
    const minor = (amount?: number | null) =>
      currency && typeof amount === 'number'
        ? stripeAmountToMinorUnitsOrUndefined(amount, currency)
        : undefined;

    return {
      ...mapCheckoutSessionResponse(session),
      status: oneOf(session.status, ['open', 'complete', 'expired'] as const),
      paymentStatus: oneOf(session.payment_status, [
        'paid',
        'unpaid',
        'no_payment_required',
      ] as const),
      paymentMethodExternalId: idOf(intent?.payment_method),
      currency,
      amountSubtotalMinor: minor(session.amount_subtotal),
      amountTaxMinor: minor(session.total_details?.amount_tax),
      amountTotalMinor: minor(session.amount_total),
      metadata: { ...(session.metadata || {}) },
    };
  }

  async setDefaultPaymentMethod(
    customerExternalId: string,
    paymentMethodExternalId: string,
  ): Promise<void> {
    if (!customerExternalId || !paymentMethodExternalId) {
      throw new Error(
        'setDefaultPaymentMethod requires a customer and a payment method',
      );
    }
    await this.provider.request(
      'POST',
      `/v1/customers/${encodeURIComponent(customerExternalId)}`,
      { invoice_settings: { default_payment_method: paymentMethodExternalId } },
    );
  }

  async createCustomerPortalSession(
    input: StripeCustomerPortalSessionInput,
  ): Promise<StripeCustomerPortalSession> {
    const response = await this.provider.request<StripePortalSessionResponse>(
      'POST',
      '/v1/billing_portal/sessions',
      {
        customer: input.customerExternalId,
        return_url: input.returnUrl,
        configuration: input.configurationExternalId,
      },
    );

    return {
      externalId: response.id,
      url: response.url,
      raw: response,
    };
  }

  async retrieveSubscriptionStatus(
    subscriptionExternalId: string,
  ): Promise<StripeSubscriptionStatusResult> {
    const subscription = await this.provider.request<StripeSubscription>(
      'GET',
      `/v1/subscriptions/${encodeURIComponent(subscriptionExternalId)}`,
    );

    return mapStripeSubscription(subscription);
  }

  async listCustomerSubscriptions(
    customerExternalId: string,
  ): Promise<StripeSubscriptionStatusResult[]> {
    const response = await this.provider.request<
      StripeListResponse<StripeSubscription>
    >('GET', '/v1/subscriptions', {
      customer: customerExternalId,
      status: 'all',
      limit: 100,
    });

    return response.data.map(mapStripeSubscription);
  }
}

class UnsupportedVendorOperations implements VendorOperations {
  async push(_vendor: VendorInput): Promise<SyncResult> {
    throw new Error('Stripe does not support vendor operations');
  }

  async pull(_externalId: string): Promise<ExternalVendor> {
    throw new Error('Stripe does not support vendor operations');
  }

  async list(_options?: ListOptions): Promise<ExternalVendor[]> {
    throw new Error('Stripe does not support vendor operations');
  }

  async sync(_vendor: VendorInput): Promise<SyncResult> {
    throw new Error('Stripe does not support vendor operations');
  }
}

class UnsupportedBillOperations implements BillOperations {
  async push(_bill: BillInput): Promise<SyncResult> {
    throw new Error('Stripe does not support bill operations');
  }

  async pull(_externalId: string): Promise<ExternalBill> {
    throw new Error('Stripe does not support bill operations');
  }

  async list(_options?: ListOptions): Promise<ExternalBill[]> {
    throw new Error('Stripe does not support bill operations');
  }

  async sync(_bill: BillInput): Promise<SyncResult> {
    throw new Error('Stripe does not support bill operations');
  }
}

class StripeAuditOperations implements AuditOperations {
  constructor(private readonly provider: StripeProvider) {}

  async reconcileCustomers(
    locals: CustomerInput[],
  ): Promise<AuditReport<CustomerInput>> {
    const externals = await this.provider.customers.list({ limit: 100 });
    return reconcileRecords('stripe', locals, externals, compareCustomer);
  }

  async reconcileInvoices(
    locals: InvoiceInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<InvoiceInput>> {
    const externals = await this.provider.invoices.list({
      limit: 100,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
    });
    return reconcileRecords('stripe', locals, externals, compareInvoice);
  }

  async reconcileVendors(
    _locals: VendorInput[],
  ): Promise<AuditReport<VendorInput>> {
    throw new Error('Stripe does not support vendor operations');
  }

  async reconcileBills(_locals: BillInput[]): Promise<AuditReport<BillInput>> {
    throw new Error('Stripe does not support bill operations');
  }

  async reconcilePayments(
    locals: PaymentInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<PaymentInput>> {
    const externals = await this.provider.payments.list({
      limit: 100,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
    });
    return reconcileRecords('stripe', locals, externals, comparePayment);
  }
}

class StripeWebhookOperations implements WebhookOperations {
  constructor(private readonly options: StripeOptions) {}

  verify(payload: string, signature: string, secret: string): boolean {
    const endpointSecret = secret || this.options.webhookSecret;
    if (!endpointSecret) {
      throw new Error(
        'Stripe webhook secret not provided. Pass it as the secret parameter or configure webhookSecret in options.',
      );
    }

    const parsed = parseStripeSignatureHeader(signature);
    if (!parsed.timestamp || parsed.signatures.length === 0) {
      return false;
    }

    const tolerance = this.options.webhookTolerance ?? 300;
    const timestamp = Number.parseInt(parsed.timestamp, 10);
    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > tolerance
    ) {
      return false;
    }

    const signedPayload = `${parsed.timestamp}.${payload}`;
    const expected = createHmac('sha256', endpointSecret)
      .update(signedPayload)
      .digest('hex');

    return parsed.signatures.some((value) =>
      constantTimeEqualHex(value, expected),
    );
  }

  parse(payload: string): WebhookEvent {
    let event: StripeWebhookPayload;
    try {
      event = JSON.parse(payload) as StripeWebhookPayload;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown JSON parse error';
      throw new Error(`Invalid Stripe webhook payload: ${message}`);
    }

    const resource = event?.data?.object;
    return {
      type: event?.type || 'unknown',
      id: typeof event?.id === 'string' ? event.id : undefined,
      provider: 'stripe',
      timestamp: unixToDate(event?.created) || new Date(),
      payload: event,
      resourceType: mapStripeResourceType(
        resource?.object || undefined,
        event?.type || undefined,
      ),
      resourceId: typeof resource?.id === 'string' ? resource.id : undefined,
    };
  }
}

function encodeStripeForm(params: Record<string, StripeFormValue>) {
  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    appendStripeFormValue(form, key, value);
  }

  return form;
}

function appendStripeFormValue(
  form: URLSearchParams,
  key: string,
  value: StripeFormValue,
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (value instanceof Date) {
    form.append(key, String(toUnixSeconds(value)));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendStripeFormValue(form, `${key}[${index}]`, item);
    });
    return;
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendStripeFormValue(form, `${key}[${childKey}]`, childValue);
    }
    return;
  }

  form.append(key, String(value));
}

function mapCustomerToStripe(
  customer: CustomerInput,
): Record<string, StripeFormValue> {
  const stripeCustomer: Record<string, StripeFormValue> = {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.billingAddress
      ? {
          line1: customer.billingAddress.street1,
          line2: customer.billingAddress.street2,
          city: customer.billingAddress.city,
          state: customer.billingAddress.state,
          postal_code: customer.billingAddress.postalCode,
          country: customer.billingAddress.country,
        }
      : undefined,
    metadata: normalizeMetadata({
      payment_terms: customer.paymentTerms,
      ...customer.metadata,
      // Written last: idempotent creation reconciles customers by it.
      local_id: customer.id,
    }),
  };

  if (customer.taxExempt !== undefined) {
    stripeCustomer.tax_exempt = customer.taxExempt ? 'exempt' : 'none';
  }

  return stripeCustomer;
}

function mapInvoiceToStripe(
  invoice: InvoiceInput,
  collectionMethod: 'send_invoice' | 'charge_automatically',
): Record<string, StripeFormValue> {
  return {
    customer: invoice.customerExternalId,
    collection_method: collectionMethod,
    // Stripe rejects a due date on automatically charged invoices.
    due_date: collectionMethod === 'send_invoice' ? invoice.dueDate : undefined,
    auto_advance: false,
    pending_invoice_items_behavior: 'include',
    automatic_tax: invoice.automaticTax ? { enabled: true } : undefined,
    metadata: normalizeMetadata({
      local_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      reference: invoice.reference,
      memo: invoice.memo,
      tax_amount: invoice.taxAmount,
      subtotal: invoice.subtotal,
      total_amount: invoice.totalAmount,
      ...invoice.metadata,
    }),
  };
}

function mapInvoiceUpdateToStripe(
  invoice: InvoiceInput,
  collectionMethod: 'send_invoice' | 'charge_automatically',
): Record<string, StripeFormValue> {
  return {
    due_date: collectionMethod === 'send_invoice' ? invoice.dueDate : undefined,
    metadata: normalizeMetadata({
      local_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      reference: invoice.reference,
      memo: invoice.memo,
      ...invoice.metadata,
    }),
  };
}

function mapCheckoutSessionToStripe(
  input: StripeCheckoutSessionInput,
): Record<string, StripeFormValue> {
  const mode = input.mode || 'subscription';
  const lineItems = input.lineItems || [];
  if (mode === 'setup') {
    if (lineItems.length > 0) {
      throw new Error('Stripe setup-mode Checkout does not accept line items');
    }
    if (!input.currency && !input.paymentMethodTypes?.length) {
      throw new Error(
        'Stripe setup-mode Checkout requires currency or paymentMethodTypes',
      );
    }
    if (input.automaticTax) {
      throw new Error('Stripe setup-mode Checkout does not calculate tax');
    }
  } else if (lineItems.length === 0) {
    throw new Error(`Stripe ${mode}-mode Checkout requires line items`);
  }
  if (input.setupFutureUsage && mode !== 'payment') {
    throw new Error('setupFutureUsage applies only to payment-mode Checkout');
  }
  if (input.customerUpdate && !input.customerExternalId) {
    throw new Error('customerUpdate requires customerExternalId');
  }

  return {
    mode,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer: input.customerExternalId,
    customer_email: input.customerExternalId ? undefined : input.customerEmail,
    client_reference_id: input.clientReferenceId,
    allow_promotion_codes: input.allowPromotionCodes,
    currency: input.currency ? input.currency.toLowerCase() : undefined,
    payment_method_types: input.paymentMethodTypes,
    automatic_tax: input.automaticTax ? { enabled: true } : undefined,
    billing_address_collection: input.billingAddressCollection,
    customer_update: input.customerUpdate
      ? {
          address: input.customerUpdate.address,
          name: input.customerUpdate.name,
          shipping: input.customerUpdate.shipping,
        }
      : undefined,
    payment_intent_data: input.setupFutureUsage
      ? { setup_future_usage: input.setupFutureUsage }
      : undefined,
    line_items:
      mode === 'setup'
        ? undefined
        : lineItems.map((lineItem) =>
            mapCheckoutLineItem(lineItem, Boolean(input.automaticTax)),
          ),
    metadata: normalizeMetadata(input.metadata || {}),
  };
}

function mapCheckoutSessionResponse(
  response: StripeCheckoutSessionResponse,
): StripeCheckoutSession {
  return {
    externalId: response.id,
    url: response.url || null,
    mode: oneOf(response.mode, ['payment', 'setup', 'subscription'] as const),
    customerExternalId: idOf(response.customer),
    subscriptionExternalId: idOf(response.subscription),
    paymentIntentExternalId: idOf(response.payment_intent),
    setupIntentExternalId: idOf(response.setup_intent),
    raw: response,
  };
}

function mapCheckoutLineItem(
  lineItem: StripeCheckoutLineItem,
  automaticTax = false,
): Record<string, StripeFormValue> {
  if (lineItem.price) {
    return {
      price: lineItem.price,
      quantity: lineItem.quantity || 1,
    };
  }

  if (!lineItem.priceData) {
    throw new Error('Stripe checkout line item requires price or priceData');
  }

  const { priceData } = lineItem;
  const productData = priceData.product
    ? undefined
    : { name: priceData.productName || 'Subscription' };
  const hasStripeAmount = priceData.unitAmount !== undefined;
  const hasMinorAmount = priceData.unitAmountMinor !== undefined;
  if (hasStripeAmount === hasMinorAmount) {
    throw new Error(
      'Stripe checkout priceData requires exactly one of unitAmount or unitAmountMinor',
    );
  }
  const unitAmount = hasMinorAmount
    ? minorUnitsToStripeAmount(
        priceData.unitAmountMinor as number,
        normalizeCurrencyCode(priceData.currency),
      )
    : priceData.unitAmount;

  return {
    quantity: lineItem.quantity || 1,
    price_data: {
      currency: priceData.currency.toLowerCase(),
      unit_amount: unitAmount,
      tax_behavior:
        priceData.taxBehavior ?? (automaticTax ? 'exclusive' : undefined),
      product: priceData.product,
      product_data: productData,
      recurring: priceData.recurring
        ? {
            interval: priceData.recurring.interval,
            interval_count: priceData.recurring.intervalCount,
          }
        : undefined,
    },
  };
}

function mapListOptions(options: ListOptions): Record<string, StripeFormValue> {
  return {
    limit: options.limit,
    starting_after:
      typeof options.offset === 'string' ? options.offset : undefined,
    created: {
      gte: options.startDate,
      lte: options.endDate,
    },
    status: options.status,
  };
}

function mapStripeCustomer(customer: StripeCustomer): ExternalCustomer {
  return {
    externalId: customer.id,
    provider: 'stripe',
    syncedAt: new Date(),
    name: customer.name || '',
    email: customer.email || undefined,
    phone: customer.phone || undefined,
    billingAddress: customer.address
      ? {
          street1: customer.address.line1 || undefined,
          street2: customer.address.line2 || undefined,
          city: customer.address.city || undefined,
          state: customer.address.state || undefined,
          postalCode: customer.address.postal_code || undefined,
          country: customer.address.country || undefined,
        }
      : undefined,
    balance:
      customer.balance === null || customer.balance === undefined
        ? undefined
        : stripeMinorUnitsToMoney(customer.balance, customer.currency),
    currency: customer.currency || undefined,
    raw: customer,
  };
}

function mapStripeInvoice(invoice: StripeInvoice): ExternalInvoice {
  return {
    externalId: invoice.id,
    provider: 'stripe',
    syncedAt: new Date(),
    invoiceNumber: invoice.number || invoice.id,
    customerExternalId:
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id || '',
    issueDate: unixToDate(invoice.created) || new Date(),
    dueDate:
      unixToDate(invoice.due_date) || unixToDate(invoice.created) || new Date(),
    subtotal: stripeMinorUnitsToMoney(invoice.subtotal || 0, invoice.currency),
    taxAmount: stripeMinorUnitsToMoney(
      stripeInvoiceTaxAmount(invoice),
      invoice.currency,
    ),
    totalAmount: stripeMinorUnitsToMoney(invoice.total || 0, invoice.currency),
    amountPaid: stripeMinorUnitsToMoney(
      invoice.amount_paid || 0,
      invoice.currency,
    ),
    balance: stripeMinorUnitsToMoney(
      invoice.amount_remaining || 0,
      invoice.currency,
    ),
    status: mapStripeInvoiceStatus(invoice.status, invoice.due_date),
    currency: invoice.currency || 'usd',
    raw: invoice,
  };
}

function mapStripePaymentIntent(
  paymentIntent: StripePaymentIntent,
): ExternalPayment {
  return {
    externalId: paymentIntent.id,
    provider: 'stripe',
    syncedAt: new Date(),
    amount: stripeMinorUnitsToMoney(
      paymentIntent.amount || 0,
      paymentIntent.currency,
    ),
    currency: paymentIntent.currency || 'usd',
    paidAt: unixToDate(paymentIntent.created) || new Date(),
    method: paymentIntent.payment_method_types?.[0],
    transactionId: paymentIntent.latest_charge || paymentIntent.id,
    invoiceExternalIds: paymentIntent.invoice
      ? [paymentIntent.invoice]
      : undefined,
    status: mapStripePaymentStatus(paymentIntent.status),
    raw: paymentIntent,
  };
}

function mapStripeSubscription(
  subscription: StripeSubscription,
): StripeSubscriptionStatusResult {
  return {
    externalId: subscription.id,
    status: subscription.status,
    customerExternalId:
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id,
    currentPeriodStart: unixToDate(subscription.current_period_start),
    currentPeriodEnd: unixToDate(subscription.current_period_end),
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    canceledAt: unixToDate(subscription.canceled_at),
    trialEnd: unixToDate(subscription.trial_end),
    raw: subscription,
  };
}

function mapStripeInvoiceStatus(
  status?: string | null,
  dueDate?: number | null,
): ExternalInvoice['status'] {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'paid':
      return 'paid';
    case 'void':
      return 'voided';
    case 'uncollectible':
      return 'uncollectible';
    case 'open':
      if (dueDate && dueDate * 1000 < Date.now()) {
        return 'overdue';
      }
      return 'sent';
    default:
      return 'sent';
  }
}

function mapStripePaymentStatus(
  status?: string | null,
): ExternalPayment['status'] {
  switch (status) {
    case 'succeeded':
      return 'completed';
    case 'processing':
    case 'requires_action':
    case 'requires_capture':
    case 'requires_confirmation':
      return 'pending';
    case 'canceled':
    case 'requires_payment_method':
      return 'failed';
    default:
      return 'pending';
  }
}

function mapStripeResourceType(
  object?: string,
  eventType?: string,
): WebhookEvent['resourceType'] | undefined {
  if (object === 'customer' || eventType?.startsWith('customer.')) {
    return 'customer';
  }
  if (object === 'invoice' || eventType?.startsWith('invoice.')) {
    return 'invoice';
  }
  if (
    object === 'payment_intent' ||
    object === 'charge' ||
    eventType?.startsWith('payment_intent.') ||
    eventType?.startsWith('charge.')
  ) {
    return 'payment';
  }
  return undefined;
}

function normalizeMetadata(
  metadata: Record<string, unknown>,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

function parseStripeSignatureHeader(signature: string): {
  timestamp?: string;
  signatures: string[];
} {
  const parts = signature.split(',').map((part) => part.trim());
  const parsed: { timestamp?: string; signatures: string[] } = {
    signatures: [],
  };

  for (const part of parts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);
    if (key === 't') {
      parsed.timestamp = value;
    }
    if (key === 'v1' && value) {
      parsed.signatures.push(value);
    }
  }

  return parsed;
}

function constantTimeEqualHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  } catch {
    return false;
  }
}

function reconcileRecords<TLocal extends { externalId?: string }>(
  provider: AccountingProviderType,
  locals: TLocal[],
  externals: ExternalRecord[],
  compare: (local: TLocal, external: ExternalRecord) => FieldDiff[],
): AuditReport<TLocal> {
  const externalById = new Map(
    externals.map((external) => [external.externalId, external]),
  );
  const matched: AuditMatch<TLocal>[] = [];
  const discrepancies: AuditReport<TLocal>['discrepancies'] = [];
  const localOnly: TLocal[] = [];
  const seenExternalIds = new Set<string>();

  for (const local of locals) {
    const external = local.externalId
      ? externalById.get(local.externalId)
      : undefined;

    if (!external) {
      localOnly.push(local);
      continue;
    }

    seenExternalIds.add(external.externalId);
    const differences = compare(local, external);
    if (differences.length === 0) {
      matched.push({ local, external, status: 'identical' });
    } else {
      discrepancies.push({ local, external, differences });
    }
  }

  const externalOnly = externals.filter(
    (external) => !seenExternalIds.has(external.externalId),
  );

  return {
    provider,
    auditedAt: new Date(),
    matched,
    localOnly,
    externalOnly,
    discrepancies,
    summary: {
      total: locals.length + externalOnly.length,
      matched: matched.length,
      localOnly: localOnly.length,
      externalOnly: externalOnly.length,
      discrepancies: discrepancies.length,
    },
  };
}

function compareCustomer(
  local: CustomerInput,
  external: ExternalRecord,
): FieldDiff[] {
  const customer = external as ExternalCustomer;
  return [
    compareField('name', local.name, customer.name),
    compareField('email', local.email, customer.email),
  ].filter((diff): diff is FieldDiff => Boolean(diff));
}

function compareInvoice(
  local: InvoiceInput,
  external: ExternalRecord,
): FieldDiff[] {
  const invoice = external as ExternalInvoice;
  return [
    compareField('totalAmount', local.totalAmount, invoice.totalAmount),
    compareField('currency', local.currency || 'usd', invoice.currency),
  ].filter((diff): diff is FieldDiff => Boolean(diff));
}

function comparePayment(
  local: PaymentInput,
  external: ExternalRecord,
): FieldDiff[] {
  const payment = external as ExternalPayment;
  return [
    compareField('amount', local.amount, payment.amount),
    compareField('currency', local.currency || 'usd', payment.currency),
  ].filter((diff): diff is FieldDiff => Boolean(diff));
}

function compareField(
  field: string,
  localValue: unknown,
  externalValue: unknown,
): FieldDiff | null {
  if (valuesEqual(localValue, externalValue)) {
    return null;
  }
  return { field, localValue, externalValue };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 0.01;
  }
  return false;
}

function stripeInvoiceTaxAmount(invoice: StripeInvoice): number {
  if (typeof invoice.tax === 'number') {
    return invoice.tax;
  }
  return (invoice.total_taxes || []).reduce(
    (total, tax) => total + (tax.amount || 0),
    0,
  );
}

const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);
const STRIPE_THREE_DECIMAL_CURRENCIES = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
]);

function stripeCurrencyMinorUnitFactor(currency?: string | null): number {
  const normalized = (currency || 'usd').toUpperCase();
  if (STRIPE_ZERO_DECIMAL_CURRENCIES.has(normalized)) {
    return 1;
  }
  if (STRIPE_THREE_DECIMAL_CURRENCIES.has(normalized)) {
    return 1_000;
  }
  return 100;
}

function moneyToStripeMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * stripeCurrencyMinorUnitFactor(currency));
}

function stripeMinorUnitsToMoney(
  amount: number,
  currency?: string | null,
): number {
  return amount / stripeCurrencyMinorUnitFactor(currency);
}

function assertIdempotencyKey(key: string): void {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error('idempotencyKey must be a non-empty string');
  }
}

/** Escape a value for a single-quoted Stripe Search Query Language string. */
function escapeSearchValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolveCollectionMethod(
  invoice: InvoiceInput,
): 'send_invoice' | 'charge_automatically' {
  const method = invoice.collectionMethod ?? 'send_invoice';
  if (method !== 'send_invoice' && method !== 'charge_automatically') {
    throw new Error(`Unsupported invoice collectionMethod '${method}'`);
  }
  return method;
}

/** The line's discount in Stripe units, validated against the line total. */
function lineDiscountToStripe(
  lineItem: InvoiceInput['lineItems'][number],
  currency: string,
): number | undefined {
  if (lineItem.discount === undefined || lineItem.discount === 0) {
    return undefined;
  }
  if (!Number.isFinite(lineItem.discount) || lineItem.discount < 0) {
    throw new Error(
      `Invoice line '${lineItem.description}' discount must be a non-negative amount`,
    );
  }
  const discount = moneyToStripeMinorUnits(lineItem.discount, currency);
  const lineTotal = Math.round(
    moneyToStripeMinorUnits(lineItem.unitPrice, currency) * lineItem.quantity,
  );
  if (discount > lineTotal) {
    throw new Error(
      `Invoice line '${lineItem.description}' discount exceeds the line total`,
    );
  }
  return discount > 0 ? discount : undefined;
}

function lineServicePeriod(
  lineItem: InvoiceInput['lineItems'][number],
): { start: Date; end: Date } | undefined {
  const { periodStart, periodEnd } = lineItem;
  if (!periodStart && !periodEnd) {
    return undefined;
  }
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    throw new Error(
      `Invoice line '${lineItem.description}' needs both periodStart and periodEnd`,
    );
  }
  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodEnd.getTime() < periodStart.getTime()
  ) {
    throw new Error(
      `Invoice line '${lineItem.description}' has an invalid service period`,
    );
  }
  return { start: periodStart, end: periodEnd };
}

function idOf(
  value: string | { id?: string | null } | null | undefined,
): string | undefined {
  if (typeof value === 'string') {
    return value || undefined;
  }
  return value?.id || undefined;
}

function oneOf<const T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function normalizeCurrencyCode(currency: string): string {
  const code = String(currency ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Currency '${currency}' must be a three-letter code`);
  }
  return code;
}

/** ISO 4217 minor-unit exponent (2 for USD, 0 for JPY and ISK). */
function isoMinorUnitExponent(currency: string): number {
  const digits = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits;
  return typeof digits === 'number' ? digits : 2;
}

/**
 * Integer ISO minor units → Stripe's smallest unit. They differ where Stripe
 * keeps a two-decimal representation for a zero-decimal currency (ISK, UGX).
 */
function minorUnitsToStripeAmount(
  amountMinor: number,
  currency: string,
): number {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(
      `Amount ${amountMinor} must be a safe integer number of minor units`,
    );
  }
  const iso = 10 ** isoMinorUnitExponent(currency);
  const stripe = stripeCurrencyMinorUnitFactor(currency);
  if (stripe >= iso) {
    return amountMinor * (stripe / iso);
  }
  const divisor = iso / stripe;
  if (amountMinor % divisor !== 0) {
    throw new Error(
      `Amount ${amountMinor} ${currency} minor units is not representable in Stripe's currency unit`,
    );
  }
  return amountMinor / divisor;
}

function stripeAmountToMinorUnitsOrUndefined(
  amount: number,
  currency: string,
): number | undefined {
  if (!Number.isSafeInteger(amount)) {
    return undefined;
  }
  const iso = 10 ** isoMinorUnitExponent(currency);
  const stripe = stripeCurrencyMinorUnitFactor(currency);
  const minor = (amount * iso) / stripe;
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function centsToMoney(cents: number): number {
  return cents / 100;
}

function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function unixToDate(value?: number | null): Date | undefined {
  return value === null || value === undefined
    ? undefined
    : new Date(value * 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
