---
'@happyvertical/payments': minor
---

Add the provider-neutral `CryptoCheckoutGateway` port (hosted crypto checkouts priced in fiat: idempotent creation by `orderId`, normalized status and exceptions, exact fiat paid amounts, webhook verification returning ids only) and its BTCPay implementation `createBtcpayCheckoutGateway` in `@happyvertical/payments/btcpay`. Settlement follows the gateway's own confirmation policy (BTCPay `speedPolicy`); callers never count confirmations.
