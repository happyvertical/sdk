---
'@happyvertical/accounting': minor
---

Add optional `automaticTax` and `taxCode` to `payments.chargeSavedPaymentMethod()`. The Stripe adapter calculates tax with Stripe Tax from the customer's saved tax location, charges subtotal plus tax, and links the calculation to the PaymentIntent so Stripe records the tax transaction on success (and reverses it on refunds). Results and payment webhook summaries report `subtotalMinor`, `taxMinor`, and `taxCalculationExternalId`; a customer without a usable tax location is a `failed` outcome with `customer_tax_location_invalid` and no charge.
