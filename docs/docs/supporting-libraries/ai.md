---
id: ai
title: "@have/ai: Multi-Provider AI Integration"
sidebar_label: "@have/ai"
sidebar_position: 2
---

# @have/ai: Multi-Provider AI Integration

Unified interface for AI model interactions across multiple providers including OpenAI, Anthropic, Google Gemini, and AWS Bedrock.

## Overview

The `@have/ai` package provides a standardized interface for AI interactions that works seamlessly across different providers:

- **🔌 Multi-Provider Support**: OpenAI, Anthropic, Gemini, Bedrock
- **🔒 Type Safety**: Full TypeScript support with proper typing
- **⚡ Performance**: Connection pooling and request optimization
- **🛡️ Error Handling**: Consistent error handling across providers
- **📊 Usage Tracking**: Built-in metrics and logging

## Quick Start

```typescript
import { getAI } from '@have/ai';

// Initialize with your preferred provider
const ai = await getAI({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o'
});

// Use consistent interface across all providers
const response = await ai.chat([
  { role: 'user', content: 'Explain quantum computing' }
]);
console.log(response.content);
```

## Supported Providers

### OpenAI
- GPT-4, GPT-3.5 Turbo
- Function calling
- Streaming responses

### Anthropic
- Claude 3 (Opus, Sonnet, Haiku)
- Constitutional AI
- Tool use

### Google Gemini
- Gemini Pro, Gemini Pro Vision
- Multimodal capabilities
- Safety settings

### AWS Bedrock
- Multiple foundation models
- AWS integration
- Enterprise features

## Provider Configuration

```typescript
// OpenAI
const openaiClient = await getAIClient({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4',
  maxTokens: 2000
});

// Anthropic
const claudeClient = await getAIClient({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-sonnet-20240229'
});

// Gemini
const geminiClient = await getAIClient({
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-pro'
});
```

## Integration with SMRT

The AI client integrates seamlessly with SMRT BaseObject:

```typescript
import { BaseObject } from '@have/smrt';
import { getAIClient } from '@have/ai';

class Product extends BaseObject {
  name: string = '';
  description: string = '';

  constructor(options: any = {}) {
    super(options);
    this.ai = getAIClient({ provider: 'openai' });
  }

  async generateMarketing(): Promise<string> {
    return await this.do(`Create marketing copy for ${this.name}: ${this.description}`);
  }
}
```

*Full documentation coming soon...*