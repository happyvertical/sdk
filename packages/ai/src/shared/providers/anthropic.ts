/**
 * Anthropic Claude provider implementation
 *
 * Provides a standardized interface for interacting with Anthropic's Claude models,
 * including chat completions, streaming responses, and vision capabilities.
 * Note: Claude models do not support embeddings - use OpenAI or another provider for that.
 */

import {
  type CacheControlWire,
  hasCacheHint,
  toCacheableTextBlocks,
  toCacheControl,
} from '../cache-hint';
import {
  type ClaudeEffort,
  claudeRejectsThinkingBudget,
  claudeSupportsEffort,
  toClaudeEffort,
} from '../claude-models';
import { rateLimitErrorFrom } from '../rate-limit';
import {
  normalizeBaseAIOptions,
  normalizeChatOptions,
  type PreparedRequestControls,
  prepareRequestControls,
} from '../safety';
import { parseToolArguments } from '../tool-messages';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  AIThinkingBlock,
  AIToolCall,
  AnthropicOptions,
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
  ContextLengthError,
  extractTextContent,
  ModelNotFoundError,
} from '../types';
import { cacheUsageFields, emitUsage } from './usage';

type AnthropicCacheControl = { cache_control?: CacheControlWire };

type AnthropicTextBlock = {
  type: 'text';
  text: string;
} & AnthropicCacheControl;

type AnthropicContentBlock =
  | AIThinkingBlock
  | AnthropicTextBlock
  | ({
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
    } & AnthropicCacheControl)
  | ({
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    } & AnthropicCacheControl);

/** Text blocks of a message, carrying `cache_control` where hinted. */
function toAnthropicTextBlocks(message: AIMessage): AnthropicTextBlock[] {
  return toCacheableTextBlocks(message).map((block) => ({
    type: 'text' as const,
    text: block.text,
    ...(block.cacheControl ? { cache_control: block.cacheControl } : {}),
  }));
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

// Note: This implementation will require @anthropic-ai/sdk package
// For now, this is a placeholder that defines the interface

/**
 * Anthropic Claude provider implementation that handles all interactions with Anthropic's API.
 * Supports Claude models, streaming, vision capabilities, and function calling.
 * Does not support embeddings (use OpenAI or another provider for embeddings).
 */
export class AnthropicProvider implements AIInterface {
  private options: AnthropicOptions;
  private client: any; // Will be Anthropic instance from @anthropic-ai/sdk

  /**
   * Creates a new Anthropic provider instance
   * @param options - Configuration options for the Anthropic provider
   */
  constructor(options: AnthropicOptions) {
    this.options = normalizeBaseAIOptions({
      defaultModel: 'claude-3-5-sonnet-20241022',
      anthropicVersion: '2023-06-01',
      ...options,
    });

    // Initialize Anthropic client
    this.initializeClientSync();
  }

  private initializeClientSync() {
    try {
      // Dynamic import in constructor - this will work if the package is installed
      import('@anthropic-ai/sdk')
        .then(({ Anthropic }) => {
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
        })
        .catch(() => {
          // Client will be null and we'll handle it in methods
        });
    } catch (_error) {
      // Client will be null and we'll handle it in methods
    }
  }

  /**
   * Ensures the Anthropic client is initialized by dynamically importing the SDK
   * @throws {AIError} When the Anthropic SDK cannot be loaded
   * @private
   */
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
      } catch (_error) {
        throw new AIError(
          'Failed to initialize Anthropic client. Make sure @anthropic-ai/sdk is installed.',
          'INITIALIZATION_ERROR',
          'anthropic',
        );
      }
    }
  }

  /**
   * Generate a chat completion using Claude models
   * @param messages - Array of conversation messages
   * @param options - Optional configuration for the chat completion
   * @returns Promise resolving to the AI response with content and metadata
   * @throws {AIError} When the API request fails or SDK is not available
   *
   * @example
   * ```typescript
   * const response = await provider.chat([
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'Explain quantum computing' }
   * ], {
   *   model: 'claude-3-5-sonnet-20241022',
   *   maxTokens: 1000
   * });
   * ```
   */
  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const { system, anthropicMessages } =
        this.mapMessagesToAnthropic(messages);

      const model = options.model || this.options.defaultModel;
      options = normalizeChatOptions(this.options, options, 'anthropic', model);
      controls = prepareRequestControls(this.options, options);

      // Build request parameters
      const requestParams: Record<string, any> = {
        model,
        messages: anthropicMessages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        stop_sequences: Array.isArray(options.stop)
          ? options.stop
          : options.stop
            ? [options.stop]
            : undefined,
        system: system || undefined,
        ...this.mapToolParams(options, anthropicMessages),
        stream: false,
      };
      const thinking = this.mapThinking(options, anthropicMessages, model);
      if (thinking) {
        requestParams.thinking = thinking;
      }
      const outputConfig = this.mapOutputConfig(options, model);
      if (outputConfig) {
        requestParams.output_config = outputConfig;
      }

      // Add response format if specified
      if (options.responseFormat?.type === 'json_object') {
        const jsonInstruction =
          '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any explanatory text outside the JSON object.';
        if (Array.isArray(requestParams.system)) {
          // Appended after the cached blocks so the instruction never
          // changes the cached prefix.
          requestParams.system = [
            ...requestParams.system,
            { type: 'text', text: jsonInstruction.trim() },
          ];
        } else {
          requestParams.system = requestParams.system
            ? requestParams.system + jsonInstruction
            : jsonInstruction.trim();
        }
      }

      const response = await this.client.messages.create(requestParams, {
        signal: controls.signal,
        timeout: controls.timeout,
      });

      // Extract text content and tool calls from response
      const textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      const toolCalls: AIToolCall[] = response.content
        .filter((block: any) => block.type === 'tool_use')
        .map((block: any) => ({
          id: block.id,
          type: 'function' as const,
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        }));

      // Extended thinking: the replayed tool_use turn must start with these
      // blocks (signatures intact), so they ride on the first tool call.
      const thinkingBlocks = extractThinkingBlocks(response.content);
      if (toolCalls.length > 0 && thinkingBlocks.length > 0) {
        toolCalls[0].thinkingBlocks = thinkingBlocks;
      }

      const usage = mapAnthropicUsage(response.usage);
      emitUsage(
        this.options,
        'anthropic',
        'chat',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        content: textContent,
        model: response.model,
        finishReason: this.mapFinishReason(response.stop_reason),
        usage,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'anthropic',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'anthropic',
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
      continueOnLength: options.continueOnLength,
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
      signal: options.signal,
      timeout: options.timeout,
      reasoning: options.reasoning,
      usageTags: options.usageTags,
      continueOnLength: options.continueOnLength,
    });

    return response.content;
  }

  async embed(
    _text: string | string[],
    _options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    // Anthropic Claude doesn't provide embeddings API
    throw new AIError(
      'Anthropic Claude does not support embeddings. Use OpenAI or another provider for embeddings.',
      'NOT_SUPPORTED',
      'anthropic',
    );
  }

  async embedImage(
    _image: string | Buffer,
    _options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Anthropic Claude does not support image embeddings. Use OpenAI or Gemini.',
      'NOT_SUPPORTED',
      'anthropic',
    );
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options: ImageDescriptionOptions = {},
  ): Promise<string> {
    // Note: Claude does support vision, but we're keeping this as a stub for now
    // A full implementation could use the chat API with image content
    throw new AIError(
      'Image description is not yet implemented for Anthropic. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async generateImage(
    _prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    throw new AIError(
      'Anthropic Claude does not support image generation. Use OpenAI or Gemini.',
      'NOT_SUPPORTED',
      'anthropic',
    );
  }

  /**
   * Streams a chat completion as text chunks.
   *
   * Streams yield text only and never surface tool calls, so `options.tools`
   * and `options.toolChoice` are ignored: tools are declared only when the
   * replayed history contains `tool_use` blocks (Anthropic requires it), with
   * `tool_choice: { type: 'none' }`. Use `chat()` for rounds that may call
   * tools.
   */
  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    try {
      await this.ensureClient();

      const { system, anthropicMessages } =
        this.mapMessagesToAnthropic(messages);

      const model = options.model || this.options.defaultModel;
      options = normalizeChatOptions(this.options, options, 'anthropic', model);
      controls = prepareRequestControls(this.options, options);

      const requestParams: Record<string, any> = {
        model,
        messages: anthropicMessages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        stop_sequences: Array.isArray(options.stop)
          ? options.stop
          : options.stop
            ? [options.stop]
            : undefined,
        system: system || undefined,
        // stream() yields text only, so a tool call would be lost: declare
        // tools only when the replayed history requires it, with
        // tool_choice none.
        ...this.mapHistoryToolParams(anthropicMessages),
        stream: true,
      };
      const thinking = this.mapThinking(options, anthropicMessages, model);
      if (thinking) {
        requestParams.thinking = thinking;
      }
      const outputConfig = this.mapOutputConfig(options, model);
      if (outputConfig) {
        requestParams.output_config = outputConfig;
      }
      const stream = await this.client.messages.create(requestParams, {
        signal: controls.signal,
        timeout: controls.timeout,
      });

      let streamStopReason: string | null = null;
      let streamUsage: Record<string, unknown> | undefined;
      for await (const chunk of stream) {
        if (chunk.type === 'message_start' && chunk.message?.usage) {
          streamUsage = { ...chunk.message.usage };
        }
        if (chunk.type === 'message_delta') {
          // message_delta usage is cumulative for the fields it carries.
          if (chunk.usage) streamUsage = { ...streamUsage, ...chunk.usage };
          if (chunk.delta?.stop_reason) {
            streamStopReason = chunk.delta.stop_reason;
          }
        }
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          if (options.onProgress) {
            options.onProgress(chunk.delta.text);
          }
          yield chunk.delta.text;
        }
      }
      options.onFinishReason?.(
        this.mapFinishReason(streamStopReason) ?? 'stop',
      );

      emitUsage(
        this.options,
        'anthropic',
        'stream',
        model!,
        streamUsage ? mapAnthropicUsage(streamUsage) : undefined,
        startTime,
        options.usageTags,
      );
    } catch (error) {
      if (controls?.didTimeout()) {
        throw new AIError(
          `AI request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          'anthropic',
          options.model,
        );
      }
      if (options.signal?.aborted) {
        throw new AIError(
          'AI request aborted by caller',
          'AI_ABORTED',
          'anthropic',
          options.model,
        );
      }
      throw this.mapError(error);
    } finally {
      controls?.cleanup();
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
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 200000,
      supportedOperations: [
        'chat',
        'completion',
        'streaming',
        'functions',
        'vision',
      ],
    };
  }

  // ============================================================================
  // Video Generation Methods (Not supported - use gemini, byteplus-modelark,
  // or openai-compat-video provider)
  // ============================================================================

  async submitVideoGenerationJob(
    _options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    throw new AIError(
      'Video generation is not supported by Anthropic provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async getVideoGenerationJob(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    throw new AIError(
      'Video generation is not supported by Anthropic provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async fetchVideoGenerationResult(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    throw new AIError(
      'Video generation is not supported by Anthropic provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async cancelVideoGenerationJob(_handle: VideoGenerationJob): Promise<void> {
    throw new AIError(
      'Video generation is not supported by Anthropic provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async validateVideoGenerationAccess(): Promise<boolean> {
    throw new AIError(
      'Video generation is not supported by Anthropic provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  // ============================================================================
  // TTS Methods (Not supported - use Qwen3-TTS provider)
  // ============================================================================

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by Anthropic provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by Anthropic provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by Anthropic provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by Anthropic provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by Anthropic provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'anthropic',
    );
  }

  /**
   * Maps internal messages to Anthropic Messages API turns.
   *
   * Assistant `tool_calls` become `tool_use` blocks and `role: 'tool'`
   * results become `tool_result` blocks paired by `tool_call_id`
   * (`tool_use_id`). Consecutive tool results are grouped into one user turn,
   * as Anthropic requires every result for a turn to follow it directly.
   * Only answered calls are replayed as `tool_use`, and only results whose
   * `tool_call_id` matches a replayed call become `tool_result`. A result
   * without `tool_call_id`, or one answering no replayed call, falls back to
   * plain text (and a call left unanswered keeps only its text).
   */
  private mapMessagesToAnthropic(messages: AIMessage[]): {
    system?: string | AnthropicTextBlock[];
    anthropicMessages: AnthropicMessage[];
  } {
    // Anthropic handles system messages separately
    let system: string | undefined;
    // Only built when a system message carries a cache hint: breakpoints
    // need block form, so the system prompt is sent as text blocks then.
    const systemBlocks: AnthropicTextBlock[] = [];
    let systemHinted = false;
    const anthropicMessages: AnthropicMessage[] = [];
    const answeredToolCallIds = new Set(
      messages
        .filter((message) => message.role === 'tool' && message.tool_call_id)
        .map((message) => message.tool_call_id as string),
    );
    // Calls replayed as tool_use: those with an answer. Only results for
    // these ids become tool_result blocks; any other result is an orphan
    // Anthropic would reject, so it falls back to plain text.
    const replayedToolUseIds = new Set<string>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const toolCall of message.tool_calls || []) {
        if (answeredToolCallIds.has(toolCall.id)) {
          replayedToolUseIds.add(toolCall.id);
        }
      }
    }

    for (const message of messages) {
      const textContent = extractTextContent(message.content);
      if (message.role === 'system') {
        // Combine multiple system messages
        system = system ? `${system}\n\n${textContent}` : textContent;
        systemHinted ||= hasCacheHint(message);
        systemBlocks.push(...toAnthropicTextBlocks(message));
        continue;
      }

      if (
        message.role === 'tool' &&
        message.tool_call_id &&
        replayedToolUseIds.has(message.tool_call_id)
      ) {
        const block: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: message.tool_call_id,
          content: textContent,
          ...(message.cacheHint
            ? { cache_control: toCacheControl(message.cacheHint) }
            : {}),
        };
        const previous = anthropicMessages[anthropicMessages.length - 1];
        if (
          previous?.role === 'user' &&
          Array.isArray(previous.content) &&
          previous.content.every((part) => part.type === 'tool_result')
        ) {
          previous.content.push(block);
        } else {
          anthropicMessages.push({ role: 'user', content: [block] });
        }
        continue;
      }

      const toolCalls =
        message.role === 'assistant'
          ? (message.tool_calls || []).filter((toolCall) =>
              answeredToolCallIds.has(toolCall.id),
            )
          : [];
      if (toolCalls.length > 0) {
        const content: AnthropicContentBlock[] = [];
        for (const toolCall of toolCalls) {
          for (const block of toolCall.thinkingBlocks || []) {
            content.push({ ...block });
          }
        }
        if (textContent) {
          content.push({ type: 'text', text: textContent });
        }
        for (const toolCall of toolCalls) {
          content.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: parseToolArguments(toolCall.function.arguments),
          });
        }
        const cacheControl = toCacheControl(message.cacheHint);
        const last = content[content.length - 1];
        if (
          cacheControl &&
          (last.type === 'text' || last.type === 'tool_use')
        ) {
          last.cache_control = cacheControl;
        }
        anthropicMessages.push({ role: 'assistant', content });
        continue;
      }

      const hintedBlocks = hasCacheHint(message)
        ? toAnthropicTextBlocks(message).filter((block) => block.text)
        : [];
      anthropicMessages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: hintedBlocks.length > 0 ? hintedBlocks : textContent,
      });
    }

    const hintedSystem = systemBlocks.filter((block) => block.text);
    return {
      system: systemHinted
        ? hintedSystem.length > 0
          ? hintedSystem
          : undefined
        : system,
      anthropicMessages,
    };
  }

  /**
   * Builds the `tools` / `tool_choice` request fields.
   *
   * Anthropic rejects a request whose history contains `tool_use` or
   * `tool_result` blocks unless `tools` is declared. A tool loop's final,
   * tool-less round (no `tools`, typically `toolChoice: 'none'`) still
   * replays that history, so when the caller declares no tools but the
   * history uses some, this declares a minimal definition for each tool the
   * history references and sets `tool_choice: { type: 'none' }` so the model
   * answers in text instead of calling them.
   */
  private mapToolParams(
    options: ChatOptions,
    anthropicMessages: AnthropicMessage[],
  ): { tools?: Record<string, any>[]; tool_choice?: Record<string, any> } {
    const tools = this.mapTools(options);
    if (tools) {
      return { tools, tool_choice: this.mapToolChoice(options.toolChoice) };
    }
    return this.mapHistoryToolParams(anthropicMessages);
  }

  /**
   * Declares a minimal definition for each tool the replayed history
   * references, with `tool_choice: { type: 'none' }`, or nothing when the
   * history has no `tool_use` blocks. Used for tool-less rounds and for
   * every stream (streams never yield tool calls).
   */
  private mapHistoryToolParams(anthropicMessages: AnthropicMessage[]): {
    tools?: Record<string, any>[];
    tool_choice?: Record<string, any>;
  } {
    // mapMessagesToAnthropic emits tool_result only for ids it replayed as
    // tool_use (orphan results become text), so tool_use names cover every
    // tool the history references.
    const historyToolNames = new Set<string>();
    for (const message of anthropicMessages) {
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content) {
        if (block.type === 'tool_use') historyToolNames.add(block.name);
      }
    }
    if (historyToolNames.size === 0) {
      return {};
    }

    return {
      tools: [...historyToolNames].map((name) => ({
        name,
        description:
          'Used earlier in this conversation; not available for this turn.',
        input_schema: { type: 'object' },
      })),
      tool_choice: { type: 'none' },
    };
  }

  /**
   * Builds the `thinking` request field for `options.reasoning.maxTokens`.
   *
   * While thinking is enabled, Anthropic requires the assistant turn of an
   * in-progress tool loop (the last assistant turn, when it holds `tool_use`)
   * to start with its thinking blocks. They are replayed from
   * `AIToolCall.thinkingBlocks`; when that turn has none (the history came
   * from another provider, a store that dropped the field, or a call made
   * without thinking), thinking is left off for this request rather than
   * sending a request Anthropic would reject.
   */
  private mapThinking(
    options: ChatOptions,
    anthropicMessages: AnthropicMessage[],
    model: string | undefined,
  ):
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'adaptive' }
    | undefined {
    const effort = options.reasoning?.effort;
    // Claude 4.6+ models are steered by `output_config.effort`, with thinking
    // adaptive; effort 'none' asks for no thinking (where it can be omitted).
    const effortDriven =
      effort !== undefined && effort !== 'none' && claudeSupportsEffort(model);
    const budget = options.reasoning?.maxTokens || 0;
    if (budget <= 0 && !effortDriven) return undefined;

    const lastAssistant = [...anthropicMessages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (
      lastAssistant &&
      Array.isArray(lastAssistant.content) &&
      lastAssistant.content.some((block) => block.type === 'tool_use')
    ) {
      const firstType = lastAssistant.content[0]?.type;
      if (firstType !== 'thinking' && firstType !== 'redacted_thinking') {
        return undefined;
      }
    }

    // Models that reject `budget_tokens` (Opus/Sonnet 4.7+, Fable, ...) can
    // only think adaptively; the budget is not sent.
    if (effortDriven || claudeRejectsThinkingBudget(model)) {
      return { type: 'adaptive' };
    }
    return { type: 'enabled', budget_tokens: budget };
  }

  /**
   * Builds `output_config` for the effort of Claude 4.6+ models. Other models
   * have no effort control, so the option is not sent to them.
   */
  private mapOutputConfig(
    options: ChatOptions,
    model: string | undefined,
  ): { effort: ClaudeEffort } | undefined {
    const effort = options.reasoning?.effort;
    if (effort === undefined || !claudeSupportsEffort(model)) return undefined;
    return { effort: toClaudeEffort(model, effort) };
  }

  private mapTools(options: ChatOptions): Record<string, any>[] | undefined {
    return options.tools && options.tools.length > 0
      ? options.tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description || '',
          input_schema: tool.function.parameters || { type: 'object' },
        }))
      : undefined;
  }

  private mapToolChoice(
    toolChoice?:
      | 'auto'
      | 'none'
      | { type: 'function'; function: { name: string } },
  ): any {
    if (!toolChoice || toolChoice === 'auto') {
      return { type: 'auto' };
    }

    if (toolChoice === 'none') {
      return { type: 'none' };
    }

    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return {
        type: 'tool',
        name: toolChoice.function.name,
      };
    }

    return { type: 'auto' };
  }

  private mapFinishReason(reason: string | null): AIResponse['finishReason'] {
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

  private mapError(error: unknown): AIError {
    if (error instanceof AIError) {
      return error;
    }

    // Map common HTTP status codes from Anthropic API
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const apiError = error as { status: number; message?: string };
      switch (apiError.status) {
        case 401:
          return new AuthenticationError('anthropic');
        case 429:
          return rateLimitErrorFrom('anthropic', error);
        case 404:
          return new ModelNotFoundError(
            apiError.message || 'Model not found',
            'anthropic',
          );
        case 413:
          return new ContextLengthError('anthropic');
      }
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown Anthropic error occurred';
    return new AIError(errorMessage, 'UNKNOWN_ERROR', 'anthropic');
  }
}

/**
 * Token usage from an Anthropic usage object. `input_tokens` excludes cached
 * tokens, so cache reads and writes are added to `promptTokens`.
 */
function mapAnthropicUsage(usage: any): TokenUsage {
  const cache = cacheUsageFields(
    usage?.cache_read_input_tokens,
    usage?.cache_creation_input_tokens,
  );
  const promptTokens =
    (usage?.input_tokens || 0) +
    (cache.cacheReadInputTokens || 0) +
    (cache.cacheCreationInputTokens || 0);
  const completionTokens = usage?.output_tokens || 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...cache,
  };
}

/**
 * Thinking and redacted-thinking blocks from an Anthropic response, copied
 * with only the fields the API accepts back.
 */
function extractThinkingBlocks(content: any[]): AIThinkingBlock[] {
  const blocks: AIThinkingBlock[] = [];
  for (const block of content || []) {
    if (block?.type === 'thinking') {
      blocks.push({
        type: 'thinking',
        thinking: block.thinking,
        signature: block.signature,
      });
    } else if (block?.type === 'redacted_thinking') {
      blocks.push({ type: 'redacted_thinking', data: block.data });
    }
  }
  return blocks;
}
