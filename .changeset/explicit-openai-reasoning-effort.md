---
'@happyvertical/ai': patch
---

Preserve explicit reasoning effort, including none, in direct OpenAI and compatible gateway chat and streaming requests.

Use LiteLLM's top-level Chat Completions reasoning_effort field. Reject unsupported explicit generic reasoning token caps and thoughts controls before transport instead of forwarding an ineffective nested envelope; Bifrost's envelope remains supported.
