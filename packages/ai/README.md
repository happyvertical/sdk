# @have/ai

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A standardized interface for AI model interactions in the HAVE SDK.

## Overview

The `@have/ai` package provides a consistent interface for interacting with various AI models, making it easy to switch between providers without changing your application code. Currently supports OpenAI, with plans to expand to other providers.

## Features

- Unified interface for multiple AI providers
- Type-safe API with TypeScript
- Simple, promise-based interactions
- Configurable request options
- Streaming responses support
- Error handling and retry logic

## Installation

```bash
# Install with npm
npm install @have/ai

# Or with yarn
yarn add @have/ai

# Or with pnpm
pnpm add @have/ai
```

## Usage

### Basic Usage

```typescript
import { OpenAIModel } from '@have/ai';

// Initialize with your API key
const model = new OpenAIModel({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo',
});

// Simple completion
const response = await model.complete('Tell me about TypeScript');
console.log(response);

// Chat completion
const chatResponse = await model.chat([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What are the benefits of TypeScript?' },
]);
console.log(chatResponse);
```

### Streaming Responses

```typescript
import { OpenAIModel } from '@have/ai';

const model = new OpenAIModel({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo',
});

// Stream the response
const stream = await model.streamChat([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Write a short poem about coding.' },
]);

for await (const chunk of stream) {
  process.stdout.write(chunk.content);
}
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_ai.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.