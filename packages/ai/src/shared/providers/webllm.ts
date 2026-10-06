// biome-ignore-all lint/style/useNamingConvention: WebLLM's OpenAI-shaped wire format and model records are snake_case.
/**
 * WebLLM provider: runs a chat model entirely in the browser on WebGPU.
 *
 * Backed by `@mlc-ai/web-llm`, an optional peer dependency that is imported
 * lazily on first use, so neither the root entry nor `getAI()` for other
 * provider types ever loads it. Reachable through `getAI({ type: 'webllm' })`
 * and the `@happyvertical/ai/local` subpath.
 *
 * WebLLM's engine API is OpenAI-shaped, so requests and responses map almost
 * one to one. Structured output (`responseSchema`) becomes WebLLM's
 * grammar-constrained `response_format`, which keeps a small model from
 * emitting a value outside the schema.
 */

import {
  normalizeBaseAIOptions,
  normalizeChatOptions,
  type PreparedRequestControls,
  prepareRequestControls,
} from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  AIToolCall,
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
  WebLLMEngineLike,
  WebLLMLoadProgress,
  WebLLMOptions,
} from '../types';
import {
  AIError,
  ContextLengthError,
  extractTextContent,
  ModelNotFoundError,
  WebGPUUnavailableError,
  WebLLMPeerMissingError,
} from '../types';
import { emitUsage } from './usage';

const PROVIDER = 'webllm';

/** Small enough for most GPUs (about 0.9 GB of VRAM); override with `defaultModel`. */
export const DEFAULT_WEBLLM_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

/** Context window assumed when a model record does not declare one. */
const DEFAULT_CONTEXT_LENGTH = 4096;

const WEBLLM_CAPABILITIES: AICapabilities = {
  chat: true,
  completion: true,
  embeddings: false,
  streaming: true,
  functions: true,
  vision: false,
  fineTuning: false,
  imageEmbeddings: false,
  imageGeneration: false,
  videoGeneration: false,
  tts: false,
  voiceCloning: false,
  voiceDesign: false,
  maxContextLength: DEFAULT_CONTEXT_LENGTH,
  supportedOperations: ['chat', 'completion', 'streaming', 'functions'],
};

/** Structural subset of the `@mlc-ai/web-llm` module this provider uses. */
interface WebLLMModule {
  CreateMLCEngine(
    model: string,
    config?: {
      appConfig?: unknown;
      initProgressCallback?: (report: WebLLMLoadProgress) => void;
    },
  ): Promise<WebLLMEngineLike>;
  prebuiltAppConfig: { model_list: WebLLMModelRecord[] };
  functionCallingModelIds?: string[];
}

interface WebLLMModelRecord {
  model_id: string;
  vram_required_MB?: number;
  low_resource_required?: boolean;
  /** WebLLM `ModelType`: 0 or absent = LLM, 1 = embedding, 2 = VLM. */
  model_type?: number;
  overrides?: { context_window_size?: number };
}

interface EngineEntry {
  promise: Promise<WebLLMEngineLike>;
  listeners: Set<(report: WebLLMLoadProgress) => void>;
}

/**
 * Per-engine request queues. WebLLM runs one generation at a time per engine
 * and `interruptGenerate()` stops whichever one is running, so requests are
 * serialized here and only the running request may interrupt.
 */
const engineQueues = new WeakMap<object, Promise<void>>();

/** Engines shared by every provider instance that uses the prebuilt model list. */
const sharedEngines = new Map<string, EngineEntry>();

/**
 * Imports the optional peer. Isolated so a missing install becomes a typed
 * {@link WebLLMPeerMissingError} instead of a bare module-resolution failure.
 */
export async function importWebLLM(): Promise<WebLLMModule> {
  try {
    const loaded = (await import('@mlc-ai/web-llm')) as unknown as
      | (WebLLMModule & { default?: WebLLMModule })
      | undefined;
    const module =
      typeof loaded?.CreateMLCEngine === 'function' ? loaded : loaded?.default;
    if (typeof module?.CreateMLCEngine !== 'function') {
      throw new Error('@mlc-ai/web-llm did not export CreateMLCEngine');
    }
    return module;
  } catch (error) {
    throw new WebLLMPeerMissingError(error);
  }
}

/** True when this runtime exposes WebGPU (`navigator.gpu`). */
export function isWebGPUAvailable(): boolean {
  const nav = (globalThis as { navigator?: { gpu?: unknown } }).navigator;
  return Boolean(nav?.gpu);
}

/**
 * Unloads every engine this module created and forgets them. Caller-supplied
 * engines are never touched.
 */
export async function disposeWebLLMEngines(): Promise<void> {
  const entries = [...sharedEngines.values()];
  sharedEngines.clear();
  await Promise.allSettled(
    entries.map(async (entry) => (await entry.promise).unload?.()),
  );
}

function unsupported(feature: string): never {
  throw new AIError(
    `${feature} is not supported by the webllm provider.`,
    'NOT_SUPPORTED',
    PROVIDER,
  );
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/**
 * In-browser chat provider on WebLLM (WebGPU). See the module header.
 */
export class WebLLMProvider implements AIInterface {
  private options: WebLLMOptions;
  /** Model the caller named, if any; a supplied engine is loaded with it already. */
  private readonly explicitModel?: string;
  private factoryEngine?: Promise<WebLLMEngineLike>;
  private readonly localEngines = new Map<string, EngineEntry>();

  constructor(options: WebLLMOptions) {
    this.explicitModel = options.defaultModel ?? options.model;
    this.options = normalizeBaseAIOptions({
      ...options,
      defaultModel: this.explicitModel ?? DEFAULT_WEBLLM_MODEL,
    });
  }

  // --------------------------------------------------------------------------
  // Engine lifecycle
  // --------------------------------------------------------------------------

  private async acquireEngine(
    model: string,
    signal?: AbortSignal,
  ): Promise<WebLLMEngineLike> {
    const supplied = this.options.engine;
    if (supplied) {
      if (typeof supplied !== 'function') return supplied;
      this.factoryEngine ??= supplied().catch((error) => {
        this.factoryEngine = undefined;
        throw error;
      });
      return abortable(this.factoryEngine, signal);
    }

    if (!isWebGPUAvailable()) {
      throw new WebGPUUnavailableError(PROVIDER);
    }

    // A custom appConfig changes what a model id means, so it must not share
    // an engine with other callers.
    const cache = this.options.appConfig ? this.localEngines : sharedEngines;
    let entry = cache.get(model);
    if (!entry) {
      const listeners = new Set<(report: WebLLMLoadProgress) => void>();
      const created: EngineEntry = {
        listeners,
        promise: this.createEngine(model, listeners),
      };
      created.promise.catch(() => {
        if (cache.get(model) === created) cache.delete(model);
      });
      cache.set(model, created);
      entry = created;
    }

    const onProgress = this.options.onLoadProgress;
    if (onProgress) entry.listeners.add(onProgress);
    try {
      return await abortable(entry.promise, signal);
    } finally {
      if (onProgress) entry.listeners.delete(onProgress);
    }
  }

  private async createEngine(
    model: string,
    listeners: Set<(report: WebLLMLoadProgress) => void>,
  ): Promise<WebLLMEngineLike> {
    const webllm = await importWebLLM();
    return webllm.CreateMLCEngine(model, {
      ...(this.options.appConfig ? { appConfig: this.options.appConfig } : {}),
      initProgressCallback: (report) => {
        for (const listener of listeners) {
          try {
            listener(report);
          } catch {
            // A progress listener must never break model loading.
          }
        }
      },
    });
  }

  // --------------------------------------------------------------------------
  // Request / response mapping
  // --------------------------------------------------------------------------

  private mapMessages(messages: AIMessage[]): Record<string, unknown>[] {
    return messages.map((message) => {
      if (message.role === 'user' && Array.isArray(message.content)) {
        return {
          role: 'user',
          content: message.content.map((part) =>
            part.type === 'text'
              ? { type: 'text', text: part.text }
              : { type: 'image_url', image_url: { url: part.image_url.url } },
          ),
          ...(message.name ? { name: message.name } : {}),
        };
      }
      const content = extractTextContent(message.content);
      if (message.role === 'tool' || message.role === 'function') {
        return {
          role: 'tool',
          content,
          tool_call_id: message.tool_call_id ?? message.name ?? '',
        };
      }
      if (message.role === 'assistant') {
        return stripUndefined({
          role: 'assistant',
          content: content || (message.tool_calls?.length ? null : ''),
          tool_calls: message.tool_calls?.map((call) => ({
            id: call.id,
            type: call.type,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
        });
      }
      return {
        role: message.role,
        content,
        ...(message.name ? { name: message.name } : {}),
      };
    });
  }

  private mapResponseFormat(
    options: Pick<ChatOptions, 'responseFormat' | 'responseSchema'>,
  ): Record<string, unknown> | undefined {
    if (options.responseSchema !== undefined) {
      const schema =
        typeof options.responseSchema === 'string'
          ? options.responseSchema
          : JSON.stringify(options.responseSchema);
      // WebLLM compiles the schema to a grammar and masks logits, so the
      // output cannot leave it.
      return { type: 'json_object', schema };
    }
    return options.responseFormat?.type === 'json_object'
      ? { type: 'json_object' }
      : undefined;
  }

  private buildRequest(
    messages: AIMessage[],
    options: ChatOptions & { maxTokens: number },
    model: string | undefined,
    stream: boolean,
    includeTools: boolean,
  ): Record<string, unknown> {
    const tools =
      includeTools && options.tools?.length
        ? options.tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.function.name,
              description: tool.function.description,
              parameters: tool.function.parameters,
            },
          }))
        : undefined;
    return stripUndefined({
      model,
      messages: this.mapMessages(messages),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      n: options.n,
      stop: options.stop,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      seed: options.seed,
      tools,
      tool_choice: tools ? options.toolChoice : undefined,
      response_format: this.mapResponseFormat(options),
      stream,
      stream_options: stream ? { include_usage: true } : undefined,
    });
  }

  /** Model id to send. A caller-supplied engine already has its model loaded. */
  private requestModel(
    model: string,
    options: ChatOptions,
  ): string | undefined {
    if (!this.options.engine) return model;
    return options.model ?? this.explicitModel;
  }

  private mapUsage(usage: unknown): TokenUsage | undefined {
    const raw = usage as
      | {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        }
      | undefined
      | null;
    if (!raw) return undefined;
    return {
      promptTokens: raw.prompt_tokens ?? 0,
      completionTokens: raw.completion_tokens ?? 0,
      totalTokens: raw.total_tokens ?? 0,
    };
  }

  private mapFinishReason(reason: string | null | undefined) {
    switch (reason) {
      case 'length':
        return 'length' as const;
      case 'tool_calls':
        return 'tool_calls' as const;
      default:
        return 'stop' as const;
    }
  }

  /**
   * WebLLM reports `abort` when generation was interrupted. The provider's own
   * aborts are raised before this point, so reaching it means someone else
   * interrupted the engine (for example a caller sharing a supplied engine);
   * a truncated reply must not look like a normal stop.
   */
  private assertNotInterrupted(
    reason: string | null | undefined,
    model: string,
  ): void {
    if (reason === 'abort') {
      throw new AIError(
        'Generation was interrupted before it finished',
        'AI_INTERRUPTED',
        PROVIDER,
        model,
        true,
      );
    }
  }

  private mapError(error: unknown, model?: string): AIError {
    if (error instanceof AIError) return error;
    const name = (error as { name?: string } | undefined)?.name ?? '';
    const message = error instanceof Error ? error.message : String(error);
    if (name === 'WebGPUNotAvailableError' || name === 'WebGPUNotFoundError') {
      return new WebGPUUnavailableError(PROVIDER, message);
    }
    if (
      name === 'ContextWindowSizeExceededError' ||
      name === 'PrefillChunkSizeSmallerThanImageError'
    ) {
      return new ContextLengthError(PROVIDER, model);
    }
    if (
      name === 'ModelNotFoundError' ||
      name === 'SpecifiedModelNotFoundError' ||
      name === 'UnsupportedModelIdError' ||
      name === 'ModelNotLoadedError'
    ) {
      return new ModelNotFoundError(model ?? message, PROVIDER);
    }
    const mapped = new AIError(
      message,
      name === 'DeviceLostError' ? 'WEBGPU_DEVICE_LOST' : 'API_ERROR',
      PROVIDER,
      model,
    );
    mapped.cause = error;
    return mapped;
  }

  /** Throws the right AI error when the request ended by timeout or caller abort. */
  private abortError(
    controls: PreparedRequestControls | undefined,
    options: ChatOptions,
    model?: string,
  ): AIError | undefined {
    if (controls?.didTimeout()) {
      return new AIError(
        `AI request timed out after ${controls.timeout}ms`,
        'AI_TIMEOUT',
        PROVIDER,
        model,
      );
    }
    if (options.signal?.aborted) {
      return new AIError(
        'AI request aborted by caller',
        'AI_ABORTED',
        PROVIDER,
        model,
      );
    }
    return undefined;
  }

  /**
   * Waits for this request's turn on the engine; resolves to a release fn. A
   * queued request that is aborted or times out leaves the queue at once and
   * never interrupts the generation ahead of it.
   */
  private async lockEngine(
    engine: WebLLMEngineLike,
    signal: AbortSignal,
  ): Promise<() => void> {
    const previous = engineQueues.get(engine) ?? Promise.resolve();
    let release: () => void = () => {};
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    engineQueues.set(
      engine,
      previous.then(() => mine),
    );
    try {
      await abortable(previous, signal);
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }

  /** Interrupts generation when the composed signal fires; returns a detach fn. */
  private bindInterrupt(
    engine: WebLLMEngineLike,
    signal: AbortSignal,
  ): () => void {
    const interrupt = () => {
      try {
        void Promise.resolve(engine.interruptGenerate()).catch(() => {});
      } catch {
        // Best effort: the request is already being abandoned.
      }
    };
    if (signal.aborted) interrupt();
    signal.addEventListener('abort', interrupt, { once: true });
    return () => signal.removeEventListener('abort', interrupt);
  }

  // --------------------------------------------------------------------------
  // Chat
  // --------------------------------------------------------------------------

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    let detach: (() => void) | undefined;
    let release: (() => void) | undefined;
    let pending: Promise<any> | undefined;
    let holdRelease: (() => Promise<unknown> | undefined) | undefined;
    const model =
      options.model || this.options.defaultModel || DEFAULT_WEBLLM_MODEL;
    try {
      options = normalizeChatOptions(this.options, options, PROVIDER, model);
      // Load before arming the request timeout: a multi-GB download must not
      // consume the generation budget.
      const engine = await this.acquireEngine(model, options.signal);
      controls = prepareRequestControls(this.options, options);
      release = await this.lockEngine(engine, controls.signal);
      detach = this.bindInterrupt(engine, controls.signal);

      pending = engine.chat.completions.create(
        this.buildRequest(
          messages,
          options as ChatOptions & { maxTokens: number },
          this.requestModel(model, options),
          false,
          true,
        ),
      );
      const started: Promise<unknown> = pending;
      let settled = false;
      const markSettled = () => {
        settled = true;
      };
      started.then(markSettled, markSettled);
      holdRelease = () => (settled ? undefined : started);
      const response = await abortable(pending, controls.signal);
      if (controls.signal.aborted) {
        throw (
          this.abortError(controls, options, model) ?? controls.signal.reason
        );
      }

      const choice = response?.choices?.[0];
      this.assertNotInterrupted(choice?.finish_reason, model);
      if (!choice) {
        throw new AIError(
          'No choices returned from webllm',
          'NO_CHOICES',
          PROVIDER,
        );
      }
      const usage = this.mapUsage(response.usage);
      emitUsage(
        this.options,
        PROVIDER,
        'chat',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );
      const toolCalls: AIToolCall[] | undefined =
        choice.message?.tool_calls?.map(
          (call: {
            id: string;
            function: { name: string; arguments: string };
          }) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          }),
        );
      return {
        content: choice.message?.content || '',
        usage,
        model: response.model || model,
        finishReason: this.mapFinishReason(choice.finish_reason),
        ...(toolCalls?.length ? { toolCalls } : {}),
      };
    } catch (error) {
      throw (
        this.abortError(controls, options, model) ?? this.mapError(error, model)
      );
    } finally {
      detach?.();
      releaseWhenIdle(release, holdRelease?.());
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

  async message(text: string, options: MessageOptions = {}): Promise<string> {
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
      responseSchema: options.responseSchema,
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

  /**
   * Streams a chat completion as text chunks. Like the other providers, a
   * stream yields text only; use `chat()` for rounds that may call tools.
   * Breaking out of the loop interrupts generation on the engine.
   */
  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startTime = Date.now();
    let controls: PreparedRequestControls | undefined;
    let detach: (() => void) | undefined;
    let engine: WebLLMEngineLike | undefined;
    let release: (() => void) | undefined;
    let iterator: AsyncIterator<WebLLMChunk> | undefined;
    let iteratorDone = false;
    let holdRelease: Promise<unknown> | undefined;
    const model =
      options.model || this.options.defaultModel || DEFAULT_WEBLLM_MODEL;
    try {
      options = normalizeChatOptions(this.options, options, PROVIDER, model);
      engine = await this.acquireEngine(model, options.signal);
      controls = prepareRequestControls(this.options, options);
      release = await this.lockEngine(engine, controls.signal);
      detach = this.bindInterrupt(engine, controls.signal);

      const pending: Promise<AsyncIterable<WebLLMChunk>> =
        engine.chat.completions.create(
          this.buildRequest(
            messages,
            options as ChatOptions & { maxTokens: number },
            this.requestModel(model, options),
            true,
            false,
          ),
        );
      let chunks: AsyncIterable<WebLLMChunk>;
      try {
        chunks = await abortable(pending, controls.signal);
      } catch (error) {
        // The caller is gone but the engine may still start this request.
        // Keep our queue closed until it has been interrupted and drained, or
        // the next request would wait behind it and could interrupt it.
        holdRelease = pending.then(
          (late) => abandonStream(late[Symbol.asyncIterator](), engine),
          () => {},
        );
        throw error;
      }
      // Iterated by hand: WebLLM releases its per-model lock only when its
      // generator runs to completion, never on an early `return()`.
      iterator = chunks[Symbol.asyncIterator]();

      let finishReason: string | null | undefined;
      let usage: TokenUsage | undefined;
      for (;;) {
        const step = await iterator.next();
        if (step.done) {
          iteratorDone = true;
          break;
        }
        const chunk = step.value;
        const choice = chunk.choices?.[0];
        finishReason = choice?.finish_reason ?? finishReason;
        if (chunk.usage) usage = this.mapUsage(chunk.usage);
        const content = choice?.delta?.content;
        if (content) {
          options.onProgress?.(content);
          yield content;
        }
      }
      if (controls.signal.aborted) {
        throw (
          this.abortError(controls, options, model) ?? controls.signal.reason
        );
      }
      this.assertNotInterrupted(finishReason, model);
      options.onFinishReason?.(this.mapFinishReason(finishReason));
      emitUsage(
        this.options,
        PROVIDER,
        'stream',
        model,
        usage,
        startTime,
        options.usageTags,
      );
    } catch (error) {
      throw (
        this.abortError(controls, options, model) ?? this.mapError(error, model)
      );
    } finally {
      if (iterator && !iteratorDone && engine) {
        // Consumer stopped early (or the loop threw): stop the GPU, then let
        // the engine's generator finish so its lock is released before the
        // next request is admitted.
        try {
          void Promise.resolve(engine.interruptGenerate()).catch(() => {});
        } catch {
          // Best effort.
        }
        await drainIterator(iterator);
      }
      detach?.();
      releaseWhenIdle(release, holdRelease);
      controls?.cleanup();
    }
  }

  async countTokens(text: string): Promise<number> {
    // WebLLM exposes no standalone tokenizer; ~4 characters per token.
    return Math.ceil(text.length / 4);
  }

  // --------------------------------------------------------------------------
  // Models and capabilities
  // --------------------------------------------------------------------------

  async getModels(): Promise<AIModel[]> {
    const webllm = await importWebLLM();
    const list =
      (
        this.options.appConfig as
          | { model_list?: WebLLMModelRecord[] }
          | undefined
      )?.model_list ?? webllm.prebuiltAppConfig.model_list;
    const functionCalling = new Set(webllm.functionCallingModelIds ?? []);
    return list
      .filter((record) => record.model_type !== 1) // embedding models
      .map((record) => {
        const vision = record.model_type === 2;
        const functions = functionCalling.has(record.model_id);
        return {
          id: record.model_id,
          name: record.model_id,
          description: record.vram_required_MB
            ? `Runs on-device via WebGPU (~${Math.round(record.vram_required_MB)} MB VRAM)`
            : 'Runs on-device via WebGPU',
          contextLength:
            record.overrides?.context_window_size ?? DEFAULT_CONTEXT_LENGTH,
          capabilities: [
            'text',
            'chat',
            ...(functions ? ['functions'] : []),
            ...(vision ? ['vision'] : []),
          ],
          supportsFunctions: functions,
          supportsVision: vision,
        };
      });
  }

  async getCapabilities(): Promise<AICapabilities> {
    return { ...WEBLLM_CAPABILITIES };
  }

  // --------------------------------------------------------------------------
  // No in-browser equivalent
  // --------------------------------------------------------------------------

  async embed(
    _text: string | string[],
    _options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    return unsupported('Embeddings');
  }

  async embedImage(
    _image: string | Buffer,
    _options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    return unsupported('Image embeddings');
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options: ImageDescriptionOptions = {},
  ): Promise<string> {
    return unsupported('Image description');
  }

  async generateImage(
    _prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    return unsupported('Image generation');
  }

  async submitVideoGenerationJob(
    _options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    return unsupported('Video generation');
  }

  async getVideoGenerationJob(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    return unsupported('Video generation');
  }

  async fetchVideoGenerationResult(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    return unsupported('Video generation');
  }

  async cancelVideoGenerationJob(_handle: VideoGenerationJob): Promise<void> {
    return unsupported('Video generation');
  }

  async validateVideoGenerationAccess(): Promise<boolean> {
    return unsupported('Video generation');
  }

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    return unsupported('Text-to-speech');
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'Text-to-speech streaming is not supported by the webllm provider.',
      'NOT_SUPPORTED',
      PROVIDER,
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    return unsupported('Voice cloning');
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    return unsupported('Voice design');
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    return unsupported('Voice listing');
  }
}

/** One streamed WebLLM chunk (structural subset). */
interface WebLLMChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
}

/** Runs a WebLLM stream to its end, ignoring errors; used after interrupting it. */
async function drainIterator(
  iterator: AsyncIterator<WebLLMChunk>,
): Promise<void> {
  try {
    while (!(await iterator.next()).done) {
      // discard
    }
  } catch {
    // The engine already stopped; nothing more to release.
  }
}

/** Releases an engine queue slot now, or once `idle` has settled. */
function releaseWhenIdle(
  release: (() => void) | undefined,
  idle?: Promise<unknown>,
): void {
  if (!release) return;
  if (idle) void idle.then(release, release);
  else release();
}

/**
 * Finishes a stream nobody is reading. WebLLM resets its interrupt flag on the
 * first `next()`, so interrupt only after pulling one chunk, then drain it so
 * the engine's lock is released.
 */
async function abandonStream(
  iterator: AsyncIterator<WebLLMChunk>,
  engine: WebLLMEngineLike | undefined,
): Promise<void> {
  try {
    if ((await iterator.next()).done) return;
    await Promise.resolve(engine?.interruptGenerate());
  } catch {
    return;
  }
  await drainIterator(iterator);
}

/** Rejects with the signal's reason if it fires first; the underlying work continues. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(
      new AIError('AI request aborted by caller', 'AI_ABORTED', PROVIDER),
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(
        new AIError('AI request aborted by caller', 'AI_ABORTED', PROVIDER),
      );
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
