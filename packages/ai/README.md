# @happyvertical/ai

Unified interface for AI model interactions across multiple providers. Supports OpenAI, Anthropic Claude, Google Gemini, AWS Bedrock, Hugging Face, Claude CLI, and Qwen3-TTS with a consistent API for chat, completions, embeddings, streaming, function calling, image operations, and text-to-speech.

## Installation

```bash
pnpm add @happyvertical/ai
```

Requires `@happyvertical/utils` as a peer dependency.

## Quick Start

```typescript
import { getAI } from '@happyvertical/ai';

const ai = await getAI({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o'
});

// Chat completion
const response = await ai.chat([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is TypeScript?' }
]);
console.log(response.content);

// Simple message (convenience wrapper around chat)
const reply = await ai.message('Explain generics in one sentence');

// Streaming
for await (const chunk of ai.stream([
  { role: 'user', content: 'Write a haiku' }
])) {
  process.stdout.write(chunk);
}
```

## Providers

```typescript
// OpenAI (default when type is omitted)
const openai = await getAI({ apiKey: 'sk-...' });

// Anthropic Claude
const claude = await getAI({ type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! });

// Google Gemini
const gemini = await getAI({ type: 'gemini', apiKey: process.env.GEMINI_API_KEY! });

// AWS Bedrock
const bedrock = await getAI({
  type: 'bedrock',
  region: 'us-east-1',
  credentials: { accessKeyId: '...', secretAccessKey: '...' }
});

// Hugging Face
const hf = await getAI({ type: 'huggingface', apiToken: process.env.HF_TOKEN! });

// Claude CLI (uses Claude Max subscription, no API key needed)
const cli = await getAI({ type: 'claude-cli', defaultModel: 'sonnet' });

// Qwen3-TTS (text-to-speech only)
const tts = await getAI({ type: 'qwen3-tts', endpoint: 'http://localhost:8880' });
```

## Environment Variables

Configuration via `HAVE_AI_*` prefix. Options passed to `getAI()` take precedence over env vars, which take precedence over provider-specific env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.).

| Variable | Purpose |
|----------|---------|
| `HAVE_AI_PROVIDER` / `HAVE_AI_TYPE` | Provider type |
| `HAVE_AI_MODEL` / `HAVE_AI_DEFAULT_MODEL` | Default model |
| `HAVE_AI_API_KEY` | API key (fallback) |
| `HAVE_AI_BASE_URL` | Custom base URL |
| `HAVE_AI_TIMEOUT` | Request timeout (ms) |
| `HAVE_AI_MAX_RETRIES` | Max retry attempts |

## API Overview

### Factory Functions

- `getAI(options)` — Creates a provider instance by type
- `getAIAuto(options)` — Auto-detects provider from credentials

### AIInterface Methods

All providers implement `AIInterface`:

| Method | Description |
|--------|-------------|
| `chat(messages, options?)` | Chat completion returning `AIResponse` |
| `message(text, options?)` | Simple single-turn convenience method |
| `complete(prompt, options?)` | Text completion |
| `stream(messages, options?)` | Streaming chat (async iterable) |
| `embed(text, options?)` | Text embeddings |
| `embedImage(image, options?)` | Image embeddings (Gemini native, OpenAI via describe-then-embed) |
| `describeImage(image, prompt?, options?)` | Image description via vision models |
| `generateImage(prompt, options?)` | Image generation (DALL-E, Imagen) |
| `countTokens(text)` | Token count estimation |
| `getModels()` | List available models |
| `getCapabilities()` | Query provider capabilities |
| `synthesizeSpeech(text, options?)` | Text-to-speech synthesis |
| `streamSpeech(text, options?)` | Streaming TTS |
| `cloneVoice(options)` | Clone a voice from audio sample |
| `designVoice(options)` | Design a voice via text description |
| `getVoices(options?)` | List available voices |

### Error Types

All extend `AIError`: `AuthenticationError`, `RateLimitError`, `ModelNotFoundError`, `ContextLengthError`, `ContentFilterError`.

### Legacy Classes

`AIClient`, `OpenAIClient`, `AIThread`, and `AIMessageClass` are exported for backward compatibility. New code should use `getAI()` and the `AIInterface` methods.

## Function Calling

```typescript
const response = await ai.chat([
  { role: 'user', content: 'What is the weather in Tokyo?' }
], {
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location']
      }
    }
  }]
});

if (response.toolCalls) {
  console.log(response.toolCalls[0].function.name);
}
```

## Usage Tracking

Track token usage, costs, and performance across all providers with the `onUsage` callback:

```typescript
const ai = await getAI({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  onUsage: (event) => {
    console.log(`[${event.provider}/${event.model}] ${event.operation}: ${event.usage?.totalTokens} tokens in ${event.duration}ms`);
    // Or: save to database, send to analytics, aggregate in-memory, etc.
  },
});
```

The `UsageEvent` payload:

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `string` | Provider name (`'openai'`, `'anthropic'`, `'gemini'`, etc.) |
| `model` | `string` | Model used (e.g. `'gpt-4o'`, `'claude-3-5-sonnet-20241022'`) |
| `operation` | `string` | `'chat'` \| `'complete'` \| `'message'` \| `'embed'` \| `'stream'` \| ... |
| `usage?` | `TokenUsage` | `{ promptTokens, completionTokens, totalTokens }` (if available) |
| `duration` | `number` | Wall-clock time in milliseconds |
| `timestamp` | `Date` | When the call completed |
| `tags?` | `Record<string, string>` | Merged from global + per-call `usageTags` |

- Works with all providers and methods (`chat`, `complete`, `message`, `embed`, `stream`)
- `complete()` and `message()` report through their underlying `chat()` call
- Errors thrown inside `onUsage` are silently caught and will not affect API results

### Tagging Usage Events

Attach custom tags to correlate usage with features, users, or workflows:

```typescript
// Global tags applied to every call
const ai = await getAI({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  usageTags: { app: 'indagator', team: 'news' },
  onUsage: (event) => {
    console.log(event.tags); // { app: 'indagator', team: 'news', feature: 'summarize' }
  },
});

// Per-call tags merge over global tags
await ai.chat(messages, {
  usageTags: { feature: 'summarize', userId: 'u_123' },
});
```

## Claude Code Context

Install context files for AI-assisted development:

```bash
npx have-ai-context
```

## License

MIT
