---
'@happyvertical/ai': minor
---

A `RateLimitError` whose limit resets more than a minute away (`retryAfterMs`, else `limitWindowMs`) now has `retryable: false`, so job runners and `isRetryableAIError` stop re-running work that cannot succeed soon; reschedule it after `retryAfterMs ?? limitWindowMs` instead. Paced clients never retry such errors in-process, and the new `rateLimit.maxRetryDelayMs` option (default 60000) sets the threshold. Behavior change: callers that treated every `RateLimitError` as retryable now see `false` for far resets. The pacing retry delay also honors millisecond reset hints.
