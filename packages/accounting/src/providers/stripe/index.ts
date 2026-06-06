/**
 * Stripe Provider
 *
 * Implements Stripe AR, payment, webhook, and billing operations using the
 * Stripe HTTP API directly. The SDK keeps Stripe as an optional runtime
 * dependency by relying on the platform fetch implementation.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: StripeAddress | null;
  balance?: number | null;
  currency?: string | null;
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
  total?: number | null;
  amount_paid?: number | null;
  amount_remaining?: number | null;
  status?: string | null;
  currency?: string | null;
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
}

interface StripeCheckoutSessionResponse {
  id: string;
  url?: string | null;
  customer?: string | null;
  subscription?: string | null;
  payment_intent?: string | null;
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
  ): Promise<T> {
    const timeout = this.options.timeout || 30000;
    const maxRetries = this.options.maxRetries || 3;
    const idempotencyKey = method === 'POST' ? `sdk-${randomUUID()}` : null;
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
          const error = new Error(
            `Stripe API error (${response.status}): ${errorText}`,
          );

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
    const response = await this.provider.request<StripeCustomer>(
      'POST',
      '/v1/customers',
      mapCustomerToStripe(customer),
    );

    return {
      action: 'created',
      externalId: response.id,
      syncedAt: new Date(),
    };
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

    for (const lineItem of invoice.lineItems) {
      await this.provider.request('POST', '/v1/invoiceitems', {
        customer: invoice.customerExternalId,
        currency: invoice.currency || 'usd',
        description: lineItem.description,
        quantity: lineItem.quantity,
        unit_amount_decimal: String(Math.round(lineItem.unitPrice * 100)),
        metadata: normalizeMetadata({
          local_sku: lineItem.sku,
          local_discount: lineItem.discount,
          local_tax_rate: lineItem.taxRate,
        }),
      });
    }

    const response = await this.provider.request<StripeInvoice>(
      'POST',
      '/v1/invoices',
      mapInvoiceToStripe(invoice),
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
      mapInvoiceUpdateToStripe(invoice),
    );

    return {
      action: 'updated',
      externalId: invoice.externalId,
      syncedAt: new Date(),
    };
  }

  async send(externalId: string): Promise<void> {
    await this.provider.request(
      'POST',
      `/v1/invoices/${encodeURIComponent(externalId)}/send`,
    );
  }

  async void(externalId: string): Promise<void> {
    await this.provider.request(
      'POST',
      `/v1/invoices/${encodeURIComponent(externalId)}/void`,
    );
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
    );

    return {
      externalId: response.id,
      url: response.url || null,
      customerExternalId: response.customer || undefined,
      subscriptionExternalId: response.subscription || undefined,
      paymentIntentExternalId: response.payment_intent || undefined,
      raw: response,
    };
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
      local_id: customer.id,
      payment_terms: customer.paymentTerms,
      ...customer.metadata,
    }),
  };

  if (customer.taxExempt !== undefined) {
    stripeCustomer.tax_exempt = customer.taxExempt ? 'exempt' : 'none';
  }

  return stripeCustomer;
}

function mapInvoiceToStripe(
  invoice: InvoiceInput,
): Record<string, StripeFormValue> {
  return {
    customer: invoice.customerExternalId,
    collection_method: 'send_invoice',
    due_date: invoice.dueDate,
    auto_advance: false,
    pending_invoice_items_behavior: 'include',
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
): Record<string, StripeFormValue> {
  return {
    due_date: invoice.dueDate,
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
  return {
    mode: input.mode || 'subscription',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer: input.customerExternalId,
    customer_email: input.customerExternalId ? undefined : input.customerEmail,
    client_reference_id: input.clientReferenceId,
    allow_promotion_codes: input.allowPromotionCodes,
    line_items: input.lineItems.map(mapCheckoutLineItem),
    metadata: normalizeMetadata(input.metadata || {}),
  };
}

function mapCheckoutLineItem(
  lineItem: StripeCheckoutLineItem,
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

  const productData = lineItem.priceData.product
    ? undefined
    : { name: lineItem.priceData.productName || 'Subscription' };

  return {
    quantity: lineItem.quantity || 1,
    price_data: {
      currency: lineItem.priceData.currency,
      unit_amount: lineItem.priceData.unitAmount,
      product: lineItem.priceData.product,
      product_data: productData,
      recurring: lineItem.priceData.recurring
        ? {
            interval: lineItem.priceData.recurring.interval,
            interval_count: lineItem.priceData.recurring.intervalCount,
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
        : centsToMoney(customer.balance),
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
    subtotal: centsToMoney(invoice.subtotal || 0),
    taxAmount: centsToMoney(invoice.tax || 0),
    totalAmount: centsToMoney(invoice.total || 0),
    amountPaid: centsToMoney(invoice.amount_paid || 0),
    balance: centsToMoney(invoice.amount_remaining || 0),
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
    amount: centsToMoney(paymentIntent.amount || 0),
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
