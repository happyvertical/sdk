/**
 * BytePlus ModelArk (Seedance) video-generation provider implementation
 *
 * Raw-HTTP provider following the `qwen3-tts` precedent: no vendor SDK, just
 * the ModelArk video-generation task API (create task / poll / fetch /
 * cancel). This provider is video-generation only; it throws
 * `NOT_IMPLEMENTED` for chat, embeddings, and other text/TTS operations.
 *
 * The base URL, endpoint paths (`/contents/generations/tasks`), request/
 * response field names, and the `queued|running|cancelled|succeeded|failed|
 * expired` status enum were confirmed directly against BytePlus's own
 * published docs and blog examples at the time this was written (see the
 * link below). The `expired` status, the `page_num`/`page_size`/`filter.*`
 * list query params, and the DELETE-as-cancel-or-delete semantics
 * (`queued` → cancelled, `running` → rejected, terminal → deleted) are
 * corroborated from that same documentation but have not been exercised
 * against a live ModelArk account by this package's test suite — see
 * `packages/ai/src/byteplus-modelark.integration.test.ts` for an opt-in
 * check (skipped unless `MODELARK_API_KEY` is set) that exercises those
 * specifics against the real API.
 *
 * @see https://docs.byteplus.com/en/docs/ModelArk/Video_Generation_API
 */

import { extractRetryAfterSeconds } from '../rate-limit';
import { normalizeBaseAIOptions } from '../safety';
import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ByteplusModelArkOptions,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
  TTSOptions,
  TTSResponse,
  VideoGenerationJob,
  VideoGenerationOptions,
  VideoGenerationReferenceImage,
  VideoGenerationResult,
  VideoGenerationStatusResult,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import { AIError, AuthenticationError, RateLimitError } from '../types';
import { emitUsage } from './usage';

const DEFAULT_MODELARK_BASE_URL =
  'https://ark.ap-southeast.bytepluses.com/api/v3';
const DEFAULT_MODELARK_MODEL = 'seedance-1-0-lite-t2v-250428';
const DEFAULT_MODELARK_I2V_MODEL = 'seedance-1-0-lite-i2v-250428';
/** Burst capacity for the submit token bucket — see {@link SubmitRateLimiter}. */
const SUBMIT_BURST_CAPACITY = 2;

type ModelArkTaskStatus =
  | 'queued'
  | 'running'
  | 'cancelled'
  | 'succeeded'
  | 'failed'
  | 'expired';

interface ModelArkContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
  role?: string;
}

interface ModelArkCreateTaskRequest {
  model: string;
  content: ModelArkContentItem[];
  resolution?: string;
  ratio?: string;
  duration?: number;
  seed?: number;
}

interface ModelArkCreateTaskResponse {
  id: string;
}

interface ModelArkTaskResponse {
  id: string;
  model: string;
  status: ModelArkTaskStatus;
  content?: { video_url?: string; last_frame_url?: string };
  error?: { code: string; message: string } | null;
  created_at: number;
  updated_at: number;
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
}

/**
 * Local token-bucket + concurrency limiter for submit-time throttling.
 *
 * ModelArk documents Seedance account limits of QPS 2 / 3 *concurrent
 * submissions*; this only gates `submitVideoGenerationJob` (task creation
 * HTTP calls), matching the "submit-time throttling" requirement — polling
 * and cancellation are not subject to the same account-level task-creation
 * limits. `maxConcurrent` bounds concurrent in-flight *submit HTTP
 * requests*, not the lifetime of the provider-side render tasks those
 * submissions create — this limiter has no way to observe when a task
 * actually finishes rendering on ModelArk's infrastructure, so
 * task-lifetime concurrency is not, and cannot be, tracked here.
 *
 * The bucket's burst capacity is capped at {@link SUBMIT_BURST_CAPACITY}
 * (independent of `requestsPerMinute`) so the bucket doesn't start full —
 * without this cap, a bucket sized to `requestsPerMinute` (e.g. 120) would
 * start with 120 tokens and let the first 120 submits through instantly,
 * defeating the QPS limit entirely.
 */
class SubmitRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private activeRequests = 0;
  private readonly maxConcurrent: number;

  constructor(options: { requestsPerMinute?: number; maxConcurrent?: number }) {
    const requestsPerMinute = options.requestsPerMinute ?? 120; // ~QPS 2
    this.refillRate = requestsPerMinute / 60;
    this.maxTokens = SUBMIT_BURST_CAPACITY;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.maxConcurrent = options.maxConcurrent ?? 3;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;

    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    while (this.tokens < 1) {
      const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      const elapsedNow = (Date.now() - this.lastRefill) / 1000;
      this.tokens = Math.min(
        this.maxTokens,
        this.tokens + elapsedNow * this.refillRate,
      );
      this.lastRefill = Date.now();
    }

    this.tokens -= 1;
    this.activeRequests += 1;
  }

  release(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
  }
}

/**
 * FNV-1a hash, used only to avoid retaining raw API keys as in-memory Map
 * keys in {@link sharedSubmitLimiters}. Not cryptographic — collisions just
 * mean two distinct keys share a rate-limit bucket, which is a pacing
 * inefficiency, not a security issue.
 */
function hashKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Submit-time limiters keyed by credential/config, shared module-wide.
 *
 * Provider instances are frequently constructed per pipeline step (a fresh
 * `getAI({ type: 'byteplus-modelark', ... })` per job), so a limiter owned
 * by a single provider instance would reset on every construction and never
 * actually enforce the account-wide QPS/concurrency limits. Keying by the
 * resolved credentials (or an explicit `rateLimit.key`) lets independently
 * constructed instances that target the same ModelArk account share one
 * bucket, mirroring how {@link createRateLimitedAI}'s budget coordinators
 * are shared by `rateLimit.key`.
 */
const sharedSubmitLimiters = new Map<string, SubmitRateLimiter>();

function getSharedSubmitLimiter(
  options: ByteplusModelArkOptions,
): SubmitRateLimiter {
  const key =
    options.rateLimit?.key?.trim() ||
    `byteplus-modelark:${hashKey(options.apiKey || 'default')}`;

  let limiter = sharedSubmitLimiters.get(key);
  if (!limiter) {
    limiter = new SubmitRateLimiter({
      requestsPerMinute: options.rateLimit?.requestsPerMinute,
      maxConcurrent: options.rateLimit?.maxConcurrent,
    });
    sharedSubmitLimiters.set(key, limiter);
  }
  return limiter;
}

/** @internal Test-only: clear shared submit limiters between test cases. */
export function __resetByteplusModelArkRateLimitersForTests(): void {
  sharedSubmitLimiters.clear();
}

/**
 * BytePlus ModelArk provider implementation for asynchronous video
 * generation (Seedance). Focuses on video-generation capabilities and
 * throws `NOT_IMPLEMENTED` for text generation methods.
 *
 * @example
 * ```typescript
 * import { getAI } from '@happyvertical/ai';
 *
 * const modelark = await getAI({
 *   type: 'byteplus-modelark',
 *   apiKey: process.env.MODELARK_API_KEY!,
 * });
 *
 * const job = await modelark.submitVideoGenerationJob({
 *   prompt: 'A drone shot flying over a coastal cliff at sunrise',
 *   durationSeconds: 5,
 *   resolution: '720p',
 *   aspectRatio: '16:9',
 * });
 *
 * // Persist `job`, poll later (even after a restart):
 * const status = await modelark.getVideoGenerationJob(job);
 * ```
 */
export class ByteplusModelArkProvider implements AIInterface {
  private options: ByteplusModelArkOptions;
  private readonly submitLimiter: SubmitRateLimiter;

  constructor(options: ByteplusModelArkOptions) {
    // Note: deliberately no `defaultModel` fallback baked in here — the
    // model-selection logic in submitVideoGenerationJob picks between the
    // t2v and i2v defaults based on whether referenceImages are present,
    // and an unconditional default here would always shadow that.
    this.options = normalizeBaseAIOptions({ ...options });

    this.submitLimiter = getSharedSubmitLimiter(this.options);
  }

  private get baseUrl(): string {
    return (this.options.baseUrl || DEFAULT_MODELARK_BASE_URL).replace(
      /\/+$/,
      '',
    );
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
      query?: Record<string, string | number>;
      signal?: AbortSignal;
      timeout?: number;
    } = {},
  ): Promise<T> {
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
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: options.method || 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey ?? ''}`,
            ...(this.options.headers || {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });
      } catch (error) {
        // The fetch() call itself failed (network error, DNS failure,
        // timeout/abort) — wrap it into the AIError taxonomy so callers get
        // a consistent, retryable-vs-terminal-distinguishable error rather
        // than a raw TypeError/DOMException.
        if (timedOut) {
          throw new AIError(
            `ModelArk request to ${path} timed out after ${timeoutMs}ms`,
            'AI_TIMEOUT',
            'byteplus-modelark',
            undefined,
            true,
          );
        }
        if (options.signal?.aborted) {
          throw new AIError(
            'ModelArk request aborted by caller',
            'AI_ABORTED',
            'byteplus-modelark',
          );
        }
        throw new AIError(
          `Network error calling ModelArk ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          'NETWORK_ERROR',
          'byteplus-modelark',
          undefined,
          true,
        );
      }

      if (!response.ok) {
        const errorText = await response.text();

        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError('byteplus-modelark');
        }
        if (response.status === 429) {
          throw new RateLimitError(
            'byteplus-modelark',
            extractRetryAfterSeconds({ headers: response.headers }),
          );
        }

        throw new AIError(
          `ModelArk request to ${path} failed: ${response.status} ${errorText}`,
          'MODELARK_REQUEST_FAILED',
          'byteplus-modelark',
        );
      }

      if (response.status === 204) {
        return {} as T;
      }

      const text = await response.text();
      return text ? (JSON.parse(text) as T) : ({} as T);
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  private toImageUrl(reference: VideoGenerationReferenceImage): string {
    if (typeof reference.image === 'string') {
      return reference.image;
    }
    const mimeType = reference.mimeType || 'image/png';
    return `data:${mimeType};base64,${reference.image.toString('base64')}`;
  }

  // ============================================================================
  // Video Generation Methods (Implemented)
  // ============================================================================

  /**
   * Submit an asynchronous Seedance video-generation task.
   *
   * Submission is locally throttled to approximate ModelArk's documented
   * Seedance account limits (QPS 2, capped at {@link SUBMIT_BURST_CAPACITY}
   * burst / 3 concurrent *submissions* — task-lifetime concurrency on
   * ModelArk's infrastructure is not tracked; see {@link SubmitRateLimiter}).
   *
   * When `referenceImages` are supplied and no explicit `model` is chosen,
   * this selects the image-to-video default model rather than silently
   * generating text-to-video with the image ignored.
   */
  async submitVideoGenerationJob(
    options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    const startTime = Date.now();
    await this.submitLimiter.acquire();

    try {
      const hasReferenceImages = (options.referenceImages?.length ?? 0) > 0;
      const model =
        options.model ||
        this.options.defaultModel ||
        (hasReferenceImages
          ? DEFAULT_MODELARK_I2V_MODEL
          : DEFAULT_MODELARK_MODEL);

      const content: ModelArkContentItem[] = [];
      if (options.prompt) {
        content.push({ type: 'text', text: options.prompt });
      }
      for (const reference of options.referenceImages ?? []) {
        content.push({
          type: 'image_url',
          image_url: { url: this.toImageUrl(reference) },
          role: reference.role || 'reference_image',
        });
      }

      if (content.length === 0) {
        throw new AIError(
          'submitVideoGenerationJob requires a prompt or at least one reference image',
          'INVALID_INPUT',
          'byteplus-modelark',
        );
      }

      const body: ModelArkCreateTaskRequest = {
        model,
        content,
        resolution: options.resolution,
        ratio: options.aspectRatio,
        duration: options.durationSeconds,
        seed: options.seed,
      };
      // Note: ModelArk's documented create-task schema has no negative_prompt
      // or fps fields, so those VideoGenerationOptions are intentionally not
      // forwarded for this provider.

      const response = await this.request<ModelArkCreateTaskResponse>(
        '/contents/generations/tasks',
        {
          method: 'POST',
          body,
          signal: options.signal,
          timeout: options.timeout,
        },
      );

      emitUsage(
        this.options,
        'byteplus-modelark',
        'submitVideoGenerationJob',
        model,
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
        jobId: response.id,
        provider: 'byteplus-modelark',
        model,
        createdAt: new Date().toISOString(),
      };
    } finally {
      this.submitLimiter.release();
    }
  }

  /**
   * Poll the status of a ModelArk video-generation task.
   */
  async getVideoGenerationJob(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    const task = await this.request<ModelArkTaskResponse>(
      `/contents/generations/tasks/${handle.jobId}`,
    );
    return this.mapTask(task);
  }

  /**
   * Fetch the result of a completed ModelArk video-generation task.
   *
   * @throws {AIError} When the job has not succeeded yet
   */
  async fetchVideoGenerationResult(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    const status = await this.getVideoGenerationJob(handle);
    if (status.status !== 'succeeded' || !status.result) {
      throw new AIError(
        `ModelArk video-generation job ${handle.jobId} has not succeeded (status: ${status.status})`,
        'VIDEO_JOB_NOT_READY',
        'byteplus-modelark',
        handle.model,
      );
    }
    return status.result;
  }

  /**
   * Cancel a ModelArk video-generation task.
   *
   * ModelArk's DELETE endpoint only transitions a `queued` task to
   * `cancelled`; a task that is already `running` cannot be cancelled and
   * the request fails with an {@link AIError} describing why. Terminal
   * tasks (`succeeded`/`failed`/`expired`) are deleted instead.
   */
  async cancelVideoGenerationJob(handle: VideoGenerationJob): Promise<void> {
    await this.request(`/contents/generations/tasks/${handle.jobId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Cheap auth-shaped check for ModelArk access: lists tasks with a page
   * size of 1. Callers on a hot path must cache the result themselves.
   */
  async validateVideoGenerationAccess(): Promise<boolean> {
    await this.request('/contents/generations/tasks', {
      query: { page_size: 1 },
    });
    return true;
  }

  private mapTask(task: ModelArkTaskResponse): VideoGenerationStatusResult {
    switch (task.status) {
      case 'queued':
        return { status: 'queued' };
      case 'running':
        return { status: 'running' };
      case 'cancelled':
        return { status: 'cancelled' };
      case 'expired':
        return {
          status: 'failed',
          error: 'ModelArk task expired before the result was retrieved',
        };
      case 'failed':
        return {
          status: 'failed',
          error: task.error?.message || 'ModelArk video generation failed',
        };
      case 'succeeded': {
        if (!task.content?.video_url) {
          return {
            status: 'failed',
            error: 'ModelArk reported success with no video_url',
          };
        }
        return {
          status: 'succeeded',
          result: {
            url: task.content.video_url,
            mimeType: 'video/mp4',
            durationSeconds: task.duration,
          },
        };
      }
      default:
        // Never invent a terminal state for a status this package doesn't
        // recognize (e.g. a future ModelArk status addition) — treat it as
        // still in flight so a caller doesn't misread a mid-render job as
        // failed, resubmit, and double-bill. The raw value is preserved for
        // diagnostics.
        return { status: 'running', rawStatus: task.status };
    }
  }

  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: 'seedance-1-0-lite-t2v-250428',
        name: 'Seedance 1.0 Lite (text-to-video)',
        description: 'ModelArk Seedance 1.0 Lite text-to-video model',
        contextLength: 0,
        capabilities: ['video_generation'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'seedance-1-0-lite-i2v-250428',
        name: 'Seedance 1.0 Lite (image-to-video)',
        description: 'ModelArk Seedance 1.0 Lite image-to-video model',
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
      'Chat is not supported by the BytePlus ModelArk provider. Use OpenAI, Anthropic, or another provider for text generation.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async complete(
    _prompt: string,
    _options?: CompletionOptions,
  ): Promise<AIResponse> {
    throw new AIError(
      'Complete is not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async message(_text: string, _options?: MessageOptions): Promise<string> {
    throw new AIError(
      'Message is not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async embed(
    _text: string | string[],
    _options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Embeddings are not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async embedImage(
    _image: string | Buffer,
    _options?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Image embeddings are not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options?: ImageDescriptionOptions,
  ): Promise<string> {
    throw new AIError(
      'Image description is not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async generateImage(
    _prompt: string,
    _options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    throw new AIError(
      'Synchronous image generation is not yet implemented by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  stream(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): AsyncIterable<string> {
    const error = new AIError(
      'Chat streaming is not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async countTokens(_text: string): Promise<number> {
    throw new AIError(
      'Token counting is not supported by the BytePlus ModelArk provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by the BytePlus ModelArk provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by the BytePlus ModelArk provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by the BytePlus ModelArk provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by the BytePlus ModelArk provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by the BytePlus ModelArk provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'byteplus-modelark',
    );
  }
}
