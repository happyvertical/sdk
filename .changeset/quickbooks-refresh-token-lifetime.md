---
'@happyvertical/accounting': patch
---

Fix QuickBooks token refresh always failing with `EXCHANGE_FAILED`: declare a refresh-token lifetime to intuit-oauth so it no longer rejects the stored token as expired before contacting Intuit (#1558).
