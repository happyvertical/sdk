---
'@happyvertical/ai': minor
---

`RateLimitError` keeps what the provider said. New fields: `reason` (the provider's text, for example Bifrost's `token limit exceeded (277867/250000, resets every 1h)`, now also in the message), `retryAfterMs` (from `Retry-After`, `x-ratelimit-reset-*` / `anthropic-ratelimit-*-reset` headers, or text such as "try again in 20s"; `retryAfter` in seconds is filled from it too), `limitWindowMs` (a named window with no reset time, such as "resets every 1h"), and `cause` (the provider error). The constructor takes an optional third `details` argument. All chat providers that map a 429 now fill these; TypeSafe's `Retry-After` header was previously never read.
