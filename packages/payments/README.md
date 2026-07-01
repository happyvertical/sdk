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
- `StripeAdapter`: Stripe Checkout URL settlement, webhook verification,
  refunds, Stripe Connect transfers, and saved payment methods / card-on-file
  (`createSetupSession` / `getSetupResult`).

The package does not depend on SMRT or a database. Consumers own quote
persistence, webhook routing, and operational policy.

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
