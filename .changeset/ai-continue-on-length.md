---
'@happyvertical/ai': minor
---

Add opt-in `continueOnLength` (per call or client default). When a reply stops on its output limit, `getAI()` clients continue from where it stopped and return the stitched text across `chat`, `complete`, `message`, and `stream`, with seam-overlap trimming, summed usage, and `maxContinuations` (default 3). Results expose `truncated` and `parts`; Gemini `MAX_TOKENS` now maps to `finishReason: 'length'`; streaming adapters report `onFinishReason`. Tool calls and JSON output are never continued. With `rateLimit` pacing each continuation part is paced and retried on its own, so a rate-limit retry never re-requests parts already returned.
