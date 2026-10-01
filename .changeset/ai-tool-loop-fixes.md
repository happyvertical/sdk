---
'@happyvertical/ai': patch
---

Fix multi-round tool loops across chat providers:

- `AIMessage` gains `tool_call_id`, and tool call ids round-trip through every chat provider (OpenAI-compatible providers such as OpenAI, Bifrost, and LiteLLM previously dropped it, so the second call of a tool loop failed with 400). Tool calls share a new `AIToolCall` type with optional `thoughtSignature` (Gemini 3) and `thinkingBlocks` (Anthropic).
- `tool_choice` is sent only when tools are declared (OpenAI-compatible and Anthropic), so a loop's final, tool-less round no longer fails.
- Anthropic declares minimal definitions for tools referenced by the history on a final tool-less round, maps `toolChoice: 'none'` to `tool_choice: { type: 'none' }`, replays thinking and redacted-thinking blocks ahead of `tool_use` in extended-thinking loops, sends tool results that match no replayed `tool_use` as plain text, and declares tools in `stream()` only when the history needs them (streams do not yield tool calls).
- Bedrock keeps `toolConfig` on a loop's final round (`'none'` omits `toolChoice` and adds a no-tools system instruction).
- Gemini replays only function calls that have a matching response and sends Google's documented placeholder thought signature for Gemini 3 when history lacks one; persist `thoughtSignature` to avoid it.
