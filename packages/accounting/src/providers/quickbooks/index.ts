/**
 * QuickBooks Online Provider
 *
 * Implements the AccountingProvider interface for QuickBooks Online.
 * Uses the Intuit OAuth2 library for authentication and the QBO API for operations.
 */

/// <reference path="../../intuit-oauth.d.ts" />

import { createHmac } from 'node:crypto';
import type {
  AccountingProvider,
  Address,
  AuditDiscrepancy,
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
  QuickBooksOptions,
  SyncResult,
  TokenSet,
  VendorInput,
  VendorOperations,
  WebhookEvent,
  WebhookOperations,
} from '../../types.js';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a Date to YYYY-MM-DD in local timezone (not UTC)
 * This prevents timezone conversion issues where dates shift by a day
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compare two values for equality (handles dates, objects, etc.)
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') {
    // Allow for floating point precision issues
    return Math.abs(a - b) < 0.01;
  }
  return false;
}

// =============================================================================
// QuickBooks Provider
// =============================================================================

/**
 * QuickBooks Online accounting provider
 */
export class QuickBooksProvider implements AccountingProvider {
  readonly type = 'quickbooks' as const;

  private options: QuickBooksOptions;
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  readonly customers: CustomerOperations;
  readonly invoices: InvoiceOperations;
  readonly vendors: VendorOperations;
  readonly bills: BillOperations;
  readonly payments: PaymentOperations;
  readonly audit: AuditOperations;
  readonly webhooks: WebhookOperations;

  constructor(options: QuickBooksOptions) {
    this.options = {
      timeout: 30000,
      maxRetries: 3,
      ...options,
    };

    // Initialize operation handlers
    this.customers = new QuickBooksCustomerOperations(this);
    this.invoices = new QuickBooksInvoiceOperations(this);
    this.vendors = new QuickBooksVendorOperations(this);
    this.bills = new QuickBooksBillOperations(this);
    this.payments = new QuickBooksPaymentOperations(this);
    this.audit = new QuickBooksAuditOperations(this);
    this.webhooks = new QuickBooksWebhookOperations(this.options);
  }

  /**
   * Get the QBO API base URL
   */
  get baseUrl(): string {
    return this.options.environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
  }

  /**
   * Get the company/realm ID
   */
  get realmId(): string {
    return this.options.realmId;
  }

  /**
   * Ensure we have a valid access token, refreshing if needed
   */
  async ensureAccessToken(): Promise<string> {
    // Check if current token is still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiresAt) {
      const bufferMs = 5 * 60 * 1000;
      if (new Date().getTime() < this.tokenExpiresAt.getTime() - bufferMs) {
        return this.accessToken;
      }
    }

    // Refresh the token
    const tokens = await this.refreshAccessToken();
    this.accessToken = tokens.accessToken;
    this.tokenExpiresAt = tokens.expiresAt;

    // Update stored refresh token so subsequent refreshes use the new token
    this.options.refreshToken = tokens.refreshToken;

    // Notify callback if provided
    if (this.options.onTokenRefresh) {
      await this.options.onTokenRefresh(tokens);
    }

    return this.accessToken;
  }

  /**
   * Refresh the OAuth access token
   */
  private async refreshAccessToken(): Promise<TokenSet> {
    // Import intuit-oauth dynamically
    const OAuthClient = (await import('intuit-oauth')).default;

    const redirectUri =
      this.options.redirectUri ||
      'https://developer.intuit.com/v2/OAuth2Playground/RedirectUrl';

    const oauthClient = new OAuthClient({
      clientId: this.options.clientId,
      clientSecret: this.options.clientSecret,
      environment:
        this.options.environment === 'production' ? 'production' : 'sandbox',
      redirectUri,
    });

    oauthClient.setToken({
      refresh_token: this.options.refreshToken,
      access_token: this.accessToken || '',
    });

    const response = await oauthClient.refresh();
    const token = response.getJson();

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      tokenType: token.token_type,
    };
  }

  /**
   * Make an authenticated request to the QBO API with timeout and retry support
   */
  async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    endpoint: string,
    body?: unknown,
  ): Promise<T> {
    const accessToken = await this.ensureAccessToken();
    const url = `${this.baseUrl}/v3/company/${this.realmId}/${endpoint}`;
    const timeout = this.options.timeout || 30000;
    const maxRetries = this.options.maxRetries || 3;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();

            // Don't retry client errors (4xx) except rate limiting
            if (
              response.status >= 400 &&
              response.status < 500 &&
              response.status !== 429
            ) {
              throw new Error(
                `QBO API error (${response.status}): ${errorText}`,
              );
            }

            // Retry on server errors and rate limiting
            throw new Error(`QBO API error (${response.status}): ${errorText}`);
          }

          return (await response.json()) as T;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry client errors (4xx except 429) - re-throw immediately
        const errorMessage = lastError.message;
        const statusMatch = errorMessage.match(/QBO API error \((\d+)\)/);
        if (statusMatch) {
          const status = Number.parseInt(statusMatch[1], 10);
          if (status >= 400 && status < 500 && status !== 429) {
            throw lastError;
          }
        }

        // Don't retry on abort (timeout) for the last attempt
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const backoffMs = 2 ** attempt * 1000;
          await sleep(backoffMs);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Execute a QBO query with pagination support
   */
  async queryAll<T>(
    entity: string,
    whereClause?: string,
    maxResults = 1000,
  ): Promise<T[]> {
    const results: T[] = [];
    let startPosition = 1;
    const pageSize = 100; // QBO max is 1000, but smaller pages are safer

    while (results.length < maxResults) {
      let query = `SELECT * FROM ${entity}`;
      if (whereClause) {
        query += ` WHERE ${whereClause}`;
      }
      query += ` MAXRESULTS ${pageSize} STARTPOSITION ${startPosition}`;

      const response = await this.request<{
        QueryResponse: Record<string, T[] | undefined>;
      }>('GET', `query?query=${encodeURIComponent(query)}`);

      const items = response.QueryResponse[entity] || [];
      results.push(...items);

      // If we got fewer than pageSize, we've reached the end
      if (items.length < pageSize) {
        break;
      }

      startPosition += pageSize;
    }

    return results;
  }
}

// =============================================================================
// Customer Operations
// =============================================================================

class QuickBooksCustomerOperations implements CustomerOperations {
  constructor(private provider: QuickBooksProvider) {}

  async push(customer: CustomerInput): Promise<SyncResult> {
    const qboCustomer = mapCustomerToQBO(customer);

    const response = await this.provider.request<{ Customer: QBOCustomer }>(
      'POST',
      'customer',
      qboCustomer,
    );

    return {
      action: 'created',
      externalId: response.Customer.Id,
      syncedAt: new Date(),
    };
  }

  async pull(externalId: string): Promise<ExternalCustomer> {
    const response = await this.provider.request<{ Customer: QBOCustomer }>(
      'GET',
      `customer/${externalId}`,
    );

    return mapQBOToCustomer(response.Customer);
  }

  async list(options?: ListOptions): Promise<ExternalCustomer[]> {
    const limit = options?.limit || 1000;
    const customers = await this.provider.queryAll<QBOCustomer>(
      'Customer',
      undefined,
      limit,
    );
    return customers.map(mapQBOToCustomer);
  }

  async sync(customer: CustomerInput): Promise<SyncResult> {
    if (customer.externalId) {
      // Update existing
      const existing = await this.provider.request<{ Customer: QBOCustomer }>(
        'GET',
        `customer/${customer.externalId}`,
      );

      const qboCustomer: QBOCustomerUpdate = {
        ...mapCustomerToQBO(customer),
        Id: customer.externalId,
        SyncToken: existing.Customer.SyncToken,
      };

      await this.provider.request('POST', 'customer', qboCustomer);

      return {
        action: 'updated',
        externalId: customer.externalId,
        syncedAt: new Date(),
      };
    }

    return this.push(customer);
  }
}

// =============================================================================
// Invoice Operations
// =============================================================================

class QuickBooksInvoiceOperations implements InvoiceOperations {
  constructor(private provider: QuickBooksProvider) {}

  async push(invoice: InvoiceInput): Promise<SyncResult> {
    const qboInvoice = mapInvoiceToQBO(invoice);

    const response = await this.provider.request<{ Invoice: QBOInvoice }>(
      'POST',
      'invoice',
      qboInvoice,
    );

    return {
      action: 'created',
      externalId: response.Invoice.Id,
      syncedAt: new Date(),
    };
  }

  async pull(externalId: string): Promise<ExternalInvoice> {
    const response = await this.provider.request<{ Invoice: QBOInvoice }>(
      'GET',
      `invoice/${externalId}`,
    );

    return mapQBOToInvoice(response.Invoice);
  }

  async list(options?: ListOptions): Promise<ExternalInvoice[]> {
    const limit = options?.limit || 1000;
    let whereClause: string | undefined;

    if (options?.startDate) {
      whereClause = `TxnDate >= '${formatLocalDate(options.startDate)}'`;
      if (options?.endDate) {
        whereClause += ` AND TxnDate <= '${formatLocalDate(options.endDate)}'`;
      }
    }

    const invoices = await this.provider.queryAll<QBOInvoice>(
      'Invoice',
      whereClause,
      limit,
    );
    return invoices.map(mapQBOToInvoice);
  }

  async sync(invoice: InvoiceInput): Promise<SyncResult> {
    if (invoice.externalId) {
      const existing = await this.provider.request<{ Invoice: QBOInvoice }>(
        'GET',
        `invoice/${invoice.externalId}`,
      );

      const qboInvoice: QBOInvoiceUpdate = {
        ...mapInvoiceToQBO(invoice),
        Id: invoice.externalId,
        SyncToken: existing.Invoice.SyncToken,
      };

      await this.provider.request('POST', 'invoice', qboInvoice);

      return {
        action: 'updated',
        externalId: invoice.externalId,
        syncedAt: new Date(),
      };
    }

    return this.push(invoice);
  }

  async send(externalId: string): Promise<void> {
    await this.provider.request('POST', `invoice/${externalId}/send`);
  }

  async void(externalId: string): Promise<void> {
    const existing = await this.provider.request<{ Invoice: QBOInvoice }>(
      'GET',
      `invoice/${externalId}`,
    );

    await this.provider.request('POST', 'invoice', {
      Id: externalId,
      SyncToken: existing.Invoice.SyncToken,
      sparse: true,
      // QBO doesn't have a Void field - you delete the invoice instead
      // or create a credit memo. For now, we'll use sparse update to mark private note
      PrivateNote: 'VOIDED',
    });
  }
}

// =============================================================================
// Vendor Operations
// =============================================================================

class QuickBooksVendorOperations implements VendorOperations {
  constructor(private provider: QuickBooksProvider) {}

  async push(vendor: VendorInput): Promise<SyncResult> {
    const qboVendor = mapVendorToQBO(vendor);

    const response = await this.provider.request<{ Vendor: QBOVendor }>(
      'POST',
      'vendor',
      qboVendor,
    );

    return {
      action: 'created',
      externalId: response.Vendor.Id,
      syncedAt: new Date(),
    };
  }

  async pull(externalId: string): Promise<ExternalVendor> {
    const response = await this.provider.request<{ Vendor: QBOVendor }>(
      'GET',
      `vendor/${externalId}`,
    );

    return mapQBOToVendor(response.Vendor);
  }

  async list(options?: ListOptions): Promise<ExternalVendor[]> {
    const limit = options?.limit || 1000;
    const vendors = await this.provider.queryAll<QBOVendor>(
      'Vendor',
      undefined,
      limit,
    );
    return vendors.map(mapQBOToVendor);
  }

  async sync(vendor: VendorInput): Promise<SyncResult> {
    if (vendor.externalId) {
      const existing = await this.provider.request<{ Vendor: QBOVendor }>(
        'GET',
        `vendor/${vendor.externalId}`,
      );

      const qboVendor: QBOVendorUpdate = {
        ...mapVendorToQBO(vendor),
        Id: vendor.externalId,
        SyncToken: existing.Vendor.SyncToken,
      };

      await this.provider.request('POST', 'vendor', qboVendor);

      return {
        action: 'updated',
        externalId: vendor.externalId,
        syncedAt: new Date(),
      };
    }

    return this.push(vendor);
  }
}

// =============================================================================
// Bill Operations
// =============================================================================

class QuickBooksBillOperations implements BillOperations {
  constructor(private provider: QuickBooksProvider) {}

  async push(bill: BillInput): Promise<SyncResult> {
    const qboBill = mapBillToQBO(bill);

    const response = await this.provider.request<{ Bill: QBOBill }>(
      'POST',
      'bill',
      qboBill,
    );

    return {
      action: 'created',
      externalId: response.Bill.Id,
      syncedAt: new Date(),
    };
  }

  async pull(externalId: string): Promise<ExternalBill> {
    const response = await this.provider.request<{ Bill: QBOBill }>(
      'GET',
      `bill/${externalId}`,
    );

    return mapQBOToBill(response.Bill);
  }

  async list(options?: ListOptions): Promise<ExternalBill[]> {
    const limit = options?.limit || 1000;
    let whereClause: string | undefined;

    if (options?.startDate) {
      whereClause = `TxnDate >= '${formatLocalDate(options.startDate)}'`;
      if (options?.endDate) {
        whereClause += ` AND TxnDate <= '${formatLocalDate(options.endDate)}'`;
      }
    }

    const bills = await this.provider.queryAll<QBOBill>(
      'Bill',
      whereClause,
      limit,
    );
    return bills.map(mapQBOToBill);
  }

  async sync(bill: BillInput): Promise<SyncResult> {
    if (bill.externalId) {
      const existing = await this.provider.request<{ Bill: QBOBill }>(
        'GET',
        `bill/${bill.externalId}`,
      );

      const qboBill: QBOBillUpdate = {
        ...mapBillToQBO(bill),
        Id: bill.externalId,
        SyncToken: existing.Bill.SyncToken,
      };

      await this.provider.request('POST', 'bill', qboBill);

      return {
        action: 'updated',
        externalId: bill.externalId,
        syncedAt: new Date(),
      };
    }

    return this.push(bill);
  }
}

// =============================================================================
// Payment Operations
// =============================================================================

class QuickBooksPaymentOperations implements PaymentOperations {
  constructor(private provider: QuickBooksProvider) {}

  async pull(externalId: string): Promise<ExternalPayment> {
    const response = await this.provider.request<{ Payment: QBOPayment }>(
      'GET',
      `payment/${externalId}`,
    );

    return mapQBOToPayment(response.Payment);
  }

  async list(options?: ListOptions): Promise<ExternalPayment[]> {
    const limit = options?.limit || 1000;
    let whereClause: string | undefined;

    if (options?.startDate) {
      whereClause = `TxnDate >= '${formatLocalDate(options.startDate)}'`;
      if (options?.endDate) {
        whereClause += ` AND TxnDate <= '${formatLocalDate(options.endDate)}'`;
      }
    }

    const payments = await this.provider.queryAll<QBOPayment>(
      'Payment',
      whereClause,
      limit,
    );
    return payments.map(mapQBOToPayment);
  }
}

// =============================================================================
// Audit Operations
// =============================================================================

class QuickBooksAuditOperations implements AuditOperations {
  constructor(private provider: QuickBooksProvider) {}

  async reconcileCustomers(
    locals: CustomerInput[],
  ): Promise<AuditReport<CustomerInput>> {
    const externals = await this.provider.customers.list({ limit: 10000 });
    return reconcileRecords(
      locals,
      externals,
      (l) => l.externalId,
      (e) => e.externalId,
      compareCustomer,
    );
  }

  async reconcileInvoices(
    locals: InvoiceInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<InvoiceInput>> {
    const externals = await this.provider.invoices.list({
      limit: 10000,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
    });
    return reconcileRecords(
      locals,
      externals,
      (l) => l.externalId,
      (e) => e.externalId,
      compareInvoice,
    );
  }

  async reconcileVendors(
    locals: VendorInput[],
  ): Promise<AuditReport<VendorInput>> {
    const externals = await this.provider.vendors.list({ limit: 10000 });
    return reconcileRecords(
      locals,
      externals,
      (l) => l.externalId,
      (e) => e.externalId,
      compareVendor,
    );
  }

  async reconcileBills(
    locals: BillInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<BillInput>> {
    const externals = await this.provider.bills.list({
      limit: 10000,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
    });
    return reconcileRecords(
      locals,
      externals,
      (l) => l.externalId,
      (e) => e.externalId,
      compareBill,
    );
  }

  async reconcilePayments(
    locals: PaymentInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<PaymentInput>> {
    const externals = await this.provider.payments.list({
      limit: 10000,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
    });
    return reconcileRecords(
      locals,
      externals,
      (l) => l.externalId,
      (e) => e.externalId,
      comparePayment,
    );
  }
}

/**
 * Generic reconciliation function with field comparison
 */
function reconcileRecords<TLocal, TExternal extends ExternalRecord>(
  locals: TLocal[],
  externals: TExternal[],
  getLocalExternalId: (local: TLocal) => string | undefined,
  getExternalId: (external: TExternal) => string,
  compareFields: (local: TLocal, external: TExternal) => FieldDiff[],
): AuditReport<TLocal> {
  const externalMap = new Map(externals.map((e) => [getExternalId(e), e]));
  const matchedExternalIds = new Set<string>();

  const matched: AuditMatch<TLocal>[] = [];
  const localOnly: TLocal[] = [];
  const discrepancies: AuditDiscrepancy<TLocal>[] = [];

  for (const local of locals) {
    const externalId = getLocalExternalId(local);
    if (externalId && externalMap.has(externalId)) {
      const external = externalMap.get(externalId)!;
      matchedExternalIds.add(externalId);

      // Compare fields
      const differences = compareFields(local, external);

      if (differences.length === 0) {
        matched.push({
          local,
          external,
          status: 'identical',
        });
      } else {
        discrepancies.push({
          local,
          external,
          differences,
        });
      }
    } else {
      localOnly.push(local);
    }
  }

  const externalOnly = externals.filter(
    (e) => !matchedExternalIds.has(getExternalId(e)),
  );

  return {
    provider: 'quickbooks',
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

// Field comparison functions
function compareCustomer(
  local: CustomerInput,
  external: ExternalCustomer,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (local.name !== external.name) {
    diffs.push({
      field: 'name',
      localValue: local.name,
      externalValue: external.name,
    });
  }
  if (local.email !== external.email) {
    diffs.push({
      field: 'email',
      localValue: local.email,
      externalValue: external.email,
    });
  }

  return diffs;
}

function compareInvoice(
  local: InvoiceInput,
  external: ExternalInvoice,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (!valuesEqual(local.totalAmount, external.totalAmount)) {
    diffs.push({
      field: 'totalAmount',
      localValue: local.totalAmount,
      externalValue: external.totalAmount,
    });
  }
  if (local.invoiceNumber !== external.invoiceNumber) {
    diffs.push({
      field: 'invoiceNumber',
      localValue: local.invoiceNumber,
      externalValue: external.invoiceNumber,
    });
  }

  return diffs;
}

function compareVendor(
  local: VendorInput,
  external: ExternalVendor,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (local.name !== external.name) {
    diffs.push({
      field: 'name',
      localValue: local.name,
      externalValue: external.name,
    });
  }
  if (local.email !== external.email) {
    diffs.push({
      field: 'email',
      localValue: local.email,
      externalValue: external.email,
    });
  }

  return diffs;
}

function compareBill(local: BillInput, external: ExternalBill): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (!valuesEqual(local.totalAmount, external.totalAmount)) {
    diffs.push({
      field: 'totalAmount',
      localValue: local.totalAmount,
      externalValue: external.totalAmount,
    });
  }

  return diffs;
}

function comparePayment(
  local: PaymentInput,
  external: ExternalPayment,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  if (!valuesEqual(local.amount, external.amount)) {
    diffs.push({
      field: 'amount',
      localValue: local.amount,
      externalValue: external.amount,
    });
  }

  return diffs;
}

// =============================================================================
// Webhook Operations
// =============================================================================

class QuickBooksWebhookOperations implements WebhookOperations {
  constructor(private options: QuickBooksOptions) {}

  /**
   * Verify webhook signature using HMAC-SHA256
   * @see https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/verify-webhooks
   */
  verify(payload: string, signature: string, secret: string): boolean {
    // Use provided secret or fall back to configured webhook verifier token
    const verifierToken = secret || this.options.webhookVerifierToken;

    if (!verifierToken) {
      throw new Error(
        'Webhook verifier token not provided. Pass it as the secret parameter or configure webhookVerifierToken in options.',
      );
    }

    // QBO uses HMAC-SHA256 and base64 encodes the signature
    const hmac = createHmac('sha256', verifierToken);
    hmac.update(payload);
    const expectedSignature = hmac.digest('base64');

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  }

  parse(payload: string): WebhookEvent {
    let data: QBOWebhookPayload;
    try {
      data = JSON.parse(payload) as QBOWebhookPayload;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown JSON parse error';
      throw new Error(`Invalid QuickBooks webhook payload: ${message}`);
    }

    // QBO webhook payload structure
    const eventNotifications = data.eventNotifications || [];
    const firstEvent = eventNotifications[0]?.dataChangeEvent?.entities?.[0];

    return {
      type: firstEvent?.operation || 'unknown',
      provider: 'quickbooks',
      timestamp: new Date(),
      payload: data,
      resourceType: mapQBOResourceType(firstEvent?.name),
      resourceId: firstEvent?.id,
    };
  }
}

function mapQBOResourceType(
  name?: string,
): WebhookEvent['resourceType'] | undefined {
  switch (name?.toLowerCase()) {
    case 'customer':
      return 'customer';
    case 'invoice':
      return 'invoice';
    case 'payment':
      return 'payment';
    case 'vendor':
      return 'vendor';
    case 'bill':
      return 'bill';
    default:
      return undefined;
  }
}

// =============================================================================
// Mapping Functions
// =============================================================================

function mapCustomerToQBO(customer: CustomerInput): QBOCustomerCreate {
  return {
    DisplayName: customer.name,
    PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
    PrimaryPhone: customer.phone
      ? { FreeFormNumber: customer.phone }
      : undefined,
    BillAddr: mapAddressToQBO(customer.billingAddress),
    ShipAddr: mapAddressToQBO(customer.shippingAddress),
    CurrencyRef: customer.currency ? { value: customer.currency } : undefined,
  };
}

function mapQBOToCustomer(qbo: QBOCustomer): ExternalCustomer {
  return {
    externalId: qbo.Id,
    provider: 'quickbooks',
    syncedAt: new Date(),
    name: qbo.DisplayName,
    email: qbo.PrimaryEmailAddr?.Address,
    phone: qbo.PrimaryPhone?.FreeFormNumber,
    billingAddress: mapQBOToAddress(qbo.BillAddr),
    balance: qbo.Balance,
    currency: qbo.CurrencyRef?.value,
    raw: qbo,
  };
}

function mapInvoiceToQBO(invoice: InvoiceInput): QBOInvoiceCreate {
  return {
    CustomerRef: { value: invoice.customerExternalId || invoice.customerId },
    DocNumber: invoice.invoiceNumber,
    TxnDate: formatLocalDate(invoice.issueDate),
    DueDate: formatLocalDate(invoice.dueDate),
    Line: invoice.lineItems.map((item, idx) => ({
      LineNum: idx + 1,
      Description: item.description,
      Amount: item.amount ?? item.quantity * item.unitPrice,
      DetailType: 'SalesItemLineDetail' as const,
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: item.unitPrice,
      },
    })),
    CurrencyRef: invoice.currency ? { value: invoice.currency } : undefined,
    CustomerMemo: invoice.memo ? { value: invoice.memo } : undefined,
  };
}

function mapQBOToInvoice(qbo: QBOInvoice): ExternalInvoice {
  const balance = qbo.Balance ?? 0;
  const totalAmount = qbo.TotalAmt ?? 0;

  return {
    externalId: qbo.Id,
    provider: 'quickbooks',
    syncedAt: new Date(),
    invoiceNumber: qbo.DocNumber || '',
    customerExternalId: qbo.CustomerRef?.value || '',
    issueDate: new Date(qbo.TxnDate),
    dueDate: new Date(qbo.DueDate),
    subtotal: totalAmount - (qbo.TxnTaxDetail?.TotalTax ?? 0),
    taxAmount: qbo.TxnTaxDetail?.TotalTax ?? 0,
    totalAmount,
    amountPaid: totalAmount - balance,
    balance,
    status: mapInvoiceStatus(balance, totalAmount, qbo.DueDate),
    currency: qbo.CurrencyRef?.value || 'USD',
    raw: qbo,
  };
}

function mapInvoiceStatus(
  balance: number,
  total: number,
  dueDate: string,
): ExternalInvoice['status'] {
  if (balance === 0) return 'paid';
  if (balance < total) return 'viewed'; // Partial payment
  if (new Date(dueDate) < new Date()) return 'overdue';
  return 'sent';
}

function mapVendorToQBO(vendor: VendorInput): QBOVendorCreate {
  return {
    DisplayName: vendor.name,
    PrimaryEmailAddr: vendor.email ? { Address: vendor.email } : undefined,
    PrimaryPhone: vendor.phone ? { FreeFormNumber: vendor.phone } : undefined,
    BillAddr: mapAddressToQBO(vendor.address),
    TaxIdentifier: vendor.taxId,
    CurrencyRef: vendor.currency ? { value: vendor.currency } : undefined,
  };
}

function mapQBOToVendor(qbo: QBOVendor): ExternalVendor {
  return {
    externalId: qbo.Id,
    provider: 'quickbooks',
    syncedAt: new Date(),
    name: qbo.DisplayName,
    email: qbo.PrimaryEmailAddr?.Address,
    phone: qbo.PrimaryPhone?.FreeFormNumber,
    address: mapQBOToAddress(qbo.BillAddr),
    balance: qbo.Balance,
    currency: qbo.CurrencyRef?.value,
    raw: qbo,
  };
}

function mapBillToQBO(bill: BillInput): QBOBillCreate {
  return {
    VendorRef: { value: bill.vendorExternalId || bill.vendorId },
    DocNumber: bill.billNumber,
    TxnDate: formatLocalDate(bill.billDate),
    DueDate: formatLocalDate(bill.dueDate),
    Line: bill.lineItems.map((item, idx) => ({
      LineNum: idx + 1,
      Description: item.description,
      Amount: item.amount ?? item.quantity * item.unitPrice,
      DetailType: 'AccountBasedExpenseLineDetail' as const,
      AccountBasedExpenseLineDetail: {
        AccountRef: item.accountCode ? { value: item.accountCode } : undefined,
      },
    })),
    CurrencyRef: bill.currency ? { value: bill.currency } : undefined,
  };
}

function mapQBOToBill(qbo: QBOBill): ExternalBill {
  const balance = qbo.Balance ?? 0;
  const totalAmount = qbo.TotalAmt ?? 0;

  return {
    externalId: qbo.Id,
    provider: 'quickbooks',
    syncedAt: new Date(),
    billNumber: qbo.DocNumber,
    vendorExternalId: qbo.VendorRef?.value || '',
    billDate: new Date(qbo.TxnDate),
    dueDate: new Date(qbo.DueDate),
    subtotal: totalAmount - (qbo.TxnTaxDetail?.TotalTax ?? 0),
    taxAmount: qbo.TxnTaxDetail?.TotalTax ?? 0,
    totalAmount,
    amountPaid: totalAmount - balance,
    balance,
    status: mapBillStatus(balance, totalAmount, qbo.DueDate),
    currency: qbo.CurrencyRef?.value || 'USD',
    raw: qbo,
  };
}

function mapBillStatus(
  balance: number,
  total: number,
  dueDate: string,
): ExternalBill['status'] {
  if (balance === 0) return 'paid';
  if (new Date(dueDate) < new Date()) return 'overdue';
  return 'pending';
}

function mapQBOToPayment(qbo: QBOPayment): ExternalPayment {
  return {
    externalId: qbo.Id,
    provider: 'quickbooks',
    syncedAt: new Date(),
    amount: qbo.TotalAmt ?? 0,
    currency: qbo.CurrencyRef?.value || 'USD',
    paidAt: new Date(qbo.TxnDate),
    method: qbo.PaymentMethodRef?.name,
    transactionId: qbo.PaymentRefNum,
    invoiceExternalIds: qbo.Line?.filter((l) => l.LinkedTxn).flatMap(
      (l) => l.LinkedTxn?.map((t) => t.TxnId) || [],
    ),
    status: 'completed',
    raw: qbo,
  };
}

function mapAddressToQBO(address?: Address): QBOAddress | undefined {
  if (!address) return undefined;
  return {
    Line1: address.street1,
    Line2: address.street2,
    City: address.city,
    CountrySubDivisionCode: address.state,
    PostalCode: address.postalCode,
    Country: address.country,
  };
}

function mapQBOToAddress(qbo?: QBOAddress): Address | undefined {
  if (!qbo) return undefined;
  return {
    street1: qbo.Line1,
    street2: qbo.Line2,
    city: qbo.City,
    state: qbo.CountrySubDivisionCode,
    postalCode: qbo.PostalCode,
    country: qbo.Country,
  };
}

// =============================================================================
// QBO API Types (internal, strongly typed)
// =============================================================================

interface QBORef {
  value: string;
  name?: string;
}

interface QBOAddress {
  Line1?: string;
  Line2?: string;
  City?: string;
  CountrySubDivisionCode?: string;
  PostalCode?: string;
  Country?: string;
}

interface QBOEmail {
  Address: string;
}

interface QBOPhone {
  FreeFormNumber: string;
}

// Customer types
interface QBOCustomerBase {
  DisplayName: string;
  PrimaryEmailAddr?: QBOEmail;
  PrimaryPhone?: QBOPhone;
  BillAddr?: QBOAddress;
  ShipAddr?: QBOAddress;
  Balance?: number;
  CurrencyRef?: QBORef;
}

interface QBOCustomerCreate extends QBOCustomerBase {}

interface QBOCustomerUpdate extends QBOCustomerBase {
  Id: string;
  SyncToken: string;
}

interface QBOCustomer extends QBOCustomerBase {
  Id: string;
  SyncToken: string;
}

// Invoice types
interface QBOInvoiceLine {
  LineNum: number;
  Description?: string;
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail?: {
    Qty?: number;
    UnitPrice?: number;
    ItemRef?: QBORef;
  };
}

interface QBOInvoiceBase {
  CustomerRef: QBORef;
  DocNumber?: string;
  TxnDate: string;
  DueDate: string;
  Line: QBOInvoiceLine[];
  TotalAmt?: number;
  Balance?: number;
  TxnTaxDetail?: {
    TotalTax?: number;
  };
  CurrencyRef?: QBORef;
  CustomerMemo?: { value: string };
}

interface QBOInvoiceCreate extends QBOInvoiceBase {}

interface QBOInvoiceUpdate extends QBOInvoiceBase {
  Id: string;
  SyncToken: string;
}

interface QBOInvoice extends QBOInvoiceBase {
  Id: string;
  SyncToken: string;
}

// Vendor types
interface QBOVendorBase {
  DisplayName: string;
  PrimaryEmailAddr?: QBOEmail;
  PrimaryPhone?: QBOPhone;
  BillAddr?: QBOAddress;
  Balance?: number;
  TaxIdentifier?: string;
  CurrencyRef?: QBORef;
}

interface QBOVendorCreate extends QBOVendorBase {}

interface QBOVendorUpdate extends QBOVendorBase {
  Id: string;
  SyncToken: string;
}

interface QBOVendor extends QBOVendorBase {
  Id: string;
  SyncToken: string;
}

// Bill types
interface QBOBillLine {
  LineNum: number;
  Description?: string;
  Amount: number;
  DetailType: 'AccountBasedExpenseLineDetail';
  AccountBasedExpenseLineDetail?: {
    AccountRef?: QBORef;
  };
}

interface QBOBillBase {
  VendorRef: QBORef;
  DocNumber?: string;
  TxnDate: string;
  DueDate: string;
  Line: QBOBillLine[];
  TotalAmt?: number;
  Balance?: number;
  TxnTaxDetail?: {
    TotalTax?: number;
  };
  CurrencyRef?: QBORef;
}

interface QBOBillCreate extends QBOBillBase {}

interface QBOBillUpdate extends QBOBillBase {
  Id: string;
  SyncToken: string;
}

interface QBOBill extends QBOBillBase {
  Id: string;
  SyncToken: string;
}

// Payment types
interface QBOPaymentLine {
  Amount: number;
  LinkedTxn?: {
    TxnId: string;
    TxnType: string;
  }[];
}

interface QBOPayment {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  TotalAmt?: number;
  CustomerRef?: QBORef;
  PaymentMethodRef?: QBORef;
  PaymentRefNum?: string;
  Line?: QBOPaymentLine[];
  CurrencyRef?: QBORef;
}

// Webhook types
interface QBOWebhookPayload {
  eventNotifications?: {
    realmId: string;
    dataChangeEvent?: {
      entities?: {
        name: string;
        id: string;
        operation: string;
        lastUpdated: string;
      }[];
    };
  }[];
}
