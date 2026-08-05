/**
 * OpenAI provider implementation
 *
 * Provides a standardized interface for interacting with OpenAI's GPT models,
 * including chat completions, text completions, embeddings, and streaming responses.
 * Supports all major OpenAI features including function calling, vision models,
 * and custom fine-tuned models.
 */

import OpenAI from 'openai';
import { extractRetryAfterSeconds } from '../rate-limit';
import {
  normalizeBaseAIOptions,
  normalizeChatOptions,
  normalizeImageGenerationOptions,
  type PreparedRequestControls,
  prepareRequestControls,
} from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  BaseAIOptions,
  ChatOptions,
  CompletionOptions,
  ContentPart,
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
  VideoGenerationJob,
  VideoGenerationOptions,
  VideoGenerationResult,
  VideoGenerationStatusResult,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import {
  AIError,
  AuthenticationError,
  ContentFilterError,
  ContextLengthError,
  ModelNotFoundError,
  RateLimitError,
} from '../types';
import { emitUsage } from './usage';

/**
 * Shared profile for OpenAI-compatible providers
 */
export interface OpenAICompatibleProfile {
  providerLabel: string;
  providerName: string;
  defaultModel: string;
  capabilities: AICapabilities;
  describeModel(modelId: string): string;
  getContextLength(modelId: string): number;
  getModelCapabilities(modelId: string): string[];
  shouldIncludeModel(modelId: string): boolean;
  supportsFunctions(modelId: string): boolean;
  supportsVision(modelId: string): boolean;
}

const OPENAI_PROFILE: OpenAICompatibleProfile = {
  providerLabel: 'OpenAI',
  providerName: 'openai',
  defaultModel: 'gpt-4o',
  capabilities: {
    chat: true,
    completion: true,
    embeddings: true,
    streaming: true,
    functions: true,
    vision: true,
    fineTuning: true,
    imageEmbeddings: true,
    imageGeneration: true,
    videoGeneration: false,
    tts: false,
    voiceCloning: false,
    voiceDesign: false,
    maxContextLength: 128000,
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
  },
  describeModel: (modelId) => `OpenAI model: ${modelId}`,
  getContextLength(modelId) {
    if (modelId.includes('gpt-4o')) return 128000;
    if (modelId.includes('gpt-4.1')) return 128000;
    if (modelId.includes('gpt-4-turbo')) return 128000;
    if (modelId.includes('gpt-4')) return 8192;
    if (modelId.includes('gpt-3.5-turbo')) return 16385;
    if (modelId.includes('text-embedding')) return 8192;
    return 4096;
  },
  getModelCapabilities(modelId) {
    const capabilities = ['text'];
    if (modelId.includes('gpt')) {
      capabilities.push('chat', 'functions');
    }
    if (
      modelId.includes('vision') ||
      modelId === 'gpt-4o' ||
      modelId.includes('gpt-4.1')
    ) {
      capabilities.push('vision');
    }
    if (modelId.includes('embedding')) {
      capabilities.push('embeddings');
    }
    return capabilities;
  },
  shouldIncludeModel(modelId) {
    return modelId.includes('gpt') || modelId.includes('text-embedding');
  },
  supportsFunctions(modelId) {
    return modelId.includes('gpt-4') || modelId.includes('gpt-3.5');
  },
  supportsVision(modelId) {
    return (
      modelId.includes('vision') ||
      modelId === 'gpt-4o' ||
      modelId.includes('gpt-4.1')
    );
  },
};

export interface OpenAICompatibleOptions extends BaseAIOptions {
  type?: string;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * OpenAI provider implementation that handles all interactions with OpenAI's API.
 * Supports GPT models, embeddings, function calling, streaming, and vision capabilities.
 */
export class OpenAIProvider implements AIInterface {
  private client: OpenAI;
  protected options: OpenAICompatibleOptions;
  protected readonly profile: OpenAICompatibleProfile;

  /**
   * Creates a new OpenAI provider instance
   * @param options - Configuration options for the OpenAI provider
   */
  constructor(
    options: OpenAICompatibleOptions,
    profile: OpenAICompatibleProfile = OPENAI_PROFILE,
  ) {
    this.profile = profile;
    this.options = normalizeBaseAIOptions({
      defaultModel: this.profile.defaultModel,
      ...options,
    });

    this.client = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: this.options.baseUrl,
      organization: this.options.organization,
      timeout: this.options.timeout,
      maxRetries: this.options.maxRetries,
      defaultHeaders: this.options.headers,
    });
  }

  /**
   * Generate a chat completion using OpenAI's chat models
   * @param messages - Array of conversation messages
   * @param options - Optional configuration for the chat completion
   * @returns Promise resolving to the AI response with content and metadata
   * @throws {AIError} When the API request fails or returns invalid data
   *
   * @example
   * ```typescript
   * const response = await provider.chat([
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'What is the capital of France?' }
   * ], {
   *   model: 'gpt-4o',
   *   temperature: 0.7,
   *   maxTokens: 150
   * });
   * console.log(response.content); // "Paris is the capital of France."
   * ```
   */
  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      const model =
        options.model || this.options.defaultModel || this.profile.defaultModel;
      options = normalizeChatOptions(
        this.options,
        options,
        this.profile.providerName,
        model,
      );
      controls = prepareRequestControls(this.options, options);
      const request = {
        model,
        messages: this.mapMessagesToOpenAI(messages),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        n: options.n,
        stop: options.stop,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        user: options.user,
        tools: options.tools?.map((tool) => ({
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
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
        reasoning?: {
          effort?: string;
          max_tokens?: number;
          include_thoughts?: boolean;
        };
      };
      if (
        (this.profile.providerName === 'bifrost' ||
          this.profile.providerName === 'litellm') &&
        (options.reasoning?.maxTokens || 0) > 0
      ) {
        request.reasoning = {
          effort: options.reasoning?.effort,
          max_tokens: options.reasoning?.maxTokens,
          include_thoughts: options.reasoning?.includeThoughts,
        };
      }
      const response = await this.client.chat.completions.create(request, {
        signal: controls.signal,
        timeout: controls.timeout,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new AIError(
          `No choices returned from ${this.profile.providerLabel}`,
          'NO_CHOICES',
          this.profile.providerName,
        );
      }

      const usage = this.mapUsage(response.usage);
      emitUsage(
        this.options,
        this.profile.providerName,
        'chat',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        content: choice.message.content || '',
        usage,
        model: response.model,
        finishReason: this.mapFinishReason(choice.finish_reason),
        toolCalls: choice.message.tool_calls
          ?.filter((call) => call.type === 'function')
          .map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
      };
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          this.profile.providerName,
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          this.profile.providerName,
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  /**
   * Generate a text completion for a given prompt
   * @param prompt - The text prompt to complete
   * @param options - Optional configuration for the completion
   * @returns Promise resolving to the AI response
   * @throws {AIError} When the API request fails
   *
   * @example
   * ```typescript
   * const response = await provider.complete('The weather today is', {
   *   model: 'gpt-4o',
   *   maxTokens: 50,
   *   temperature: 0.5
   * });
   * ```
   */
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
      signal: options.signal,
      timeout: options.timeout,
      reasoning: options.reasoning,
      usageTags: options.usageTags,
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
   * // With options
   * const response = await provider.message('Analyze this', {
   *   model: 'gpt-4o',
   *   responseFormat: { type: 'json_object' }
   * });
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
      signal: options.signal,
      timeout: options.timeout,
      reasoning: options.reasoning,
      usageTags: options.usageTags,
    });

    return response.content;
  }

  /**
   * Generate embeddings for the given text(s)
   * @param text - Single text string or array of texts to embed
   * @param options - Optional configuration for embeddings
   * @returns Promise resolving to embeddings response with vector arrays
   * @throws {AIError} When the API request fails
   *
   * @example
   * ```typescript
   * // Single text embedding
   * const response1 = await provider.embed('Hello world');
   * console.log(response1.embeddings[0]); // Array of numbers
   *
   * // Multiple text embeddings
   * const response2 = await provider.embed(['Text 1', 'Text 2']);
   * console.log(response2.embeddings.length); // 2
   * ```
   */
  async embed(
    text: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    try {
      const model = options.model || 'text-embedding-3-small';
      const input = Array.isArray(text) ? text : [text];
      const response = await this.client.embeddings.create({
        model,
        input,
        encoding_format: options.encodingFormat,
        dimensions: options.dimensions,
        user: options.user,
      });

      const usage = this.mapUsage(response.usage);
      emitUsage(
        this.options,
        this.profile.providerName,
        'embed',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        embeddings: response.data.map((item) => item.embedding),
        usage,
        model: response.model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Convert an image to a base64 data URL
   * @param image - Image as URL, base64 data URL, or Buffer
   * @returns base64 data URL string
   * @private
   */
  private async imageToBase64(
    image: string | Buffer,
    signal?: AbortSignal,
  ): Promise<string> {
    if (Buffer.isBuffer(image)) {
      return `data:image/png;base64,${image.toString('base64')}`;
    }
    if (image.startsWith('data:')) {
      return image; // Already base64 data URL
    }
    // It's a URL - fetch and convert
    const response = await fetch(image, { signal });
    if (!response.ok) {
      throw new AIError(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
        'IMAGE_FETCH_ERROR',
        this.profile.providerName,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
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
    let controls: PreparedRequestControls | undefined;
    try {
      const defaultPrompt =
        'Describe this image for a search index. Include objects, mood, lighting, and any visible text.';

      controls = prepareRequestControls(this.options, options);
      const imageUrl = await this.imageToBase64(image, controls.signal);

      const response = await this.chat(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt || defaultPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: options.detail || 'auto',
                },
              },
            ],
          },
        ],
        {
          model:
            options.model ||
            this.options.defaultModel ||
            this.profile.defaultModel,
          maxTokens: options.maxTokens ?? 500,
          signal: controls.signal,
          timeout: controls.timeout,
          reasoning: options.reasoning,
          usageTags: options.usageTags,
        },
      );

      return response.content;
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          this.profile.providerName,
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          this.profile.providerName,
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  /**
   * Generate embeddings for an image using describe-then-embed pattern
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
      // OpenAI doesn't have native image embeddings - use describe-then-embed
      const description = await this.describeImage(
        image,
        'Describe this image in detail for semantic embedding. Include all visible objects, colors, textures, composition, text, people, actions, and overall scene context.',
      );

      return this.embed(description, {
        model: options.model || 'text-embedding-3-small',
        dimensions: options.dimensions,
        user: options.user,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Generate an image from a text prompt using DALL-E
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
    let controls: PreparedRequestControls | undefined;
    try {
      const model = options.model || 'dall-e-3';
      options = normalizeImageGenerationOptions(
        this.options,
        options,
        this.profile.providerName,
        model,
      );
      controls = prepareRequestControls(this.options, options);

      const requestParams: OpenAI.Images.ImageGenerateParams = {
        model,
        prompt,
        n: model === 'dall-e-3' ? 1 : options.n,
        size:
          (options.size as OpenAI.Images.ImageGenerateParams['size']) ||
          '1024x1024',
        response_format: options.outputFormat === 'url' ? 'url' : 'b64_json',
      };

      if (model === 'dall-e-3') {
        if (options.style) {
          requestParams.style = options.style;
        }
        if (options.quality) {
          requestParams.quality =
            options.quality as OpenAI.Images.ImageGenerateParams['quality'];
        }
      }

      const response = await this.client.images.generate(requestParams, {
        signal: controls.signal,
        timeout: controls.timeout,
      });

      const images = (response.data || []).map((item) => {
        let data: Buffer | string;
        const mimeType = 'image/png';

        if (options.outputFormat === 'url') {
          data = item.url || '';
        } else if (options.outputFormat === 'base64') {
          data = item.b64_json || '';
        } else {
          // Default: buffer
          data = Buffer.from(item.b64_json || '', 'base64');
        }

        return {
          data,
          mimeType,
          revisedPrompt: item.revised_prompt,
        };
      });

      return {
        images,
        model,
      };
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          this.profile.providerName,
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          this.profile.providerName,
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  // ============================================================================
  // Video Generation Methods (Not supported - use gemini, byteplus-modelark,
  // or openai-compat-video provider)
  // ============================================================================

  async submitVideoGenerationJob(
    _options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    throw new AIError(
      `Video generation is not supported by ${this.profile.providerLabel} provider. Use gemini, byteplus-modelark, or openai-compat-video provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  async getVideoGenerationJob(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    throw new AIError(
      `Video generation is not supported by ${this.profile.providerLabel} provider. Use gemini, byteplus-modelark, or openai-compat-video provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  async fetchVideoGenerationResult(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    throw new AIError(
      `Video generation is not supported by ${this.profile.providerLabel} provider. Use gemini, byteplus-modelark, or openai-compat-video provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  async cancelVideoGenerationJob(_handle: VideoGenerationJob): Promise<void> {
    throw new AIError(
      `Video generation is not supported by ${this.profile.providerLabel} provider. Use gemini, byteplus-modelark, or openai-compat-video provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  async validateVideoGenerationAccess(): Promise<boolean> {
    throw new AIError(
      `Video generation is not supported by ${this.profile.providerLabel} provider. Use gemini, byteplus-modelark, or openai-compat-video provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  /**
   * Stream a chat completion response in real-time
   * @param messages - Array of conversation messages
   * @param options - Optional configuration for the chat completion
   * @yields Individual content chunks as they arrive
   * @throws {AIError} When the streaming request fails
   *
   * @example
   * ```typescript
   * for await (const chunk of provider.stream([
   *   { role: 'user', content: 'Write a story about AI' }
   * ])) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      const model =
        options.model || this.options.defaultModel || this.profile.defaultModel;
      options = normalizeChatOptions(
        this.options,
        options,
        this.profile.providerName,
        model,
      );
      controls = prepareRequestControls(this.options, options);
      const request = {
        model,
        messages: this.mapMessagesToOpenAI(messages),
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        stop: options.stop,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        user: options.user,
        stream: true,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming & {
        reasoning?: {
          effort?: string;
          max_tokens?: number;
          include_thoughts?: boolean;
        };
      };
      if (
        (this.profile.providerName === 'bifrost' ||
          this.profile.providerName === 'litellm') &&
        (options.reasoning?.maxTokens || 0) > 0
      ) {
        request.reasoning = {
          effort: options.reasoning?.effort,
          max_tokens: options.reasoning?.maxTokens,
          include_thoughts: options.reasoning?.includeThoughts,
        };
      }
      const stream = await this.client.chat.completions.create(request, {
        signal: controls.signal,
        timeout: controls.timeout,
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

      emitUsage(
        this.options,
        this.profile.providerName,
        'stream',
        model,
        undefined,
        startTime,
        options.usageTags,
      );
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          this.profile.providerName,
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          this.profile.providerName,
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  /**
   * Count the number of tokens in the given text
   * @param text - The text to count tokens for
   * @returns Promise resolving to the estimated token count
   *
   * @remarks
   * OpenAI doesn't provide a direct token counting API, so this is an approximation
   * based on the general rule of ~4 characters per token. For precise counting,
   * consider using a dedicated tokenizer library.
   *
   * @example
   * ```typescript
   * const count = await provider.countTokens('Hello, world!');
   * console.log(count); // Approximately 4 tokens
   * ```
   */
  async countTokens(text: string): Promise<number> {
    // OpenAI doesn't provide a direct token counting API
    // This is an approximation based on the general rule of ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get a list of available OpenAI models
   * @returns Promise resolving to an array of model information
   * @throws {AIError} When the API request fails
   *
   * @example
   * ```typescript
   * const models = await provider.getModels();
   * const gptModels = models.filter(m => m.id.includes('gpt'));
   * ```
   */
  async getModels(): Promise<AIModel[]> {
    try {
      const response = await this.client.models.list();
      return response.data
        .filter((model) => this.profile.shouldIncludeModel(model.id))
        .map((model) => ({
          id: model.id,
          name: model.id,
          description: this.profile.describeModel(model.id),
          contextLength: this.profile.getContextLength(model.id),
          capabilities: this.profile.getModelCapabilities(model.id),
          supportsFunctions: this.profile.supportsFunctions(model.id),
          supportsVision: this.profile.supportsVision(model.id),
        }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Get the capabilities supported by this OpenAI provider
   * @returns Promise resolving to provider capabilities
   *
   * @example
   * ```typescript
   * const caps = await provider.getCapabilities();
   * if (caps.functions) {
   *   // Provider supports function calling
   * }
   * ```
   */
  async getCapabilities(): Promise<AICapabilities> {
    return { ...this.profile.capabilities };
  }

  // ============================================================================
  // TTS Methods (Not supported - use Qwen3-TTS provider)
  // ============================================================================

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      `TTS is not supported by ${this.profile.providerLabel} provider. Use Qwen3-TTS provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      `TTS streaming is not supported by ${this.profile.providerLabel} provider. Use Qwen3-TTS provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      `Voice cloning is not supported by ${this.profile.providerLabel} provider. Use Qwen3-TTS provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      `Voice design is not supported by ${this.profile.providerLabel} provider. Use Qwen3-TTS provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      `Voice listing is not supported by ${this.profile.providerLabel} provider. Use Qwen3-TTS provider.`,
      'NOT_IMPLEMENTED',
      this.profile.providerName,
    );
  }

  /**
   * Maps internal AI messages to OpenAI's message format
   * @param messages - Array of internal AI messages
   * @returns Array of OpenAI-compatible message parameters
   * @private
   */
  private mapMessagesToOpenAI(
    messages: AIMessage[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((message) => {
      // Handle content that can be string or ContentPart[]
      let content: string | OpenAI.Chat.ChatCompletionContentPart[];

      if (typeof message.content === 'string') {
        content = message.content;
      } else {
        // Array of content parts - map to OpenAI format
        content = message.content.map((part: ContentPart) => {
          if (part.type === 'text') {
            return { type: 'text' as const, text: part.text };
          }
          // Image content part
          return {
            type: 'image_url' as const,
            image_url: {
              url: part.image_url.url,
              detail: part.image_url.detail,
            },
          };
        });
      }

      // Build message based on role and content
      const baseMessage = {
        role: message.role as OpenAI.Chat.ChatCompletionRole,
        content,
      };

      // Add optional fields based on role and availability
      if (
        message.name &&
        (message.role === 'system' ||
          message.role === 'user' ||
          message.role === 'function')
      ) {
        (baseMessage as any).name = message.name;
      }

      if (message.tool_calls && message.role === 'assistant') {
        (baseMessage as any).tool_calls = message.tool_calls;
      }

      return baseMessage as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  /**
   * Maps internal tool choice format to OpenAI's tool choice format
   * @param toolChoice - Internal tool choice specification
   * @returns OpenAI-compatible tool choice option or undefined
   * @private
   */
  private mapToolChoice(
    toolChoice?:
      | 'auto'
      | 'none'
      | { type: 'function'; function: { name: string } },
  ): OpenAI.Chat.ChatCompletionToolChoiceOption | undefined {
    if (!toolChoice) return undefined;
    if (typeof toolChoice === 'string') return toolChoice;
    return {
      type: 'function',
      function: { name: toolChoice.function.name },
    };
  }

  /**
   * Maps OpenAI usage information to internal token usage format
   * @param usage - OpenAI usage object from API response
   * @returns Internal token usage object or undefined
   * @private
   */
  private mapUsage(
    usage?:
      | OpenAI.CompletionUsage
      | OpenAI.Completions.CompletionUsage
      | OpenAI.Embeddings.CreateEmbeddingResponse.Usage,
  ): TokenUsage | undefined {
    if (!usage) return undefined;
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: (usage as any).completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };
  }

  /**
   * Maps OpenAI finish reason to internal finish reason format
   * @param reason - OpenAI finish reason from API response
   * @returns Internal finish reason
   * @private
   */
  private mapFinishReason(reason: string | null): AIResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Gets the context length for a given OpenAI model
   * @param modelId - The OpenAI model identifier
   * @returns Maximum context length in tokens
   * @private
   */
  /**
   * Maps OpenAI API errors to internal AI error types
   * @param error - The error object from OpenAI API
   * @returns Appropriate internal AI error instance
   * @private
   */

  private mapError(error: unknown): AIError {
    if (error instanceof OpenAI.APIError) {
      switch (error.status) {
        case 401:
          return new AuthenticationError(this.profile.providerName);
        case 429: {
          return new RateLimitError(
            this.profile.providerName,
            extractRetryAfterSeconds(error),
          );
        }
        case 404:
          return new ModelNotFoundError(
            error.message,
            this.profile.providerName,
          );
        case 413:
          return new ContextLengthError(this.profile.providerName);
        default:
          if (error.message.includes('content_filter')) {
            return new ContentFilterError(this.profile.providerName);
          }
          return new AIError(
            error.message,
            'API_ERROR',
            this.profile.providerName,
          );
      }
    }

    if (error instanceof AIError) {
      return error;
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return new AIError(
      errorMessage,
      'UNKNOWN_ERROR',
      this.profile.providerName,
    );
  }
}
