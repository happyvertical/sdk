---
'@happyvertical/speech': patch
---

Fix the `openai-compatible` synthesizer's default endpoint. A base URL ending in a version segment (for example `http://gateway/tts/v1`) now posts to `/audio/speech` instead of `/v1/v1/audio/speech`, and a base already ending in `/audio/speech` is used as-is. Explicit `speechPath` overrides are unchanged.
