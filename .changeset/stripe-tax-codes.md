---
'@happyvertical/accounting': minor
---

Add optional `taxCode` to Stripe Checkout `priceData` (sent as `price_data[product_data][tax_code]`) and to invoice line items (sent as the invoice item's `tax_code`), so Stripe Tax can classify ad-hoc lines such as prepaid credit instead of using the account's default product tax code.
