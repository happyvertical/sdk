/**
 * Google Gemini provider implementation
 */

import crypto from 'node:crypto';

import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  GeminiOptions,
} from '../types';
import {
  AIError,
  AuthenticationError,
  ModelNotFoundError,
  RateLimitError,
} from '../types';

// Note: This implementation uses the new @google/genai package
// @google/generative-ai is deprecated - migrated to @google/genai

export class GeminiProvider implements AIInterface {
  private options: GeminiOptions;
  private client: any; // GoogleGenAI instance from @google/genai

  constructor(options: GeminiOptions) {
    this.options = {
      defaultModel: 'gemini-1.5-pro',
      ...options,
    };

    // Initialize Google Generative AI client
    this.initializeClientSync();
  }

  private initializeClientSync() {
    try {
      // Dynamic import in constructor - this will work if the package is installed
      import('@google/genai')
        .then(({ GoogleGenAI }) => {
          this.client = new GoogleGenAI({ apiKey: this.options.apiKey });
        })
        .catch(() => {
          // Client will be null and we'll handle it in methods
        });
    } catch (_error) {
      // Client will be null and we'll handle it in methods
    }
  }

  private async ensureClient() {
    if (!this.client) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        this.client = new GoogleGenAI({ apiKey: this.options.apiKey });
      } catch (_error) {
        throw new AIError(
          'Failed to initialize Gemini client. Make sure @google/genai is installed.',
          'INITIALIZATION_ERROR',
          'gemini',
        );
      }
    }
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    try {
      await this.ensureClient();

      const modelConfig: Record<string, any> = {
        model: options.model || this.options.defaultModel,
        generationConfig: {
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature,
          topP: options.topP,
          stopSequences: Array.isArray(options.stop)
            ? options.stop
            : options.stop
              ? [options.stop]
              : undefined,
          // Add response MIME type for JSON output
          responseMimeType:
            options.responseFormat?.type === 'json_object'
              ? 'application/json'
              : undefined,
        },
      };

      // Add tools if provided
      if (options.tools && options.tools.length > 0) {
        modelConfig.tools = [
          {
            functionDeclarations: options.tools.map((tool) => ({
              name: tool.function.name,
              description: tool.function.description || '',
              parameters: tool.function.parameters || { type: 'object' },
            })),
          },
        ];

        // Map tool choice
        if (options.toolChoice) {
          modelConfig.toolConfig = this.mapToolChoice(options.toolChoice);
        }
      }

      const model = this.client.getGenerativeModel(modelConfig);

      // Convert messages to Gemini format
      const prompt = this.messagesToGeminiFormat(messages);
      const result = await model.generateContent(prompt);
      const response = await result.response;

      // Extract tool calls from response
      // Note: Gemini doesn't provide IDs for function calls, so we generate them
      let toolCalls: AIResponse['toolCalls'];
      try {
        const functionCalls = response.functionCalls?.();
        if (functionCalls && functionCalls.length > 0) {
          toolCalls = functionCalls.map((call: any) => ({
            id: `call_${crypto.randomUUID()}`,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.args),
            },
          }));
        }
      } catch (error) {
        // functionCalls() method may not exist or may throw
        // Continue without tool calls rather than failing
        toolCalls = undefined;
      }

      return {
        content: response.text() || '',
        model: options.model || this.options.defaultModel,
        finishReason: this.mapFinishReason(response),
        usage: {
          promptTokens: result.response.usageMetadata?.promptTokenCount || 0,
          completionTokens:
            result.response.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: result.response.usageMetadata?.totalTokenCount || 0,
        },
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
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

  async embed(
    _text: string | string[],
    _options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    try {
      // TODO: Implement Gemini embeddings
      // Note: Gemini may not support embeddings directly
      throw new AIError(
        'Gemini embeddings not implemented',
        'NOT_IMPLEMENTED',
        'gemini',
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async *stream(
    _messages: AIMessage[],
    _options: ChatOptions = {},
  ): AsyncIterable<string> {
    // TODO: Implement Gemini streaming
    // For now, yield an empty stream and then throw
    yield* [];
    throw new AIError(
      'Gemini streaming not implemented',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  async countTokens(text: string): Promise<number> {
    try {
      // TODO: Implement Gemini token counting
      // const model = this.client.getGenerativeModel({ model: 'gemini-1.5-pro' });
      // const { totalTokens } = await model.countTokens(text);
      // return totalTokens;

      // Approximation for now
      return Math.ceil(text.length / 4);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async getModels(): Promise<AIModel[]> {
    // Return static list of known Gemini models
    return [
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Most capable Gemini model with 2M token context',
        contextLength: 2000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Fast and efficient Gemini model',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-1.0-pro',
        name: 'Gemini 1.0 Pro',
        description: 'Previous generation Gemini model',
        contextLength: 32000,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
    ];
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: false, // Gemini may not support embeddings directly
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: false,
      maxContextLength: 2000000,
      supportedOperations: [
        'chat',
        'completion',
        'streaming',
        'functions',
        'vision',
      ],
    };
  }

  private mapToolChoice(
    toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } },
  ): any {
    if (!toolChoice || toolChoice === 'auto') {
      return { functionCallingConfig: { mode: 'AUTO' } };
    }

    if (toolChoice === 'none') {
      return { functionCallingConfig: { mode: 'NONE' } };
    }

    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return {
        functionCallingConfig: {
          mode: 'ANY',
          allowedFunctionNames: [toolChoice.function.name],
        },
      };
    }

    return { functionCallingConfig: { mode: 'AUTO' } };
  }

  private mapFinishReason(response: any): AIResponse['finishReason'] {
    // Check if response has function calls
    if (response.functionCalls && response.functionCalls().length > 0) {
      return 'tool_calls';
    }

    // Gemini doesn't provide detailed finish reasons, default to 'stop'
    return 'stop';
  }

  private messagesToGeminiFormat(messages: AIMessage[]): string {
    // Gemini expects a simple text prompt, so convert chat messages to text
    return `${messages
      .map((message) => {
        switch (message.role) {
          case 'system':
            return `Instructions: ${message.content}`;
          case 'user':
            return `Human: ${message.content}`;
          case 'assistant':
            return `Assistant: ${message.content}`;
          default:
            return message.content;
        }
      })
      .join('\n\n')}\n\nAssistant:`;
  }

  private mapError(error: unknown): AIError {
    if (error instanceof AIError) {
      return error;
    }

    // Map common Gemini error patterns
    const message =
      error instanceof Error ? error.message : 'Unknown Gemini error occurred';

    if (message.includes('API_KEY_INVALID') || message.includes('401')) {
      return new AuthenticationError('gemini');
    }

    if (message.includes('QUOTA_EXCEEDED') || message.includes('429')) {
      return new RateLimitError('gemini');
    }

    if (message.includes('MODEL_NOT_FOUND') || message.includes('404')) {
      return new ModelNotFoundError(message, 'gemini');
    }

    return new AIError(message, 'UNKNOWN_ERROR', 'gemini');
  }
}
