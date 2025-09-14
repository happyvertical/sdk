/**
 * OpenAI provider implementation
 */

import 'openai/shims/node';
import OpenAI from 'openai';

import type {
  AIInterface,
  OpenAIOptions,
  AIMessage,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  AIResponse,
  EmbeddingResponse,
  AIModel,
  AICapabilities,
  TokenUsage,
} from '../types.js';
import {
  AIError,
  AuthenticationError,
  RateLimitError,
  ModelNotFoundError,
  ContextLengthError,
  ContentFilterError,
} from '../types.js';

export class OpenAIProvider implements AIInterface {
  private client: OpenAI;
  private options: OpenAIOptions;

  constructor(options: OpenAIOptions) {
    this.options = {
      defaultModel: 'gpt-4o',
      ...options,
    };

    this.client = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: this.options.baseUrl,
      organization: this.options.organization,
      timeout: this.options.timeout,
      maxRetries: this.options.maxRetries,
      defaultHeaders: this.options.headers,
    });
  }

  async chat(messages: AIMessage[], options: ChatOptions = {}): Promise<AIResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.options.defaultModel || 'gpt-4o',
        messages: this.mapMessagesToOpenAI(messages),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        n: options.n,
        stop: options.stop,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        user: options.user,
        tools: options.tools?.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        })),
        tool_choice: this.mapToolChoice(options.toolChoice),
        response_format: options.responseFormat,
        seed: options.seed,
        stream: false,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new AIError('No choices returned from OpenAI', 'NO_CHOICES', 'openai');
      }

      return {
        content: choice.message.content || '',
        usage: this.mapUsage(response.usage),
        model: response.model,
        finishReason: this.mapFinishReason(choice.finish_reason),
        functionCalls: choice.message.function_call ? [{
          name: choice.message.function_call.name,
          arguments: choice.message.function_call.arguments,
        }] : undefined,
        toolCalls: choice.message.tool_calls?.map(call => ({
          id: call.id,
          type: call.type,
          function: {
            name: call.function.name,
            arguments: call.function.arguments,
          },
        })),
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
    try {
      const input = Array.isArray(text) ? text : [text];
      const response = await this.client.embeddings.create({
        model: options.model || 'text-embedding-3-small',
        input,
        encoding_format: options.encodingFormat,
        dimensions: options.dimensions,
        user: options.user,
      });

      return {
        embeddings: response.data.map(item => item.embedding),
        usage: this.mapUsage(response.usage),
        model: response.model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async *stream(messages: AIMessage[], options: ChatOptions = {}): AsyncIterable<string> {
    try {
      const stream = await this.client.chat.completions.create({
        model: options.model || this.options.defaultModel || 'gpt-4o',
        messages: this.mapMessagesToOpenAI(messages),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        stop: options.stop,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        user: options.user,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          if (options.onProgress) {
            options.onProgress(content);
          }
          yield content;
        }
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async countTokens(text: string): Promise<number> {
    // OpenAI doesn't provide a direct token counting API
    // This is an approximation based on the general rule of ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  async getModels(): Promise<AIModel[]> {
    try {
      const response = await this.client.models.list();
      return response.data
        .filter(model => model.id.includes('gpt') || model.id.includes('text-embedding'))
        .map(model => ({
          id: model.id,
          name: model.id,
          description: `OpenAI model: ${model.id}`,
          contextLength: this.getContextLength(model.id),
          capabilities: this.getModelCapabilities(model.id),
          supportsFunctions: model.id.includes('gpt-4') || model.id.includes('gpt-3.5'),
          supportsVision: model.id.includes('vision') || model.id === 'gpt-4o',
        }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: true,
      maxContextLength: 128000,
      supportedOperations: ['chat', 'completion', 'embedding', 'streaming', 'functions', 'vision'],
    };
  }

  private mapMessagesToOpenAI(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(message => {
      // Build message based on role and content
      const baseMessage = {
        role: message.role as OpenAI.Chat.ChatCompletionRole,
        content: message.content,
      };
      
      // Add optional fields based on role and availability
      if (message.name && (message.role === 'system' || message.role === 'user' || message.role === 'function')) {
        (baseMessage as any).name = message.name;
      }
      
      if (message.function_call && message.role === 'assistant') {
        (baseMessage as any).function_call = message.function_call;
      }
      
      if (message.tool_calls && message.role === 'assistant') {
        (baseMessage as any).tool_calls = message.tool_calls;
      }
      
      return baseMessage as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  private mapToolChoice(
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  ): OpenAI.Chat.ChatCompletionToolChoiceOption | undefined {
    if (!toolChoice) return undefined;
    if (typeof toolChoice === 'string') return toolChoice;
    return {
      type: 'function',
      function: { name: toolChoice.function.name },
    };
  }

  private mapUsage(usage?: OpenAI.CompletionUsage | OpenAI.Completions.CompletionUsage | OpenAI.Embeddings.CreateEmbeddingResponse.Usage): TokenUsage | undefined {
    if (!usage) return undefined;
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: (usage as any).completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }

  private mapFinishReason(reason: string | null): AIResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'function_call': return 'function_call';
      case 'tool_calls': return 'tool_calls';
      case 'content_filter': return 'content_filter';
      default: return 'stop';
    }
  }

  private getContextLength(modelId: string): number {
    if (modelId.includes('gpt-4o')) return 128000;
    if (modelId.includes('gpt-4-turbo')) return 128000;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5-turbo')) return 16385;
    return 4096;
  }

  private getModelCapabilities(modelId: string): string[] {
    const capabilities = ['text'];
    if (modelId.includes('gpt')) {
      capabilities.push('chat', 'functions');
    }
    if (modelId.includes('vision') || modelId === 'gpt-4o') {
      capabilities.push('vision');
    }
    if (modelId.includes('embedding')) {
      capabilities.push('embeddings');
    }
    return capabilities;
  }

  private mapError(error: unknown): AIError {
    if (error instanceof OpenAI.APIError) {
      switch (error.status) {
        case 401:
          return new AuthenticationError('openai');
        case 429:
          // Try to extract retry-after from headers
          const retryAfter = error.headers?.['retry-after'];
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
          return new RateLimitError('openai', retryAfterSeconds);
        case 404:
          return new ModelNotFoundError(error.message, 'openai');
        case 413:
          return new ContextLengthError('openai');
        default:
          if (error.message.includes('content_filter')) {
            return new ContentFilterError('openai');
          }
          return new AIError(error.message, 'API_ERROR', 'openai');
      }
    }
    
    if (error instanceof AIError) {
      return error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new AIError(errorMessage, 'UNKNOWN_ERROR', 'openai');
  }
}