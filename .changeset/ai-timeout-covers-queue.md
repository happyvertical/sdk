---
'@happyvertical/ai': minor
---

With `rateLimit` pacing, the request `timeout` now covers the whole call: time queued behind other calls on the same key, cooldown and retry waits, and the request itself (which gets only the remaining time). Previously a call could wait in the queue far longer than its timeout. A call still queued at its deadline fails with `AI_TIMEOUT` without reaching the provider; when a rate limit has closed the key past the deadline it fails at once with a `RateLimitError` carrying the original `reason` and remaining `retryAfterMs`; a retry that cannot finish in time is not started; aborting `signal` releases a queued call. Behavior change: paced calls that used to wait out a long queue now time out.
