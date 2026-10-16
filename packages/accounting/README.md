# @happyvertical/accounting

Provider-neutral accounting synchronization with Stripe billing support.

## QuickBooks connection OAuth

The package loads Intuit's official OAuth client as a Node.js runtime
dependency. No browser globals or consumer-provided shims are required.

Use the public connection helper to generate an accounting authorization URL,
exchange Intuit's callback, and revoke a refresh token:

```ts
import { createQuickBooksOAuthClient } from '@happyvertical/accounting';

const oauth = await createQuickBooksOAuthClient({
  clientId: process.env.QBO_CLIENT_ID!,
  clientSecret: process.env.QBO_CLIENT_SECRET!,
  environment: 'sandbox',
  redirectUri: 'https://app.example.com/api/accounting/quickbooks/callback',
});

const url = oauth.authorizationUrl({ state: oneUseOpaqueState });
const connection = await oauth.exchangeCallback({
  callbackUrl: request.url,
  expectedState: oneUseOpaqueState,
});
await oauth.revoke({ refreshToken: connection.tokens.refreshToken });
```

The helper requests only Intuit's QuickBooks accounting scope. Before the
official client receives a callback, it requires the configured origin and
path, exactly one nonempty state, code, and realm ID, and a constant-time state
match. Returned failures have stable `QuickBooksOAuthError.code` values and do
not retain provider errors that may contain callback URLs or credentials.

The application owns one-use state bound to its authenticated principal,
tenant, and environment; authorization to connect the returned realm;
encrypted token storage; and atomic connection persistence. The helper does
not make those application decisions. The redirect URI must also be registered
in Intuit's developer portal. See Intuit's [OAuth client authorization-code flow](https://github.com/intuit/oauth-jsclient#authorization-code-flow)
and [revocation helper](https://github.com/intuit/oauth-jsclient#revoke-access_token).

## QuickBooks invoice creation and retries

QuickBooks sales lines can carry explicit references to existing entities in the
target company:

```ts
const invoice = {
  // ...provider-neutral invoice fields...
  currency: 'CAD',
  subtotal: 100,
  taxAmount: 5,
  totalAmount: 105,
  quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
  lineItems: [
    {
      description: 'Reviewed work',
      quantity: 1,
      unitPrice: 100,
      quickbooksMapping: {
        itemRef: '123', // Item.Id in this QuickBooks company
        taxCodeRef: 'GST', // TaxCode.Id in this QuickBooks company
      },
    },
  ],
};
```

The QuickBooks adapter maps these values to `SalesItemLineDetail.ItemRef`,
`SalesItemLineDetail.TaxCodeRef`, `GlobalTaxCalculation`, and
`TxnTaxDetail`. It supports `TaxExcluded`, zero-tax `NotApplicable`, and frozen
`TaxInclusive` snapshots. For an inclusive line, pass the stored net amount as
`amount`, its stored tax as `taxAmount`, the stored gross amount as
`taxInclusiveAmount`, and stored per-component amounts as `taxComponents`.
An explicit zero-tax inclusive snapshot may supply an empty component list when
its net and gross facts are equal, including when an off-grid reduced unit price
requires the generated negative discount line.
The adapter sends net `Amount` and gross
`SalesItemLineDetail.TaxInclusiveAmt`; Intuit defines that nested field as the
total including tax in its [SDK reference](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippphpdevkitv3/entities/files/IPPSalesOrderItemLineDetail.html).
It emits the stored component tax exactly as `TxnTaxDetail.TaxLine[].Amount`.
When any component detail is present, every taxed line must carry it and the
minor-unit aggregate must equal the frozen header tax. Each component therefore
needs a realm `quickbooksTaxRateRef`; its frozen
`rate` is a fraction from `0` through `1` and becomes QBO's percent-form
`TaxPercent` (for example `0.13` becomes `13`). Intuit's invoice example shows
the writable `TaxLineDetail` fields, and its TaxLineDetail reference requires
an international `TaxRateRef` to belong to a tax code used on a transaction
line: [invoice API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/invoice),
[TaxLineDetail reference](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/393902ec-f79c-bb8f-82fd-0f3bd296dd27.htm).
It validates every component sum, rate-to-frozen-amount allocation (each stored
component is the exact floor or ceiling allowed by line/document rounding), and
header reconciliation before any network request. Every mapped line must supply both realm-specific references;
the caller must validate that those IDs belong to the configured company.

Legacy untaxed invoices without `quickbooksMapping` remain supported. The
adapter fails before authentication or HTTP when an input would otherwise be
silently discarded: nonzero numeric `taxRate`, generic `taxCode`, `automaticTax`,
inconsistent totals, partial mappings, or invalid references. `unitPrice` and
`discount` are in the document's amount mode: net for exclusive inputs and gross
for inclusive ones; `amount` is always the already-discounted net snapshot. A
discount uses a reduced QBO unit price only when that price fits the currency's
ISO 4217 minor-unit grid. Otherwise, for an inclusive line, the adapter derives
the negative net amount from the frozen gross discount and frozen component
rates, and then adds a negative `Discount on line N` sales line with the same item and tax-code
references. It never sends QBO's unsupported line-discount field or subtracts a
discount twice. Negative generated discount lines are internal; caller invoice
lines remain non-negative. An explicit exclusive line `amount` must agree with
`quantity × unitPrice` after discount, either exactly or as its decimal
**half-up** result at the explicitly supplied currency's ISO 4217 minor
precision. For example, CAD quantity `1.0005` × unit price `10` accepts the
retained line amount `10.01`. The adapter preserves approved snapshots and never
changes subtotal/tax reconciliation.

A frozen monetary snapshot means a `TaxInclusive` document, or a line carrying
`taxAmount`, `taxComponents`, `taxInclusiveAmount`, or a nonzero `discount`.
Those snapshots (document subtotal/tax/total and relevant line net/gross,
component tax, and discount) must fit the explicitly supplied ISO 4217 grid.
The source `unitPrice` may remain fractional when its retained line amount is
on that grid. Legacy exclusive exact-product inputs that carry only an `amount`
or QuickBooks mapping retain the base validation and do not require a known
currency. Unknown or missing currency never authorizes frozen snapshot rounding.

Precision comes from [ISO 4217 List One published 2026-09-17](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml),
not runtime display formatting (which differs for IQD, MGA and RSD). Zero-, two-,
three- and four-decimal codes include JPY, CAD, KWD and CLF respectively. Missing,
unknown and `N.A.` minor-unit codes do not enable rounding; their existing
exact-product behavior is retained. Currency recognition does not assert that a
particular QuickBooks company supports that currency: the caller still owns the
company's currency configuration and authoritative readback.

Prepare a caller-owned request descriptor **once**, persist it with the approved
invoice in your durable outbox, then pass it on every create attempt:

```ts
import { prepareQuickBooksInvoiceRequest, QuickBooksWriteError } from '@happyvertical/accounting';

const quickbooksRequest = prepareQuickBooksInvoiceRequest(invoice, {
  requestId: outbox.requestId, // e.g. a persisted UUID, never regenerated on retry
  realmId: outbox.realmId,
  environment: 'sandbox',
});
// Persist quickbooksRequest AND the invoice snapshot before invoking push.
try {
  const result = await qbo.invoices.push({ ...invoice, quickbooksRequest });
  // Persist result.externalId on the same outbox record.
} catch (error) {
  if (error instanceof QuickBooksWriteError && error.outcome === 'unknown') {
    // Keep this record pending reconciliation; it may already exist remotely.
    // Retry only the unchanged snapshot + descriptor, never with a new ID.
  } else {
    throw error;
  }
}
```

The helper performs no HTTP. Its JSON-roundtrippable descriptor binds the exact
mapped QuickBooks payload (SHA-256) to the realm and sandbox/production environment.
`push()` and create-only `sync()` verify that binding before authentication or
HTTP, including on a new provider instance. Restore invoice date fields as `Date`
objects when loading an outbox. Mapping uses local calendar dates, so keep the
same timezone across workers; a changed mapped date fails closed. Changes to
mapped fields, realm, environment, or descriptor hash are rejected locally.
Request IDs accept this SDK's conservative subset: 1–50 ASCII letters, digits,
dots, underscores, and hyphens. The URL receives the caller's exact `requestid`.

The descriptor is a consistency check, **not an authorization token or durable
ID registry**. The caller must enforce uniqueness, tenant/realm ownership,
immutability, and concurrency in its outbox. Never prepare a new descriptor with
an old ID for different contents: a stateless SDK cannot detect that across
processes. Existing Stripe `idempotencyKey` is not a QuickBooks request ID.
Descriptors are create-only and are refused with `externalId`; update, send,
void, customer, vendor, and bill operations do not accept them.

QuickBooks reads retain automatic retry of transport failures, HTTP 429, and
5xx responses. Invoice creates with a descriptor retry these failures using
identical URL/body bytes; malformed successful invoice responses also remain
uncertain and may be retried under that identity. `maxRetries: 0` disables
retries; the default is three retries after the initial attempt. Timeout covers
reading the response as well as fetching it.

**All unkeyed QuickBooks writes now make one attempt**, including invoice
creates/updates/send/void and customer/vendor/bill creates and updates. This deliberately replaces the previous automatic write retry
behavior, which could duplicate a remotely accepted write. HTTP 429 is also
single-attempt for those operations. Stripe behavior is unchanged.
`QuickBooksWriteError` reports `outcome: 'rejected'` for an unkeyed HTTP client
rejection (including 429), or `outcome: 'unknown'` for transport failures,
server failures, or malformed success responses. **Every keyed failure is
conservatively `unknown`, including HTTP 4xx on the first locally observed
attempt.** A stateless SDK cannot prove that a persisted identity was never
sent by an earlier worker. This preserves uncertainty across process restarts
and later rejections without requiring mutable descriptor state. Client errors
still receive no automatic retry (except keyed 429 responses). Its realm, environment,
endpoint, optional request ID/payload hash, HTTP status, and cause support caller
reconciliation. A local validation or token acquisition error occurs before the
write and is not wrapped. Never treat an unknown outcome as a clean failure.

Intuit documents request-ID replay in its [API best practices](https://blogs.a.intuit.com/2018/09/10/quickbooks-online-api-best-practices/)
and [request ID field contract](https://developer.intuit.com/app/developer/qbo/docs/learn/learn-basic-field-definitions#request-id).
The [static documentation](https://static.developer.intuit.com/output_html/qbo/docs/learn/learn-basic-field-definitions.html)
confirms the 50-character limit and per-realm uniqueness requirement.
Our regression tests mock remote acceptance and response loss; they prove SDK
identity/byte preservation and retry policy, **not live Intuit deduplication**.
Before relying on remote idempotency, verify in an authorized sandbox: send a uniquely identified invoice,
repeat the identical request with the same ID, confirm the same Invoice.Id and
one invoice, and simulate a lost response before replaying it. Record realm,
environment, request ID, timestamps, and returned IDs without credentials.
No replay retention period or exactly-once guarantee is asserted here; reconcile
old or uncertain requests against QuickBooks before any new creation identity.

## QuickBooks credit memos

`creditMemos` is an optional provider capability. QuickBooks supports positive
frozen customer credit notes through `CreditMemo`; providers that omit the
capability must be refused by the caller. A `CreditMemoInput` uses the same
net/gross/tax snapshot rules as an invoice, has a
`creditedInvoiceExternalId` for durable reconciliation, and is created with a
separate descriptor:

```ts
import {
  prepareQuickBooksCreditMemoRequest,
  requireCreditMemoOperations,
} from '@happyvertical/accounting';

const request = prepareQuickBooksCreditMemoRequest(creditMemo, {
  requestId: outbox.requestId,
  realmId: outbox.realmId,
  environment: 'sandbox',
});
await requireCreditMemoOperations(qbo).push({
  ...creditMemo,
  quickbooksCreditMemoRequest: request,
});
```

The descriptor carries its realm, environment, and caller-owned request ID, and
hashes the mapped frozen credit payload together with
`creditedInvoiceExternalId`. It does not include mutable payment, allocation,
or status fields, so a retry of the same frozen revision keeps the same request
identity. Creating a QBO
`CreditMemo` does not itself apply that credit to the named invoice through this
API contract; an application must record any later QBO payment/application step
explicitly. This package does not assume an account's automatic-credit setting.
It has the same retry and unknown-outcome rules as a keyed invoice create. No
live Intuit sandbox assertion is made by this package's contract tests; they
verify serialized payloads, request IDs, retries, and refusal paths.

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
- `taxCode` is the Stripe product tax code (`txcd_...`) for the line, sent
  as the invoice item's `tax_code`, so Stripe Tax classifies it instead of
  using the account's default product tax code.

`collectionMethod: 'charge_automatically'` bills the customer's default
payment method instead of emailing a payable invoice (the default,
`send_invoice`). `invoices.send()` then finalizes the invoice with automatic
collection on: Stripe charges the card on its own collection schedule (not
necessarily at once, so activate service on `invoice.paid` rather than on
`send()`), retries failures under your Stripe retry settings, and reports the
result as `invoice.paid` or `invoice.payment_failed`. Automatically charged invoices carry no due date.
`invoices.markUncollectible()` writes an open invoice off, and invoice reads
report that state as `status: 'uncollectible'`.

`invoices.markPaidOutOfBand()` closes an invoice that was paid on another
rail (for example a crypto payment for a Stripe-issued invoice): Stripe marks
it `paid_out_of_band`, which stops its emails, dunning, and automatic charges.
It is idempotent (an invoice already closed out of band, or paid with
nothing collected — a zero total or a credit balance — is left alone), throws
for an invoice Stripe collected money for itself (a second collection needs a
refund, not a silent close), finalizes a draft first without automatic
collection and refuses it if finalization raised the amount due, pays an
uncollectible invoice, and refuses a void one. Invoice reads report `paidOutOfBand`, so a consumer can tell such
an invoice from one Stripe collected.

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
`taxBehavior: 'exclusive'` when tax is on. Set `priceData.taxCode` (a Stripe
product tax code such as `txcd_10000000`) to classify an ad-hoc line instead
of using the account's default product tax code; an existing `product`
carries its own tax code, so `taxCode` is refused with it.

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
// Both methods are optional on StripeBillingOperations; StripeProvider has them.
const done = await stripe.billing.retrieveCheckoutSession?.(setup.externalId);
if (done?.status === 'complete' && done.paymentMethodExternalId) {
  await stripe.billing.setDefaultPaymentMethod?.(
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
  case 'requires_action': // issuer wants authentication; re-save the card on-session
  case 'failed': // declined or no payment method; see failureCode
}
```

A decline (`failureCode: 'card_declined'`) or an authentication requirement
(`requires_action`, `failureCode: 'authentication_required'`) is returned, not
thrown. Results never include Stripe's client secret, so a `requires_action`
attempt is not completed later: when the customer is next present, collect
authentication with a `setup` mode Checkout session and
`setDefaultPaymentMethod`, then charge again with a new idempotency key (the
old key returns the original, unauthenticated attempt). Other Stripe API
errors throw a `StripeApiError` carrying `status`, `type`, and `code`;
invalid input and a reused-key refusal throw a plain `Error` before any
provider request. Every retry with the same key returns the original
charge: Stripe replays it inside its idempotency window, and after it the
adapter finds the PaymentIntent by its `hv_charge_key` metadata. Scope keys
to the payer and use a new key for a new attempt: a key reused for a
different amount, currency, customer, or explicit payment method is refused
(Stripe `idempotency_error`, or an adapter error after the window), never
charged. Pass `paymentMethodExternalId` to keep retries identical when the
customer's default card may change in between. Payment webhooks (`payment_intent.*`) carry a normalized `WebhookEvent.payment`
summary with the status, minor-unit amount, and `chargeKey`.

### Tax on off-session charges

Set `automaticTax: true` to tax the charge with Stripe Tax, the way a Checkout
purchase of the same thing is taxed. `amountMinor` is then the pre-tax
subtotal: the adapter calculates tax (Stripe Tax Calculations API) from the
customer's saved address and tax-exempt status, charges subtotal plus tax,
and links the calculation to the PaymentIntent
(`hooks[inputs][tax][calculation]`), so Stripe records the tax transaction
when the payment succeeds, including a `processing` payment that settles
later, and reverses it on refunds. `taxCode` (a Stripe product tax code)
classifies the charge instead of the account default.

```ts
const charge = await stripe.payments.chargeSavedPaymentMethod?.({
  customerExternalId: 'cus_123',
  amountMinor: 2500, // the credit, before tax
  currency: 'USD',
  idempotencyKey: `topup:${policyId}:${sequence}`,
  automaticTax: true,
  taxCode: 'txcd_10000000',
});
// charge.amountMinor = 2500 + tax (what was charged)
// charge.subtotalMinor = 2500 (grant this as credit)
// charge.taxMinor = tax (book as tax payable)
```

With `automaticTax`, `amountMinor` in the result and in the payment webhook
summary is the amount charged, tax included; `subtotalMinor` and `taxMinor`
report the two parts separately (webhooks read them from the PaymentIntent's
`hv_subtotal_amount` / `hv_tax_amount` metadata, in Stripe units, so settle
credit from `subtotalMinor`). A customer whose tax location Stripe cannot
determine yields `status: 'failed'` with
`failureCode: 'customer_tax_location_invalid'` and no charge; other Stripe Tax
errors (for example Stripe Tax not activated) throw. The payment method is
resolved before tax is calculated, so a customer without a card costs no
calculation. Every attempt calculates afresh, so a retry with the same key
succeeds once the customer's address is fixed (a calculation alone records
no tax). Exactly-once charging is unchanged: the PaymentIntent keeps its
`<key>:payment_intent` Stripe idempotency key, and the adapter first returns
any charge already made under the key by `hv_charge_key`. A retry that races
Stripe's search index (seconds after a lost response) can fail with Stripe's
`idempotency_error` instead of charging twice; retry it later. A key first used
with `automaticTax` is refused for an untaxed retry, and the reverse, as is a
different subtotal. Caller metadata may not use the adapter's tax keys
(`hv_tax_calculation`, `hv_subtotal_amount`, `hv_tax_amount`). A provider that implements
`chargeSavedPaymentMethod` without tax support throws on `automaticTax`
rather than charging untaxed.

Minor-unit amounts (`amountMinor`, `unitAmountMinor`, and the `*Minor` read
fields) use ISO 4217 exponents from an explicit table, not the runtime's
`Intl` display digits, which differ for some currencies (for example RSD,
IQD, and MGA). Derive minor units the same way before calling.

## Stripe webhooks

After `webhooks.verify` succeeds, the parsed Stripe webhook exposes its provider event as `WebhookEvent.id`.
Persist that identifier in a durable inbox before applying side effects; the
in-process parser alone cannot deduplicate deliveries across restarts or
replicas.

### Ordered compound tax snapshots

A frozen component may set `compound: true` and `taxableAmount` (currency major
units). It then taxes the line's net amount plus **all preceding components in
that line's ordered snapshot**. Its explicit basis must equal that sum of stored
facts; neither a replacement rate nor a jurisdiction rule is inferred. Different
applicable line subsets use their corresponding realm tax codes.

Compound lines also require verified configuration evidence:

```ts
quickbooksMapping: {
  itemRef: '123',
  taxCodeRef: 'configured-compound-code',
  taxComponents: [
    { taxRateRef: 'gst-rate', compound: false },
    { taxRateRef: 'provincial-rate', compound: true },
  ],
}
```

The host must verify this sequence against the target company's existing TaxCode,
including its applicability and ordering, and persist the verification provenance
with tenant configuration. The SDK requires an exact match with frozen component
references and flags; it cannot verify a remote realm from an ID alone and does
not create or modify tax codes. Missing, duplicate, unknown or mismatched order
metadata fails before a request can be sent. Tax-only dependencies other than
all previous applicable components are outside this contract.

Exclusive validation uses preceding stored rounded/allocated taxes. Inclusive
validation extracts exact ordered rational factors and checks the same permitted
floor/ceiling allocation as additive snapshots. Inclusive discount projection
uses those factors too. Stored component amounts and original rates are preserved
in `TxnTaxDetail.TaxLine`; an explicit basis is aggregated by rate into
`TaxLineDetail.NetAmountTaxable`. Additive snapshots without these new fields
retain their prior payload bytes and retry descriptor hashes. Credit memos use
the same representation. This preserves source facts; sandbox acceptance and
provider readback still require the host's authorized integration verification.

Intuit's [TaxRateDetail schema](https://static.developer.intuit.com/sdkdocs/qbv3doc/ipp-v3-java-devkit-javadoc/com/intuit/ipp/data/TaxRateDetail.html)
defines applicability/order, including
[TaxOnAmountPlusTax](https://static.developer.intuit.com/sdkdocs/qbv3doc/ipp-v3-java-devkit-javadoc/com/intuit/ipp/data/TaxTypeApplicablityEnum.html).
Its [TaxLineDetail reference](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/393902ec-f79c-bb8f-82fd-0f3bd296dd27.htm)
documents the applicable-rate taxable base and realm rate-reference constraint.
# QuickBooks receivable transfers

`AccountingProvider.receivableTransfers` is an optional capability. The QuickBooks
provider implements reviewed receivable reclassification using JournalEntry and
zero-cash Payment requests. It does not emulate a native retainage API, create
sales items, reduce invoice gross/tax, or initiate bank settlement.

The caller supplies an immutable, versioned mapping and review evidence:
`accountingBasis: 'accrual'`, `taxTiming: 'invoice-tax-point'`,
`releaseDueDates: 'host-managed'`, realm/environment, customer, currency and
distinct AR/retained-asset/optional bank accounts. Other accounting/tax timing
policies are unsupported. The provider verifies active customer/accounts, account
types and the realm's home currency before writing. Foreign-currency transfers
are unsupported; no exchange rate is inferred. Account CurrencyRef, when present,
must agree. Missing transaction currency or financial fields fails closed.

`prepareQuickBooksReceivableRequest(input)` returns a persistable descriptor.
Amounts are positive safe integer **minor units**, exactly representable on the
currency grid. Source type/ID/customer, effective date, evidence and mapping version
are bound into its hash and provider note; journal lines repeat source/customer
evidence. No provider DueDate is invented for release journals: the host owns
release due dates and customer-facing collection documents.

| Kind | Debit | Credit | Readback meaning |
| --- | --- | --- | --- |
| withhold | retained asset | customer AR | receivable reclassification |
| release | customer AR | retained asset | released receivable |
| cash-refund | customer AR | bank | recorded cash outflow, not verified settlement |
| reverse-cash-refund | bank | customer AR | recorded reversal, not bank execution |
| application | existing Invoice/JournalEntry | existing CreditMemo/JournalEntry | noncash application, TotalAmt = 0 |

`provider.receivableTransfers.execute(prepared)` verifies scope, mapping and
source customer/currency before posting. Applications also inspect current debit
and credit capacity. Journal capacity uses the complete paginated customer payment
history, rejecting ambiguous multi-transaction allocation lines instead of
allocating them arbitrarily. These reads are not a remote transaction lock: hosts
must serialize their own workflows and reconcile changes made by other provider
users. A stale or rejected application must not be recorded as completed locally.

Readback validates exact postings/linkage, amounts, source evidence, customer,
currency and date. It returns `nonCashAppliedMinor` separately from
`recordedCashChangeMinor`. `providerProcessedCashMinor` is zero and
`bankSettlementVerified` is false, including cash-refund journals. Ordinary invoice
`TotalAmt - Balance` includes noncash applications and must not be treated as cash
received in a retention workflow.

## Durability and recovery

Persist the complete descriptor before execution. Its hash binds bytes and
provenance; it does **not** prove that a provider operation happened exactly once.
The request uses QuickBooks' documented `requestid` query parameter (1–50 URL-safe
characters) through the existing SDK duplicate-handling transport. A host must
retain that identity across transport retries and may never silently replace it
with a fresh identity following an unknown outcome.

Each journal and application is a separate provider write. The SDK supplies no
cross-request transaction or persistent workflow. The host must persist per-step
in-flight/unknown/rejected/confirmed states and retain successful earlier steps
when a later step fails. `read(prepared, externalId)` reconciles a known remote ID
without writing. Unknown IDs/outcomes require authoritative provider reconciliation
before progressing; an input hash or a missing list result is not proof of absence.
Replaying `execute` after a completed application can fail its current-capacity
preflight; use persisted confirmation/readback instead. Reversal commands require
the host's approved source lineage and conserved refund/release capacity; they are
not an automatic recovery action.

The public contract is covered by local mocked provider tests. **No live sandbox
certification or production write has been performed.** Deployment certification
must verify realm-specific journal/customer application behavior and echoed fields.

## Provider evidence

- [Payment API](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/Payment): Invoice, CreditMemo and JournalEntry links; zero-total credit application example.
- [Journal line contract](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/62627c63-90a3-c87a-ef9b-8b4b06daee08.htm): AccountRef, PostingType and customer Entity.
- [Journal contract](https://static.developer.intuit.com/sdkdocs/qbv3doc/ippdotnetdevkitv3/html/0b5f8961-f32e-e396-3a39-7b3e241434e8.htm): transaction currency/date; no assumed release due-date field.
- [Intuit API best practices](https://blogs.a.intuit.com/2018/09/10/quickbooks-online-api-best-practices/): request-ID duplicate handling. This is distinct from host durable reconciliation.
