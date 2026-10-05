---
'@happyvertical/accounting': patch
---

Keep Intuit's official OAuth client external to the accounting bundle so the
public QuickBooks OAuth and token-refresh paths execute in plain Node.js.
