---
"@happyvertical/ai": patch
---

Fix the OpenAI provider sending `max_tokens` and `temperature` on every chat
completion, which `gpt-5` family models (`gpt-5`, `gpt-5-mini`, `gpt-5-nano`,
and future `gpt-5*` variants) and the `o1`/`o3`/`o4` reasoning-model families
reject with a 400 error — `max_tokens` must be `max_completion_tokens` for
these models, and they do not accept a `temperature` parameter at all.

Adds an exported `usesCompletionTokenLimit(model)` helper in
`packages/ai/src/shared/providers/openai.ts` and applies it at every place the
OpenAI provider builds a chat/completion request body (non-streaming,
streaming, and the reasoning-gateway path shared by `BifrostProvider` and
`LiteLLMProvider`): affected models now send `max_completion_tokens` and omit
`temperature` entirely, while `gpt-4.x`, `gpt-3.5`, and all other models keep
sending `max_tokens` and `temperature` unchanged.
