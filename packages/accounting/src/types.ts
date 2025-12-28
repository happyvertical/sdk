/**
 * @happyvertical/accounting - Type definitions
 *
 * Core interfaces for accounting provider abstraction.
 * These types define the contract between SMRT models and external providers.
 */

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported accounting provider types
 */
export type AccountingProviderType =
  | 'quickbooks'
  | 'stripe'
  | 'paypal'
  | 'coinbase';

/**
 * Base options for all providers
 */
export interface BaseAccountingOptions {
  /** Provider type */
  type: AccountingProviderType;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
}

/**
 * QuickBooks Online provider options
 */
export interface QuickBooksOptions extends BaseAccountingOptions {
  type: 'quickbooks';
  /** OAuth client ID */
  clientId: string;
  /** OAuth client secret */
  clientSecret: string;
  /** QBO company/realm ID */
  realmId: string;
  /** OAuth refresh token */
  refreshToken: string;
  /** Environment */
  environment?: 'sandbox' | 'production';
  /** OAuth redirect URI (must match app configuration in Intuit Developer Portal) */
  redirectUri?: string;
  /** Webhook verifier token for signature validation */
  webhookVerifierToken?: string;
  /** Callback when tokens are refreshed (persist to storage) */
  onTokenRefresh?: (tokens: TokenSet) => Promise<void>;
}

/**
 * Stripe provider options
 */
export interface StripeOptions extends BaseAccountingOptions {
  type: 'stripe';
  /** Stripe secret key */
  secretKey: string;
}

/**
 * PayPal provider options (future)
 */
export interface PayPalOptions extends BaseAccountingOptions {
  type: 'paypal';
  /** PayPal client ID */
  clientId: string;
  /** PayPal client secret */
  clientSecret: string;
  /** Environment */
  environment?: 'sandbox' | 'live';
}

/**
 * Coinbase Commerce provider options (future)
 */
export interface CoinbaseOptions extends BaseAccountingOptions {
  type: 'coinbase';
  /** Coinbase Commerce API key */
  apiKey: string;
}

/**
 * Union of all provider options
 */
export type AccountingOptions =
  | QuickBooksOptions
  | StripeOptions
  | PayPalOptions
  | CoinbaseOptions;

/**
 * OAuth token set returned from token refresh
 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType?: string;
}

// =============================================================================
// Input Types (what SMRT models provide)
// =============================================================================

/**
 * Address structure
 */
export interface Address {
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/**
 * Customer input for sync operations
 */
export interface CustomerInput {
  /** Local ID */
  id: string;
  /** External provider ID (if already synced) */
  externalId?: string;
  /** Customer name (individual or company) */
  name: string;
  /** Email address */
  email?: string;
  /** Phone number */
  phone?: string;
  /** Billing address */
  billingAddress?: Address;
  /** Shipping address */
  shippingAddress?: Address;
  /** Tax exempt status */
  taxExempt?: boolean;
  /** Payment terms (e.g., "Net 30") */
  paymentTerms?: string;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Invoice line item input
 */
export interface InvoiceLineItemInput {
  /** Line item description */
  description: string;
  /** SKU or product code */
  sku?: string;
  /** Quantity */
  quantity: number;
  /** Unit price */
  unitPrice: number;
  /** Discount amount */
  discount?: number;
  /** Tax rate (decimal, e.g., 0.0825 for 8.25%) */
  taxRate?: number;
  /** Calculated line total */
  amount?: number;
  /** Service/product date range start */
  periodStart?: Date;
  /** Service/product date range end */
  periodEnd?: Date;
}

/**
 * Invoice input for sync operations
 */
export interface InvoiceInput {
  /** Local ID */
  id: string;
  /** External provider ID (if already synced) */
  externalId?: string;
  /** Invoice number */
  invoiceNumber: string;
  /** Customer local ID */
  customerId: string;
  /** Customer external ID (if already synced) */
  customerExternalId?: string;
  /** Invoice issue date */
  issueDate: Date;
  /** Payment due date */
  dueDate: Date;
  /** Line items */
  lineItems: InvoiceLineItemInput[];
  /** Subtotal before tax */
  subtotal: number;
  /** Tax amount */
  taxAmount: number;
  /** Total amount */
  totalAmount: number;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** External reference (e.g., PO number) */
  reference?: string;
  /** Invoice memo/notes */
  memo?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Vendor input for sync operations (AP side)
 */
export interface VendorInput {
  /** Local ID */
  id: string;
  /** External provider ID (if already synced) */
  externalId?: string;
  /** Vendor/supplier name */
  name: string;
  /** Email address */
  email?: string;
  /** Phone number */
  phone?: string;
  /** Billing address */
  address?: Address;
  /** Tax ID / EIN */
  taxId?: string;
  /** Payment terms */
  paymentTerms?: string;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Bill line item input (AP)
 */
export interface BillLineItemInput {
  /** Line item description */
  description: string;
  /** Account code/number for expense categorization */
  accountCode?: string;
  /** Quantity */
  quantity: number;
  /** Unit price */
  unitPrice: number;
  /** Tax rate */
  taxRate?: number;
  /** Calculated line total */
  amount?: number;
}

/**
 * Bill input for sync operations (AP side)
 */
export interface BillInput {
  /** Local ID */
  id: string;
  /** External provider ID (if already synced) */
  externalId?: string;
  /** Bill/invoice number from vendor */
  billNumber?: string;
  /** Vendor local ID */
  vendorId: string;
  /** Vendor external ID (if already synced) */
  vendorExternalId?: string;
  /** Bill date */
  billDate: Date;
  /** Payment due date */
  dueDate: Date;
  /** Line items */
  lineItems: BillLineItemInput[];
  /** Subtotal before tax */
  subtotal: number;
  /** Tax amount */
  taxAmount: number;
  /** Total amount */
  totalAmount: number;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** Reference/memo */
  reference?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Payment input for sync/audit operations
 */
export interface PaymentInput {
  /** Local ID */
  id: string;
  /** External provider ID (if already synced) */
  externalId?: string;
  /** Payment amount */
  amount: number;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** Payment date */
  paidAt: Date;
  /** Payment method */
  method?:
    | 'cash'
    | 'check'
    | 'credit_card'
    | 'bank_transfer'
    | 'crypto'
    | 'other';
  /** External transaction ID (e.g., Stripe charge ID) */
  transactionId?: string;
  /** Associated invoice IDs */
  invoiceIds?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Output Types (what providers return)
// =============================================================================

/**
 * External record base (what provider returns)
 */
export interface ExternalRecord {
  /** Provider's ID for this record */
  externalId: string;
  /** Provider type */
  provider: AccountingProviderType;
  /** Last sync timestamp */
  syncedAt: Date;
  /** Raw provider response (for debugging) */
  raw?: unknown;
}

/**
 * External customer from provider
 */
export interface ExternalCustomer extends ExternalRecord {
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: Address;
  balance?: number;
  currency?: string;
}

/**
 * External invoice from provider
 */
export interface ExternalInvoice extends ExternalRecord {
  invoiceNumber: string;
  customerExternalId: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'voided';
  currency: string;
}

/**
 * External vendor from provider
 */
export interface ExternalVendor extends ExternalRecord {
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  balance?: number;
  currency?: string;
}

/**
 * External bill from provider
 */
export interface ExternalBill extends ExternalRecord {
  billNumber?: string;
  vendorExternalId: string;
  billDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  status: 'draft' | 'pending' | 'paid' | 'overdue';
  currency: string;
}

/**
 * External payment from provider
 */
export interface ExternalPayment extends ExternalRecord {
  amount: number;
  currency: string;
  paidAt: Date;
  method?: string;
  transactionId?: string;
  invoiceExternalIds?: string[];
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

// =============================================================================
// Sync Result Types
// =============================================================================

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Action taken */
  action: 'created' | 'updated' | 'unchanged';
  /** External provider ID */
  externalId: string;
  /** Sync timestamp */
  syncedAt: Date;
  /** Any warnings during sync */
  warnings?: string[];
}

/**
 * Options for list operations
 */
export interface ListOptions {
  /** Maximum records to return */
  limit?: number;
  /** Pagination offset or cursor */
  offset?: number | string;
  /** Date range filter - start */
  startDate?: Date;
  /** Date range filter - end */
  endDate?: Date;
  /** Status filter */
  status?: string;
}

/**
 * Date range for filtering
 */
export interface DateRange {
  start: Date;
  end: Date;
}

// =============================================================================
// Audit Types
// =============================================================================

/**
 * Matched record in audit
 */
export interface AuditMatch<T> {
  /** Local record */
  local: T;
  /** External record from provider */
  external: ExternalRecord;
  /** Match status */
  status: 'identical' | 'synced';
}

/**
 * Field difference in audit
 */
export interface FieldDiff {
  /** Field name */
  field: string;
  /** Local value */
  localValue: unknown;
  /** External value */
  externalValue: unknown;
}

/**
 * Discrepancy found in audit
 */
export interface AuditDiscrepancy<T> {
  /** Local record */
  local: T;
  /** External record from provider */
  external: ExternalRecord;
  /** Field differences */
  differences: FieldDiff[];
}

/**
 * Audit report for reconciliation
 */
export interface AuditReport<T> {
  /** Provider that was audited */
  provider: AccountingProviderType;
  /** Audit timestamp */
  auditedAt: Date;

  /** Records that match */
  matched: AuditMatch<T>[];
  /** Records only in local (not in provider) */
  localOnly: T[];
  /** Records only in provider (not in local) */
  externalOnly: ExternalRecord[];
  /** Records with differences */
  discrepancies: AuditDiscrepancy<T>[];

  /** Summary statistics */
  summary: {
    total: number;
    matched: number;
    localOnly: number;
    externalOnly: number;
    discrepancies: number;
  };
}

// =============================================================================
// Webhook Types
// =============================================================================

/**
 * Webhook event from provider
 */
export interface WebhookEvent {
  /** Event type */
  type: string;
  /** Provider */
  provider: AccountingProviderType;
  /** Event timestamp */
  timestamp: Date;
  /** Event payload */
  payload: unknown;
  /** Associated resource type */
  resourceType?: 'customer' | 'invoice' | 'payment' | 'vendor' | 'bill';
  /** Associated resource external ID */
  resourceId?: string;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Customer operations interface
 */
export interface CustomerOperations {
  /** Push local customer to provider */
  push(customer: CustomerInput): Promise<SyncResult>;
  /** Pull customer from provider by external ID */
  pull(externalId: string): Promise<ExternalCustomer>;
  /** List customers from provider */
  list(options?: ListOptions): Promise<ExternalCustomer[]>;
  /** Sync customer (create or update) */
  sync(customer: CustomerInput): Promise<SyncResult>;
}

/**
 * Invoice operations interface
 */
export interface InvoiceOperations {
  /** Push local invoice to provider */
  push(invoice: InvoiceInput): Promise<SyncResult>;
  /** Pull invoice from provider by external ID */
  pull(externalId: string): Promise<ExternalInvoice>;
  /** List invoices from provider */
  list(options?: ListOptions): Promise<ExternalInvoice[]>;
  /** Sync invoice (create or update) */
  sync(invoice: InvoiceInput): Promise<SyncResult>;
  /** Send invoice to customer */
  send(externalId: string): Promise<void>;
  /** Void/cancel invoice */
  void(externalId: string): Promise<void>;
}

/**
 * Vendor operations interface
 */
export interface VendorOperations {
  /** Push local vendor to provider */
  push(vendor: VendorInput): Promise<SyncResult>;
  /** Pull vendor from provider by external ID */
  pull(externalId: string): Promise<ExternalVendor>;
  /** List vendors from provider */
  list(options?: ListOptions): Promise<ExternalVendor[]>;
  /** Sync vendor (create or update) */
  sync(vendor: VendorInput): Promise<SyncResult>;
}

/**
 * Bill operations interface (AP)
 */
export interface BillOperations {
  /** Push local bill to provider */
  push(bill: BillInput): Promise<SyncResult>;
  /** Pull bill from provider by external ID */
  pull(externalId: string): Promise<ExternalBill>;
  /** List bills from provider */
  list(options?: ListOptions): Promise<ExternalBill[]>;
  /** Sync bill (create or update) */
  sync(bill: BillInput): Promise<SyncResult>;
}

/**
 * Payment operations interface
 */
export interface PaymentOperations {
  /** Pull payment from provider by external ID */
  pull(externalId: string): Promise<ExternalPayment>;
  /** List payments from provider */
  list(options?: ListOptions): Promise<ExternalPayment[]>;
}

/**
 * Audit operations interface
 */
export interface AuditOperations {
  /** Reconcile local customers against provider */
  reconcileCustomers(
    locals: CustomerInput[],
  ): Promise<AuditReport<CustomerInput>>;
  /** Reconcile local invoices against provider */
  reconcileInvoices(
    locals: InvoiceInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<InvoiceInput>>;
  /** Reconcile local vendors against provider */
  reconcileVendors(locals: VendorInput[]): Promise<AuditReport<VendorInput>>;
  /** Reconcile local bills against provider */
  reconcileBills(
    locals: BillInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<BillInput>>;
  /** Reconcile local payments against provider */
  reconcilePayments(
    locals: PaymentInput[],
    dateRange?: DateRange,
  ): Promise<AuditReport<PaymentInput>>;
}

/**
 * Webhook operations interface
 */
export interface WebhookOperations {
  /** Verify webhook signature */
  verify(payload: string, signature: string, secret: string): boolean;
  /** Parse webhook payload */
  parse(payload: string): WebhookEvent;
}

/**
 * Main accounting provider interface
 */
export interface AccountingProvider {
  /** Provider type */
  readonly type: AccountingProviderType;

  // AR: Accounts Receivable
  /** Customer operations */
  customers: CustomerOperations;
  /** Invoice operations */
  invoices: InvoiceOperations;

  // AP: Accounts Payable
  /** Vendor operations */
  vendors: VendorOperations;
  /** Bill operations */
  bills: BillOperations;

  // Shared
  /** Payment operations */
  payments: PaymentOperations;

  // Audit & Reconciliation
  /** Audit operations */
  audit: AuditOperations;

  // Webhooks
  /** Webhook operations */
  webhooks: WebhookOperations;
}
