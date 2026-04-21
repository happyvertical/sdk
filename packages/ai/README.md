# @happyvertical/ai

Unified interface for AI model interactions across multiple providers. Supports OpenAI, LiteLLM, Ollama, Anthropic Claude, Google Gemini, AWS Bedrock, Hugging Face, Claude CLI, and Qwen3-TTS with a consistent API for chat, completions, embeddings, streaming, function calling, image operations, and text-to-speech.

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

// LiteLLM (OpenAI-compatible gateway)
const litellm = await getAI({
  type: 'litellm',
  apiKey: process.env.LITELLM_API_KEY!,
  baseUrl: process.env.LITELLM_BASE_URL || 'https://llm.happyvertical.com/v1',
  defaultModel: process.env.LITELLM_MODEL, // Use a model id returned by /v1/models
});

// Ollama (local by default)
const ollama = await getAI({
  type: 'ollama',
  baseUrl: process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST || 'http://localhost:11434',
  apiKey: process.env.OLLAMA_API_KEY, // Optional, only needed for remote/cloud hosts
  defaultModel: process.env.OLLAMA_MODEL, // Optional; otherwise the first compatible local model is selected
});

// Bare host:port values are also accepted and normalized to http://
const ollamaNode = await getAI({
  type: 'ollama',
  baseUrl: 'warthog:11434',
});

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

## Opt-In Rate-Limit Pacing

Use `rateLimit` when multiple calls share the same provider budget and you want
`getAI()` to serialize requests, honor `Retry-After` hints, and retry only
rate-limit failures.

Pacing is enabled when:
- you set `enabled: true`, or
- you omit `enabled` and set any pacing field such as `key`, `cooldownMs`, `initialDelayMs`, or `maxAttempts`

```typescript
const ai = await getAI({
  type: 'gemini',
  apiKey: process.env.GEMINI_API_KEY!,
  defaultModel: 'gemini-2.5-flash',
  rateLimit: {
    enabled: true,
    key: 'gemini:shared-batch-key',
    cooldownMs: 2000,
    initialDelayMs: 15000,
    maxAttempts: 3,
  },
});
```

- `key` coordinates pacing across multiple clients in the same process
- `cooldownMs` spaces successful calls that share the same budget
- `initialDelayMs` is the fallback retry delay when the provider omits `Retry-After`
- `maxAttempts` counts the first call plus any rate-limit retries

When `rateLimit` is omitted, or `enabled: false` is set explicitly, `getAI()`
behaves exactly as it did before.

### `rateLimit` Options

| Field | Type | Default | Notes |
|------|------|---------|------|
| `enabled` | `boolean` | unset | Set to `true` for explicit opt-in, or `false` to force pacing off even if other pacing fields are present |
| `key` | `string` | derived | Shared budget key; clients with the same key coordinate with each other |
| `cooldownMs` | `number` | `0` | Minimum delay after a successful call before the next call with the same key |
| `initialDelayMs` | `number` | `5000` | Fallback retry delay when the provider does not return `Retry-After` |
| `maxAttempts` | `number` | `3` | Total attempts, including the initial call |
| `requestsPerMinute` | `number` | provider-specific | Used by `qwen3-tts` local token-bucket limiting |
| `maxConcurrent` | `number` | provider-specific | Used by `qwen3-tts` local concurrency limiting |

- If `key` is omitted, `@happyvertical/ai` derives a provider-scoped key from the configured credentials
- Setting any of `key`, `cooldownMs`, `initialDelayMs`, or `maxAttempts` also opts in when `enabled` is omitted
- Only normalized rate-limit failures are retried
- `stream()` is left unchanged; pacing is applied to the promise-returning request methods

Example quota-sensitive batch workload:

```typescript
const ai = await getAI({
  type: 'gemini',
  apiKey: process.env.GEMINI_API_KEY!,
  defaultModel: 'gemini-2.5-flash',
  rateLimit: {
    enabled: true,
    key: 'praeco:multi-site-analysis',
    cooldownMs: 2000,
    initialDelayMs: 15000,
    maxAttempts: 3,
  },
});

for (const site of sites) {
  const summary = await ai.message(`Summarize anomalies for ${site.name}`);
  console.log(site.name, summary);
}
```

## Environment Variables

`getAI()` reads `HAVE_AI_*` variables. Explicit options passed to `getAI()` take precedence over those env vars.

| Variable | Purpose |
|----------|---------|
| `HAVE_AI_PROVIDER` / `HAVE_AI_TYPE` | Provider type |
| `HAVE_AI_MODEL` / `HAVE_AI_DEFAULT_MODEL` | Default model |
| `HAVE_AI_API_KEY` | API key (fallback) |
| `HAVE_AI_BASE_URL` | Custom base URL |
| `HAVE_AI_TIMEOUT` | Request timeout (ms) |
| `HAVE_AI_MAX_RETRIES` | Max retry attempts |

### Node Auto-Detection Env Vars

`getAIAuto()` also checks provider-specific Node.js environment variables:

- `LITELLM_BASE_URL`, `LITELLM_API_KEY`
- `OLLAMA_HOST`, `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`
- `HF_TOKEN`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`

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
| `embedImage(image, options?)` | Image embeddings (Gemini and Bedrock native, OpenAI and Ollama via describe-then-embed) |
| `describeImage(image, prompt?, options?)` | Image description via vision models |
| `generateImage(prompt, options?)` | Image generation (DALL-E, Imagen, Titan Image Generator, Ollama-compatible image models) |
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

- `AIError.retryable` distinguishes retryable failures from terminal ones
- `RateLimitError.retryAfter` exposes provider retry hints in seconds when available

```typescript
try {
  await ai.chat(messages);
} catch (error) {
  if (error instanceof RateLimitError && error.retryable) {
    console.log('retry after seconds:', error.retryAfter);
  }
}
```

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
