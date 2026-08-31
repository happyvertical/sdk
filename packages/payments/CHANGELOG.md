# @happyvertical/payments

## 0.89.3

## 0.89.2

## 0.89.1

## 0.89.0

## 0.88.2

## 0.88.1

## 0.88.0

## 0.87.0

## 0.86.4

## 0.86.3

## 0.86.2

## 0.86.1

## 0.86.0

## 0.85.5

## 0.85.4

## 0.85.3

## 0.85.2

## 0.85.1

## 0.85.0

## 0.84.0

## 0.83.0

## 0.82.0

## 0.81.0

## 0.80.6

## 0.80.5

## 0.80.4

## 0.80.3

## 0.80.2

## 0.80.1

## 0.80.0

## 0.79.0

## 0.78.3

## 0.78.2

## 0.78.1

## 0.78.0

## 0.77.0

## 0.76.2

### Patch Changes

- f8af6d1: Fix `StripeAdapter.refundPayment` to read the refunded currency back from the Stripe Refund response (`readStripeResultCurrency(refund) ?? currency.toUpperCase()`) instead of always returning the requested/defaulted currency. Previously, a full refund of a payment whose currency differed from the adapter's `defaultCurrency` where the caller omitted `input.currency` could report the wrong `RefundResult.currency` (the adapter default rather than the actual refunded currency). This matches the read-back already done by `capturePayment` and `voidPayment`.

## 0.76.1

### Patch Changes

- c191a28: Fix `StripeAdapter.refundPayment` to read the refunded amount back from the Stripe refund response. `RefundResult.amount` now comes from `readSafeInteger(refund, 'amount') ?? input.amount` (mirroring `capturePayment`), so a full refund — where the caller supplies no `amount` — surfaces the amount Stripe actually refunded instead of `undefined`. Partial refunds are unaffected, since the response echoes the requested amount.

## 0.76.0

### Minor Changes

- 066af2f: Add saved-payment-method (card on file) support to the Stripe adapter. `createSetupSession` starts a hosted Checkout Session in `setup` mode so a buyer can save a card without being charged, and `getSetupResult` reads back the resulting reusable references (`cus_`/`pm_`) plus non-sensitive card display fields (brand / last4 / expiry) — never raw card data.

  Exposed as optional `PaymentBackend` methods (`createSetupSession?`/`getSetupResult?`) plus a `supportsSavedPaymentMethods` capability flag, so settlement-only backends are unaffected. Covered by unit tests for the session, the result parse, validation, and failure paths.

## 0.75.0

### Minor Changes

- 26a8743: Add the manual-capture card lifecycle to the Stripe adapter. `authorizePayment` creates a manual-capture PaymentIntent (holds funds without charging, returns `requires_capture`), `capturePayment` captures an authorized intent in full or part, and `voidPayment` cancels an uncaptured one. Refunds continue to use the existing `refundPayment`. `authorizePayment` is off-session by default (`offSession`, for charging a saved card while the buyer is absent — the primary use) and sends the `customer` when `providerCustomerId` is supplied, as Stripe requires for a customer-attached payment method.

  These are exposed as optional `PaymentBackend` methods (`authorizePayment?`/`capturePayment?`/`voidPayment?`) plus a `supportsManualCapture` capability flag, so settlement-only backends (crypto) are unaffected. Each op forwards an idempotency key and is covered by unit tests for success, failure, and validation paths.

  `parseWebhookEvent` now also maps the PaymentIntent lifecycle events **for intents this adapter created** (identified by a `quoteId` in metadata), so their webhook-driven consumers see terminal statuses: `payment_intent.succeeded` → `confirmed`, `payment_intent.canceled` / `payment_intent.payment_failed` → `failed`. PaymentIntents the adapter doesn't own — e.g. ones a Checkout Session created, which fire the same events with no `quoteId` — stay non-terminal (`processing`) and are handled via the `checkout.session.*` events, so a normal checkout doesn't emit a spurious, uncorrelatable terminal event. An auto-canceled (lapsed) hold maps to `expired` rather than `failed`. Terminal `failed`/`refunded` webhook statuses are now scoped to payment-in events (Checkout Session / PaymentIntent / Charge), so money-out events (`transfer.failed`, `payout.failed`, …) — which can carry a `quoteId` from `sendPayout` — are no longer miscorrelated as a payment failure.

## 0.74.11

## 0.74.10

## 0.74.9

## 0.74.8

## 0.74.7

## 0.74.6

## 0.74.5

## 0.74.4

## 0.74.3

## 0.74.2

## 0.74.1
