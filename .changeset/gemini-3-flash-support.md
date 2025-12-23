---
"@happyvertical/ai": minor
---

Add support for Gemini 3 Flash Preview model with thinking level configuration

- Add Vertex AI support with `projectId` and `location` options
- Add `gemini-3-flash-preview` to available models list
- Add `thinkingLevel` parameter ('minimal', 'low', 'medium', 'high') for Gemini 3 models
- Add `includeThoughts` option to include model's internal reasoning in response
- Support thinking level at both provider-level (default) and per-request
- Add comprehensive integration tests for Gemini 3 Flash
