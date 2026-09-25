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

`collectionMethod: 'charge_automatically'` bills the customer's default
payment method instead of emailing a payable invoice (the default,
`send_invoice`). `invoices.send()` then finalizes the invoice with automatic
collection on: Stripe charges the card, retries failures under your Stripe
retry settings, and reports the result as `invoice.paid` or
`invoice.payment_failed`. Automatically charged invoices carry no due date.
`invoices.markUncollectible()` writes an open invoice off, and invoice reads
report that state as `status: 'uncollectible'`.

## Stripe customers

Pass a stable `idempotencyKey` when a retry might create the customer again
(for example a worker that crashed before storing the returned id). A retry
with the same key returns the first customer: Stripe replays the create
inside its idempotency window, and after it the adapter finds the customer by
the `local_id` metadata it writes on every customer (the oldest one wins if
earlier retries left duplicates). Reuse the key only for the same customer
contents.

```ts
const { externalId } = await stripe.customers.sync({
  id: account.id,
  name: account.name,
  billingAddress: account.address,
  idempotencyKey: `billing-account:${account.id}`,
});
```

## Stripe Checkout and webhooks

`billing.createCheckoutSession` accepts `idempotencyKey`; reuse it when
retrying the same Checkout Session creation.

Price ad-hoc Checkout lines with `priceData.unitAmountMinor`, integer ISO 4217
minor units that the adapter converts to Stripe's unit (ISK and UGX are
two-decimal at Stripe). `priceData.unitAmount` is still accepted and passed
through unconverted in Stripe's unit. Set `automaticTax: true` to charge tax
with Stripe Tax; Stripe needs the buyer's location, so collect it with
`billingAddressCollection` or, for an existing customer, save it with
`customerUpdate: { address: 'auto' }`. Ad-hoc prices default to
`taxBehavior: 'exclusive'` when tax is on.

```ts
const session = await stripe.billing.createCheckoutSession({
  mode: 'payment',
  customerExternalId: 'cus_123',
  lineItems: [
    {
      priceData: { currency: 'CAD', unitAmountMinor: 5000, productName: 'Credit' },
    },
  ],
  automaticTax: true,
  customerUpdate: { address: 'auto' },
  setupFutureUsage: 'off_session', // also keep the card for top-ups
  successUrl,
  cancelUrl,
  idempotencyKey: `credit-purchase:${cartId}`,
});
```

### Card on file

A `setup` mode session saves a payment method without charging. It takes no
line items and needs `currency` (or `paymentMethodTypes`). After it completes,
read the saved method and make it the customer's default so automatically
charged invoices and off-session charges can use it:

```ts
const setup = await stripe.billing.createCheckoutSession({
  mode: 'setup',
  customerExternalId: 'cus_123',
  currency: 'CAD',
  billingAddressCollection: 'required',
  customerUpdate: { address: 'auto', name: 'auto' },
  successUrl,
  cancelUrl,
  idempotencyKey: `card-setup:${accountId}:${attempt}`,
});
// On checkout.session.completed:
const done = await stripe.billing.retrieveCheckoutSession(setup.externalId);
if (done.status === 'complete' && done.paymentMethodExternalId) {
  await stripe.billing.setDefaultPaymentMethod(
    'cus_123',
    done.paymentMethodExternalId,
  );
}
```

## Off-session charges

`payments.chargeSavedPaymentMethod()` charges a saved payment method without
the customer present, for example an automatic prepaid-credit top-up. It is
provider-neutral and optional on `PaymentOperations`: a provider that cannot
pull funds from a stored method (such as a push-payment BTC rail) does not
implement it, so check for it before calling. Amounts are integer minor units
(`amountMinor`), and `idempotencyKey` is required.

```ts
const charge = await stripe.payments.chargeSavedPaymentMethod?.({
  customerExternalId: 'cus_123', // default payment method unless one is given
  amountMinor: 2500,
  currency: 'USD',
  idempotencyKey: `topup:${policyId}:${sequence}`,
  metadata: { policy: policyId },
});
switch (charge?.status) {
  case 'succeeded': // funds secured: grant the credit
  case 'processing': // wait for the payment webhook
  case 'requires_action': // customer must authenticate on-session
  case 'failed': // declined or no payment method; see failureCode
}
```

A decline (`failureCode: 'card_declined'`) or an authentication requirement
(`requires_action`, `failureCode: 'authentication_required'`) is returned, not
thrown; other Stripe errors throw a `StripeApiError` carrying `status`,
`type`, and `code`. Every retry with the same key returns the original
charge: Stripe replays it inside its idempotency window, and after it the
adapter finds the PaymentIntent by its `hv_charge_key` metadata. Payment
webhooks (`payment_intent.*`) carry a normalized `WebhookEvent.payment`
summary with the status, minor-unit amount, and `chargeKey`. After `webhooks.verify` succeeds,
the parsed Stripe webhook exposes its provider event as `WebhookEvent.id`.
Persist that identifier in a durable inbox before applying side effects; the
in-process parser alone cannot deduplicate deliveries across restarts or
replicas.
