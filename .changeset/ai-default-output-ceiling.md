---
'@happyvertical/ai': patch
---

Stop capping explicit `maxTokens` at 4096 by default. The output ceiling (`generationLimits.maxOutputTokens`) now defaults to 131072; the 4096 default applies only when a caller passes no `maxTokens` (`generationLimits.defaultOutputTokens`). A deployment-configured ceiling is still enforced (error or clamp).
