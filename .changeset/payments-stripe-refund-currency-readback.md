---
"@happyvertical/payments": patch
---

Fix `StripeAdapter.refundPayment` to read the refunded currency back from the Stripe Refund response (`readStripeResultCurrency(refund) ?? currency.toUpperCase()`) instead of always returning the requested/defaulted currency. Previously, a full refund of a payment whose currency differed from the adapter's `defaultCurrency` where the caller omitted `input.currency` could report the wrong `RefundResult.currency` (the adapter default rather than the actual refunded currency). This matches the read-back already done by `capturePayment` and `voidPayment`.
