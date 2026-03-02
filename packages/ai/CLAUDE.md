# @happyvertical/ai

Multi-provider AI client. Factory: `getAI(options): Promise<AIInterface>`.

## Adapters

openai, anthropic, gemini, huggingface, bedrock, claude-cli, qwen3-tts. All in `src/providers/`.

## Key patterns

- Streaming via async generators: `for await (const chunk of ai.stream(messages))`
- Tool use unified across providers via `AITool` interface
- Multimodal: `content` accepts `string | ContentPart[]` (text + images)
- Image ops: `describeImage()`, `embedImage()`, `generateImage()` (not all providers)
- Embeddings only on OpenAI and Gemini

## Gotchas

- Anthropic requires alternating user/assistant messages
- `claude-cli` adapter uses subprocess, no embeddings or tool use
- Context limits are hardcoded per model — not fetched from API
- Env vars use `HAVE_AI_*` prefix; user options take precedence
