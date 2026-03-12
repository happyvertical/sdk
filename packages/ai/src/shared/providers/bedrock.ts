/**
 * AWS Bedrock provider implementation
 */

import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  BedrockOptions,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
  TokenUsage,
  TTSOptions,
  TTSResponse,
  UsageEvent,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import {
  AIError,
  AuthenticationError,
  ContextLengthError,
  extractTextContent,
  ModelNotFoundError,
  RateLimitError,
} from '../types';

// Note: This implementation will require @aws-sdk/client-bedrock-runtime package
// For now, this is a placeholder that defines the interface

export class BedrockProvider implements AIInterface {
  private options: BedrockOptions;
  private client: any; // Will be BedrockRuntimeClient instance from @aws-sdk/client-bedrock-runtime

  constructor(options: BedrockOptions) {
    this.options = {
      defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      ...options,
    };

    // Initialize AWS Bedrock client
    this.initializeClientSync();
  }

  private initializeClientSync() {
    try {
      // Dynamic import in constructor - this will work if the package is installed
      import('@aws-sdk/client-bedrock-runtime')
        .then(({ BedrockRuntimeClient }) => {
          this.client = new BedrockRuntimeClient({
            region: this.options.region,
            credentials: this.options.credentials,
            endpoint: this.options.endpoint,
          });
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
        const { BedrockRuntimeClient } = await import(
          '@aws-sdk/client-bedrock-runtime'
        );
        this.client = new BedrockRuntimeClient({
          region: this.options.region,
          credentials: this.options.credentials,
          endpoint: this.options.endpoint,
        });
      } catch (_error) {
        throw new AIError(
          'Failed to initialize Bedrock client. Make sure @aws-sdk/client-bedrock-runtime is installed.',
          'INITIALIZATION_ERROR',
          'bedrock',
        );
      }
    }
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    try {
      await this.ensureClient();

      const modelId = options.model || this.options.defaultModel;
      let response: AIResponse;

      if (modelId?.includes('anthropic.claude')) {
        response = await this.chatWithClaude(messages, options);
      } else if (modelId?.includes('amazon.titan')) {
        response = await this.chatWithTitan(messages, options);
      } else if (modelId?.includes('cohere.command')) {
        response = await this.chatWithCohere(messages, options);
      } else if (modelId?.includes('meta.llama')) {
        response = await this.chatWithLlama(messages, options);
      } else {
        // Default to Claude format for unknown models
        response = await this.chatWithClaude(messages, options);
      }

      this.emitUsage(
        'chat',
        response.model || modelId || 'unknown',
        response.usage,
        startTime,
        options.usageTags,
      );
      return response;
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

  /**
   * Simple message interface for single-turn interactions with optional history
   *
   * @param text - The message text to send
   * @param options - Configuration options including history, model, etc.
   * @returns Promise resolving to the response content string
   */
  async message(text: string, options: MessageOptions = {}): Promise<string> {
    // Build messages array from history + current message
    const messages: AIMessage[] = [
      ...(options.history || []),
      { role: options.role || 'user', content: text },
    ];

    const response = await this.chat(messages, {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stop,
      stream: options.stream,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      responseFormat: options.responseFormat,
      seed: options.seed,
      tools: options.tools,
      toolChoice: options.toolChoice,
      onProgress: options.onProgress,
    });

    return response.content;
  }

  async embed(
    _text: string | string[],
    _options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    try {
      // TODO: Implement Bedrock embeddings with Titan Embeddings
      // const modelId = options.model || 'amazon.titan-embed-text-v1';

      throw new AIError(
        'Bedrock embeddings not implemented',
        'NOT_IMPLEMENTED',
        'bedrock',
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async embedImage(
    _image: string | Buffer,
    _options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'AWS Bedrock does not support image embeddings. Use OpenAI or Gemini.',
      'NOT_SUPPORTED',
      'bedrock',
    );
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options: ImageDescriptionOptions = {},
  ): Promise<string> {
    // Note: Some Bedrock models (Claude) support vision, but we're keeping this as a stub
    throw new AIError(
      'Image description is not yet implemented for AWS Bedrock. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  async generateImage(
    _prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    // Note: Bedrock has Titan Image Generator, but we're keeping this as a stub
    throw new AIError(
      'Image generation is not yet implemented for AWS Bedrock. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  async *stream(
    _messages: AIMessage[],
    _options: ChatOptions = {},
  ): AsyncIterable<string> {
    // TODO: Implement Bedrock streaming
    // For now, yield an empty stream and then throw
    yield* [];
    throw new AIError(
      'Bedrock streaming not implemented',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  async countTokens(text: string): Promise<number> {
    // AWS Bedrock doesn't provide a direct token counting API
    // Approximation varies by model provider
    return Math.ceil(text.length / 4);
  }

  async getModels(): Promise<AIModel[]> {
    // Return static list of popular Bedrock models
    return [
      // Anthropic Claude models
      {
        id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        name: 'Claude 3.5 Sonnet v2',
        description: 'Latest Claude 3.5 Sonnet model on Bedrock',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'anthropic.claude-3-opus-20240229-v1:0',
        name: 'Claude 3 Opus',
        description: 'Most powerful Claude model on Bedrock',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision'],
        supportsFunctions: false,
        supportsVision: true,
      },
      // Amazon Titan models
      {
        id: 'amazon.titan-text-premier-v1:0',
        name: 'Titan Text Premier',
        description: 'Premier Amazon Titan text model',
        contextLength: 32000,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'amazon.titan-embed-text-v1',
        name: 'Titan Embeddings Text',
        description: 'Amazon Titan text embeddings model',
        contextLength: 8192,
        capabilities: ['embeddings'],
        supportsFunctions: false,
        supportsVision: false,
      },
      // Cohere models
      {
        id: 'cohere.command-r-plus-v1:0',
        name: 'Command R+',
        description: 'Cohere Command R+ model with advanced capabilities',
        contextLength: 128000,
        capabilities: ['text', 'chat', 'functions'],
        supportsFunctions: true,
        supportsVision: false,
      },
      // Meta Llama models
      {
        id: 'meta.llama3-1-405b-instruct-v1:0',
        name: 'Llama 3.1 405B Instruct',
        description: 'Meta Llama 3.1 405B instruction-tuned model',
        contextLength: 128000,
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
      embeddings: true, // Via Titan Embeddings
      streaming: true,
      functions: true, // Some models support function calling
      vision: true, // Some models support vision
      fineTuning: true, // Via Bedrock fine-tuning
      imageEmbeddings: false,
      imageGeneration: false, // Titan Image Generator exists but not implemented
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 200000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
      ],
    };
  }

  // ============================================================================
  // TTS Methods (Not supported - use Qwen3-TTS provider)
  // ============================================================================

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by Bedrock provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by Bedrock provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by Bedrock provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by Bedrock provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by Bedrock provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  private async chatWithClaude(
    messages: AIMessage[],
    options: ChatOptions,
  ): Promise<AIResponse> {
    const { InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    // Convert messages to Claude format for Bedrock
    const { system, anthropicMessages } = this.mapMessagesToClaude(messages);

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: options.maxTokens || 4096,
      messages: anthropicMessages,
      temperature: options.temperature,
      top_p: options.topP,
      stop_sequences: Array.isArray(options.stop)
        ? options.stop
        : options.stop
          ? [options.stop]
          : undefined,
      system: system || undefined,
    };

    const command = new InvokeModelCommand({
      modelId: options.model || this.options.defaultModel,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await this.client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    return {
      content: responseBody.content?.[0]?.text || '',
      model: options.model || this.options.defaultModel,
      finishReason: this.mapClaudeFinishReason(responseBody.stop_reason),
      usage: {
        promptTokens: responseBody.usage?.input_tokens || 0,
        completionTokens: responseBody.usage?.output_tokens || 0,
        totalTokens:
          (responseBody.usage?.input_tokens || 0) +
          (responseBody.usage?.output_tokens || 0),
      },
    };
  }

  private async chatWithTitan(
    _messages: AIMessage[],
    _options: ChatOptions,
  ): Promise<AIResponse> {
    // TODO: Implement Titan-specific format for Bedrock
    throw new AIError(
      'Titan on Bedrock not implemented',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  private async chatWithCohere(
    _messages: AIMessage[],
    _options: ChatOptions,
  ): Promise<AIResponse> {
    // TODO: Implement Cohere-specific format for Bedrock
    throw new AIError(
      'Cohere on Bedrock not implemented',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  private async chatWithLlama(
    _messages: AIMessage[],
    _options: ChatOptions,
  ): Promise<AIResponse> {
    // TODO: Implement Llama-specific format for Bedrock
    throw new AIError(
      'Llama on Bedrock not implemented',
      'NOT_IMPLEMENTED',
      'bedrock',
    );
  }

  private mapMessagesToClaude(messages: AIMessage[]): {
    system?: string;
    anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    // Same as Anthropic provider - separate system messages
    let system: string | undefined;
    const anthropicMessages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }> = [];

    for (const message of messages) {
      const textContent = extractTextContent(message.content);
      if (message.role === 'system') {
        system = system ? `${system}\n\n${textContent}` : textContent;
      } else {
        anthropicMessages.push({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: textContent,
        });
      }
    }

    return { system, anthropicMessages };
  }

  private mapClaudeFinishReason(
    reason: string | null,
  ): AIResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }

  /**
   * Emits a usage event to the onUsage callback if configured.
   * @private
   */
  private emitUsage(
    operation: UsageEvent['operation'],
    model: string,
    usage: TokenUsage | undefined,
    startTime: number,
    callTags?: Record<string, string>,
  ): void {
    if (!this.options.onUsage) return;
    const globalTags = this.options.usageTags;
    const tags =
      globalTags || callTags ? { ...globalTags, ...callTags } : undefined;
    try {
      this.options.onUsage({
        provider: 'bedrock',
        model,
        operation,
        usage,
        duration: Date.now() - startTime,
        timestamp: new Date(),
        tags,
      });
    } catch {
      // Silently swallow consumer errors
    }
  }

  private mapError(error: unknown): AIError {
    if (error instanceof AIError) {
      return error;
    }

    // Map common AWS error codes
    if (typeof error === 'object' && error !== null) {
      const awsError = error as { name?: string; message?: string };

      if (awsError.name === 'AccessDeniedException') {
        return new AuthenticationError('bedrock');
      }

      if (awsError.name === 'ThrottlingException') {
        return new RateLimitError('bedrock');
      }

      if (awsError.name === 'ResourceNotFoundException') {
        return new ModelNotFoundError(
          awsError.message || 'Model not found',
          'bedrock',
        );
      }

      if (
        awsError.name === 'ValidationException' &&
        awsError.message?.includes('input is too long')
      ) {
        return new ContextLengthError('bedrock');
      }
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown Bedrock error occurred';
    return new AIError(errorMessage, 'UNKNOWN_ERROR', 'bedrock');
  }
}
