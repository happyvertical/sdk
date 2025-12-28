# @happyvertical/accounting: Multi-Provider Accounting Integration

## Purpose and Responsibilities

The `@happyvertical/accounting` package provides a unified interface for syncing and auditing accounting data (AR/AP) with external providers like QuickBooks Online, Stripe, PayPal, and Coinbase Commerce.

### Key Responsibilities

- **Sync Operations**: Push local SMRT data to external providers, pull updates from providers
- **Audit/Reconciliation**: Compare local data against provider data to find discrepancies
- **Provider Abstraction**: Single interface for multiple accounting providers
- **OAuth Token Management**: Handle token refresh for OAuth-based providers
- **Webhook Processing**: Verify and parse incoming webhooks from providers

### Architecture Position

```
SMRT (source of truth)              SDK (bridge)                 External
─────────────────────               ────────────                 ────────
smrt-commerce                       @have/accounting             QuickBooks
  Customer, Vendor                    ↔ sync/audit ↔              QBO API
  Contract (Order, PO, etc.)
smrt-ledgers
  Account, Journal

fiscus (agent)
  Invoice, RecurringInvoice           ↔ sync/audit ↔            QBO/Stripe
```

The SDK package is purely a **bridge layer** - it doesn't store data, just maps between SMRT models and external providers. SMRT models have `externalId`, `externalProvider`, `syncedAt` fields to track sync state.

## Key APIs

### Factory Function

```typescript
import { getAccountingProvider } from '@happyvertical/accounting';

// QuickBooks Online
const qbo = await getAccountingProvider({
  type: 'quickbooks',
  clientId: process.env.QBO_CLIENT_ID!,
  clientSecret: process.env.QBO_CLIENT_SECRET!,
  realmId: process.env.QBO_REALM_ID!,
  refreshToken: process.env.QBO_REFRESH_TOKEN!,
  environment: 'sandbox', // or 'production'
  onTokenRefresh: async (tokens) => {
    // Persist refreshed tokens to your storage
    await db.update('settings', { qboTokens: tokens });
  }
});

// Stripe
const stripe = await getAccountingProvider({
  type: 'stripe',
  secretKey: process.env.STRIPE_SECRET_KEY!
});

// Using environment variables (HAVE_ACCOUNTING_*)
const provider = await getAccountingProvider({ type: 'quickbooks' });
// Reads: HAVE_ACCOUNTING_CLIENT_ID, HAVE_ACCOUNTING_CLIENT_SECRET, etc.
```

### Customer Operations

```typescript
// Push a new customer to the provider
const result = await provider.customers.push({
  id: 'local-123',
  name: 'Acme Corp',
  email: 'billing@acme.com',
  billingAddress: {
    street1: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US'
  },
  paymentTerms: 'Net 30'
});
// result: { action: 'created', externalId: 'qbo-456', syncedAt: Date }

// Sync (create or update based on externalId)
const syncResult = await provider.customers.sync({
  id: 'local-123',
  externalId: 'qbo-456', // If present, updates; otherwise creates
  name: 'Acme Corporation',
  email: 'billing@acme.com'
});

// Pull from provider
const customer = await provider.customers.pull('qbo-456');

// List all customers
const customers = await provider.customers.list({ limit: 100 });
```

### Invoice Operations

```typescript
// Push an invoice
const result = await provider.invoices.push({
  id: 'inv-local-1',
  invoiceNumber: 'INV-2024-001',
  customerId: 'local-123',
  customerExternalId: 'qbo-456', // Use if customer already synced
  issueDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  lineItems: [
    {
      description: 'Consulting Services - January 2024',
      quantity: 40,
      unitPrice: 150,
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-01-31')
    }
  ],
  subtotal: 6000,
  taxAmount: 495,
  totalAmount: 6495,
  currency: 'USD'
});

// Send invoice to customer
await provider.invoices.send(result.externalId);

// Void/cancel an invoice
await provider.invoices.void(result.externalId);

// List invoices with date filter
const invoices = await provider.invoices.list({
  limit: 100,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31')
});
```

### Vendor/Bill Operations (AP)

```typescript
// Sync a vendor
const vendor = await provider.vendors.sync({
  id: 'vendor-local-1',
  name: 'Office Supplies Inc',
  email: 'ap@officesupplies.com',
  address: { ... }
});

// Push a bill (vendor invoice)
const bill = await provider.bills.push({
  id: 'bill-local-1',
  billNumber: 'SUP-2024-123',
  vendorId: 'vendor-local-1',
  vendorExternalId: 'qbo-vendor-789',
  billDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  lineItems: [
    {
      description: 'Office supplies',
      quantity: 1,
      unitPrice: 250,
      accountCode: '6100' // Expense account
    }
  ],
  subtotal: 250,
  taxAmount: 0,
  totalAmount: 250
});
```

### Audit/Reconciliation

```typescript
// Get local invoices from SMRT
const localInvoices = await invoiceCollection.findAll();

// Reconcile against provider
const report = await provider.audit.reconcileInvoices(localInvoices, {
  start: new Date('2024-01-01'),
  end: new Date('2024-12-31')
});

console.log(report.summary);
// {
//   total: 150,
//   matched: 142,
//   localOnly: 5,      // In SMRT but not in QBO
//   externalOnly: 3,   // In QBO but not in SMRT
//   discrepancies: 0   // Amount/date differences
// }

// Process discrepancies
for (const local of report.localOnly) {
  console.log(`Missing in QBO: ${local.invoiceNumber}`);
  // Optionally push to provider
  await provider.invoices.push(local);
}

for (const external of report.externalOnly) {
  console.log(`Missing locally: ${external.externalId}`);
  // Optionally create local record
}
```

### Webhooks

```typescript
// In your webhook handler (Express/SvelteKit)
app.post('/webhooks/quickbooks', async (req, res) => {
  const signature = req.headers['intuit-signature'] as string;
  const payload = req.body;

  // Verify signature
  const isValid = provider.webhooks.verify(
    JSON.stringify(payload),
    signature,
    process.env.QBO_WEBHOOK_VERIFIER_TOKEN!
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Parse event
  const event = provider.webhooks.parse(JSON.stringify(payload));

  switch (event.resourceType) {
    case 'payment':
      // A payment was received - update local records
      const payment = await provider.payments.pull(event.resourceId!);
      await updateLocalPaymentRecord(payment);
      break;
    case 'invoice':
      // Invoice status changed
      const invoice = await provider.invoices.pull(event.resourceId!);
      await syncInvoiceStatus(invoice);
      break;
  }

  res.status(200).send('OK');
});
```

## Environment Variables

Configuration via environment variables (loadEnvConfig fallback):

```bash
HAVE_ACCOUNTING_TYPE=quickbooks
HAVE_ACCOUNTING_CLIENT_ID=xxx
HAVE_ACCOUNTING_CLIENT_SECRET=xxx
HAVE_ACCOUNTING_REALM_ID=xxx
HAVE_ACCOUNTING_REFRESH_TOKEN=xxx
HAVE_ACCOUNTING_ENVIRONMENT=sandbox

# Or for Stripe
HAVE_ACCOUNTING_TYPE=stripe
HAVE_ACCOUNTING_SECRET_KEY=sk_test_xxx
```

## Provider Capabilities

| Capability | QBO | Stripe | PayPal | Coinbase |
|------------|-----|--------|--------|----------|
| Customers | ✅ | ✅ | ❌ | ❌ |
| Invoices | ✅ | ✅ | ✅ | checkout |
| Send Invoice | ✅ | ✅ | ✅ | ❌ |
| Vendors | ✅ | ❌ | ❌ | ❌ |
| Bills | ✅ | ❌ | ❌ | ❌ |
| Payments | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Audit/Reconcile | ✅ | ✅ | partial | ❌ |

## Dependencies

### External Dependencies

- **intuit-oauth** (^4.1.0): OAuth 2.0 client for QuickBooks Online
- **@happyvertical/utils** (workspace:*): Environment config, utilities

### Optional/Future Dependencies

- **stripe**: Stripe SDK (when Stripe provider is implemented)

## Type Definitions

### Input Types (what SMRT models provide)

```typescript
interface CustomerInput {
  id: string;
  externalId?: string;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: Address;
  taxExempt?: boolean;
  paymentTerms?: string;
}

interface InvoiceInput {
  id: string;
  externalId?: string;
  invoiceNumber: string;
  customerId: string;
  customerExternalId?: string;
  issueDate: Date;
  dueDate: Date;
  lineItems: InvoiceLineItemInput[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency?: string;
}
```

### Output Types (what providers return)

```typescript
interface SyncResult {
  action: 'created' | 'updated' | 'unchanged';
  externalId: string;
  syncedAt: Date;
  warnings?: string[];
}

interface AuditReport<T> {
  provider: AccountingProviderType;
  auditedAt: Date;
  matched: AuditMatch<T>[];
  localOnly: T[];
  externalOnly: ExternalRecord[];
  discrepancies: AuditDiscrepancy<T>[];
  summary: { total, matched, localOnly, externalOnly, discrepancies };
}
```

## Development Guidelines

### Adding a New Provider

1. Create provider directory: `src/providers/{name}/index.ts`
2. Implement `AccountingProvider` interface
3. Add provider options type to `types.ts`
4. Add factory case in `index.ts`
5. Update capabilities matrix in docs

### OAuth Token Handling

QuickBooks uses OAuth 2.0 with refresh tokens. The provider:
1. Checks token validity before each request
2. Refreshes if expired (with 5 min buffer)
3. Calls `onTokenRefresh` callback to persist new tokens
4. Caller is responsible for storing refreshed tokens

```typescript
const provider = await getAccountingProvider({
  type: 'quickbooks',
  // ...
  onTokenRefresh: async (tokens) => {
    // Store in database, file, or secret manager
    await secretManager.put('qbo-tokens', JSON.stringify(tokens));
  }
});
```

### Error Handling

```typescript
try {
  await provider.invoices.push(invoice);
} catch (error) {
  if (error.message.includes('QBO API error')) {
    // Handle QBO-specific errors
    console.error('QuickBooks error:', error.message);
  }
  throw error;
}
```

### Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run build         # Build package
```

## Related Packages and Issues

- **SMRT Commerce** (smrt-commerce): Customer, Vendor, Contract, Payment models
- **SMRT Ledgers** (smrt-ledgers): Account, Journal, JournalEntry for double-entry
- **Fiscus Agent** (fiscus): Accounting agent that uses this package
- **SMRT Issue #592**: Invoice, InvoiceLineItem, PaymentAllocation models

## Quick Reference

### File Structure

```
packages/accounting/
├── src/
│   ├── index.ts                    # Factory + exports
│   ├── types.ts                    # All type definitions
│   └── providers/
│       ├── quickbooks/
│       │   └── index.ts            # Full QBO implementation
│       └── stripe/
│           └── index.ts            # Stub implementation
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CLAUDE.md
```

### Common Operations

```typescript
// Sync flow
const result = await provider.customers.sync(customer);
customer.externalId = result.externalId;
customer.syncedAt = result.syncedAt;
await customer.save();

// Audit flow
const report = await provider.audit.reconcileInvoices(localInvoices);
if (report.localOnly.length > 0) {
  // Push missing invoices
  for (const invoice of report.localOnly) {
    await provider.invoices.push(invoice);
  }
}
```
