---
'@happyvertical/accounting': minor
---

Stripe billing for card-on-file launches: idempotent customer creation
reconciled by local id (#1268); Stripe Tax, billing-address collection,
customer updates, and ISO minor-unit prices on Checkout (#1269);
provider-neutral off-session `payments.chargeSavedPaymentMethod` with
normalized payment webhooks (#1270); invoice line discounts as amount-off
coupons, `uncollectible` invoice status, and `invoices.markUncollectible`
(#1271); setup-mode Checkout, `retrieveCheckoutSession`,
`setDefaultPaymentMethod`, and `charge_automatically` invoices (#1273); and
invoice line service periods (#1274). Stripe API failures now throw
`StripeApiError` (same message, plus `status`, `type`, and `code`).
