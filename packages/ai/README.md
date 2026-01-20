---
id: ai
title: "@happyvertical/ai: Multi-Provider AI Integration"
sidebar_label: "@happyvertical/ai"
sidebar_position: 2
---

# @happyvertical/ai

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A standardized interface for AI model interactions across multiple providers in the HAVE SDK.

## Overview

The `@happyvertical/ai` package provides a unified interface for interacting with various AI models, making it easy to switch between providers without changing your application code. Supports **OpenAI**, **Anthropic Claude**, **Google Gemini**, **AWS Bedrock**, and **Hugging Face** with a consistent API.

## Features

- **Multi-Provider Support**: OpenAI, Anthropic, Google Gemini, AWS Bedrock, Hugging Face, and Claude CLI
- **Unified Interface**: Consistent API across all providers
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Streaming Responses**: Real-time content streaming for all providers
- **Function Calling**: Tool usage and function calling support (where available)
- **Error Handling**: Standardized error types with retry logic
- **Auto-Detection**: Automatically detect provider from credentials
- **Embeddings**: Text embeddings support (OpenAI and other embedding providers)
- **Model Information**: Query available models and capabilities
- **Claude Max Integration**: Use Claude CLI to leverage Max subscription instead of API billing

## Installation

```bash
# Install with bun (recommended)
bun add @happyvertical/ai

# Or with npm
npm install @happyvertical/ai

# Or with yarn
yarn add @happyvertical/ai
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-ai-context
```

This copies the package's `CLAUDE.md` documentation and `.claude-meta.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Quick Start

### Basic Usage (Auto-Detection)

```typescript
import { getAI } from '@happyvertical/ai';

// OpenAI (default)
const openai = await getAI({
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o'
});

// Chat completion
const response = await openai.chat([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is TypeScript?' }
]);

console.log(response.content);
console.log(`Tokens used: ${response.usage?.totalTokens}`);
```

### Multiple Providers

```typescript
import { getAI } from '@happyvertical/ai';

// OpenAI
const openai = await getAI({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o'
});

// Anthropic Claude
const claude = await getAI({
  type: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  defaultModel: 'claude-3-5-sonnet-20241022'
});

// Google Gemini
const gemini = await getAI({
  type: 'gemini',
  apiKey: process.env.GEMINI_API_KEY!,
  defaultModel: 'gemini-1.5-pro'
});

// AWS Bedrock
const bedrock = await getAI({
  type: 'bedrock',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  },
  defaultModel: 'anthropic.claude-3-sonnet-20240229-v1:0'
});

// Claude CLI (uses Claude Max subscription)
const claudeCli = await getAI({
  type: 'claude-cli',
  defaultModel: 'sonnet' // or 'opus', 'haiku'
  // No API key needed - uses existing Claude session
});
```

### Streaming Responses

```typescript
// Stream response in real-time
for await (const chunk of client.stream([
  { role: 'user', content: 'Write a story about AI' }
])) {
  process.stdout.write(chunk);
}
```

### Function Calling

```typescript
const response = await client.chat([
  { role: 'user', content: 'What is the weather in Tokyo?' }
], {
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' }
        },
        required: ['location']
      }
    }
  }],
  toolChoice: 'auto'
});

if (response.toolCalls) {
  console.log('Function called:', response.toolCalls[0].function.name);
}
```

### Embeddings

```typescript
// Generate text embeddings (OpenAI)
const embeddings = await client.embed([
  'First document text',
  'Second document text'
]);

console.log(`Generated ${embeddings.embeddings.length} embeddings`);
```

### Error Handling

```typescript
import {
  getAI,
  AIError,
  AuthenticationError,
  RateLimitError,
  ModelNotFoundError
} from '@happyvertical/ai';

try {
  const response = await client.chat([
    { role: 'user', content: 'Hello' }
  ]);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, retry after:', error.message);
  } else if (error instanceof ModelNotFoundError) {
    console.error('Model not available:', error.model);
  } else if (error instanceof AIError) {
    console.error('AI Error:', error.code, error.message);
  }
}
```

### Provider Capabilities

```typescript
// Check what features are supported
const capabilities = await client.getCapabilities();

if (capabilities.functions) {
  console.log('Function calling is supported');
}

if (capabilities.vision) {
  console.log('Vision/multimodal input is supported');
}

// Get available models
const models = await client.getModels();
console.log('Available models:', models.map(m => m.id));
```

## Provider-Specific Features

### OpenAI
- **Models**: GPT-4o, GPT-4 Turbo, GPT-3.5 Turbo
- **Features**: Chat, completions, embeddings, function calling, vision
- **Strengths**: Best function calling, JSON mode, wide model selection

### Anthropic Claude
- **Models**: Claude 3.5 Sonnet, Claude 3.5 Haiku, Claude 3 Opus
- **Features**: Chat, completions, streaming, vision (no embeddings)
- **Strengths**: Large context (200k tokens), safety-focused

### Google Gemini
- **Models**: Gemini 1.5 Pro, Gemini 1.5 Flash
- **Features**: Chat, completions, streaming, multimodal
- **Strengths**: Multimodal capabilities, cost-effective

### AWS Bedrock
- **Models**: Claude, Llama, Titan models available through AWS
- **Features**: Enterprise-grade security, region-specific deployment
- **Strengths**: AWS integration, compliance, scalability

### Hugging Face
- **Models**: Thousands of community and commercial models
- **Features**: Custom models, specialized use cases
- **Strengths**: Model variety, community ecosystem

### Claude CLI
- **Models**: Claude Sonnet, Opus, Haiku (via CLI short names)
- **Features**: Chat, completions, streaming (no embeddings or function calling)
- **Strengths**: Zero cost (uses Claude Max subscription), no API key management
- **Authentication**:
  - **Local**: Uses existing Claude Code session (no setup needed)
  - **CI/CD**: Use `claude setup-token` to create long-lived token for GitHub Actions

```typescript
// Local development (uses Claude Max session)
const client = await getAI({
  type: 'claude-cli',
  defaultModel: 'sonnet'
});

// With custom CLI path
const client = await getAI({
  type: 'claude-cli',
  cliPath: '/custom/path/to/claude'
});

// Chat example
const response = await client.chat([
  { role: 'user', content: 'Explain TypeScript generics' }
]);

// Streaming example
for await (const chunk of client.stream([
  { role: 'user', content: 'Write a story about AI' }
])) {
  process.stdout.write(chunk);
}
```

**Note**: Requires Claude Code CLI to be installed. Visit [Claude Code documentation](https://docs.claude.com/en/docs/claude-code/) for installation instructions.

## Environment Variable Configuration

The `@happyvertical/ai` package supports configuration via environment variables using the `HAVE_AI_*` prefix pattern:

```bash
# .env file
HAVE_AI_PROVIDER=openai
HAVE_AI_MODEL=gpt-4o
HAVE_AI_TIMEOUT=60000
HAVE_AI_MAX_RETRIES=5
HAVE_AI_API_KEY=your-api-key-here
HAVE_AI_BASE_URL=https://custom.proxy.com/v1
```

### Supported Environment Variables

- `HAVE_AI_PROVIDER` or `HAVE_AI_TYPE` → Provider type ('openai', 'anthropic', 'gemini', 'huggingface', 'bedrock', 'claude-cli')
- `HAVE_AI_MODEL` or `HAVE_AI_DEFAULT_MODEL` → Default model name
- `HAVE_AI_TIMEOUT` → Request timeout in milliseconds (number)
- `HAVE_AI_MAX_RETRIES` → Maximum retry attempts (number)
- `HAVE_AI_API_KEY` → API key (fallback if provider-specific key not set)
- `HAVE_AI_BASE_URL` → Custom base URL for API requests

### Usage Examples

```typescript
import { getAI } from '@happyvertical/ai';

// Example 1: Use environment variables only
// Set: HAVE_AI_PROVIDER=openai, HAVE_AI_MODEL=gpt-4o
const client1 = await getAI({});
// Creates OpenAIProvider with model 'gpt-4o'

// Example 2: Mix env vars and options (options take precedence)
// Set: HAVE_AI_PROVIDER=openai, HAVE_AI_MODEL=gpt-3.5-turbo
const client2 = await getAI({
  type: 'anthropic', // Overrides HAVE_AI_PROVIDER
  defaultModel: 'claude-3-5-sonnet-20241022' // Overrides HAVE_AI_MODEL
});

// Example 3: Configure timeout and retries
// Set: HAVE_AI_TYPE=openai, HAVE_AI_API_KEY=sk-..., HAVE_AI_TIMEOUT=60000
const client3 = await getAI({});
// Creates OpenAI client with 60s timeout

// Example 4: Custom base URL for proxies
// Set: HAVE_AI_TYPE=openai, HAVE_AI_API_KEY=sk-..., HAVE_AI_BASE_URL=https://proxy.com
const client4 = await getAI({});
```

### Provider-Specific Environment Variables

In addition to `HAVE_AI_*` variables, the package also checks:

- `OPENAI_API_KEY` → OpenAI API key
- `ANTHROPIC_API_KEY` → Anthropic API key
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` → Google Gemini API key
- `HF_TOKEN` → Hugging Face API token
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` → AWS Bedrock

### Precedence Order

1. **Explicit options** passed to `getAI()` (highest priority)
2. **HAVE_AI_* environment variables**
3. **Provider-specific environment variables** (lowest priority)

### Best Practices

- Use `.env` files with `dotenv` for local development
- Never commit `.env` files to version control
- Use secrets management (GitHub Secrets, AWS Secrets Manager) in production
- Validate environment variables before calling `getAI()` in production code
- Use `HAVE_AI_API_KEY` as a general fallback for simpler multi-provider setups

## Advanced Usage

### Auto-Detection
```typescript
import { getAIAuto } from '@happyvertical/ai';

// Automatically detects provider from credentials
const client = await getAIAuto({
  apiKey: 'sk-...',  // Detected as OpenAI
  // apiToken: 'hf_...', // Would detect as Hugging Face
  // region: 'us-east-1', credentials: {...} // Would detect as Bedrock
});
```

### Multi-Provider Fallback
```typescript
const providers = [
  await getAI({ type: 'openai', apiKey: process.env.OPENAI_API_KEY! }),
  await getAI({ type: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY! })
];

async function robustChat(messages: AIMessage[]) {
  for (const provider of providers) {
    try {
      return await provider.chat(messages);
    } catch (error) {
      console.warn('Provider failed, trying next:', error);
    }
  }
  throw new Error('All providers failed');
}
```

## Writing Custom Providers

To add support for a new AI provider, implement the `AIInterface`:

```typescript
import { AIInterface, AIMessage, AIResponse, ChatOptions } from '@happyvertical/ai';

export class MyAIProvider implements AIInterface {
  constructor(private options: MyProviderOptions) {
    // Initialize provider client
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse> {
    // Implement chat completion
    // Map provider's response to AIResponse format
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<AIResponse> {
    // Implement text completion
  }

  async embed(text: string | string[], options?: EmbeddingOptions): Promise<EmbeddingResponse> {
    // Implement embeddings (if supported)
  }

  async *stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string> {
    // Implement streaming responses
    for await (const chunk of providerStream) {
      yield chunk.content;
    }
  }

  async countTokens(text: string): Promise<number> {
    // Estimate or calculate token count
  }

  async getModels(): Promise<AIModel[]> {
    // Return available models
  }

  async getCapabilities(): Promise<AICapabilities> {
    // Return provider capabilities
  }
}
```

### Registering Your Provider

Update the factory function in `shared/factory.ts`:

```typescript
export async function getAI(options: GetAIOptions): Promise<AIInterface> {
  if (isMyProviderOptions(options)) {
    const { MyAIProvider } = await import('./providers/my-provider.js');
    return new MyAIProvider(options);
  }
  // ... other providers
}
```

### Implementation Guidelines

- **Error Mapping**: Map provider-specific errors to standardized error types (`AIError`, `RateLimitError`, `AuthenticationError`)
- **Message Formatting**: Convert standard `AIMessage` format to provider's expected format
- **Streaming**: Use async generators for streaming responses
- **Token Counting**: Provide approximations if exact counting isn't available
- **Type Safety**: Define provider-specific options interface

## TypeScript Support

The package is written in TypeScript and provides comprehensive type definitions:

```typescript
import type {
  AIInterface,
  AIMessage,
  AIResponse,
  ChatOptions,
  AICapabilities,
  TokenUsage
} from '@happyvertical/ai';
```

## API Reference

- **Factory Functions**: `getAI()`, `getAIAuto()`
- **Core Interface**: `AIInterface` with `chat()`, `complete()`, `embed()`, `stream()`
- **Error Types**: `AIError`, `AuthenticationError`, `RateLimitError`, etc.
- **Options**: Provider-specific configuration interfaces
- **Types**: Comprehensive TypeScript definitions

For complete API documentation, see the generated TypeDoc documentation in the `docs/` directory or visit the [HAVE SDK documentation site](https://happyvertical.github.io/sdk/).

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.