/**
 * AWS Bedrock provider implementation
 */

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
import { emitUsage } from './usage';

const BEDROCK_DEFAULT_CHAT_MODEL = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
const BEDROCK_TEXT_EMBEDDING_MODEL = 'amazon.titan-embed-text-v2:0';
const BEDROCK_IMAGE_EMBEDDING_MODEL = 'amazon.titan-embed-image-v1';
const BEDROCK_IMAGE_GENERATION_MODEL = 'amazon.titan-image-generator-v2:0';

export class BedrockProvider implements AIInterface {
  private options: BedrockOptions;
  private client: any; // Will be BedrockRuntimeClient instance from @aws-sdk/client-bedrock-runtime

  constructor(options: BedrockOptions) {
    this.options = normalizeBaseAIOptions({
      defaultModel: BEDROCK_DEFAULT_CHAT_MODEL,
      ...options,
    });

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
            maxAttempts: (this.options.maxRetries || 0) + 1,
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
          maxAttempts: (this.options.maxRetries || 0) + 1,
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
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const modelId = options.model || this.options.defaultModel;
      options = normalizeChatOptions(this.options, options, 'bedrock', modelId);
      controls = prepareRequestControls(this.options, options);
      const response = this.mapConverseResponse(
        await this.client.converse(
          await this.buildConverseRequest(
            messages,
            options,
            modelId!,
            controls.signal,
          ),
          { abortSignal: controls.signal },
        ),
        modelId!,
      );

      emitUsage(
        this.options,
        'bedrock',
        'chat',
        response.model || modelId || 'unknown',
        response.usage,
        startTime,
        options.usageTags,
      );
      return response;
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'bedrock',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'bedrock',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
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

  async embed(
    text: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    try {
      await this.ensureClient();

      const model = options.model || BEDROCK_TEXT_EMBEDDING_MODEL;
      const inputs = Array.isArray(text) ? text : [text];
      const embeddings: number[][] = [];
      let totalTokens = 0;

      for (const inputText of inputs) {
        const response = await this.client.invokeModel({
          modelId: model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            inputText,
            ...(options.dimensions && { dimensions: options.dimensions }),
            normalize: true,
          }),
        });

        const payload = await this.parseInvokeModelBody(response.body);
        const embedding = this.extractEmbeddingVector(payload);
        if (embedding) {
          embeddings.push(embedding);
        }

        totalTokens +=
          payload.inputTextTokenCount ||
          payload.inputTokenCount ||
          payload.tokenCount ||
          0;
      }

      const usage: TokenUsage | undefined =
        totalTokens > 0
          ? {
              promptTokens: totalTokens,
              completionTokens: 0,
              totalTokens,
            }
          : undefined;

      emitUsage(
        this.options,
        'bedrock',
        'embed',
        model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        embeddings,
        model,
        usage,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async embedImage(
    image: string | Buffer,
    options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    try {
      await this.ensureClient();

      const model = options.model || BEDROCK_IMAGE_EMBEDDING_MODEL;
      const response = await this.client.invokeModel({
        modelId: model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputImage: await this.imageToBase64(image),
          ...(options.dimensions && {
            embeddingConfig: {
              outputEmbeddingLength: options.dimensions,
            },
          }),
        }),
      });

      const payload = await this.parseInvokeModelBody(response.body);
      const embedding = this.extractEmbeddingVector(payload);

      emitUsage(
        this.options,
        'bedrock',
        'embedImage',
        model,
        undefined,
        startTime,
      );

      return {
        embeddings: embedding ? [embedding] : [],
        model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async describeImage(
    image: string | Buffer,
    prompt?: string,
    options: ImageDescriptionOptions = {},
  ): Promise<string> {
    const imageUrl = await this.imageToDataUrl(image, options.signal);
    const response = await this.chat(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                prompt ||
                'Describe this image for a search index. Include objects, mood, lighting, and any visible text.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      {
        model: options.model || this.options.defaultModel,
        maxTokens: options.maxTokens ?? 500,
        signal: options.signal,
        timeout: options.timeout,
        reasoning: options.reasoning,
        usageTags: options.usageTags,
      },
    );

    return response.content;
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const model = options.model || BEDROCK_IMAGE_GENERATION_MODEL;
      options = normalizeImageGenerationOptions(
        this.options,
        options,
        'bedrock',
        model,
      );
      controls = prepareRequestControls(this.options, options);
      const size = this.resolveImageSize(options);
      const response = await this.client.invokeModel(
        {
          modelId: model,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify({
            taskType: 'TEXT_IMAGE',
            textToImageParams: {
              text: prompt,
              ...(options.imageInput && {
                conditionImage: await this.imageToBase64(
                  options.imageInput,
                  controls.signal,
                ),
              }),
            },
            imageGenerationConfig: {
              numberOfImages: options.n,
              quality: this.mapImageQuality(options.quality),
              ...size,
            },
          }),
        },
        { abortSignal: controls.signal },
      );

      const payload = await this.parseInvokeModelBody(response.body);
      if (payload.error) {
        throw new AIError(payload.error, 'API_ERROR', 'bedrock');
      }

      const images = (payload.images || []).map((encoded: string) => {
        const mimeType = 'image/png';
        if (options.outputFormat === 'base64') {
          return { data: encoded, mimeType };
        }
        if (options.outputFormat === 'url') {
          return { data: `data:${mimeType};base64,${encoded}`, mimeType };
        }
        return {
          data: Buffer.from(encoded, 'base64'),
          mimeType,
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
          'bedrock',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'bedrock',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const modelId = options.model || this.options.defaultModel;
      options = normalizeChatOptions(this.options, options, 'bedrock', modelId);
      controls = prepareRequestControls(this.options, options);
      const response = await this.client.converseStream(
        await this.buildConverseRequest(
          messages,
          options,
          modelId!,
          controls.signal,
        ),
        { abortSignal: controls.signal },
      );

      let usage: TokenUsage | undefined;

      for await (const event of response.stream || []) {
        const text = event.contentBlockDelta?.delta?.text;
        if (text) {
          if (options.onProgress) {
            options.onProgress(text);
          }
          yield text;
        }

        if (event.metadata?.usage) {
          usage = {
            promptTokens: event.metadata.usage.inputTokens || 0,
            completionTokens: event.metadata.usage.outputTokens || 0,
            totalTokens: event.metadata.usage.totalTokens || 0,
          };
        }
      }

      emitUsage(
        this.options,
        'bedrock',
        'stream',
        modelId || 'unknown',
        usage,
        startTime,
        options.usageTags,
      );
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'bedrock',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'bedrock',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      await this.ensureClient();

      const modelId = this.options.defaultModel || BEDROCK_DEFAULT_CHAT_MODEL;
      const response = await this.client.countTokens({
        modelId,
        input: {
          converse: {
            messages: [
              {
                role: 'user',
                content: [{ text }],
              },
            ],
          },
        },
      });

      return response.inputTokens || Math.ceil(text.length / 4);
    } catch (error) {
      throw this.mapError(error);
    }
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
      {
        id: BEDROCK_TEXT_EMBEDDING_MODEL,
        name: 'Titan Embeddings Text V2',
        description: 'Amazon Titan text embeddings v2 model',
        contextLength: 8192,
        capabilities: ['embeddings'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: BEDROCK_IMAGE_EMBEDDING_MODEL,
        name: 'Titan Multimodal Embeddings G1',
        description:
          'Amazon Titan multimodal embeddings model for image similarity',
        contextLength: 256,
        capabilities: ['embeddings', 'image_embedding'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: BEDROCK_IMAGE_GENERATION_MODEL,
        name: 'Titan Image Generator V2',
        description: 'Amazon Titan image generation model',
        contextLength: 0,
        capabilities: ['image_generation'],
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
      embeddings: true,
      streaming: true,
      functions: true, // Some models support function calling
      vision: true, // Some models support vision
      fineTuning: true, // Via Bedrock fine-tuning
      imageEmbeddings: true,
      imageGeneration: true,
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

  private async buildConverseRequest(
    messages: AIMessage[],
    options: ChatOptions,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<Record<string, any>> {
    const { system, bedrockMessages } = await this.mapMessagesToBedrock(
      messages,
      signal,
    );
    const systemPrompt =
      options.responseFormat?.type === 'json_object'
        ? [
            system,
            'Respond with valid JSON only. Do not include explanatory text outside the JSON object.',
          ]
            .filter(Boolean)
            .join('\n\n')
        : system;

    const inferenceConfig = Object.fromEntries(
      Object.entries({
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        stopSequences: Array.isArray(options.stop)
          ? options.stop
          : options.stop
            ? [options.stop]
            : undefined,
      }).filter(([, value]) => value !== undefined),
    );

    const request: Record<string, any> = {
      modelId,
      messages: bedrockMessages,
      ...(Object.keys(inferenceConfig).length > 0 && { inferenceConfig }),
      ...(systemPrompt && { system: [{ text: systemPrompt }] }),
    };
    if ((options.reasoning?.maxTokens || 0) > 0) {
      request.additionalModelRequestFields = {
        thinking: {
          type: 'enabled',
          budget_tokens: options.reasoning?.maxTokens,
        },
      };
    }

    const toolConfig = this.mapToolConfig(options);
    if (toolConfig) {
      request.toolConfig = toolConfig;
    }

    return request;
  }

  private async mapMessagesToBedrock(
    messages: AIMessage[],
    signal?: AbortSignal,
  ): Promise<{
    system?: string;
    bedrockMessages: Array<{ role: 'user' | 'assistant'; content: any[] }>;
  }> {
    let system: string | undefined;
    const bedrockMessages: Array<{
      role: 'user' | 'assistant';
      content: any[];
    }> = [];

    for (const message of messages) {
      const textContent = extractTextContent(message.content);
      if (message.role === 'system') {
        system = system ? `${system}\n\n${textContent}` : textContent;
        continue;
      }

      const content: any[] = [];
      if (typeof message.content === 'string') {
        content.push({ text: message.content });
      } else {
        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ text: part.text });
            continue;
          }

          const image = await this.imageUrlToBedrockImage(
            part.image_url.url,
            signal,
          );
          content.push({ image });
        }
      }

      if (message.role === 'assistant' && message.tool_calls) {
        for (const toolCall of message.tool_calls) {
          content.push({
            toolUse: {
              toolUseId: toolCall.id,
              name: toolCall.function.name,
              input: this.safeJsonParse(toolCall.function.arguments),
            },
          });
        }
      }

      if (content.length === 0 && textContent) {
        content.push({ text: textContent });
      }

      bedrockMessages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content,
      });
    }

    return { system, bedrockMessages };
  }

  private mapConverseResponse(response: any, modelId: string): AIResponse {
    const contentBlocks = response.output?.message?.content || [];
    const textContent = contentBlocks
      .filter((block: any) => typeof block.text === 'string')
      .map((block: any) => block.text)
      .join('');

    const toolCalls = contentBlocks
      .filter((block: any) => block.toolUse)
      .map((block: any) => ({
        id: block.toolUse.toolUseId,
        type: 'function' as const,
        function: {
          name: block.toolUse.name,
          arguments: JSON.stringify(block.toolUse.input || {}),
        },
      }));

    const usage =
      response.usage &&
      ({
        promptTokens: response.usage.inputTokens || 0,
        completionTokens: response.usage.outputTokens || 0,
        totalTokens: response.usage.totalTokens || 0,
      } satisfies TokenUsage);

    return {
      content: textContent,
      model: modelId,
      finishReason: this.mapBedrockFinishReason(response.stopReason),
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  private mapBedrockFinishReason(
    reason: string | null | undefined,
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

  private mapToolConfig(options: ChatOptions): Record<string, any> | undefined {
    if (!options.tools || options.tools.length === 0) {
      return undefined;
    }

    if (options.toolChoice === 'none') {
      return undefined;
    }

    return {
      tools: options.tools.map((tool) => ({
        toolSpec: {
          name: tool.function.name,
          description: tool.function.description || '',
          inputSchema: {
            json: tool.function.parameters || { type: 'object' },
          },
        },
      })),
      ...(options.toolChoice && {
        toolChoice: this.mapToolChoice(options.toolChoice),
      }),
    };
  }

  private mapToolChoice(
    toolChoice?:
      | 'auto'
      | 'none'
      | { type: 'function'; function: { name: string } },
  ): Record<string, any> | undefined {
    if (!toolChoice || toolChoice === 'auto') {
      return { auto: {} };
    }

    if (toolChoice === 'none') {
      return undefined;
    }

    return {
      tool: {
        name: toolChoice.function.name,
      },
    };
  }

  private async parseInvokeModelBody(body: unknown): Promise<any> {
    const bytes =
      typeof (body as any)?.transformToByteArray === 'function'
        ? await (body as any).transformToByteArray()
        : body instanceof Uint8Array
          ? body
          : Buffer.isBuffer(body)
            ? body
            : new Uint8Array(body as ArrayBuffer);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  private extractEmbeddingVector(payload: any): number[] | undefined {
    if (Array.isArray(payload.embedding)) {
      return payload.embedding;
    }

    if (Array.isArray(payload.embeddings?.[0])) {
      return payload.embeddings[0];
    }

    if (Array.isArray(payload.embeddingsByType?.float)) {
      return payload.embeddingsByType.float;
    }

    if (Array.isArray(payload.vector)) {
      return payload.vector;
    }

    return undefined;
  }

  private async imageUrlToBedrockImage(
    imageUrl: string,
    signal?: AbortSignal,
  ): Promise<any> {
    const { bytes, mimeType } = await this.imageToBytes(imageUrl, signal);
    return {
      format: this.mimeTypeToBedrockImageFormat(mimeType),
      source: { bytes },
    };
  }

  private async imageToDataUrl(
    image: string | Buffer,
    signal?: AbortSignal,
  ): Promise<string> {
    if (Buffer.isBuffer(image)) {
      return `data:image/png;base64,${image.toString('base64')}`;
    }
    if (image.startsWith('data:')) {
      return image;
    }

    const { bytes, mimeType } = await this.imageToBytes(image, signal);
    return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
  }

  private async imageToBase64(
    image: string | Buffer,
    signal?: AbortSignal,
  ): Promise<string> {
    if (Buffer.isBuffer(image)) {
      return image.toString('base64');
    }
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new AIError(
          'Invalid base64 data URL format',
          'INVALID_INPUT',
          'bedrock',
        );
      }
      return match[2];
    }

    const { bytes } = await this.imageToBytes(image, signal);
    return Buffer.from(bytes).toString('base64');
  }

  private async imageToBytes(
    image: string,
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; mimeType: string }> {
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new AIError(
          'Invalid base64 data URL format',
          'INVALID_INPUT',
          'bedrock',
        );
      }

      return {
        bytes: Uint8Array.from(Buffer.from(match[2], 'base64')),
        mimeType: match[1],
      };
    }

    const response = await fetch(image, { signal });
    if (!response.ok) {
      throw new AIError(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
        'IMAGE_FETCH_ERROR',
        'bedrock',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      bytes: new Uint8Array(arrayBuffer),
      mimeType: response.headers.get('content-type') || 'image/png',
    };
  }

  private mimeTypeToBedrockImageFormat(mimeType: string): string {
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpeg';
    if (mimeType.includes('gif')) return 'gif';
    if (mimeType.includes('webp')) return 'webp';

    throw new AIError(
      `Unsupported image format for Bedrock: ${mimeType}`,
      'INVALID_INPUT',
      'bedrock',
    );
  }

  private resolveImageSize(options: ImageGenerationOptions): {
    width: number;
    height: number;
  } {
    if (options.size) {
      const [width, height] = options.size.split('x').map(Number);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
      }
    }

    const aspectRatioSizes: Record<string, { width: number; height: number }> =
      {
        '1:1': { width: 1024, height: 1024 },
        '2:3': { width: 768, height: 1152 },
        '3:2': { width: 1152, height: 768 },
        '3:5': { width: 768, height: 1280 },
        '5:3': { width: 1280, height: 768 },
        '7:9': { width: 896, height: 1152 },
        '9:7': { width: 1152, height: 896 },
        '6:11': { width: 768, height: 1408 },
        '11:6': { width: 1408, height: 768 },
        '5:11': { width: 640, height: 1408 },
        '11:5': { width: 1408, height: 640 },
        '9:5': { width: 1152, height: 640 },
        '16:9': { width: 1173, height: 640 },
      };

    return (
      aspectRatioSizes[options.aspectRatio || ''] || {
        width: 1024,
        height: 1024,
      }
    );
  }

  private mapImageQuality(quality?: string): string {
    if (!quality || quality === 'standard') {
      return 'standard';
    }

    if (quality === 'hd') {
      return 'premium';
    }

    return quality;
  }

  private safeJsonParse(input: string): any {
    try {
      return JSON.parse(input);
    } catch {
      return { rawArguments: input };
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
