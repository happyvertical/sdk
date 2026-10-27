# @happyvertical/payments

Multi-backend payment provider abstraction for crypto and fiat checkout.

The root import exposes the shared `PaymentBackend` contract, common types,
errors, and dynamic factory:

```ts
import { createPaymentBackend } from '@happyvertical/payments';

const payments = await createPaymentBackend({
  type: 'stripe',
  secretKey: process.env.STRIPE_SECRET_KEY!,
  successUrl: 'https://example.com/pay/success',
  cancelUrl: 'https://example.com/pay/cancel',
});
```

Adapters are also available as selective subpath exports:

```ts
import { BaseUsdcAdapter } from '@happyvertical/payments/base-usdc';
import { BtcAdapter } from '@happyvertical/payments/btc';
import { StripeAdapter } from '@happyvertical/payments/stripe';
```

## Adapters

- `BaseUsdcAdapter`: USDC on Base via JSON-RPC, deterministic xpub child
  addresses, x402 proof verification, and injected signer payouts.
- `BtcAdapter`: BTCPay Server invoice, polling/webhook status, tiered
  confirmation policy, and unsigned PSBT payout creation.
- `BtcpayClient` (`@happyvertical/payments/btcpay`): a stateless BTCPay
  Greenfield client for billing integrations — see
  [BTCPay Greenfield client](#btcpay-greenfield-client).
- `StripeAdapter`: Stripe Checkout URL settlement, webhook verification,
  refunds, Stripe Connect Standard direct charges, Connect onboarding and
  account-routed Connect webhooks, transfers, saved payment methods / card-on-file
  (`createSetupSession` / `getSetupResult`), and the manual-capture card
  lifecycle (`authorizePayment` / `capturePayment` / `voidPayment`).

The package does not depend on SMRT or a database. Consumers own quote
persistence, webhook routing, and operational policy.

### Stripe Connect Standard direct charges

Pass `stripeAccount` to a `StripeAdapter` for a fixed connected-account scope,
or to an individual Checkout, PaymentIntent, refund, status, or setup
call. The adapter sends it as Stripe's `Stripe-Account` header. With no account
configured or supplied, requests retain platform-account behavior.

```ts
const workerCoopPayments = new StripeAdapter({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  stripeAccount: 'acct_worker_coop',
  successUrl,
  cancelUrl,
});

await workerCoopPayments.createPaymentOption({
  quoteId: 'project-revenue-42',
  amount: 10_000,
  currency: 'USD',
  expiresAt,
  applicationFeeAmount: 500,
});

await workerCoopPayments.refundPayment({
  paymentId: 'pi_123',
  amount: 10_000,
  refundApplicationFee: true,
});
```

Amounts, including `applicationFeeAmount`, are integer minor units. The fee is
collected by Stripe from the direct charge; downstream accounting must offset
the matching platform allocation so it is never a second payable. The SDK only
propagates provider flags and account scope; it does not calculate allocations
or post accounting entries. `refundApplicationFee` and `reverseTransfer` are
sent only when explicitly requested.

### Stripe Connect onboarding and webhooks

Connect onboarding uses **Standard** accounts: the account holder (for example
a co-op tenant) owns its Stripe relationship and dashboard, and the platform
only connects to it. Onboarding and capability reads are platform calls; they
never send `Stripe-Account`, even on an account-scoped adapter.

```ts
const platform = new StripeAdapter({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!, // platform endpoint
  connectWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET!, // Connect endpoint
});

// 1. Create the Standard account once and persist accountId with the tenant.
const account = await platform.createStandardAccount({
  country: 'CA',
  email: treasurerEmail,
  metadata: { tenant: tenantId },
  idempotencyKey: `connect-account:${tenantId}`,
});

// 2. Send the account holder through Stripe-hosted onboarding. Links are
//    single use and short lived; refreshUrl should mint a new one.
const link = await platform.createOnboardingLink(
  account.accountId,
  'https://app.example/connect/return',
  'https://app.example/connect/refresh',
);

// 3. On return (which does not mean onboarding finished), and on every
//    account.updated webhook, read the capability state.
const state = await platform.getAccountCapabilities(account.accountId);
state.chargesEnabled; // charges_enabled
state.detailsSubmitted; // details_submitted
state.payoutsEnabled; // payouts_enabled
state.capabilities; // { card_payments: 'active', ... }
state.requirements; // { currentlyDue, eventuallyDue, pastDue, disabledReason }
```

Treat the onboarding `url` as a bearer secret: redirect to it, but do not log
or store it.

Stripe delivers connected-account events to a separate **Connect** webhook
endpoint signed with its own secret. Route that endpoint through
`resolveConnectWebhookEvent`, which verifies the signature before reading the
payload, requires the event's `account`, and then calls your resolver to map
the account to its owner. An account the resolver does not recognize (it
returns `undefined` or `null`) is rejected with `PaymentNotOwnedError`; there
is no fallback to the platform account. An account-scoped adapter
(`stripeAccount` set) also rejects events for any other account.

```ts
// POST /webhooks/stripe/connect
const { event, account, owner } = await platform.resolveConnectWebhookEvent(
  rawBody,
  request.headers.get('Stripe-Signature') ?? undefined,
  { resolveAccount: (account) => tenants.findByStripeAccount(account) },
);

if (event.connect?.type === 'account.updated') {
  await owner.saveStripeCapabilities(event.connect.account);
} else if (event.quoteId && event.status === 'confirmed') {
  // The connected account chose quoteId; settle only the owner's own quote.
  const quote = await owner.findQuote(event.quoteId);
  if (!quote) throw new Error('quote does not belong to this account');
  await quote.markPaid(event);
}
```

**Bind quotes to the account before settling.** A connected account controls
the Checkout Sessions and PaymentIntents it creates, so the `quoteId` on a
Connect event is whatever that account chose, including another tenant's quote
id. Resolving `account` proves only who sent the event. Before marking a quote
paid, check that `event.quoteId` belongs to the resolved `owner` (reject the
event in `resolveAccount`, which receives it, or check it before settling), and
compare amount and currency with the stored quote.

`parseConnectWebhookEvent` performs the same verification without the
resolver and returns a `StripeConnectWebhookEvent` whose `account` is always
set. The platform endpoint (`parseWebhookEvent`) rejects any event carrying a
connected `account`, so a misrouted Connect delivery fails closed instead of
being processed as a platform payment.

Typed Connect payloads arrive on `event.connect`:

- `account.updated` (Connect endpoint): `{ type, account }` with the same
  `StripeConnectAccountStatus` shape as `getAccountCapabilities`.
- `application_fee.created` / `application_fee.refunded` (platform endpoint,
  because the fee belongs to the platform): `{ type, applicationFee }` with
  `id`, `account` (the connected account charged), `amount`, `amountRefunded`,
  `currency`, `refunded`, and `charge`. Route them with
  `resolveConnectWebhookEvent(rawBody, signature, { endpoint: 'platform',
  resolveAccount })`, which uses the fee's account and rejects platform events
  that have none.

These events report `status: 'processing'`; they never mark a customer payment
refunded or failed. Duplicate detection records an event only after it
resolves, so a delivery rejected for an unmapped account is not reported as a
duplicate when Stripe retries it.

### Disputes: verified snapshots and authoritative rereads

Stripe normalizes `charge.dispute.created`, `.updated`, `.closed`,
`.funds_withdrawn`, and `.funds_reinstated` into `event.dispute` and
`event.connect = { type, dispute }` on both endpoint parsers. Connect events
retain the verified `account`; dispute events require a boolean event
`livemode` matching the object's environment and expose `createdAt` and
`livemode` without reading `raw`. Their generic payment `status` stays
`processing`: a dispute never marks the original payment refunded or failed.
Existing non-dispute event behavior is unchanged.

```ts
const { event, owner, account } = await platform.resolveConnectWebhookEvent(
  rawBody, signature, { resolveAccount: findAccountOwner },
);
if (event.dispute) {
  if (event.livemode !== owner.stripeLivemode) throw new Error('wrong environment');
  // Authenticate/route the delivery first; reread after out-of-order delivery or
  // restart. The request scope is preserved in current.account even though
  // Stripe's dispute object normally omits it.
  const current = await platform.getDispute(event.dispute.id, {
    stripeAccount: account,
    expectedLivemode: owner.stripeLivemode,
  });
  if (current.status === 'unknown') throw new Error('unsupported dispute status');
  await owner.reconcileDispute(current); // consumer-owned durable/idempotent ledger
}
```

`PaymentDispute`, `PaymentDisputeStatus`, and
`PaymentDisputeBalanceTransaction` are root type exports. The Stripe subpath
exports `StripeDispute`, `StripeDisputeEventType`, and
`StripeGetDisputeOptions`. A dispute supplies `id`, `chargeId`, optional
`paymentIntentId`, `amount`, `currency`, `status`, `providerStatus`, `livemode`,
`createdAt`, and `balanceTransactions`. `getDispute(id, options?)` is a GET,
uses the explicit account or adapter's default account (otherwise platform),
and refuses an override of a fixed adapter account. The caller must select an
owned account; Stripe authenticates the read within that account. A reread
requests an expanded charge to recover `paymentIntentId` when absent on the
dispute. Both card `ch_` and non-card `py_` charge identities are accepted, as are
current `du_` and legacy `dp_` dispute identities. Some charges genuinely have no
PaymentIntent: that field remains
optional, and consumers must resolve charge ownership themselves or quarantine
unroutable snapshots. Conflicting expanded references are rejected.

All amounts are safe integers in minor units. Disputed `amount` is
non-negative. Balance evidence contains transaction `id`, signed `amount`,
`fee`, signed `net` (`amount - fee`), `currency`, `createdAt`, provider `type`,
and optional `reportingCategory`. Its currency may differ from the dispute's
after FX; do not combine currencies or silently apply the dispute's amount.
The transaction identifiers and actual deltas are the evidence for accounting;
statuses and event suffixes alone never prove an amount moved. A `won` or
`lost` status does not synthesize a credit or debit. Stripe describes zero,
one, or two balance transactions showing withdrawals and reinstatements.

A validated empty `balanceTransactions` means Stripe reported no balance
transactions in that snapshot. Missing/incomplete/malformed balance evidence
throws `PaymentProviderError`; it never becomes an empty array. Known core
fields with malformed values, unsafe amounts, duplicate transaction IDs,
inconsistent net values, missing environments, or mismatched identities fail
closed. Additional unrelated provider fields are ignored. Future lifecycle
statuses become `status: 'unknown'` with their original `providerStatus`;
consumers must quarantine those business decisions. Future `charge.dispute.*`
event types throw rather than falling through as an ignored payment.

Webhook signature verification occurs before parsing; Connect ownership
resolution occurs before the duplicate marker is recorded. Duplicate and older
events retain their original evidence; the adapter does not merge snapshots,
suppress stale events, journal funds, or guarantee durable deduplication.
Persist event and balance transaction identifiers in the consumer and reread
authoritatively for retry/crash recovery. Provider/transport errors propagate;
no dispute writes are exposed. Do not persist `raw`, which may contain PII.

Semantics checked against Stripe's official
[dispute object](https://docs.stripe.com/api/disputes/object),
[event types](https://docs.stripe.com/api/events/types),
[dispute retrieval](https://docs.stripe.com/api/disputes/retrieve), and
[balance transaction object](https://docs.stripe.com/api/balance_transactions/object)
on 2026-10-23.

### BTCPay Greenfield client

`BtcpayClient` is a stateless client for one BTCPay Server store (Greenfield
2.x). It creates, reads, and lists invoices (filterable by `orderId`), reads an
invoice's payment methods and payments, and verifies and parses webhooks.
Decimal amounts stay strings; Greenfield unix-second timestamps become `Date`s.
BTCPay has no idempotency keys, so callers make creation idempotent by
listing by `orderId` first.

```ts
import {
  BtcpayClient,
  isValidBtcpayWebhookSignature,
  parseBtcpayWebhook,
} from '@happyvertical/payments/btcpay';

const btcpay = new BtcpayClient({ baseUrl, apiKey, storeId });
const [existing] = await btcpay.listInvoices({ orderId, status: ['New', 'Processing', 'Settled'] });
const invoice =
  existing ??
  (await btcpay.createInvoice({
    amount: '25.00',
    currency: 'CAD',
    orderId,
    checkout: {
      speedPolicy: 'MediumSpeed', // 1 confirmation
      paymentMethods: ['BTC-CHAIN'],
      expirationMinutes: 15,
      paymentTolerance: 0,
      redirectURL: successUrl,
    },
  }));
redirect(invoice.checkoutLink);

// webhook route
if (!isValidBtcpayWebhookSignature(rawBody, request.headers.get('BTCPay-Sig'), webhookSecret)) {
  return new Response(null, { status: 400 });
}
const delivery = parseBtcpayWebhook(rawBody); // persist delivery.deliveryId to dedupe
const current = await btcpay.getInvoice(delivery.invoiceId!); // act on re-read state
```

Invoice payments do not report confirmation counts; BTCPay settles an
invoice by its `speedPolicy` (`HighSpeed` 0, `MediumSpeed` 1,
`LowMediumSpeed` 2, `LowSpeed` 6 confirmations — no other values exist). An
on-chain payment's `transactionId` is parsed from its `<txid>-<vout>` id.

Errors are `BtcpayApiError` (`status`, Greenfield `apiCode`, `retryable` for
429 and for reads that failed on the network or with 5xx). A `createInvoice`
that failed on the network or with 5xx may have created the invoice, so it is
never `retryable`: look it up by `orderId` before creating another. Messages never include the API key. A store
API key needs only `btcpay.store.canviewinvoices` and
`btcpay.store.cancreateinvoice` for these calls.

### Crypto checkout gateway (provider-neutral)

`CryptoCheckoutGateway` (root export) is the narrow port billing
code uses for **hosted crypto checkouts priced in fiat**. BTCPay is one
implementation (`createBtcpayCheckoutGateway` from
`@happyvertical/payments/btcpay`); a dedicated crypto-payments service can
implement the same port later without changing callers.

- `createCheckout({ orderId, amount, currency, metadata, redirectUrl })` —
  `amount` is integer fiat minor units. Idempotent by `orderId`: a live
  checkout is returned (a different price for the same order is refused); an
  expired or invalid one is never revived.
- `getCheckout(id)` / `listCheckouts({ orderId })` return `status`
  (`open` → `confirming` → `settled`, or `expired` / `invalid`), an
  `exception` (`underpaid`, `overpaid`, `paid_late`, `manually_marked`), the
  locked fiat `amount`, `amountPaid` (fiat minor units, rounded down), native
  amounts, rate, rate source, and each payment (asset, rail, amount, fee,
  status, txid).
- `verifyWebhook(rawBody, headers)` authenticates a delivery and returns ids
  only (`eventId` is stable across redeliveries). Always act on
  `getCheckout()`, never on the webhook body. `getCheckout()` throws
  `CryptoCheckoutNotOwnedError` for a checkout the gateway did not create (for
  example an invoice made by hand at the provider): acknowledge and ignore it.
- Returned `metadata` holds only the caller's own keys, so it round-trips
  into `createCheckout`.

**Settlement belongs to the gateway.** `settled` means the gateway's own
confirmation policy is met; callers never count confirmations. For BTCPay that
policy is the required `speedPolicy` option (`HighSpeed` 0, `MediumSpeed` 1,
`LowMediumSpeed` 2, `LowSpeed` 6 confirmations — the only values BTCPay
supports). Lightning needs no caller change: add `BTC-LN` to `paymentMethods`
and payments arrive with `rail: 'lightning'`.

```ts
import { BtcpayClient, createBtcpayCheckoutGateway } from '@happyvertical/payments/btcpay';

const gateway = createBtcpayCheckoutGateway({
  client: new BtcpayClient({ baseUrl, apiKey, storeId }),
  webhookSecret,
  speedPolicy: 'LowSpeed',
  paymentMethods: ['BTC-CHAIN'],
  expirationMinutes: 15,
  paymentTolerance: 0,
  rateSource: 'kraken',
});
```

### Save a card (setup) → charge later

```ts
const setup = await stripe.createSetupSession({
  customerEmail: advertiser.email, // or providerCustomerId for an existing customer
  successUrl,
  cancelUrl,
});
redirect(setup.url); // buyer saves their card on Stripe's hosted page

// on return, read the reusable references to persist:
const saved = await stripe.getSetupResult({ sessionId: setup.sessionId });
if (saved.status === 'complete') {
  // both refs are guaranteed present when complete; persist them (never `raw`,
  // which may contain PII). Charge later via authorizePayment (see below /
  // the manual-capture adapter).
  persist({ cus: saved.providerCustomerId, pm: saved.providerPaymentMethodId,
            brand: saved.brand, last4: saved.last4 });
}
// status: 'pending' (still processing), 'failed' (declined — stop polling),
// 'expired' (session lapsed). A setup-mode Checkout webhook is only a
// "go call getSetupResult" trigger, not the save outcome itself.
```

### Manual capture (authorize → capture / void)

Charge a saved card later — e.g. hold at approval, capture on fulfillment:

```ts
const auth = await stripe.authorizePayment({
  amount: 5000, // minor units
  currency: 'CAD',
  providerPaymentMethodId: saved.providerPaymentMethodId, // pm_...
  providerCustomerId: saved.providerCustomerId, // cus_... — REQUIRED for a saved card
  quoteId: campaign.id, // stamp your id so capture/void webhooks are correlatable
  // offSession defaults to true (buyer absent). An off-session step-up throws
  // `authentication_required`; re-prompt on-session (offSession: false) to recover.
});
if (auth.status !== 'requires_capture') {
  // 'succeeded' means already captured (don't capture again); else declined.
}
await stripe.capturePayment({ providerPaymentId: auth.providerPaymentId, idempotencyKey });
// or, to release the hold:
await stripe.voidPayment({ providerPaymentId: auth.providerPaymentId, idempotencyKey });
```

Common footguns: omitting `providerCustomerId` for a customer-attached (saved)
card 400s at charge time; omitting `quoteId` leaves the intent's
capture/void/fail webhooks un-correlatable (`processing`, no `quoteId`).

Public payment amounts follow Stripe's convention: `amount` is an integer in
the smallest currency unit, paired with a `currency` code. For example,
`{ amount: 1234, currency: 'USD' }` means USD 12.34. Crypto settlement uses the
same rule at the public boundary: `{ amount: 10000, currency: 'BTC' }` means
10,000 satoshis, and `{ amount: 1000000, currency: 'USDC' }` means 1 USDC.
Adapters convert those integers to provider-specific decimal strings or atomic
unit strings internally when a protocol requires it.

Stripe-compatible whole-unit currencies that still have two-decimal ISO minor
units, such as `ISK` and `UGX`, must be passed in whole-unit increments:
`{ amount: 500, currency: 'UGX' }` means UGX 5.00, and `amount` must be evenly
divisible by 100.

## Operational Notes

### Migration Notes

Webhook parsing now requires configured secrets. Callers that previously parsed
Stripe or BTCPay webhooks without `webhookSecret` must configure the provider
secret or handle trusted test fixtures outside `parseWebhookEvent`.

`StripeAdapter.parseWebhookEvent` now rejects events that carry a connected
`account` with `PaymentVerificationError`. Stripe sends those only to Connect
endpoints; verify them with `connectWebhookSecret` through
`parseConnectWebhookEvent` or `resolveConnectWebhookEvent`.

Webhook parsing is fail-closed. `StripeAdapter.parseWebhookEvent` and
`BtcAdapter.parseWebhookEvent` require a configured `webhookSecret` and a valid
signature. BTCPay webhook payloads must include `deliveryId`; the exported
`BtcpayWebhookEvent.deliveryId` type is required. Duplicate webhook detection is
bounded, in-memory replay protection for the current adapter instance;
production webhook handlers should still persist Stripe event ids and BTCPay
delivery ids before applying side effects, especially across restarts or
multiple replicas.

Base x402 receipt replay protection is also bounded and in-memory. Persist the
accepted transaction id in the application layer if a verified x402 proof
unlocks durable access.

`StripeAdapter` sends Checkout Sessions with Stripe API-compatible expiry
values only. Expiries outside Stripe's 30 minute to 24 hour Checkout window are
rejected instead of being silently clamped.

`BtcAdapter` defaults to the BTCPay on-chain method id `BTC-CHAIN` while still
matching exact `BTC` and `BITCOIN` aliases.

`BaseUsdcAdapter` records `metadata.searchStartBlock` on created payment
options. Persist it with quote state and pass it back as
`PaymentStatusContext.searchStartBlock` after process restarts so old transfers
cannot satisfy a new quote. Stateless `getStatus` calls that provide an amount
must also provide `searchStartBlock` unless the adapter was configured with
`fromBlock`. Long-lived unpaid quotes may force `eth_getLogs` ranges that exceed
some RPC provider limits; use an archive provider, provider-supported range, or
application-level batching for old `searchStartBlock` values. Cumulative
split-transfer matching is disabled by default; enable
`allowCumulativeTransferMatching` only when every quote receives a unique deposit
address and the search start block is persisted. When quote currency is `USD`,
Base settlement assumes a 1:1 USD-to-USDC amount; callers that need live FX or
spread handling should convert to `USDC` amounts before creating payment
options.

`pollPaymentStatus` emits `event: 'timeout'` when polling times out. The
associated `status` remains the last observed status, or `pending` if no status
was observed, rather than being coerced to `failed`.


### Reverse checkout reconciliation (Stripe)

`lookupCheckout` is an optional `PaymentBackend` method. Stripe implements it
without relying on a cached create response or PaymentIntent metadata, including
Checkout Sessions created by earlier SDK releases:

```typescript
const result = await stripe.lookupCheckout({
  chargeId: dispute.chargeId,
  paymentIntentId: dispute.paymentIntentId, // optional; if supplied, must agree
  stripeAccount: verifiedAccount, // omit for platform scope
  livemode: dispute.livemode, // required expected environment
});
if (result.status === 'matched') {
  // result.checkoutId, paymentIntentId, quoteId, optional clientReferenceId
  // Bind quoteId to YOUR persisted owner/account before deciding what to do.
} else if (result.status === 'no_match') {
  // Complete absence of a Checkout Session for this authenticated payment.
} else {
  // indeterminate: pagination_limit, ambiguous, or missing_quote.
  // Retry/investigate; do not treat this as unrelated or acknowledge ownership.
}
```

Supply a PaymentIntent id, a Charge id, or both. Every Charge/PaymentIntent is
reread and validated for resource identity and environment; both supplied ids
must agree. A Charge explicitly lacking a PaymentIntent returns `no_match`.
Otherwise Stripe's [Checkout Session list PaymentIntent filter](https://docs.stripe.com/api/checkout/sessions/list)
is paginated to completion (100 per page). `maxPages` defaults to 10 and accepts
1–100; reaching the cap returns `indeterminate`, even after finding a candidate.
Malformed pages, duplicate sessions/cursors, resource/linkage mismatch, wrong
account/environment, and provider failures throw, never `no_match`.

A unique Session in payment mode returns `matched` only with a nonempty quote
from `metadata.quoteId` or `client_reference_id`; when both exist they must
agree exactly. Missing both returns `indeterminate: missing_quote`; multiple
Sessions return `indeterminate: ambiguous`. The result includes `backendId`,
`livemode`, authenticated `accountId` (absent for platform), and available
payment references. It exposes no raw provider payload. Adapter account scope
cannot be overridden with another account. All reads use that same scope.

This proves provider correlation, not application authorization or settlement.
Connected account operators control their metadata: validate the quote against
your own owner/account records. A matched quote with no local settlement can
mean settlement is delayed or the create response was lost; retain a retry path.
Only complete `no_match` proves no hosted Checkout Session, and it says nothing
about payments created by another API (including manual authorization). A
backend without this optional method supplies no absence evidence.
