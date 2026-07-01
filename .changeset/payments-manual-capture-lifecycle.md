---
"@happyvertical/payments": minor
---

Add the manual-capture card lifecycle to the Stripe adapter. `authorizePayment` creates a manual-capture PaymentIntent (holds funds without charging, returns `requires_capture`), `capturePayment` captures an authorized intent in full or part, and `voidPayment` cancels an uncaptured one. Refunds continue to use the existing `refundPayment`.

These are exposed as optional `PaymentBackend` methods (`authorizePayment?`/`capturePayment?`/`voidPayment?`) plus a `supportsManualCapture` capability flag, so settlement-only backends (crypto) are unaffected. Each op forwards an idempotency key and is covered by unit tests for success, failure, and validation paths.

`parseWebhookEvent` now also maps the PaymentIntent lifecycle events **for intents this adapter created** (identified by a `quoteId` in metadata), so their webhook-driven consumers see terminal statuses: `payment_intent.succeeded` → `confirmed`, `payment_intent.canceled` / `payment_intent.payment_failed` → `failed`. PaymentIntents the adapter doesn't own — e.g. ones a Checkout Session created, which fire the same events with no `quoteId` — stay non-terminal (`processing`) and are handled via the `checkout.session.*` events, so a normal checkout doesn't emit a spurious, uncorrelatable terminal event.
