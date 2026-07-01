---
"@happyvertical/payments": minor
---

Add the manual-capture card lifecycle to the Stripe adapter. `authorizePayment` creates a manual-capture PaymentIntent (holds funds without charging, returns `requires_capture`), `capturePayment` captures an authorized intent in full or part, and `voidPayment` cancels an uncaptured one. Refunds continue to use the existing `refundPayment`.

These are exposed as optional `PaymentBackend` methods (`authorizePayment?`/`capturePayment?`/`voidPayment?`) plus a `supportsManualCapture` capability flag, so settlement-only backends (crypto) are unaffected. Each op forwards an idempotency key and is covered by unit tests for success, failure, and validation paths.

`parseWebhookEvent` now also maps the PaymentIntent lifecycle events, so webhook-driven consumers see terminal statuses for captured/voided payments: `payment_intent.succeeded` → `confirmed` and `payment_intent.canceled` / `payment_intent.payment_failed` → `failed` (previously these fell through to the non-terminal `processing`).
