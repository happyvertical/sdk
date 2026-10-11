import { normalizeBaseAIOptions, prepareRequestControls } from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatGPTPlanOptions,
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
import { AIError } from '../types';
import { emitUsage } from './usage';

const PROVIDER = 'chatgpt-plan';
const MODELS_URL = 'https://api.openai.com/v1/models';
const RESPONSES_URL = 'https://api.openai.com/v1/responses';

interface WireError {
  code?: unknown;
  message?: unknown;
  param?: unknown;
}

interface StreamEvent {
  type?: unknown;
  delta?: unknown;
  response?: {
    model?: unknown;
    usage?: unknown;
    error?: WireError | null;
    incomplete_details?: unknown;
  };
  error?: WireError | null;
}

interface ProviderEvent {
  delta?: string;
  completed?: {
    model?: string;
    usage?: TokenUsage;
  };
}

/** Base error for the local ChatGPT plan-usage provider. */
export class ChatGPTPlanError extends AIError {
  constructor(
    message: string,
    code: string,
    public readonly status?: number,
    public readonly requestId?: string,
    public readonly param?: string,
    retryable = false,
    model?: string,
  ) {
    super(message, code, PROVIDER, model, retryable);
    this.name = 'ChatGPTPlanError';
  }
}

/** The selected account or application limit stopped plan-usage inference. */
export class ChatGPTPlanUsageLimitError extends ChatGPTPlanError {
  constructor(
    message: string,
    status?: number,
    requestId?: string,
    model?: string,
  ) {
    super(
      message,
      'subscription_sharing_usage_limit_exceeded',
      status,
      requestId,
      undefined,
      false,
      model,
    );
    this.name = 'ChatGPTPlanUsageLimitError';
  }
}

/** The selected user/workspace/policy does not allow this request. */
export class ChatGPTPlanWorkspaceError extends ChatGPTPlanError {
  constructor(
    message: string,
    code: string,
    status?: number,
    requestId?: string,
    param?: string,
    model?: string,
  ) {
    super(message, code, status, requestId, param, false, model);
    this.name = 'ChatGPTPlanWorkspaceError';
  }
}

/** The saved registration can no longer authorize plan-usage requests. */
export class ChatGPTPlanSessionRevokedError extends ChatGPTPlanError {
  constructor(
    message: string,
    code = 'subscription_sharing_invalid_user',
    status?: number,
    requestId?: string,
    model?: string,
  ) {
    super(message, code, status, requestId, undefined, false, model);
    this.name = 'ChatGPTPlanSessionRevokedError';
  }
}

/** Plan usage or account/workspace lookup is temporarily unavailable. */
export class ChatGPTPlanUsageUnavailableError extends ChatGPTPlanError {
  constructor(
    message: string,
    code = 'subscription_sharing_usage_unavailable',
    status?: number,
    requestId?: string,
    model?: string,
  ) {
    super(message, code, status, requestId, undefined, true, model);
    this.name = 'ChatGPTPlanUsageUnavailableError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeTokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function mapUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const promptTokens = safeTokenCount(value.input_tokens);
  const completionTokens = safeTokenCount(value.output_tokens);
  const totalTokens = safeTokenCount(value.total_tokens);
  if (
    promptTokens === undefined ||
    completionTokens === undefined ||
    totalTokens === undefined
  )
    return undefined;
  return { promptTokens, completionTokens, totalTokens };
}

function redact(value: string, token: string): string {
  return token ? value.split(token).join('[REDACTED]') : value;
}

function errorMessage(error: WireError | null | undefined): string | undefined {
  return typeof error?.message === 'string' ? error.message : undefined;
}

function errorCode(error: WireError | null | undefined): string | undefined {
  return typeof error?.code === 'string' ? error.code : undefined;
}

function errorParam(error: WireError | null | undefined): string | undefined {
  return typeof error?.param === 'string' ? error.param : undefined;
}

function mappedError(input: {
  error?: WireError | null;
  detail?: string;
  status?: number;
  requestId?: string;
  token: string;
  model?: string;
}): ChatGPTPlanError {
  const code = errorCode(input.error);
  const diagnostic = redact(
    errorMessage(input.error) ||
      input.detail ||
      `ChatGPT plan request failed${input.status ? ` (${input.status})` : ''}`,
    input.token,
  );
  const param = errorParam(input.error);

  if (code === 'subscription_sharing_usage_limit_exceeded')
    return new ChatGPTPlanUsageLimitError(
      diagnostic,
      input.status,
      input.requestId,
      input.model,
    );
  if (
    code === 'subscription_sharing_usage_unavailable' ||
    code === 'subscription_sharing_user_unavailable' ||
    input.status === 503
  )
    return new ChatGPTPlanUsageUnavailableError(
      diagnostic,
      code || 'subscription_sharing_usage_unavailable',
      input.status,
      input.requestId,
      input.model,
    );
  if (code === 'subscription_sharing_invalid_user' || input.status === 401)
    return new ChatGPTPlanSessionRevokedError(
      diagnostic,
      code || 'subscription_sharing_invalid_user',
      input.status,
      input.requestId,
      input.model,
    );
  if (
    code === 'subscription_sharing_user_not_eligible' ||
    code === 'subscription_sharing_route_not_supported' ||
    code === 'chatpass_v2_scope_not_authorized' ||
    code === 'chatpass_v2_invalid_authorization_context' ||
    input.status === 403
  )
    return new ChatGPTPlanWorkspaceError(
      diagnostic,
      code || 'workspace_restricted',
      input.status,
      input.requestId,
      param,
      input.model,
    );
  return new ChatGPTPlanError(
    diagnostic,
    code || 'CHATGPT_PLAN_REQUEST_FAILED',
    input.status,
    input.requestId,
    param,
    Boolean(input.status && input.status >= 500),
    input.model,
  );
}

async function responseError(
  response: Response,
  token: string,
  model?: string,
): Promise<ChatGPTPlanError> {
  const requestId = response.headers.get('x-request-id') || undefined;
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  const record = isRecord(body) ? body : undefined;
  const nested = isRecord(record?.error)
    ? (record?.error as WireError)
    : undefined;
  return mappedError({
    error: nested,
    detail:
      typeof record?.detail === 'string'
        ? record.detail
        : text.slice(0, 500) || undefined,
    status: response.status,
    requestId,
    token,
    model,
  });
}

function frameData(frame: string): string | undefined {
  const values = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  return values.length ? values.join('\n') : undefined;
}

async function* sse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const data = frameData(frame);
        if (data !== undefined) yield data;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const data = frameData(buffer);
      if (data !== undefined) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

function validateOptions(options: ChatOptions): void {
  const unsupported: Array<keyof ChatOptions> = [
    'maxTokens',
    'temperature',
    'topP',
    'n',
    'stop',
    'frequencyPenalty',
    'presencePenalty',
    'user',
    'tools',
    'toolChoice',
    'responseFormat',
    'responseSchema',
    'seed',
    'reasoning',
    'thinkingLevel',
    'includeThoughts',
  ];
  const present = unsupported.filter((key) => options[key] !== undefined);
  if (present.length)
    throw new ChatGPTPlanError(
      `ChatGPT plan usage does not support request option(s): ${present.join(', ')}`,
      'subscription_sharing_unsupported_capability',
      400,
      undefined,
      present[0],
    );
}

function inputFor(messages: AIMessage[]): Array<Record<string, unknown>> {
  if (!messages.length)
    throw new ChatGPTPlanError(
      'ChatGPT plan usage requires at least one input message',
      'INVALID_REQUEST',
      400,
    );
  return messages.map((message) => {
    if (
      message.role === 'function' ||
      message.role === 'tool' ||
      message.tool_calls?.length ||
      message.tool_call_id ||
      message.name
    )
      throw new ChatGPTPlanError(
        'ChatGPT plan usage does not support this tool/function message shape',
        'subscription_sharing_unsupported_capability',
        400,
        undefined,
        'input',
      );
    const role = message.role === 'system' ? 'developer' : message.role;
    const content =
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) =>
            part.type === 'text'
              ? { type: 'input_text', text: part.text }
              : {
                  type: 'input_image',
                  image_url: part.image_url.url,
                  ...(part.image_url.detail
                    ? { detail: part.image_url.detail }
                    : {}),
                },
          );
    return { role, content };
  });
}

/**
 * Responses API adapter for an explicitly selected, locally authorized
 * ChatGPT plan. It uses only the public SIWC routes and never falls back to an
 * API-key provider.
 */
export class ChatGPTPlanProvider implements AIInterface {
  private readonly options: ChatGPTPlanOptions;
  private readonly fetcher: typeof fetch;

  constructor(options: ChatGPTPlanOptions) {
    if (!options.clientId?.trim())
      throw new ChatGPTPlanError(
        'clientId is required for ChatGPT plan usage',
        'INVALID_CONFIGURATION',
      );
    if (typeof options.sessionManager?.accessToken !== 'function')
      throw new ChatGPTPlanError(
        'sessionManager.accessToken is required for ChatGPT plan usage',
        'INVALID_CONFIGURATION',
      );
    this.options = normalizeBaseAIOptions(options);
    this.fetcher = options.fetch ?? fetch;
  }

  private async token(model?: string): Promise<string> {
    try {
      const token = await this.options.sessionManager.accessToken(
        this.options.clientId,
      );
      if (!token)
        throw new ChatGPTPlanSessionRevokedError(
          'The selected ChatGPT session has no usable access token; sign in again',
          'session_invalidated',
          undefined,
          undefined,
          model,
        );
      return token;
    } catch (error) {
      if (error instanceof ChatGPTPlanError) throw error;
      const code =
        isRecord(error) && typeof error.code === 'string'
          ? error.code
          : 'session_invalidated';
      const revoked = new Set([
        'unknown_account',
        'refresh_invalid',
        'session_invalidated',
        'plan_permission_missing',
      ]);
      const message =
        error instanceof Error
          ? error.message
          : 'The selected ChatGPT session is unavailable';
      if (revoked.has(code))
        throw new ChatGPTPlanSessionRevokedError(
          message,
          code,
          undefined,
          undefined,
          model,
        );
      throw new ChatGPTPlanError(
        message,
        code,
        undefined,
        undefined,
        undefined,
        true,
        model,
      );
    }
  }

  private async *events(
    messages: AIMessage[],
    options: ChatOptions,
  ): AsyncIterable<ProviderEvent> {
    validateOptions(options);
    const model = options.model || this.options.defaultModel;
    if (!model)
      throw new ChatGPTPlanError(
        'Select a model returned by getModels() before inference',
        'MODEL_REQUIRED',
      );
    const input = inputFor(messages);
    const controls = prepareRequestControls(this.options, options);
    let token = '';
    try {
      token = await this.token(model);
      const response = await this.fetcher(RESPONSES_URL, {
        method: 'POST',
        headers: {
          ...this.options.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          input,
          store: false,
          stream: true,
        }),
        signal: controls.signal,
      });
      if (!response.ok) throw await responseError(response, token, model);
      if (
        !response.body ||
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .includes('text/event-stream')
      )
        throw new ChatGPTPlanError(
          'ChatGPT plan response did not provide an event stream',
          'INVALID_RESPONSE',
          response.status,
          response.headers.get('x-request-id') || undefined,
          undefined,
          false,
          model,
        );

      let completed = false;
      for await (const data of sse(response.body)) {
        if (data === '[DONE]') continue;
        let event: StreamEvent;
        try {
          event = JSON.parse(data) as StreamEvent;
        } catch {
          throw new ChatGPTPlanError(
            'ChatGPT plan stream contained invalid JSON',
            'INVALID_RESPONSE',
            response.status,
            response.headers.get('x-request-id') || undefined,
            undefined,
            false,
            model,
          );
        }
        if (
          event.type === 'response.output_text.delta' &&
          typeof event.delta === 'string'
        ) {
          yield { delta: event.delta };
        } else if (event.type === 'response.completed') {
          completed = true;
          yield {
            completed: {
              model:
                typeof event.response?.model === 'string'
                  ? event.response.model
                  : model,
              usage: mapUsage(event.response?.usage),
            },
          };
        } else if (event.type === 'response.failed') {
          throw mappedError({
            error: event.response?.error || event.error,
            token,
            status: response.status,
            requestId: response.headers.get('x-request-id') || undefined,
            model,
          });
        } else if (event.type === 'response.incomplete') {
          throw new ChatGPTPlanError(
            'ChatGPT plan response was incomplete',
            'RESPONSE_INCOMPLETE',
            response.status,
            response.headers.get('x-request-id') || undefined,
            'incomplete_details',
            false,
            model,
          );
        }
      }
      if (!completed)
        throw new ChatGPTPlanError(
          'ChatGPT plan stream ended before response.completed',
          'STREAM_INTERRUPTED',
          response.status,
          response.headers.get('x-request-id') || undefined,
          undefined,
          true,
          model,
        );
    } catch (error) {
      if (controls.didTimeout())
        throw new ChatGPTPlanError(
          `ChatGPT plan request timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
          undefined,
          undefined,
          undefined,
          true,
          model,
        );
      if (options.signal?.aborted)
        throw new ChatGPTPlanError(
          'ChatGPT plan request was aborted',
          'AI_ABORTED',
          undefined,
          undefined,
          undefined,
          false,
          model,
        );
      if (error instanceof ChatGPTPlanError) throw error;
      const message = redact(
        error instanceof Error ? error.message : String(error),
        token,
      );
      throw new ChatGPTPlanError(
        `Network error calling ChatGPT plan usage: ${message}`,
        'NETWORK_ERROR',
        undefined,
        undefined,
        undefined,
        true,
        model,
      );
    } finally {
      controls.cleanup();
    }
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startedAt = Date.now();
    let content = '';
    let completed: ProviderEvent['completed'];
    for await (const event of this.events(messages, options)) {
      if (event.delta !== undefined) {
        content += event.delta;
        options.onProgress?.(event.delta);
      }
      if (event.completed) completed = event.completed;
    }
    options.onFinishReason?.('stop');
    const model =
      completed?.model || options.model || this.options.defaultModel || '';
    emitUsage(
      this.options,
      PROVIDER,
      'chat',
      model,
      completed?.usage,
      startedAt,
      options.usageTags,
    );
    return {
      content,
      model,
      usage: completed?.usage,
      finishReason: 'stop',
    };
  }

  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const startedAt = Date.now();
    let completed: ProviderEvent['completed'];
    for await (const event of this.events(messages, options)) {
      if (event.delta !== undefined) {
        options.onProgress?.(event.delta);
        yield event.delta;
      }
      if (event.completed) completed = event.completed;
    }
    options.onFinishReason?.('stop');
    emitUsage(
      this.options,
      PROVIDER,
      'stream',
      completed?.model || options.model || this.options.defaultModel || '',
      completed?.usage,
      startedAt,
      options.usageTags,
    );
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async message(text: string, options: MessageOptions = {}): Promise<string> {
    const response = await this.chat(
      [
        ...(options.history || []),
        { role: options.role || 'user', content: text },
      ],
      options,
    );
    return response.content;
  }

  async getModels(): Promise<AIModel[]> {
    const controls = prepareRequestControls(this.options);
    let token = '';
    try {
      token = await this.token();
      const response = await this.fetcher(MODELS_URL, {
        headers: {
          ...this.options.headers,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controls.signal,
      });
      if (!response.ok) throw await responseError(response, token);
      const body = (await response.json()) as unknown;
      if (!isRecord(body) || !Array.isArray(body.models))
        throw new ChatGPTPlanError(
          'ChatGPT plan model catalog omitted models',
          'INVALID_RESPONSE',
          response.status,
          response.headers.get('x-request-id') || undefined,
        );
      return body.models
        .filter(
          (entry): entry is Record<string, unknown> =>
            isRecord(entry) &&
            entry.visibility === 'list' &&
            typeof entry.slug === 'string' &&
            Boolean(entry.slug),
        )
        .map((entry) => ({
          id: entry.slug as string,
          name:
            typeof entry.display_name === 'string'
              ? entry.display_name
              : (entry.slug as string),
          contextLength: 0,
          capabilities: ['text', 'chat'],
          supportsFunctions: false,
          supportsVision: true,
        }));
    } catch (error) {
      if (controls.didTimeout())
        throw new ChatGPTPlanUsageUnavailableError(
          `ChatGPT plan model discovery timed out after ${controls.timeout}ms`,
          'AI_TIMEOUT',
        );
      if (error instanceof ChatGPTPlanError) throw error;
      throw new ChatGPTPlanError(
        `ChatGPT plan model discovery failed: ${redact(
          error instanceof Error ? error.message : String(error),
          token,
        )}`,
        'NETWORK_ERROR',
        undefined,
        undefined,
        undefined,
        true,
      );
    } finally {
      controls.cleanup();
    }
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: false,
      streaming: true,
      functions: false,
      vision: true,
      fineTuning: false,
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 0,
      supportedOperations: ['chat', 'completion', 'streaming', 'vision'],
    };
  }

  async countTokens(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }

  private unsupported(): never {
    throw new ChatGPTPlanError(
      'This operation is not supported by ChatGPT plan usage.',
      'NOT_IMPLEMENTED',
    );
  }
  async embed(
    _text: string | string[],
    _options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    return this.unsupported();
  }
  async embedImage(
    _image: string | Buffer,
    _options?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    return this.unsupported();
  }
  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options?: ImageDescriptionOptions,
  ): Promise<string> {
    return this.unsupported();
  }
  async generateImage(
    _prompt: string,
    _options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    return this.unsupported();
  }
  async submitVideoGenerationJob(
    _options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    return this.unsupported();
  }
  async getVideoGenerationJob(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    return this.unsupported();
  }
  async fetchVideoGenerationResult(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    return this.unsupported();
  }
  async cancelVideoGenerationJob(_handle: VideoGenerationJob): Promise<void> {
    return this.unsupported();
  }
  async validateVideoGenerationAccess(): Promise<boolean> {
    return this.unsupported();
  }
  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    return this.unsupported();
  }
  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new ChatGPTPlanError(
      'Speech streaming is not supported by ChatGPT plan usage.',
      'NOT_IMPLEMENTED',
    );
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    };
  }
  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    return this.unsupported();
  }
  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    return this.unsupported();
  }
  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    return this.unsupported();
  }
}
