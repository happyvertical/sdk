---
"@happyvertical/payments": patch
---

Fix `StripeAdapter.refundPayment` to read the refunded amount back from the Stripe refund response. `RefundResult.amount` now comes from `readSafeInteger(refund, 'amount') ?? input.amount` (mirroring `capturePayment`), so a full refund — where the caller supplies no `amount` — surfaces the amount Stripe actually refunded instead of `undefined`. Partial refunds are unaffected, since the response echoes the requested amount.
