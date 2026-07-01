---
"@happyvertical/payments": minor
---

Add the manual-capture card lifecycle to the Stripe adapter. `authorizePayment` creates a manual-capture PaymentIntent (holds funds without charging, returns `requires_capture`), `capturePayment` captures an authorized intent in full or part, and `voidPayment` cancels an uncaptured one. Refunds continue to use the existing `refundPayment`.

These are exposed as optional `PaymentBackend` methods (`authorizePayment?`/`capturePayment?`/`voidPayment?`) plus a `supportsManualCapture` capability flag, so settlement-only backends (crypto) are unaffected. Each op forwards an idempotency key and is covered by unit tests for success, failure, and validation paths.
