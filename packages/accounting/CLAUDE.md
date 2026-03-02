# @happyvertical/accounting

AR/AP sync and audit. Factory: `getAccountingProvider(options): Promise<AccountingProvider>`.

## Adapters

QuickBooks (full — customers, invoices, vendors, bills, payments, webhooks, audit). Stripe is a stub (error-throwing closures). PayPal and Coinbase throw from factory.

## Gotchas

- QuickBooks uses OAuth2 with refresh tokens — caller must persist via `onTokenRefresh` callback
- QBO webhook verification uses HMAC-SHA256 with verifier token
- Audit operations cross-reference `externalId` fields
- Env vars use `HAVE_ACCOUNTING_*` prefix
