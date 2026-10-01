---
'@happyvertical/ai': patch
---

Stop capping explicit `maxTokens` at 4096 by default. The output ceiling (`generationLimits.maxOutputTokens`) now defaults to 131072; the 4096 default applies only when a caller passes no `maxTokens` (`generationLimits.defaultOutputTokens`). A deployment-configured ceiling is still enforced (error or clamp).

Behavior change that can raise spend: a caller that passes a large `maxTokens` (for example 16000) previously had it rejected or clamped to 4096 and now gets up to the requested number of output tokens per request. Set `generationLimits.maxOutputTokens` to keep a lower ceiling.
