---
'@happyvertical/ai': minor
---

Add opt-in `continueOnLength` (per call or client default). When a reply stops on its output limit, `getAI()` clients continue from where it stopped and return the stitched text across `chat`, `complete`, `message`, and `stream` (Ollama `complete` runs as a one-message chat when continuation is on, since `/generate` cannot be continued), with seam-overlap trimming and restored sentence spacing at the seam, summed usage, and `maxContinuations` (default 3). Results expose `truncated` and `parts`; Gemini `MAX_TOKENS` now maps to `finishReason: 'length'`; streaming adapters report `onFinishReason` (once per continued stream, with the last part's reason). Tool calls, JSON output, and a reply that hit the limit before producing any text are never continued (they return `truncated: true`). With `rateLimit` pacing each continuation part is paced and retried on its own, so a rate-limit retry never re-requests parts already returned.
