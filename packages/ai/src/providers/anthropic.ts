/**
 * Anthropic Claude provider implementation
 */

import type {
  AIInterface,
  AnthropicOptions,
  AIMessage,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  AIResponse,
  EmbeddingResponse,
  AIModel,
  AICapabilities,
} from '../types.js';
import {
  AIError,
  AuthenticationError,
  RateLimitError,
  ModelNotFoundError,
  ContextLengthError,
  ContentFilterError,
} from '../types.js';

// Note: This implementation will require @anthropic-ai/sdk package
// For now, this is a placeholder that defines the interface

export class AnthropicProvider implements AIInterface {
  private options: AnthropicOptions;
  private client: any; // Will be Anthropic instance

  constructor(options: AnthropicOptions) {
    this.options = {
      defaultModel: 'claude-3-5-sonnet-20241022',
      anthropicVersion: '2023-06-01',
      ...options,
    };

    // Initialize Anthropic client
    this.initializeClientSync();
  }

  private initializeClientSync() {
    try {
      // Dynamic import in constructor - this will work if the package is installed
      import('@anthropic-ai/sdk').then(({ Anthropic }) => {
        this.client = new Anthropic({
          apiKey: this.options.apiKey,
          baseURL: this.options.baseUrl,
          timeout: this.options.timeout,
          maxRetries: this.options.maxRetries,
          defaultHeaders: {
            'anthropic-version': this.options.anthropicVersion,
            ...this.options.headers,
          },
        });
      }).catch(() => {
        // Client will be null and we'll handle it in methods
      });
    } catch (error) {
      // Client will be null and we'll handle it in methods
    }
  }

  private async ensureClient() {
    if (!this.client) {
      try {
        const { Anthropic } = await import('@anthropic-ai/sdk');
        this.client = new Anthropic({
          apiKey: this.options.apiKey,
          baseURL: this.options.baseUrl,
          timeout: this.options.timeout,
          maxRetries: this.options.maxRetries,
          defaultHeaders: {
            'anthropic-version': this.options.anthropicVersion,
            ...this.options.headers,
          },
        });
      } catch (error) {
        throw new AIError(
          'Failed to initialize Anthropic client. Make sure @anthropic-ai/sdk is installed.',
          'INITIALIZATION_ERROR',
          'anthropic'
        );
      }
    }
  }

  async chat(messages: AIMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    try {
      await this.ensureClient();

      const { system, anthropicMessages } = this.mapMessagesToAnthropic(messages);
      
      const response = await this.client.messages.create({
        model: options.model || this.options.defaultModel,
        messages: anthropicMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature,
        top_p: options.topP,
        stop_sequences: Array.isArray(options.stop) ? options.stop : options.stop ? [options.stop] : undefined,
        system: system || undefined,
        stream: false,
      });

      return {
        content: response.content[0]?.text || '',
        model: response.model,
        finishReason: this.mapFinishReason(response.stop_reason),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<AIResponse> {
    return this.chat([{ role: 'user', content: prompt }], {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      n: options.n,
      stop: options.stop,
      stream: options.stream,
      onProgress: options.onProgress,
    });
  }

  async embed(text: string | string[], options: EmbeddingOptions = {}): Promise<EmbeddingResponse> {
    // Anthropic Claude doesn't provide embeddings API
    throw new AIError(
      'Anthropic Claude does not support embeddings. Use OpenAI or another provider for embeddings.',
      'NOT_SUPPORTED',
      'anthropic'
    );
  }

  async *stream(messages: AIMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    try {
      await this.ensureClient();

      const { system, anthropicMessages } = this.mapMessagesToAnthropic(messages);
      
      const stream = await this.client.messages.create({
        model: options.model || this.options.defaultModel,
        messages: anthropicMessages,
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature,
        top_p: options.topP,
        stop_sequences: Array.isArray(options.stop) ? options.stop : options.stop ? [options.stop] : undefined,
        system: system || undefined,
        stream: true,
      });
      
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          if (options.onProgress) {
            options.onProgress(chunk.delta.text);
          }
          yield chunk.delta.text;
        }
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async countTokens(text: string): Promise<number> {
    // Anthropic doesn't provide a direct token counting API
    // This is an approximation - Claude uses a different tokenizer than OpenAI
    return Math.ceil(text.length / 3.5); // Slightly different ratio for Claude
  }

  async getModels(): Promise<AIModel[]> {
    // Return static list of known Claude models
    return [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        description: 'Most intelligent Claude model with balanced performance',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Fastest Claude model for simple tasks',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        description: 'Most powerful Claude model for complex tasks',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        description: 'Balanced Claude model for most tasks',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        description: 'Fast Claude model for simple tasks',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision'],
        supportsFunctions: false,
        supportsVision: true,
      },
    ];
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: false, // Claude doesn't support embeddings
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: false,
      maxContextLength: 200000,
      supportedOperations: ['chat', 'completion', 'streaming', 'functions', 'vision'],
    };
  }

  private mapMessagesToAnthropic(messages: AIMessage[]): { system?: string; anthropicMessages: any[] } {
    // Anthropic handles system messages separately
    let system: string | undefined;
    const anthropicMessages: any[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Combine multiple system messages
        system = system ? `${system}\n\n${message.content}` : message.content;
      } else {
        anthropicMessages.push({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        });
      }
    }

    return { system, anthropicMessages };
  }

  private mapFinishReason(reason: string | null): AIResponse['finishReason'] {
    switch (reason) {
      case 'end_turn': return 'stop';
      case 'max_tokens': return 'length';
      case 'stop_sequence': return 'stop';
      case 'tool_use': return 'function_call';
      default: return 'stop';
    }
  }

  private mapError(error: any): AIError {
    // TODO: Map Anthropic-specific errors
    if (error instanceof AIError) {
      return error;
    }
    
    // Map common HTTP status codes from Anthropic API
    if (error?.status) {
      switch (error.status) {
        case 401:
          return new AuthenticationError('anthropic');
        case 429:
          return new RateLimitError('anthropic');
        case 404:
          return new ModelNotFoundError(error.message || 'Model not found', 'anthropic');
        case 413:
          return new ContextLengthError('anthropic');
      }
    }
    
    return new AIError(
      error?.message || 'Unknown Anthropic error occurred',
      'UNKNOWN_ERROR',
      'anthropic'
    );
  }
}