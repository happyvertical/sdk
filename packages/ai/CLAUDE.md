# @have/ai: AI Model Interface Package

## Purpose and Responsibilities

The `@have/ai` package provides a standardized interface for interacting with various AI models. It currently focuses on OpenAI's API but is designed with an abstraction layer to potentially support other AI providers in the future. This package:

- Offers a unified client interface for AI text completions
- Handles configuration for different AI providers
- Manages streaming responses and progress callbacks
- Provides type definitions for AI model parameters

## Key APIs

### Creating an AI Client

```typescript
import { getAIClient } from '@have/ai';

// Create an OpenAI client (default)
const client = await getAIClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.openai.com/v1' // optional
});

// The client can then be used for text completions
```

### Text Completions

```typescript
import { getAIClient } from '@have/ai';

const client = await getAIClient({ apiKey: 'your-api-key' });

// Basic completion
const result = await client.textCompletion("What is the capital of France?");

// Completion with options
const resultWithOptions = await client.textCompletion("Generate a poem about coding", {
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 500
});
```

### Streaming Responses

```typescript
import { getAIClient } from '@have/ai';

const client = await getAIClient({ apiKey: 'your-api-key' });

// Stream response with progress callback
const result = await client.textCompletion("Generate a long story", {
  stream: true,
  onProgress: (partialMessage) => {
    console.log("Received chunk:", partialMessage);
  }
});
```

### Configuration Options

The package supports various configuration options for AI completions:

```typescript
// Example with multiple options
const result = await client.textCompletion("Your prompt here", {
  model: "gpt-4o",            // AI model to use
  temperature: 0.7,           // Randomness (0-2)
  maxTokens: 500,             // Maximum response length
  stop: ["\n\n", "THE END"],  // Stop sequences
  role: "user",               // Message role
  history: [                  // Conversation history
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Who are you?" },
    { role: "assistant", content: "I'm an AI assistant." }
  ]
});
```

## Internal Architecture

The package uses a factory pattern with an abstract base class:

- `AIClient`: Abstract base class defining the common interface
- `OpenAIClient`: Implementation for OpenAI's API
- `getAIClient()`: Factory function that returns the appropriate client

The design allows for future expansion to other AI providers by creating new client implementations that extend the base class.

## Dependencies

- `openai`: The official OpenAI JavaScript/TypeScript client

## Development Guidelines

### Adding New AI Providers

To add support for a new AI provider:

1. Create a new client class that extends `AIClient`
2. Implement the required methods (especially `textCompletion`)
3. Update the type guard and factory function in `getAIClient()`
4. Add appropriate type definitions for the new provider's options

### Testing

The package includes tests for verifying client behavior:

```bash
bun test        # Run tests once
bun test:watch  # Run tests in watch mode
```

Mock the actual API calls in tests to avoid external dependencies.

### Building

Build the package with:

```bash
bun run build       # Build once
bun run build:watch # Build in watch mode
```

### Best Practices

- Keep API credentials secure (never hard-code them)
- Handle streaming responses efficiently
- Use appropriate error handling for API calls
- Set reasonable timeouts for AI model requests
- Consider rate limits of AI providers in implementation

This package serves as an abstraction layer over AI services, allowing the rest of the SDK to use AI capabilities without being tightly coupled to specific providers.