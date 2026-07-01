---
"@happyvertical/payments": minor
---

Add saved-payment-method (card on file) support to the Stripe adapter. `createSetupSession` starts a hosted Checkout Session in `setup` mode so a buyer can save a card without being charged, and `getSetupResult` reads back the resulting reusable references (`cus_`/`pm_`) plus non-sensitive card display fields (brand / last4 / expiry) — never raw card data.

Exposed as optional `PaymentBackend` methods (`createSetupSession?`/`getSetupResult?`) plus a `supportsSavedPaymentMethods` capability flag, so settlement-only backends are unaffected. Covered by unit tests for the session, the result parse, validation, and failure paths.
