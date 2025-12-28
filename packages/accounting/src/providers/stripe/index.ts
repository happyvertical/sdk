/**
 * Stripe Provider (Stub)
 *
 * Placeholder for Stripe accounting provider implementation.
 * Stripe supports invoicing and payment processing.
 */

import type {
  AccountingProvider,
  AuditOperations,
  BillOperations,
  CustomerOperations,
  InvoiceOperations,
  PaymentOperations,
  StripeOptions,
  VendorOperations,
  WebhookOperations,
} from '../../types.js';

/**
 * Stripe accounting provider (stub implementation)
 */
export class StripeProvider implements AccountingProvider {
  readonly type = 'stripe' as const;

  private options: StripeOptions;

  readonly customers: CustomerOperations;
  readonly invoices: InvoiceOperations;
  readonly vendors: VendorOperations;
  readonly bills: BillOperations;
  readonly payments: PaymentOperations;
  readonly audit: AuditOperations;
  readonly webhooks: WebhookOperations;

  constructor(options: StripeOptions) {
    this.options = options;

    // Create stub implementations that throw "not implemented" errors
    const notImplemented = (operation: string) => () => {
      throw new Error(`Stripe ${operation} not yet implemented`);
    };

    this.customers = {
      push: notImplemented('customers.push'),
      pull: notImplemented('customers.pull'),
      list: notImplemented('customers.list'),
      sync: notImplemented('customers.sync'),
    };

    this.invoices = {
      push: notImplemented('invoices.push'),
      pull: notImplemented('invoices.pull'),
      list: notImplemented('invoices.list'),
      sync: notImplemented('invoices.sync'),
      send: notImplemented('invoices.send'),
      void: notImplemented('invoices.void'),
    };

    this.vendors = {
      push: notImplemented('vendors.push'),
      pull: notImplemented('vendors.pull'),
      list: notImplemented('vendors.list'),
      sync: notImplemented('vendors.sync'),
    };

    this.bills = {
      push: notImplemented('bills.push'),
      pull: notImplemented('bills.pull'),
      list: notImplemented('bills.list'),
      sync: notImplemented('bills.sync'),
    };

    this.payments = {
      pull: notImplemented('payments.pull'),
      list: notImplemented('payments.list'),
    };

    this.audit = {
      reconcileCustomers: notImplemented('audit.reconcileCustomers'),
      reconcileInvoices: notImplemented('audit.reconcileInvoices'),
      reconcileVendors: notImplemented('audit.reconcileVendors'),
      reconcileBills: notImplemented('audit.reconcileBills'),
      reconcilePayments: notImplemented('audit.reconcilePayments'),
    };

    this.webhooks = {
      verify: () => {
        throw new Error('Stripe webhooks.verify not yet implemented');
      },
      parse: () => {
        throw new Error('Stripe webhooks.parse not yet implemented');
      },
    };
  }
}
