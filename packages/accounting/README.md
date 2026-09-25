# @happyvertical/accounting

Provider-neutral accounting synchronization with Stripe billing support.

## Stripe invoices

Accounting amounts use currency major units: `12.34` means USD 12.34 and
`1200` means JPY 1200. The Stripe adapter converts them to Stripe's smallest
currency unit at the provider boundary.

For a retryable period close, provide one stable `idempotencyKey` for the
logical invoice. The adapter derives stable Stripe keys for every invoice item
and the invoice. It tags resources with the local invoice and line identifiers,
then reconciles them on a later replay, including after Stripe's idempotency
retention window. Reuse the key only for the same invoice contents.

```ts
await stripe.invoices.push({
  id: 'tenant-42:2026-09',
  invoiceNumber: 'INV-2026-09-42',
  customerId: 'tenant-42',
  customerExternalId: 'cus_123',
  issueDate: new Date('2026-09-01'),
  dueDate: new Date('2026-09-30'),
  lineItems: [{ description: 'Usage', quantity: 1, unitPrice: 12.34 }],
  subtotal: 12.34,
  taxAmount: 0,
  totalAmount: 12.34,
  currency: 'USD',
  idempotencyKey: 'period-close:tenant-42:2026-09',
  automaticTax: true,
});
```

`automaticTax: true` enables Stripe Tax on the invoice. Sync the customer's
complete billing address before creating the invoice so Stripe can calculate
tax from that customer tax location. Read the invoice back to persist Stripe's
calculated `taxAmount`; callers do not supply local tax tables or rates.

Invoice lines carry more than an amount:

- `periodStart` / `periodEnd` (set both) become the Stripe invoice item's
  service `period`, so the invoice PDF, portal, and revenue reports show the
  billed window. `periodEnd` is exclusive, like Stripe's own subscription
  periods, and must not be before `periodStart`.
- `discount` is the line's total discount in major units. Stripe receives it
  as an amount-off coupon on the invoice item (one reusable coupon per
  currency and amount, id `hv_amount_off_<currency>_<stripe amount>`), so the
  discount shows on the invoice and Stripe Tax taxes the discounted amount.

## Stripe Checkout and webhooks

`billing.createCheckoutSession` accepts `idempotencyKey`; reuse it when
retrying the same Checkout Session creation. After `webhooks.verify` succeeds,
the parsed Stripe webhook exposes its provider event as `WebhookEvent.id`.
Persist that identifier in a durable inbox before applying side effects; the
in-process parser alone cannot deduplicate deliveries across restarts or
replicas.
