/**
 * Ollama provider implementation.
 *
 * Uses Ollama's native `/api/*` endpoints for chat, completions, embeddings,
 * and model discovery, while bridging to the experimental OpenAI-compatible
 * image-generation endpoint when available.
 */

import { ValidationError } from '@happyvertical/utils';

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
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
  OllamaOptions,
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
  ContentFilterError,
  ContextLengthError,
  extractTextContent,
  ModelNotFoundError,
  RateLimitError,
} from '../types';
import { emitUsage } from './usage';

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

const OLLAMA_CAPABILITIES: AICapabilities = {
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
  maxContextLength: 131072,
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

type ResolvedOllamaCapability =
  | 'chat'
  | 'vision'
  | 'embedding'
  | 'image_generation';

interface OllamaModelSummary {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  details?: {
    family?: string;
    families?: string[];
    format?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models?: OllamaModelSummary[];
}

interface OllamaShowResponse {
  capabilities?: string[];
  parameters?: string;
  modified_at?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
  model_info?: Record<string, unknown>;
}

interface OllamaToolCall {
  type?: 'function';
  function?: {
    index?: number;
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  thinking?: string;
  images?: string[];
  tool_name?: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  model?: string;
  message?: OllamaMessage;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaGenerateResponse {
  model?: string;
  response?: string;
  thinking?: string;
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbedResponse {
  model?: string;
  embeddings?: number[][];
  embedding?: number[];
  prompt_eval_count?: number;
}

interface OllamaImageGenerationResponse {
  created?: number;
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeHost(baseUrl?: string): string {
  const rawBase = baseUrl?.trim() || DEFAULT_OLLAMA_HOST;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(rawBase)
    ? rawBase
    : `http://${rawBase}`;
  const base = stripTrailingSlash(withScheme);
  if (base.endsWith('/api')) return base.slice(0, -4);
  if (base.endsWith('/v1')) return base.slice(0, -3);
  return base;
}

function isEmbeddingModel(modelId: string): boolean {
  return /(?:^|[-_:/])(?:embed|embedding)|nomic-embed|mxbai-embed/i.test(
    modelId,
  );
}

function isImageGenerationModel(modelId: string): boolean {
  return /(?:^|[-_:/])(flux|sdxl|stable(?:[-_ ]?diffusion)?|z-image|image(?:[-_ ]?(?:turbo|gen|generator)))/i.test(
    modelId,
  );
}

function inferVisionSupport(
  modelId: string,
  capabilities: Set<string>,
): boolean {
  if (capabilities.has('vision')) return true;
  return /vision|llava|bakllava|moondream|pixtral|qwen.*vl|vl-|gemma3/i.test(
    modelId,
  );
}

function inferFunctionSupport(
  modelId: string,
  capabilities: Set<string>,
): boolean {
  if (
    capabilities.has('tools') ||
    capabilities.has('tool_calling') ||
    capabilities.has('function_calling')
  ) {
    return true;
  }

  if (isEmbeddingModel(modelId) || isImageGenerationModel(modelId)) {
    return false;
  }

  return /qwen|llama3|gpt-oss|mistral|deepseek|command-r|phi4/i.test(modelId);
}

function parseCapabilities(
  modelId: string,
  show?: OllamaShowResponse | null,
): string[] {
  const capabilities = new Set(
    (show?.capabilities || []).map((capability) => capability.toLowerCase()),
  );

  if (isImageGenerationModel(modelId)) {
    return ['image_generation'];
  }

  if (
    capabilities.has('embedding') ||
    capabilities.has('embeddings') ||
    isEmbeddingModel(modelId)
  ) {
    return ['embeddings'];
  }

  const supported = new Set<string>(['text', 'chat']);

  if (inferVisionSupport(modelId, capabilities)) {
    supported.add('vision');
  }

  if (inferFunctionSupport(modelId, capabilities)) {
    supported.add('functions');
  }

  return [...supported];
}

function parseContextLength(
  modelId: string,
  show?: OllamaShowResponse | null,
): number {
  const modelInfo = show?.model_info || {};

  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith('.context_length') && typeof value === 'number') {
      return value;
    }
  }

  const numCtxMatch = show?.parameters?.match(/\bnum_ctx\s+(\d+)/);
  if (numCtxMatch?.[1]) {
    return Number(numCtxMatch[1]);
  }

  if (isEmbeddingModel(modelId)) return 8192;
  if (/gemma3|qwen3|gpt-oss|llama3/i.test(modelId)) return 131072;
  return 32768;
}

function mapUsage(
  promptTokens?: number,
  completionTokens?: number,
): TokenUsage | undefined {
  if (
    typeof promptTokens !== 'number' &&
    typeof completionTokens !== 'number'
  ) {
    return undefined;
  }

  const prompt = promptTokens || 0;
  const completion = completionTokens || 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
  };
}

function mapFinishReason(reason?: string): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'stop';
  }
}

function scoreModelForCapability(
  model: AIModel,
  capability: ResolvedOllamaCapability,
): number {
  const id = model.id.toLowerCase();
  let score = 0;

  if (id.includes(':latest')) score += 6;
  if (id.includes('instruct') || id.includes('-it')) score += 6;
  if (id.startsWith('hf.co/')) score -= 8;
  if (/ocr|rerank|embed|image|diffusion|flux/.test(id)) score -= 12;

  switch (capability) {
    case 'vision':
      if (model.supportsVision) score += 25;
      if (/gemma4|gemma3/.test(id)) score += 12;
      if (/qwen.*vl|llava|moondream|vision/.test(id)) score += 8;
      if (/ocr/.test(id)) score -= 10;
      break;
    case 'embedding':
      if (model.capabilities.includes('embeddings')) score += 20;
      if (/nomic|mxbai|embed/.test(id)) score += 6;
      break;
    case 'image_generation':
      if (model.capabilities.includes('image_generation')) score += 20;
      if (/flux|sdxl|stable/.test(id)) score += 8;
      break;
    case 'chat':
    default:
      if (model.capabilities.includes('chat')) score += 12;
      if (model.supportsFunctions) score += 4;
      if (/llama|mistral|qwen|gemma|phi|command-r|deepseek-coder/.test(id)) {
        score += 8;
      }
      if (/gpt-oss/.test(id)) score -= 3;
      break;
  }

  return score;
}

export class OllamaProvider implements AIInterface {
  private readonly options: OllamaOptions;
  private readonly host: string;
  private readonly configuredDefaultModel?: string;
  private modelListPromise?: Promise<AIModel[]>;
  private readonly modelShowCache = new Map<
    string,
    Promise<OllamaShowResponse | null>
  >();
  private readonly resolvedModelCache = new Map<
    ResolvedOllamaCapability,
    Promise<string>
  >();

  constructor(options: OllamaOptions) {
    this.host = normalizeHost(options.baseUrl);
    this.options = {
      ...options,
      baseUrl: this.host,
    };
    this.configuredDefaultModel = options.defaultModel;
  }

  private get nativeBaseUrl(): string {
    return `${this.host}/api`;
  }

  private get compatibilityBaseUrl(): string {
    return `${this.host}/v1`;
  }

  private buildHeaders(stream = false): Headers {
    const headers = new Headers(this.options.headers);
    headers.set('Content-Type', 'application/json');
    headers.set(
      'Accept',
      stream ? 'application/x-ndjson, application/json' : 'application/json',
    );
    if (this.options.apiKey) {
      headers.set('Authorization', `Bearer ${this.options.apiKey}`);
    }
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout =
      typeof this.options.timeout === 'number' ? this.options.timeout : 0;
    const timer = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : undefined;

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async buildHttpError(response: Response): Promise<AIError> {
    const text = await response.text();
    const message =
      text && text.trim().length > 0
        ? text.trim()
        : `Ollama request failed with status ${response.status}`;

    switch (response.status) {
      case 401:
      case 403:
        return new AuthenticationError('ollama');
      case 404:
        return new ModelNotFoundError(message, 'ollama');
      case 413:
        return new ContextLengthError('ollama');
      case 429:
        return new RateLimitError('ollama');
      default:
        if (/content[_ -]?filter/i.test(message)) {
          return new ContentFilterError('ollama');
        }
        if (/context|too long|maximum context/i.test(message)) {
          return new ContextLengthError('ollama');
        }
        return new AIError(message, 'API_ERROR', 'ollama');
    }
  }

  private mapError(error: unknown): AIError {
    if (error instanceof AIError) {
      return error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return new AIError('Ollama request timed out', 'TIMEOUT', 'ollama');
    }

    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return new AIError(message, 'UNKNOWN_ERROR', 'ollama');
  }

  private async requestJson<T>(
    path: string,
    body?: Record<string, unknown>,
    options: { compatibility?: boolean } = {},
  ): Promise<T> {
    const baseUrl = options.compatibility
      ? this.compatibilityBaseUrl
      : this.nativeBaseUrl;
    const response = await this.fetchWithTimeout(`${baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: this.buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await this.buildHttpError(response);
    }

    return (await response.json()) as T;
  }

  private async requestStream(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const response = await this.fetchWithTimeout(
      `${this.nativeBaseUrl}${path}`,
      {
        method: 'POST',
        headers: this.buildHeaders(true),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw await this.buildHttpError(response);
    }

    return response;
  }

  private async *parseNdjson<T>(response: Response): AsyncIterable<T> {
    const reader = response.body?.getReader();
    if (!reader) {
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          yield JSON.parse(line) as T;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    const line = buffer.trim();
    if (line) {
      yield JSON.parse(line) as T;
    }
  }

  private async showModel(model: string): Promise<OllamaShowResponse | null> {
    const cached = this.modelShowCache.get(model);
    if (cached) {
      return cached;
    }

    const pending = this.requestJson<OllamaShowResponse>('/show', {
      model,
      verbose: false,
    }).catch((_error) => null);

    this.modelShowCache.set(model, pending);
    return pending;
  }

  private async resolveModel(
    capability: ResolvedOllamaCapability,
    explicitModel?: string,
  ): Promise<string> {
    if (explicitModel) {
      return explicitModel;
    }

    if (
      this.configuredDefaultModel &&
      (capability === 'chat' || capability === 'vision')
    ) {
      return this.configuredDefaultModel;
    }

    const cached = this.resolvedModelCache.get(capability);
    if (cached) {
      return cached;
    }

    const pending = this.selectModel(capability).catch((error) => {
      this.resolvedModelCache.delete(capability);
      throw error;
    });
    this.resolvedModelCache.set(capability, pending);
    return pending;
  }

  private async selectModel(
    capability: ResolvedOllamaCapability,
  ): Promise<string> {
    const models = await this.getModels();
    const candidates = models.filter((candidate) => {
      switch (capability) {
        case 'vision':
          return (
            candidate.capabilities.includes('vision') ||
            candidate.supportsVision === true
          );
        case 'embedding':
          return candidate.capabilities.includes('embeddings');
        case 'image_generation':
          return candidate.capabilities.includes('image_generation');
        case 'chat':
        default:
          return candidate.capabilities.includes('chat');
      }
    });

    const model = candidates.sort(
      (left, right) =>
        scoreModelForCapability(right, capability) -
        scoreModelForCapability(left, capability),
    )[0];

    if (!model) {
      throw new ValidationError(
        `No ${capability} model is available from the Ollama host`,
        {
          provider: 'ollama',
          capability,
          hint: 'Pass model/defaultModel explicitly or make sure the Ollama host has a compatible model installed',
        },
      );
    }

    return model.id;
  }

  private isVisionRequest(messages: AIMessage[]): boolean {
    return messages.some(
      (message) =>
        Array.isArray(message.content) &&
        message.content.some((part) => part.type === 'image_url'),
    );
  }

  private async imageToBase64Payload(image: string | Buffer): Promise<string> {
    if (Buffer.isBuffer(image)) {
      return image.toString('base64');
    }

    if (image.startsWith('data:')) {
      const commaIndex = image.indexOf(',');
      return commaIndex === -1 ? image : image.slice(commaIndex + 1);
    }

    const response = await fetch(image);
    if (!response.ok) {
      throw new AIError(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
        'IMAGE_FETCH_ERROR',
        'ollama',
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  }

  private async imageToDataUrl(image: string | Buffer): Promise<string> {
    if (Buffer.isBuffer(image)) {
      return `data:image/png;base64,${image.toString('base64')}`;
    }

    if (image.startsWith('data:')) {
      return image;
    }

    const response = await fetch(image);
    if (!response.ok) {
      throw new AIError(
        `Failed to fetch image: ${response.status} ${response.statusText}`,
        'IMAGE_FETCH_ERROR',
        'ollama',
      );
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
  }

  private parseToolArguments(argumentsText?: string): Record<string, unknown> {
    if (!argumentsText) {
      return {};
    }

    try {
      const parsed = JSON.parse(argumentsText);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private async mapMessagesToOllama(
    messages: AIMessage[],
  ): Promise<OllamaMessage[]> {
    const mappedMessages = await Promise.all(
      messages.map(async (message) => {
        const content = extractTextContent(message.content);
        const mapped: OllamaMessage = {
          role:
            message.role === 'function'
              ? 'tool'
              : (message.role as OllamaMessage['role']),
          content,
        };

        if (Array.isArray(message.content)) {
          const imageParts = message.content.filter(
            (part) => part.type === 'image_url',
          );
          if (imageParts.length > 0) {
            mapped.images = await Promise.all(
              imageParts.map((part) =>
                this.imageToBase64Payload(part.image_url.url),
              ),
            );
          }
        }

        if (
          mapped.role === 'assistant' &&
          Array.isArray(message.tool_calls) &&
          message.tool_calls.length > 0
        ) {
          mapped.tool_calls = message.tool_calls.map((toolCall, index) => ({
            type: 'function',
            function: {
              index,
              name: toolCall.function.name,
              arguments: this.parseToolArguments(toolCall.function.arguments),
            },
          }));
        }

        if (mapped.role === 'tool' && message.name) {
          mapped.tool_name = message.name;
        }

        return mapped;
      }),
    );

    return mappedMessages;
  }

  private mapTools(
    tools: ChatOptions['tools'],
    toolChoice: ChatOptions['toolChoice'],
  ): Array<Record<string, unknown>> | undefined {
    if (!tools || tools.length === 0 || toolChoice === 'none') {
      return undefined;
    }

    const scopedTools =
      toolChoice && typeof toolChoice === 'object'
        ? tools.filter(
            (tool) => tool.function.name === toolChoice.function.name,
          )
        : tools;

    if (scopedTools.length === 0) {
      return undefined;
    }

    return scopedTools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters || { type: 'object' },
      },
    }));
  }

  private buildRuntimeOptions(options: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stop?: string | string[];
    seed?: number;
  }): Record<string, unknown> | undefined {
    const runtimeOptions: Record<string, unknown> = {};

    if (typeof options.maxTokens === 'number') {
      runtimeOptions.num_predict = options.maxTokens;
    }
    if (typeof options.temperature === 'number') {
      runtimeOptions.temperature = options.temperature;
    }
    if (typeof options.topP === 'number') {
      runtimeOptions.top_p = options.topP;
    }
    if (options.stop) {
      runtimeOptions.stop = Array.isArray(options.stop)
        ? options.stop
        : [options.stop];
    }
    if (typeof options.seed === 'number') {
      runtimeOptions.seed = options.seed;
    }

    return Object.keys(runtimeOptions).length > 0 ? runtimeOptions : undefined;
  }

  private mapThink(
    options: Pick<ChatOptions, 'thinkingLevel'>,
  ): boolean | string | undefined {
    if (!Object.hasOwn(options, 'thinkingLevel')) {
      return undefined;
    }

    return options.thinkingLevel;
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    try {
      const model = await this.resolveModel(
        this.isVisionRequest(messages) ? 'vision' : 'chat',
        options.model,
      );

      const response = await this.requestJson<OllamaChatResponse>('/chat', {
        model,
        messages: await this.mapMessagesToOllama(messages),
        stream: false,
        format:
          options.responseFormat?.type === 'json_object' ? 'json' : undefined,
        tools: this.mapTools(options.tools, options.toolChoice),
        think: this.mapThink(options),
        keep_alive: this.options.keepAlive,
        options: this.buildRuntimeOptions(options),
      });

      const usage = mapUsage(response.prompt_eval_count, response.eval_count);

      emitUsage(
        this.options,
        'ollama',
        'chat',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );

      const toolCalls =
        response.message?.tool_calls
          ?.filter((call) => call.function?.name)
          .map((call, index) => ({
            id: `${response.model || model}-tool-${index + 1}`,
            type: 'function' as const,
            function: {
              name: call.function?.name || '',
              arguments: JSON.stringify(call.function?.arguments || {}),
            },
          })) || undefined;

      return {
        content: response.message?.content || '',
        model: response.model || model,
        usage,
        finishReason:
          toolCalls && toolCalls.length > 0
            ? 'tool_calls'
            : mapFinishReason(response.done_reason),
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
    const startTime = Date.now();
    try {
      const model = await this.resolveModel('chat', options.model);
      const response = await this.requestJson<OllamaGenerateResponse>(
        '/generate',
        {
          model,
          prompt,
          stream: false,
          keep_alive: this.options.keepAlive,
          options: this.buildRuntimeOptions(options),
        },
      );

      const usage = mapUsage(response.prompt_eval_count, response.eval_count);

      emitUsage(
        this.options,
        'ollama',
        'complete',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        content: response.response || '',
        model: response.model || model,
        usage,
        finishReason: mapFinishReason(response.done_reason),
      };
    } catch (error) {
      throw this.mapError(error);
    }
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
      seed: options.seed,
      tools: options.tools,
      toolChoice: options.toolChoice,
      onProgress: options.onProgress,
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
      const model = await this.resolveModel('embedding', options.model);
      const input = Array.isArray(text) ? text : [text];
      const response = await this.requestJson<OllamaEmbedResponse>('/embed', {
        model,
        input,
        keep_alive: this.options.keepAlive,
      });

      const embeddings =
        response.embeddings ||
        (response.embedding ? [response.embedding] : undefined);

      if (!embeddings || embeddings.length === 0) {
        throw new AIError(
          'Invalid embedding response from Ollama',
          'INVALID_RESPONSE',
          'ollama',
        );
      }

      const usage = mapUsage(response.prompt_eval_count, 0);
      emitUsage(
        this.options,
        'ollama',
        'embed',
        response.model || model,
        usage,
        startTime,
        options.usageTags,
      );

      return {
        embeddings,
        usage,
        model: response.model || model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async embedImage(
    image: string | Buffer,
    options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const description = await this.describeImage(
      image,
      'Describe this image in detail for semantic embedding. Include objects, people, text, setting, colors, composition, and notable visual relationships.',
    );

    return this.embed(description, {
      model: options.model,
      dimensions: options.dimensions,
      user: options.user,
    });
  }

  async describeImage(
    image: string | Buffer,
    prompt?: string,
    options: ImageDescriptionOptions = {},
  ): Promise<string> {
    const defaultPrompt =
      'Describe this image for a search index. Include objects, mood, lighting, and any visible text.';

    const imageUrl = await this.imageToDataUrl(image);
    const response = await this.chat(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt || defaultPrompt,
            },
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
        model: options.model,
        maxTokens: options.maxTokens || 500,
        thinkingLevel: false,
      },
    );

    return response.content;
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    try {
      if (options.imageInput) {
        throw new AIError(
          'Ollama image generation does not support imageInput in this adapter yet.',
          'NOT_IMPLEMENTED',
          'ollama',
        );
      }

      if (options.outputFormat === 'url') {
        throw new AIError(
          'Ollama image generation only supports buffer or base64 outputs in this adapter.',
          'NOT_SUPPORTED',
          'ollama',
        );
      }

      const model = await this.resolveModel('image_generation', options.model);
      const response = await this.requestJson<OllamaImageGenerationResponse>(
        '/images/generations',
        {
          model,
          prompt,
          n: options.n || 1,
          size: options.size || '1024x1024',
          response_format: 'b64_json',
          quality: options.quality,
          style: options.style,
        },
        { compatibility: true },
      );

      const images = (response.data || []).map((item) => {
        const b64 = item.b64_json || '';
        return {
          data:
            options.outputFormat === 'base64'
              ? b64
              : Buffer.from(b64, 'base64'),
          mimeType: 'image/png',
          revisedPrompt: item.revised_prompt,
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
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startTime = Date.now();
    try {
      const model = await this.resolveModel(
        this.isVisionRequest(messages) ? 'vision' : 'chat',
        options.model,
      );

      const response = await this.requestStream('/chat', {
        model,
        messages: await this.mapMessagesToOllama(messages),
        stream: true,
        format:
          options.responseFormat?.type === 'json_object' ? 'json' : undefined,
        tools: this.mapTools(options.tools, options.toolChoice),
        think: this.mapThink(options),
        keep_alive: this.options.keepAlive,
        options: this.buildRuntimeOptions(options),
      });

      let finalUsage: TokenUsage | undefined;
      let finalModel = model;

      for await (const chunk of this.parseNdjson<OllamaChatResponse>(
        response,
      )) {
        if (chunk.model) {
          finalModel = chunk.model;
        }

        if (
          typeof chunk.message?.content === 'string' &&
          chunk.message.content
        ) {
          if (options.onProgress) {
            options.onProgress(chunk.message.content);
          }
          yield chunk.message.content;
        }

        if (chunk.done) {
          finalUsage = mapUsage(chunk.prompt_eval_count, chunk.eval_count);
        }
      }

      emitUsage(
        this.options,
        'ollama',
        'stream',
        finalModel,
        finalUsage,
        startTime,
        options.usageTags,
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }

  async getModels(): Promise<AIModel[]> {
    if (this.modelListPromise) {
      return this.modelListPromise;
    }

    this.modelListPromise = (async () => {
      const response = await this.requestJson<OllamaTagsResponse>('/tags');
      const summaries = response.models || [];

      return Promise.all(
        summaries.map(async (summary) => {
          const modelId = summary.name || summary.model;
          if (!modelId) {
            throw new AIError(
              'Ollama returned a model without an identifier',
              'INVALID_RESPONSE',
              'ollama',
            );
          }

          const show = await this.showModel(modelId);
          const capabilities = parseCapabilities(modelId, show);
          const vision = capabilities.includes('vision');
          const functions = capabilities.includes('functions');
          const parameterSize =
            show?.details?.parameter_size || summary.details?.parameter_size;
          const family = show?.details?.family || summary.details?.family;

          return {
            id: modelId,
            name: modelId,
            description:
              parameterSize || family
                ? `${family || 'Ollama'} ${parameterSize || ''}`.trim()
                : `Ollama model: ${modelId}`,
            contextLength: parseContextLength(modelId, show),
            capabilities,
            supportsFunctions: functions,
            supportsVision: vision,
          } satisfies AIModel;
        }),
      );
    })().catch((error) => {
      this.modelListPromise = undefined;
      throw this.mapError(error);
    });

    return this.modelListPromise;
  }

  async getCapabilities(): Promise<AICapabilities> {
    return { ...OLLAMA_CAPABILITIES };
  }

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by the Ollama provider.',
      'NOT_IMPLEMENTED',
      'ollama',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by the Ollama provider.',
      'NOT_IMPLEMENTED',
      'ollama',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by the Ollama provider.',
      'NOT_IMPLEMENTED',
      'ollama',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by the Ollama provider.',
      'NOT_IMPLEMENTED',
      'ollama',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by the Ollama provider.',
      'NOT_IMPLEMENTED',
      'ollama',
    );
  }
}
