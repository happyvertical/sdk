---
'@happyvertical/payments': minor
---

Add the provider-neutral `CryptoCheckoutGateway` port (hosted crypto checkouts priced in fiat: idempotent creation by `orderId`, normalized status and exceptions, exact fiat paid amounts, webhook verification returning ids only) and its BTCPay implementation `createBtcpayCheckoutGateway` in `@happyvertical/payments/btcpay`. Settlement follows the gateway's own confirmation policy (BTCPay `speedPolicy`); callers never count confirmations.

`BtcpayInvoicePaymentMethod.paymentMethodPaid` is now optional: an absent value means BTCPay did not report it (it is no longer read as `'0'`), and the Greenfield 1.x `paid` alias is read. `listInvoices` accepts `includeArchived`.

`getCheckout()` throws the new `CryptoCheckoutNotOwnedError` (new `PaymentErrorCode` `PAYMENT_NOT_OWNED`) for a checkout the gateway did not create — routine for store-scoped webhooks; acknowledge and ignore it. Code that switches exhaustively over `PaymentErrorCode` must handle the new member.
