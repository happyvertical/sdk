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
  /** Stripe API version sent on requests */
  apiVersion?: string;
  /** Stripe API base URL, primarily useful for tests */
  apiBaseUrl?: string;
  /** Stripe webhook endpoint secret */
  webhookSecret?: string;
  /** Maximum webhook signature age in seconds. Defaults to 300 seconds. */
  webhookTolerance?: number;
  /** Fetch implementation override, primarily useful for tests */
  fetch?: typeof fetch;
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
  /**
   * Stable caller-owned key for creating this provider customer exactly once.
   * Used only when the customer has no `externalId` yet. A retry with the same
   * key returns the customer the first attempt created: Stripe replays the
   * create inside its idempotency window, and after it the adapter finds the
   * customer by the `local_id` it tags on every customer. Reuse the key only
   * for the same customer contents.
   */
  idempotencyKey?: string;
}

/**
 * How a provider collects an invoice.
 *
 * - `send_invoice`: the customer is sent a payable invoice (default).
 * - `charge_automatically`: the provider charges the customer's saved default
 *   payment method when the invoice is sent, and its own retry/dunning rules
 *   apply to failures. Providers that cannot charge a stored payment method
 *   (for example, push-payment rails such as BTC) must reject it rather than
 *   silently falling back to `send_invoice`.
 */
export type InvoiceCollectionMethod = 'send_invoice' | 'charge_automatically';

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
  /**
   * Unit price in the currency's major unit (for example, `12.34` USD or
   * `1200` JPY). The Stripe provider converts this value to Stripe's smallest
   * currency unit.
   */
  unitPrice: number;
  /**
   * Total discount for this line (not per unit), in the currency's major
   * unit. Must be between 0 and `quantity × unitPrice`. The Stripe provider
   * applies it as an amount-off discount on the invoice item, so the invoice
   * shows the discount and Stripe Tax taxes the discounted amount.
   */
  discount?: number;
  /** Tax rate (decimal, e.g., 0.0825 for 8.25%) */
  taxRate?: number;
  /** Calculated line total */
  amount?: number;
  /**
   * Service period start. Set together with `periodEnd`; the Stripe provider
   * sends both as the invoice item's `period` (Unix seconds).
   */
  periodStart?: Date;
  /**
   * Service period end, exclusive (the instant the next period starts), which
   * is also how Stripe reports subscription line periods. Must not be before
   * `periodStart`.
   */
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
  /** Subtotal before tax, in the currency's major unit. */
  subtotal: number;
  /** Tax amount in the currency's major unit. Ignored by Stripe when automaticTax is enabled. */
  taxAmount: number;
  /** Total amount in the currency's major unit. */
  totalAmount: number;
  /** Currency code (ISO 4217) */
  currency?: string;
  /** External reference (e.g., PO number) */
  reference?: string;
  /** Invoice memo/notes */
  memo?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /**
   * Stable caller-owned key for replaying the same provider invoice. Stripe
   * invoice-item and invoice requests derive deterministic provider keys from
   * it, and the adapter reconciles tagged provider resources after Stripe's
   * idempotency retention window.
   */
  idempotencyKey?: string;
  /**
   * Ask Stripe Tax to calculate tax from the synced customer's billing
   * address. The provider-calculated amount is returned by invoice reads.
   */
  automaticTax?: boolean;
  /**
   * How the provider collects this invoice. Defaults to `send_invoice`. With
   * `charge_automatically`, Stripe charges the customer's default payment
   * method (see `billing.setDefaultPaymentMethod`) after the invoice is sent,
   * on Stripe's own collection schedule (not necessarily immediately), and
   * Stripe's retry settings drive `invoice.payment_failed` / `invoice.paid`
   * webhooks. `dueDate` is not sent for automatically charged invoices. On
   * `sync()` of an existing invoice, a set `collectionMethod` is sent too;
   * Stripe only allows changing it while the invoice is a draft.
   */
  collectionMethod?: InvoiceCollectionMethod;
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
  /** Monetary values are in the currency's major unit. */
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  /**
   * `uncollectible` is an open balance the seller has written off (Stripe
   * `uncollectible`); it can still be paid or voided later.
   */
  status:
    | 'draft'
    | 'sent'
    | 'viewed'
    | 'paid'
    | 'overdue'
    | 'voided'
    | 'uncollectible';
  currency: string;
  /**
   * The invoice was closed as paid outside the provider (Stripe
   * `paid_out_of_band`), for example after a payment on another rail.
   */
  paidOutOfBand?: boolean;
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
// Saved Payment Method Charges (provider-neutral)
// =============================================================================

/**
 * Outcome of a merchant-initiated charge.
 *
 * - `succeeded`: funds are secured.
 * - `processing`: the provider accepted the charge but settlement is pending;
 *   wait for the payment webhook before granting value.
 * - `requires_action`: the issuer requires customer authentication (for
 *   example 3-D Secure); nothing was charged. Results never carry the
 *   provider's client secret, so do not try to complete this attempt: next
 *   time the customer is present, have them re-save the card (Stripe:
 *   `setup` mode Checkout, then `setDefaultPaymentMethod`) and charge again
 *   under a new idempotency key.
 * - `failed`: declined or unusable payment method; nothing was charged.
 * - `canceled`: the payment was canceled before completion (webhooks only).
 */
export type PaymentChargeStatus =
  | 'succeeded'
  | 'processing'
  | 'requires_action'
  | 'failed'
  | 'canceled';

/**
 * Charge a customer's saved payment method without the customer present
 * (off-session), for example to top up a prepaid balance.
 *
 * Amounts are **integer minor units** of `currency`: the ISO 4217 minor unit
 * (`1999` USD = 19.99, `1200` JPY = 1200). A provider for a non-ISO asset
 * documents its smallest unit (for example satoshis for BTC). Providers
 * convert to their own representation at the boundary.
 */
export interface SavedPaymentMethodChargeInput {
  /** Provider customer that owns the saved payment method. */
  customerExternalId: string;
  /**
   * Saved payment method to charge. Omit to charge the customer's default
   * payment method; a customer without one yields a `failed` result with
   * `failureCode: 'payment_method_missing'` and no provider charge.
   */
  paymentMethodExternalId?: string;
  /**
   * Positive integer minor units of `currency`, by the ISO 4217 exponent
   * (not the runtime's `Intl` display digits, which differ for a few
   * currencies such as RSD and IQD).
   */
  amountMinor: number;
  /** ISO 4217 currency code (case-insensitive). */
  currency: string;
  /**
   * Required stable caller-owned key for this logical charge. Every retry
   * with the same key returns the original charge instead of charging again,
   * including after the provider's own idempotency window. Providers tag the
   * charge with it, and payment webhooks report it as `chargeKey`. Scope it
   * to the payer (keys are global to the provider account) and use a new key
   * for a new attempt: a key reused with a different amount, currency, or
   * customer is refused, not charged. A different explicit payment method is
   * refused too; a change of the customer's default between retries is
   * refused only inside the provider's idempotency window (Stripe
   * `idempotency_error`) and afterwards returns the original charge, which
   * reports the method it actually used. Pass `paymentMethodExternalId` to
   * pin the method.
   */
  idempotencyKey: string;
  /** Statement/description text shown to the customer where supported. */
  description?: string;
  /** Opaque values stored on the provider charge and returned by webhooks. */
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

export interface SavedPaymentMethodChargeResult {
  status: PaymentChargeStatus;
  provider: AccountingProviderType;
  /** Provider payment id (Stripe PaymentIntent), when one was created. */
  paymentExternalId?: string;
  customerExternalId: string;
  paymentMethodExternalId?: string;
  /** Integer minor units of `currency`. */
  amountMinor: number;
  /** Upper-case ISO 4217 code. */
  currency: string;
  /** The caller's `idempotencyKey`. */
  chargeKey: string;
  /** Provider failure code (for example `card_declined`, `authentication_required`). */
  failureCode?: string;
  /** Issuer decline code, when the provider reports one. */
  declineCode?: string;
  /** Provider failure message, safe to log (contains no card data). */
  failureMessage?: string;
  raw?: unknown;
}

/**
 * Payment lifecycle facts normalized from a verified webhook, so hosts can
 * settle merchant-initiated charges without parsing provider payloads.
 */
export interface WebhookPaymentSummary {
  status: PaymentChargeStatus;
  paymentExternalId: string;
  customerExternalId?: string;
  /** Integer minor units, when the provider amount converts exactly. */
  amountMinor?: number;
  /** Upper-case ISO 4217 code. */
  currency?: string;
  /** `idempotencyKey` of the `chargeSavedPaymentMethod` call that created it. */
  chargeKey?: string;
  failureCode?: string;
  declineCode?: string;
  failureMessage?: string;
  metadata: Record<string, string>;
}

// =============================================================================
// Stripe Billing Types
// =============================================================================

export type StripeCheckoutMode = 'payment' | 'setup' | 'subscription';

export type StripeSubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid';

export interface StripeRecurringPriceData {
  interval: 'day' | 'week' | 'month' | 'year';
  intervalCount?: number;
}

export interface StripeCheckoutPriceData {
  currency: string;
  /**
   * Unit amount in **Stripe's** smallest currency unit, passed through
   * unconverted. Stripe's unit differs from the ISO 4217 minor unit for some
   * currencies (for example ISK and UGX); prefer `unitAmountMinor`. Set
   * exactly one of `unitAmount` and `unitAmountMinor`.
   */
  unitAmount?: number;
  /**
   * Unit amount in integer ISO 4217 minor units (`1999` USD, `1200` JPY),
   * converted to Stripe's unit by the adapter.
   */
  unitAmountMinor?: number;
  /**
   * Stripe Tax behavior of this ad-hoc price. Defaults to `exclusive` when the
   * session sets `automaticTax`.
   */
  taxBehavior?: 'exclusive' | 'inclusive' | 'unspecified';
  product?: string;
  productName?: string;
  recurring?: StripeRecurringPriceData;
}

export interface StripeCheckoutLineItem {
  price?: string;
  priceData?: StripeCheckoutPriceData;
  quantity?: number;
}

export interface StripeCheckoutCustomerUpdate {
  /** `auto` saves the address collected in Checkout to the customer. */
  address?: 'auto' | 'never';
  name?: 'auto' | 'never';
  shipping?: 'auto' | 'never';
}

export interface StripeCheckoutSessionInput {
  /** Defaults to `subscription`. */
  mode?: StripeCheckoutMode;
  successUrl: string;
  cancelUrl: string;
  customerExternalId?: string;
  customerEmail?: string;
  clientReferenceId?: string;
  /**
   * Required in `payment` and `subscription` mode; must be omitted in `setup`
   * mode, which saves a payment method without charging.
   */
  lineItems?: StripeCheckoutLineItem[];
  metadata?: Record<string, string | number | boolean | null | undefined>;
  allowPromotionCodes?: boolean;
  /** Stable caller-owned key reused when creating the same Checkout Session. */
  idempotencyKey?: string;
  /**
   * Calculate tax with Stripe Tax (`automatic_tax[enabled]`). Stripe needs
   * the buyer's location: collect it with `billingAddressCollection`, or for
   * an existing customer without an address set `customerUpdate.address:
   * 'auto'`. Not valid in `setup` mode.
   */
  automaticTax?: boolean;
  /** Collect the billing address (`auto` collects it only when needed). */
  billingAddressCollection?: 'auto' | 'required';
  /** Save details collected in Checkout back to `customerExternalId`. */
  customerUpdate?: StripeCheckoutCustomerUpdate;
  /**
   * Three-letter currency. Required in `setup` mode unless
   * `paymentMethodTypes` is set.
   */
  currency?: string;
  /** Restrict payment method types (for example `['card']`). */
  paymentMethodTypes?: string[];
  /**
   * `payment` mode only: also save the payment method for later
   * (`payment_intent_data[setup_future_usage]`); `off_session` allows later
   * merchant-initiated charges such as automatic top-ups.
   */
  setupFutureUsage?: 'off_session' | 'on_session';
}

export interface StripeCheckoutSession {
  externalId: string;
  url: string | null;
  mode?: StripeCheckoutMode;
  customerExternalId?: string;
  subscriptionExternalId?: string;
  paymentIntentExternalId?: string;
  /** SetupIntent of a `setup` mode session. */
  setupIntentExternalId?: string;
  raw?: unknown;
}

/**
 * A retrieved Checkout Session, with the saved payment method resolved from
 * its SetupIntent (`setup` mode) or PaymentIntent (`payment` mode).
 */
export interface StripeCheckoutSessionDetails extends StripeCheckoutSession {
  status?: 'open' | 'complete' | 'expired';
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required';
  /** The payment method the session collected, once complete. */
  paymentMethodExternalId?: string;
  /** Upper-case ISO 4217 code. */
  currency?: string;
  /** Line-item amount before discounts and tax, integer ISO minor units. */
  amountSubtotalMinor?: number;
  /** Tax calculated by Stripe Tax, integer ISO minor units. */
  amountTaxMinor?: number;
  /** Amount collected, integer ISO minor units. */
  amountTotalMinor?: number;
  metadata: Record<string, string>;
}

export interface StripeCustomerPortalSessionInput {
  customerExternalId: string;
  returnUrl: string;
  configurationExternalId?: string;
}

export interface StripeCustomerPortalSession {
  externalId: string;
  url: string;
  raw?: unknown;
}

export interface StripeSubscriptionStatusResult {
  externalId: string;
  status: StripeSubscriptionStatus;
  customerExternalId: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialEnd?: Date;
  raw?: unknown;
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
  /** Verified provider event identifier for durable inbox deduplication. */
  id?: string;
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
  /**
   * Normalized payment facts for payment events (Stripe `payment_intent.*`),
   * including charges made by `payments.chargeSavedPaymentMethod`.
   */
  payment?: WebhookPaymentSummary;
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
  /**
   * Write off an open invoice as uncollectible. Optional: providers without
   * the concept omit it.
   */
  markUncollectible?(externalId: string): Promise<void>;
  /**
   * Close an invoice as paid outside the provider, stopping its collection
   * (emails, dunning, automatic charges). Idempotent: an invoice already
   * closed this way is a no-op; one the provider collected itself throws.
   * Optional: providers without the concept omit it.
   */
  markPaidOutOfBand?(externalId: string): Promise<void>;
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
  /**
   * Charge a saved payment method off-session, idempotently by
   * `input.idempotencyKey`. Optional: providers that cannot pull funds from a
   * stored payment method (for example push-payment rails such as BTC) omit
   * it, which is how callers detect the capability.
   */
  chargeSavedPaymentMethod?(
    input: SavedPaymentMethodChargeInput,
  ): Promise<SavedPaymentMethodChargeResult>;
}

/**
 * Stripe billing operations interface.
 *
 * These operations are Stripe-specific because billing portals and checkout
 * sessions are payment-provider products rather than portable accounting
 * concepts.
 */
export interface StripeBillingOperations {
  /** Create a Stripe Checkout Session */
  createCheckoutSession(
    input: StripeCheckoutSessionInput,
  ): Promise<StripeCheckoutSession>;
  /**
   * Retrieve a Checkout Session, resolving the payment method it collected
   * (use after a `setup` mode session completes). Optional so existing
   * structural implementations keep compiling; `StripeProvider` implements it.
   */
  retrieveCheckoutSession?(
    sessionExternalId: string,
  ): Promise<StripeCheckoutSessionDetails>;
  /**
   * Make a saved payment method the customer's default for invoices and for
   * `payments.chargeSavedPaymentMethod` without an explicit method. Optional
   * for the same reason; `StripeProvider` implements it.
   */
  setDefaultPaymentMethod?(
    customerExternalId: string,
    paymentMethodExternalId: string,
  ): Promise<void>;
  /** Create a Stripe Customer Portal Session */
  createCustomerPortalSession(
    input: StripeCustomerPortalSessionInput,
  ): Promise<StripeCustomerPortalSession>;
  /** Retrieve a Stripe subscription status summary */
  retrieveSubscriptionStatus(
    subscriptionExternalId: string,
  ): Promise<StripeSubscriptionStatusResult>;
  /** List Stripe subscription status summaries for a customer */
  listCustomerSubscriptions(
    customerExternalId: string,
  ): Promise<StripeSubscriptionStatusResult[]>;
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

/**
 * Stripe provider interface with provider-specific billing operations.
 */
export interface StripeAccountingProvider extends AccountingProvider {
  readonly type: 'stripe';
  billing: StripeBillingOperations;
}
