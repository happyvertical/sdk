/**
 * OpenAI-compatible video-generation provider implementation
 *
 * Thin, raw-HTTP adapter over a `/v1/videos`-shaped REST surface (create /
 * retrieve / cancel / download content) configured by base URL + key. This
 * is the shape LiteLLM normalizes Veo behind, and the shape used by
 * Sora-style gateways. The surface is young and still churning across
 * vendors, so this adapter is deliberately thin: it forwards the fields the
 * OpenAI `videos` API documents (model, prompt, seconds, size, a single
 * image reference) and leaves everything else to the gateway's defaults.
 *
 * Only video-generation methods are implemented; use the `openai` or
 * `litellm` provider types against the same gateway for chat/embeddings.
 *
 * Request bodies are sent as JSON, not the `multipart/form-data` the
 * official `openai` npm package uses for `input_reference` uploads. This is
 * a deliberate choice for this thin adapter: LiteLLM (the primary target
 * gateway) accepts `input_reference.image_url` as a URL or base64 data URL
 * in a JSON body, and staying JSON-only keeps this file a plain HTTP client
 * with no multipart-encoding dependency. A raw OpenAI Sora endpoint that
 * requires actual multipart file uploads is not supported by this adapter.
 */

import { ValidationError } from '@happyvertical/utils';
import { extractRetryAfterSeconds } from '../rate-limit';
import { normalizeBaseAIOptions } from '../safety';
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
  OpenAICompatVideoOptions,
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
import { AIError, AuthenticationError, RateLimitError } from '../types';
import { emitUsage } from './usage';

/** Raw video-job object shape, following the OpenAI `videos` API. */
interface CompatVideoObject {
  id: string;
  status: string;
  model: string;
  progress?: number;
  seconds?: string;
  size?: string;
  error?: { code?: string; message?: string } | null;
  /** Some gateways (LiteLLM's Veo passthrough) include a direct download URL. */
  url?: string;
}

function ensureOpenAICompatVideoOptions(
  options: OpenAICompatVideoOptions,
): OpenAICompatVideoOptions {
  if (!options.baseUrl?.trim()) {
    throw new ValidationError('openai-compat-video baseUrl is required', {
      provider: 'openai-compat-video',
      hint: 'Pass baseUrl like https://llm.happyvertical.com/v1 or set OPENAI_COMPAT_VIDEO_BASE_URL',
    });
  }

  return {
    ...options,
    baseUrl: options.baseUrl.trim().replace(/\/+$/, ''),
  };
}

function parseSize(size: string | undefined): {
  width?: number;
  height?: number;
} {
  const match = size?.match(/^(\d+)x(\d+)$/);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Map a gateway's raw status string to our status enum.
 *
 * LiteLLM (the primary target gateway) documents `'processing'` as its
 * mid-render status rather than OpenAI's own `'in_progress'`; both, plus
 * `'pending'`, map to `'running'`. Only an explicit `'failed'` maps to a
 * terminal failure — an unrecognized status is never assumed to be
 * terminal, since misreading a mid-render job as failed would cause a
 * caller to resubmit (and double-bill) a job that was actually still
 * rendering. Unrecognized values map to `'running'` with the raw string
 * preserved via `rawStatus` so callers can still see and log it.
 */
function mapStatus(status: string): {
  status: VideoGenerationStatusResult['status'];
  rawStatus?: string;
} {
  switch (status) {
    case 'queued':
      return { status: 'queued' };
    case 'in_progress':
    case 'processing':
    case 'pending':
      return { status: 'running' };
    case 'completed':
      return { status: 'succeeded' };
    case 'failed':
      return { status: 'failed' };
    case 'cancelled':
    case 'canceled':
      return { status: 'cancelled' };
    default:
      return { status: 'running', rawStatus: status };
  }
}

/**
 * OpenAI-compatible video-generation provider for `/v1/videos`-shaped
 * gateways (LiteLLM, Sora-shaped providers).
 *
 * @example
 * ```typescript
 * import { getAI } from '@happyvertical/ai';
 *
 * const video = await getAI({
 *   type: 'openai-compat-video',
 *   baseUrl: 'https://llm.happyvertical.com/v1',
 *   apiKey: process.env.OPENAI_COMPAT_VIDEO_API_KEY!,
 * });
 *
 * const job = await video.submitVideoGenerationJob({
 *   prompt: 'A time-lapse of clouds over a mountain range',
 *   durationSeconds: 8,
 * });
 * ```
 */
export class OpenAICompatVideoProvider implements AIInterface {
  private options: OpenAICompatVideoOptions;

  constructor(options: OpenAICompatVideoOptions) {
    this.options = normalizeBaseAIOptions(
      ensureOpenAICompatVideoOptions(options),
    );
  }

  private get baseUrl(): string {
    return this.options.baseUrl as string;
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      query?: Record<string, string | number>;
      signal?: AbortSignal;
      timeout?: number;
    } = {},
  ): Promise<T> {
    const response = await this.rawRequest(path, options);
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private async rawRequest(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      query?: Record<string, string | number>;
      signal?: AbortSignal;
      timeout?: number;
      /** When true, a 404 response is returned as-is instead of throwing. */
      allowNotFound?: boolean;
    } = {},
  ): Promise<Response> {
    if (options.signal?.aborted) {
      throw new AIError(
        'openai-compat-video request aborted by caller',
        'AI_ABORTED',
        'openai-compat-video',
      );
    }

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timeoutMs = options.timeout ?? this.options.timeout;
    let timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;
    // Mirrors `prepareRequestControls`'s pattern (packages/ai/src/shared/safety.ts):
    // addEventListener on an already-aborted signal never fires, so an
    // already-aborted `signal` must invoke the abort immediately instead of
    // only listening for a future 'abort' event.
    const onExternalAbort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) {
      onExternalAbort();
    } else {
      options.signal?.addEventListener('abort', onExternalAbort, {
        once: true,
      });
    }

    try {
      const headers: Record<string, string> = {
        ...(this.options.headers || {}),
      };
      if (this.options.apiKey) {
        headers.Authorization = `Bearer ${this.options.apiKey}`;
      }
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          body:
            options.body !== undefined
              ? JSON.stringify(options.body)
              : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        // The fetch() call itself failed (network error, DNS failure,
        // timeout/abort) — wrap it into the AIError taxonomy so callers get
        // a consistent, retryable-vs-terminal-distinguishable error rather
        // than a raw TypeError/DOMException.
        if (timedOut) {
          throw new AIError(
            `openai-compat-video request to ${path} timed out after ${timeoutMs}ms`,
            'AI_TIMEOUT',
            'openai-compat-video',
            undefined,
            true,
          );
        }
        if (options.signal?.aborted) {
          throw new AIError(
            'openai-compat-video request aborted by caller',
            'AI_ABORTED',
            'openai-compat-video',
          );
        }
        throw new AIError(
          `Network error calling openai-compat-video ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'NETWORK_ERROR',
          'openai-compat-video',
          undefined,
          true,
        );
      }

      if (!response.ok) {
        if (response.status === 404 && options.allowNotFound) {
          return response;
        }

        const errorText = await response.text();

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError('openai-compat-video');
        }
        if (response.status === 429) {
          throw new RateLimitError(
            'openai-compat-video',
            extractRetryAfterSeconds({ headers: response.headers }),
          );
        }

        throw new AIError(
          `openai-compat-video request to ${path} failed: ${response.status} ${errorText}`,
          'OPENAI_COMPAT_VIDEO_REQUEST_FAILED',
          'openai-compat-video',
        );
      }

      return response;
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  // ============================================================================
  // Video Generation Methods (Implemented)
  // ============================================================================

  /**
   * Submit an asynchronous video-generation job.
   *
   * `resolution` is forwarded as the gateway's `size` field only when it is
   * already in `WIDTHxHEIGHT` form (e.g. `'1280x720'`); other resolution
   * labels (`'720p'`) are not translated and the gateway's default size
   * applies instead — keeping this adapter thin rather than guessing a
   * pixel size per vendor. `negativePrompt`, `seed`, and `fps` are not part
   * of the documented OpenAI videos schema and are not forwarded.
   */
  async submitVideoGenerationJob(
    options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    const startTime = Date.now();
    const model = options.model || this.options.defaultModel || 'sora-2';

    const body: Record<string, unknown> = {
      model,
      prompt: options.prompt,
    };
    if (options.durationSeconds !== undefined) {
      body.seconds = String(options.durationSeconds);
    }
    if (options.resolution?.includes('x')) {
      body.size = options.resolution;
    }
    const firstReference = options.referenceImages?.[0];
    if (firstReference) {
      body.input_reference = {
        image_url:
          typeof firstReference.image === 'string'
            ? firstReference.image
            : `data:${firstReference.mimeType || 'image/png'};base64,${firstReference.image.toString('base64')}`,
      };
    }

    const video = await this.request<CompatVideoObject>('/videos', {
      method: 'POST',
      body,
      signal: options.signal,
      timeout: options.timeout,
    });

    emitUsage(
      this.options,
      'openai-compat-video',
      'submitVideoGenerationJob',
      video.model || model,
      undefined,
      startTime,
      {
        ...(options.durationSeconds !== undefined
          ? { durationSeconds: String(options.durationSeconds) }
          : {}),
        ...(options.resolution ? { resolution: options.resolution } : {}),
        ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
        ...options.usageTags,
      },
    );

    return {
      jobId: video.id,
      provider: 'openai-compat-video',
      model: video.model || model,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Poll the status of a video-generation job.
   *
   * The gateway's status response does not include the video bytes, so
   * `result` on a succeeded job carries only metadata (mimeType, duration,
   * dimensions) plus a `url` when the gateway happens to include one
   * directly. Call {@link fetchVideoGenerationResult} to download the bytes.
   */
  async getVideoGenerationJob(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    const video = await this.request<CompatVideoObject>(
      `/videos/${handle.jobId}`,
    );
    return this.mapVideo(video);
  }

  /**
   * Fetch the result of a completed video-generation job, downloading the
   * rendered bytes from the gateway's content endpoint.
   *
   * @throws {AIError} When the job has not succeeded yet
   */
  async fetchVideoGenerationResult(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    const video = await this.request<CompatVideoObject>(
      `/videos/${handle.jobId}`,
    );
    const status = this.mapVideo(video);
    if (status.status !== 'succeeded') {
      throw new AIError(
        `openai-compat-video job ${handle.jobId} has not succeeded (status: ${status.status})`,
        'VIDEO_JOB_NOT_READY',
        'openai-compat-video',
        handle.model,
      );
    }

    if (video.url) {
      return status.result as VideoGenerationResult;
    }

    const response = await this.rawRequest(`/videos/${handle.jobId}/content`);
    const arrayBuffer = await response.arrayBuffer();
    const { width, height } = parseSize(video.size);

    return {
      data: Buffer.from(arrayBuffer),
      mimeType: response.headers.get('content-type') || 'video/mp4',
      durationSeconds: video.seconds ? Number(video.seconds) : undefined,
      width,
      height,
    };
  }

  /**
   * Cancel a video-generation job. Cancellation of an in-flight Sora-shaped
   * job is not part of the documented OpenAI `videos` API and is
   * gateway-dependent (e.g. LiteLLM's Veo passthrough may support it); this
   * attempts the conventional `/videos/{id}/cancel` REST call and surfaces
   * an {@link AIError} if the gateway rejects or does not implement it.
   */
  async cancelVideoGenerationJob(handle: VideoGenerationJob): Promise<void> {
    await this.rawRequest(`/videos/${handle.jobId}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Cheap auth-shaped check for video-generation access.
   *
   * This probes `GET /videos/{sentinel-id}` rather than listing videos:
   * LiteLLM (the primary target gateway) requires a `custom_llm_provider`
   * parameter on its `GET /v1/videos` list route that this generic adapter
   * has no context to supply, so a list-based check would fail with valid
   * credentials on the flagship gateway. A single-resource GET works
   * uniformly instead, classified as:
   * - `401`/`403` → invalid credentials, throws {@link AuthenticationError}
   * - `404` → authenticated successfully, the sentinel id just doesn't
   *   exist — this is a **valid** result, not a failure
   * - `2xx` → valid (the sentinel id coincidentally exists)
   *
   * Callers on a hot path must cache the result themselves.
   */
  async validateVideoGenerationAccess(): Promise<boolean> {
    const sentinelId = 'have-ai-validate-video-access';
    const response = await this.rawRequest(`/videos/${sentinelId}`, {
      allowNotFound: true,
    });
    return response.ok || response.status === 404;
  }

  private mapVideo(video: CompatVideoObject): VideoGenerationStatusResult {
    const { status, rawStatus } = mapStatus(video.status);

    if (status === 'failed') {
      return {
        status: 'failed',
        error:
          video.error?.message ||
          `Video generation failed (status: ${video.status})`,
      };
    }

    if (status !== 'succeeded') {
      return { status, progress: video.progress, rawStatus };
    }

    const { width, height } = parseSize(video.size);
    const result: VideoGenerationResult = {
      url: video.url,
      mimeType: 'video/mp4',
      durationSeconds: video.seconds ? Number(video.seconds) : undefined,
      width,
      height,
    };

    return { status: 'succeeded', result };
  }

  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: 'sora-2',
        name: 'Sora 2',
        description: 'OpenAI-compatible Sora 2 video-generation model',
        contextLength: 0,
        capabilities: ['video_generation'],
        supportsFunctions: false,
        supportsVision: true,
      },
      {
        id: 'sora-2-pro',
        name: 'Sora 2 Pro',
        description: 'OpenAI-compatible Sora 2 Pro video-generation model',
        contextLength: 0,
        capabilities: ['video_generation'],
        supportsFunctions: false,
        supportsVision: true,
      },
    ];
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: false,
      completion: false,
      embeddings: false,
      streaming: false,
      functions: false,
      vision: false,
      fineTuning: false,
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: true,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 0,
      supportedOperations: [
        'submitVideoGenerationJob',
        'getVideoGenerationJob',
        'fetchVideoGenerationResult',
        'cancelVideoGenerationJob',
      ],
    };
  }

  // ============================================================================
  // Text Generation / TTS Methods (Not Implemented - Use another provider)
  // ============================================================================

  async chat(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): Promise<AIResponse> {
    throw new AIError(
      'Chat is not supported by the openai-compat-video provider. Use the openai or litellm provider for text generation.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async complete(
    _prompt: string,
    _options?: CompletionOptions,
  ): Promise<AIResponse> {
    throw new AIError(
      'Complete is not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async message(_text: string, _options?: MessageOptions): Promise<string> {
    throw new AIError(
      'Message is not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async embed(
    _text: string | string[],
    _options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Embeddings are not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async embedImage(
    _image: string | Buffer,
    _options?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Image embeddings are not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options?: ImageDescriptionOptions,
  ): Promise<string> {
    throw new AIError(
      'Image description is not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async generateImage(
    _prompt: string,
    _options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    throw new AIError(
      'Image generation is not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  stream(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): AsyncIterable<string> {
    const error = new AIError(
      'Chat streaming is not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async countTokens(_text: string): Promise<number> {
    throw new AIError(
      'Token counting is not supported by the openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by the openai-compat-video provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by the openai-compat-video provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by the openai-compat-video provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by the openai-compat-video provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by the openai-compat-video provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'openai-compat-video',
    );
  }
}
