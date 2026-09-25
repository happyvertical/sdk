---
'@happyvertical/payments': minor
---

Add `@happyvertical/payments/btcpay`: a stateless BTCPay Greenfield client (`BtcpayClient`) for billing integrations — create, read, and list store invoices by `orderId`, read invoice payment methods and payments, and verify (`isValidBtcpayWebhookSignature`) and parse (`parseBtcpayWebhook`) webhooks. Errors are `BtcpayApiError` with HTTP status, Greenfield code, and retryability; they never include the API key.
