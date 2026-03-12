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
  GeminiThinkingLevel,
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
  extractTextContent,
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
      defaultModel: 'gemini-2.5-flash',
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
          this.client = new GoogleGenAI(this.buildClientConfig());
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
        this.client = new GoogleGenAI(this.buildClientConfig());
      } catch (_error) {
        throw new AIError(
          'Failed to initialize Gemini client. Make sure @google/genai is installed.',
          'INITIALIZATION_ERROR',
          'gemini',
        );
      }
    }
  }

  /**
   * Build the GoogleGenAI client configuration based on provided options.
   * Supports both Google AI Studio (apiKey only) and Vertex AI (projectId + location).
   */
  private buildClientConfig(): Record<string, any> {
    // If projectId and location are provided, use Vertex AI mode
    if (this.options.projectId && this.options.location) {
      return {
        vertexai: true,
        project: this.options.projectId,
        location: this.options.location,
        apiKey: this.options.apiKey, // Optional for Vertex AI with ADC
      };
    }

    // Default to Google AI Studio mode with API key
    return {
      apiKey: this.options.apiKey,
    };
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    try {
      await this.ensureClient();

      const model = options.model || this.options.defaultModel;
      const generationConfig: Record<string, any> = {
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
      };

      // Build request config
      const requestConfig: Record<string, any> = {
        model,
        contents: this.messagesToGeminiFormat(messages),
        generationConfig,
      };

      // Add tools if provided
      if (options.tools && options.tools.length > 0) {
        requestConfig.tools = [
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
          requestConfig.toolConfig = this.mapToolChoice(options.toolChoice);
        }
      }

      // Add thinking config for Gemini 3 models
      const thinkingLevel = options.thinkingLevel || this.options.thinkingLevel;
      if (thinkingLevel || options.includeThoughts) {
        requestConfig.config = {
          ...requestConfig.config,
          thinkingConfig: {
            ...(thinkingLevel && {
              thinkingLevel: this.mapThinkingLevel(thinkingLevel),
            }),
            ...(options.includeThoughts !== undefined && {
              includeThoughts: options.includeThoughts,
            }),
          },
        };
      }

      // Call new SDK API: ai.models.generateContent()
      const result = await this.client.models.generateContent(requestConfig);

      // Extract tool calls from response
      let toolCalls: AIResponse['toolCalls'];
      const firstCandidate = result.candidates?.[0];
      if (firstCandidate?.content?.parts) {
        const functionCalls = firstCandidate.content.parts.filter(
          (part: any) => part.functionCall,
        );
        if (functionCalls.length > 0) {
          toolCalls = functionCalls.map((part: any) => ({
            id: `call_${crypto.randomUUID()}`,
            type: 'function' as const,
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          }));
        }
      }

      // Clean content - remove markdown code blocks if JSON mode was requested
      let content = result.text || '';
      if (options.responseFormat?.type === 'json_object') {
        content = this.stripMarkdownCodeBlock(content);
      }

      const usage: TokenUsage = {
        promptTokens: result.usageMetadata?.promptTokenCount || 0,
        completionTokens: result.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: result.usageMetadata?.totalTokenCount || 0,
      };
      this.emitUsage('chat', model!, usage, startTime, options.usageTags);

      return {
        content,
        model,
        finishReason: this.mapFinishReason(result),
        usage,
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

  /**
   * Simple message interface for single-turn interactions with optional history
   *
   * @param text - The message text to send
   * @param options - Configuration options including history, model, etc.
   * @returns Promise resolving to the response content string
   *
   * @example
   * ```typescript
   * // Simple usage
   * const response = await provider.message('Hello!');
   *
   * // With history
   * const response = await provider.message('What was my question?', {
   *   history: [
   *     { role: 'user', content: 'What is 2+2?' },
   *     { role: 'assistant', content: '4' }
   *   ]
   * });
   * ```
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

  /**
   * Generate embeddings for text using Gemini embedding models
   * @param text - Single text string or array of texts to embed
   * @param options - Optional configuration for embeddings
   * @returns Promise resolving to embeddings response
   *
   * @example
   * ```typescript
   * const embedding = await provider.embed('Hello world');
   * const embeddings = await provider.embed(['Text 1', 'Text 2']);
   * ```
   */
  async embed(
    text: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    try {
      await this.ensureClient();

      const model = options.model || 'text-embedding-004';
      const input = Array.isArray(text) ? text : [text];

      const embeddings: number[][] = [];
      let totalTokens = 0;

      for (const content of input) {
        const config: Record<string, any> = {};
        if (options.dimensions) {
          config.outputDimensionality = options.dimensions;
        }

        const result = await this.client.models.embedContent({
          model,
          contents: content,
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        if (result.embeddings?.[0]?.values) {
          embeddings.push(result.embeddings[0].values);
        }
        if (result.metadata?.tokenCount) {
          totalTokens += result.metadata.tokenCount;
        }
      }

      const usage: TokenUsage | undefined =
        totalTokens > 0
          ? {
              promptTokens: totalTokens,
              completionTokens: 0,
              totalTokens,
            }
          : undefined;
      this.emitUsage('embed', model, usage, startTime, options.usageTags);

      return {
        embeddings,
        model,
        usage,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Convert an image to Gemini inline format
   * @param image - Image as URL, base64 data URL, or Buffer
   * @returns Gemini inline data format
   * @private
   */
  private async imageToGeminiFormat(
    image: string | Buffer,
  ): Promise<{ inlineData: { mimeType: string; data: string } }> {
    let mimeType = 'image/png';
    let base64Data: string;

    if (Buffer.isBuffer(image)) {
      base64Data = image.toString('base64');
    } else if (image.startsWith('data:')) {
      // Parse data URL
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        throw new AIError(
          'Invalid base64 data URL format',
          'INVALID_INPUT',
          'gemini',
        );
      }
    } else {
      // Fetch from URL
      const response = await fetch(image);
      if (!response.ok) {
        throw new AIError(
          `Failed to fetch image: ${response.status} ${response.statusText}`,
          'IMAGE_FETCH_ERROR',
          'gemini',
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
      mimeType = response.headers.get('content-type') || 'image/png';
    }

    return {
      inlineData: { mimeType, data: base64Data },
    };
  }

  /**
   * Generate a text description of an image
   * @param image - Image as URL, base64 data URL, or Buffer
   * @param prompt - Custom prompt for description (optional)
   * @param options - Optional configuration
   * @returns Promise resolving to the description string
   *
   * @example
   * ```typescript
   * const description = await provider.describeImage('https://example.com/image.jpg');
   * ```
   */
  async describeImage(
    image: string | Buffer,
    prompt?: string,
    options: ImageDescriptionOptions = {},
  ): Promise<string> {
    try {
      await this.ensureClient();

      const defaultPrompt =
        'Describe this image for a search index. Include objects, mood, lighting, and any visible text.';

      const imageData = await this.imageToGeminiFormat(image);

      const response = await this.client.models.generateContent({
        model: options.model || this.options.defaultModel || 'gemini-2.5-flash',
        contents: [{ text: prompt || defaultPrompt }, imageData],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 500,
        },
      });

      return response.text || '';
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Generate embeddings for an image using native multimodal embeddings
   * @param image - Image as URL, base64 data URL, or Buffer
   * @param options - Optional configuration for image embeddings
   * @returns Promise resolving to embeddings response
   *
   * @example
   * ```typescript
   * const embedding = await provider.embedImage('https://example.com/image.jpg');
   * ```
   */
  async embedImage(
    image: string | Buffer,
    options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    try {
      await this.ensureClient();

      // Gemini uses multimodal embedding model
      const model = options.model || 'multimodalembedding@001';
      const imageData = await this.imageToGeminiFormat(image);

      const config: Record<string, any> = {};
      if (options.dimensions) {
        config.outputDimensionality = options.dimensions;
      }

      const result = await this.client.models.embedContent({
        model,
        contents: [imageData],
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      return {
        embeddings: result.embeddings?.[0]?.values
          ? [result.embeddings[0].values]
          : [],
        model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Generate an image from a text prompt using Imagen 3
   * @param prompt - Text description of the image to generate
   * @param options - Optional configuration for image generation
   * @returns Promise resolving to generated image(s)
   *
   * @example
   * ```typescript
   * const result = await provider.generateImage('A sunset over mountains');
   * fs.writeFileSync('image.png', result.images[0].data);
   * ```
   */
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    try {
      await this.ensureClient();

      const model = options.model || 'imagen-3.0-generate-002';

      const config: Record<string, any> = {
        numberOfImages: options.n || 1,
      };

      if (options.aspectRatio) {
        config.aspectRatio = options.aspectRatio;
      }

      const response = await this.client.models.generateImages({
        model,
        prompt,
        config,
      });

      const images = (response.generatedImages || []).map((img: any) => {
        let data: Buffer | string;
        const mimeType = 'image/png';
        const imageBytes = img.image?.imageBytes;

        if (options.outputFormat === 'base64') {
          data =
            typeof imageBytes === 'string'
              ? imageBytes
              : Buffer.from(imageBytes).toString('base64');
        } else if (options.outputFormat === 'url') {
          // Gemini Imagen doesn't provide URLs, return as base64 data URL
          const b64 =
            typeof imageBytes === 'string'
              ? imageBytes
              : Buffer.from(imageBytes).toString('base64');
          data = `data:${mimeType};base64,${b64}`;
        } else {
          // Default: buffer
          data =
            typeof imageBytes === 'string'
              ? Buffer.from(imageBytes, 'base64')
              : Buffer.from(imageBytes);
        }

        return {
          data,
          mimeType,
        };
      });

      return {
        images,
        model,
      };
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
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash Preview',
        description:
          'Preview of Gemini 3 Flash model. Available on Vertex AI in us-central1 only.',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.0-flash-001',
        name: 'Gemini 2.0 Flash',
        description:
          'Latest fast and efficient Gemini model with function calling',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Experimental next-generation Gemini model',
        contextLength: 1000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro (Legacy)',
        description: 'Previous generation model (may not be available)',
        contextLength: 2000000,
        capabilities: ['text', 'chat', 'vision', 'functions'],
        supportsFunctions: true,
        supportsVision: true,
      },
    ];
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: false,
      imageEmbeddings: true,
      imageGeneration: true,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 2000000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
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
      'TTS is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by Gemini provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'gemini',
    );
  }

  private mapToolChoice(
    toolChoice?:
      | 'auto'
      | 'none'
      | { type: 'function'; function: { name: string } },
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

  /**
   * Map thinking level from our type to SDK's expected format
   * The SDK expects uppercase values: MINIMAL, LOW, MEDIUM, HIGH
   */
  private mapThinkingLevel(level: GeminiThinkingLevel): string {
    return level.toUpperCase();
  }

  private mapFinishReason(response: any): AIResponse['finishReason'] {
    // Check if response has function calls in any candidate
    const firstCandidate = response.candidates?.[0];
    if (firstCandidate?.content?.parts) {
      const hasFunctionCall = firstCandidate.content.parts.some(
        (part: any) => part.functionCall,
      );
      if (hasFunctionCall) {
        return 'tool_calls';
      }
    }

    // Gemini doesn't provide detailed finish reasons, default to 'stop'
    return 'stop';
  }

  private messagesToGeminiFormat(messages: AIMessage[]): string {
    // Convert messages to a simple text prompt
    // The new SDK expects a string for the contents field
    return messages
      .map((message) => {
        const textContent = extractTextContent(message.content);
        switch (message.role) {
          case 'system':
            return `Instructions: ${textContent}`;
          case 'user':
            return `Human: ${textContent}`;
          case 'assistant':
            return `Assistant: ${textContent}`;
          default:
            return textContent;
        }
      })
      .join('\n\n');
  }

  private stripMarkdownCodeBlock(text: string): string {
    // Remove markdown code blocks like ```json\n...\n```
    const codeBlockRegex =
      /^```(?:json|javascript|typescript)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const match = text.match(codeBlockRegex);
    return match ? match[1].trim() : text.trim();
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
        provider: 'gemini',
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
