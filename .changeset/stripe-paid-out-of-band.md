---
'@happyvertical/accounting': minor
---

Add optional `invoices.markPaidOutOfBand()` (Stripe `invoices/:id/pay` with `paid_out_of_band`, idempotent, finalizes drafts without automatic collection, refuses void invoices) and `ExternalInvoice.paidOutOfBand`, so an invoice paid on another rail can be closed at Stripe.
