# @happyvertical/payments

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
