/**
 * Seevio's native asynchronous Seedance 2.5 video-generation provider.
 *
 * Seevio is deliberately implemented as its own raw-HTTP adapter rather than
 * being shaped to ModelArk. Both services can run Seedance, but their task,
 * billing, and media contracts differ.
 *
 * @see https://seevio.ai/api-docs
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
  SeevioOptions,
  TTSOptions,
  TTSResponse,
  VideoGenerationBillingMetadata,
  VideoGenerationJob,
  VideoGenerationOptions,
  VideoGenerationReferenceMedia,
  VideoGenerationResult,
  VideoGenerationStatusResult,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import { AIError, AuthenticationError, RateLimitError } from '../types';
import { emitUsage } from './usage';

const DEFAULT_BASE_URL = 'https://api.seevio.ai';
const DEFAULT_RESULT_ORIGIN = 'https://cdn.seevio.ai';
const MODEL = 'seedance-2-5';
const MIN_POLL_INTERVAL_MS = 10_000;
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESULT_BYTES = 200 * 1024 * 1024;
const COMPLETED_SNAPSHOT_TTL_MS = MIN_POLL_INTERVAL_MS;
const MAX_COMPLETED_SNAPSHOTS = 128;

interface SeevioTask {
  id: string;
  status: string;
  model?: string;
  billing_status?: string;
  credits?: number;
  failed_reason?: string | null;
  data?: {
    results?: string[];
    video_expires_at?: string;
    last_frame_url?: string | null;
    processing_time?: number;
  };
}

interface SeevioErrorResponse {
  error?: {
    code?: string;
    message?: string;
    required?: number;
    available?: number;
  };
}

interface SeevioCreateResponse {
  taskId: string;
  credits?: number;
}

interface SeevioInput {
  prompt: string;
  generation_type: 'text-to-video' | 'image-to-video' | 'reference-to-video';
  image_urls?: string[];
  video_urls?: string[];
  audio_urls?: string[];
  duration: number;
  aspect_ratio: 'adaptive' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9';
  resolution: '480p' | '720p';
  generate_audio: boolean;
  return_last_frame: boolean;
}

function ensureOptions(options: SeevioOptions): SeevioOptions {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== 'https:') {
    throw new ValidationError('seevio baseUrl must use HTTPS', {
      provider: 'seevio',
    });
  }
  const origins = options.resultUrlOrigins?.length
    ? options.resultUrlOrigins
    : [DEFAULT_RESULT_ORIGIN];
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== origin.replace(/\/+$/, '')
    ) {
      throw new ValidationError(
        'seevio resultUrlOrigins must contain HTTPS origins only',
        {
          provider: 'seevio',
        },
      );
    }
  }
  if (
    options.maxResultBytes !== undefined &&
    (!Number.isSafeInteger(options.maxResultBytes) ||
      options.maxResultBytes <= 0)
  ) {
    throw new ValidationError(
      'seevio maxResultBytes must be a positive safe integer',
      { provider: 'seevio' },
    );
  }
  return {
    ...options,
    baseUrl,
    resultUrlOrigins: origins.map((origin) => origin.replace(/\/+$/, '')),
  };
}

function validatedHttpsUrl(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`${label} must be a valid public HTTPS URL`, {
      provider: 'seevio',
    });
  }
  if (url.protocol !== 'https:') {
    throw new ValidationError(`${label} must use HTTPS`, {
      provider: 'seevio',
    });
  }
  const host = url.hostname.toLowerCase();
  if (
    url.username ||
    url.password ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.includes(':') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
  ) {
    throw new ValidationError(
      `${label} must not use credentials, localhost, or an IP-literal host`,
      { provider: 'seevio' },
    );
  }
  return url.toString();
}

function normalizeBilling(
  task: SeevioTask,
): VideoGenerationBillingMetadata | undefined {
  if (task.credits === undefined && !task.billing_status) return undefined;
  const normalized = [
    'reserved',
    'charged',
    'refunded',
    'refund_failed',
  ].includes(task.billing_status || '')
    ? (task.billing_status as VideoGenerationBillingMetadata['status'])
    : undefined;
  return {
    ...(task.credits !== undefined ? { credits: task.credits } : {}),
    ...(normalized ? { status: normalized } : {}),
    ...(!normalized && task.billing_status
      ? { rawStatus: task.billing_status }
      : {}),
  };
}

/** Native Seevio adapter for the pinned `seedance-2-5` model. */
export class SeevioProvider implements AIInterface {
  private readonly options: SeevioOptions;
  private readonly resultOrigins: Set<string>;
  private readonly nextPollAt = new Map<string, number>();
  private readonly completedSnapshots = new Map<
    string,
    { task: SeevioTask; recordedAt: number }
  >();

  /** Creates a Seevio task client using the documented HTTPS API root. */
  constructor(options: SeevioOptions) {
    this.options = normalizeBaseAIOptions(ensureOptions(options));
    this.resultOrigins = new Set(this.options.resultUrlOrigins);
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      body?: unknown;
      signal?: AbortSignal;
      timeout?: number;
      allowNotFound?: boolean;
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
      signal?: AbortSignal;
      timeout?: number;
      allowNotFound?: boolean;
    } = {},
  ): Promise<Response> {
    if (options.signal?.aborted)
      throw new AIError(
        'Seevio request aborted by caller',
        'AI_ABORTED',
        'seevio',
      );
    const controller = new AbortController();
    const timeoutMs = options.timeout ?? this.options.timeout;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      let response: Response;
      try {
        response = await fetch(`${this.options.baseUrl}${path}`, {
          method: options.method || 'GET',
          headers: {
            Authorization: `Bearer ${this.options.apiKey ?? ''}`,
            ...(options.body !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
            ...(this.options.headers || {}),
          },
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut)
          throw new AIError(
            `Seevio request to ${path} timed out after ${timeoutMs}ms`,
            'AI_TIMEOUT',
            'seevio',
            undefined,
            options.method !== 'POST',
          );
        if (options.signal?.aborted)
          throw new AIError(
            'Seevio request aborted by caller',
            'AI_ABORTED',
            'seevio',
          );
        throw new AIError(
          `Network error calling Seevio ${path}: ${error instanceof Error ? error.message : String(error)}`,
          'NETWORK_ERROR',
          'seevio',
          undefined,
          options.method !== 'POST',
        );
      }
      if (response.status === 404 && options.allowNotFound) return response;
      if (response.ok) return response;
      const errorText = await response.text();
      let payload: SeevioErrorResponse = {};
      try {
        payload = JSON.parse(errorText) as SeevioErrorResponse;
      } catch {
        /* preserve status fallback below */
      }
      const message =
        payload.error?.message ||
        `Seevio request to ${path} failed with HTTP ${response.status}`;
      if (response.status === 401) throw new AuthenticationError('seevio');
      if (response.status === 403)
        throw new AIError(message, 'SEEVIO_FORBIDDEN', 'seevio');
      if (response.status === 402)
        throw new AIError(message, 'INSUFFICIENT_CREDITS', 'seevio');
      if (response.status === 429)
        throw new RateLimitError(
          'seevio',
          extractRetryAfterSeconds({ headers: response.headers }),
        );
      throw new AIError(
        message,
        'SEEVIO_REQUEST_FAILED',
        'seevio',
        undefined,
        response.status >= 500 && options.method !== 'POST',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  private assertReviewedResultUrl(value: string): string {
    const url = validatedHttpsUrl(value, 'Seevio result URL');
    if (!this.resultOrigins.has(new URL(url).origin)) {
      throw new AIError(
        'Seevio returned a result URL outside configured reviewed origins',
        'UNTRUSTED_RESULT_URL',
        'seevio',
      );
    }
    return url;
  }

  private async downloadReviewedResult(
    initialUrl: string,
  ): Promise<{ data: Buffer; mimeType: string; url: string }> {
    let current = this.assertReviewedResultUrl(initialUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeout);
    const maxBytes = this.options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
    try {
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const response = await fetch(current, {
          redirect: 'manual',
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location)
            throw new AIError(
              'Seevio result redirect omitted Location',
              'SEEVIO_RESULT_DOWNLOAD_FAILED',
              'seevio',
            );
          current = this.assertReviewedResultUrl(
            new URL(location, current).toString(),
          );
          continue;
        }
        if (!response.ok)
          throw new AIError(
            `Seevio result download failed with HTTP ${response.status}`,
            'SEEVIO_RESULT_DOWNLOAD_FAILED',
            'seevio',
          );
        const contentType = response.headers.get('content-type');
        if (!contentType?.toLowerCase().startsWith('video/'))
          throw new AIError(
            `Seevio result download returned non-video content type ${contentType}`,
            'SEEVIO_RESULT_MIME_INVALID',
            'seevio',
          );
        const contentLength = response.headers.get('content-length');
        if (contentLength && Number(contentLength) > maxBytes)
          throw new AIError(
            `Seevio result exceeds configured ${maxBytes}-byte download limit`,
            'SEEVIO_RESULT_TOO_LARGE',
            'seevio',
          );
        if (!response.body)
          throw new AIError(
            'Seevio result download had no response body',
            'SEEVIO_RESULT_DOWNLOAD_FAILED',
            'seevio',
          );
        const chunks: Uint8Array[] = [];
        let size = 0;
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new AIError(
              `Seevio result exceeds configured ${maxBytes}-byte download limit`,
              'SEEVIO_RESULT_TOO_LARGE',
              'seevio',
            );
          }
          chunks.push(value);
        }
        return {
          data: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
          mimeType: contentType,
          url: current,
        };
      }
      throw new AIError(
        'Seevio result exceeded the maximum redirect count',
        'SEEVIO_RESULT_DOWNLOAD_FAILED',
        'seevio',
      );
    } catch (error) {
      if (controller.signal.aborted)
        throw new AIError(
          `Seevio result download timed out after ${this.options.timeout}ms`,
          'AI_TIMEOUT',
          'seevio',
          undefined,
          true,
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private mediaUrls(options: VideoGenerationOptions): {
    images: string[];
    videos: string[];
    audio: string[];
  } {
    const images = (options.referenceImages ?? []).map((reference) => {
      if (
        typeof reference.image !== 'string' ||
        reference.image.startsWith('data:')
      ) {
        throw new ValidationError(
          'Seevio referenceImages must be public HTTPS URLs; it cannot retrieve bytes or data URLs',
          { provider: 'seevio' },
        );
      }
      return validatedHttpsUrl(reference.image, 'Seevio reference image');
    });
    const references = options.referenceMedia ?? [];
    if (references.length + images.length > 50)
      throw new ValidationError(
        'Seevio accepts at most 50 total reference assets',
        { provider: 'seevio' },
      );
    const collect = (type: VideoGenerationReferenceMedia['type']) =>
      references
        .filter((reference) => reference.type === type)
        .map((reference) =>
          validatedHttpsUrl(reference.url, `Seevio ${type} reference`),
        );
    const mediaImages = collect('image');
    const videos = collect('video');
    const audio = collect('audio');
    if (
      images.length + mediaImages.length > 30 ||
      videos.length > 10 ||
      audio.length > 10
    ) {
      throw new ValidationError(
        'Seevio reference limits are 30 images, 10 videos, and 10 audio files',
        { provider: 'seevio' },
      );
    }
    for (const reference of references) {
      if (
        (reference.type === 'video' || reference.type === 'audio') &&
        reference.durationSeconds !== undefined &&
        (!Number.isFinite(reference.durationSeconds) ||
          reference.durationSeconds < 2 ||
          reference.durationSeconds > 30)
      ) {
        throw new ValidationError(
          'Seevio video/audio reference durations must be 2-30 seconds when supplied',
          { provider: 'seevio' },
        );
      }
    }
    for (const [label, type] of [
      ['video', 'video'],
      ['audio', 'audio'],
    ] as const) {
      const durations = references
        .filter((reference) => reference.type === type)
        .flatMap((reference) =>
          reference.durationSeconds === undefined
            ? []
            : [reference.durationSeconds],
        );
      if (durations.reduce((total, duration) => total + duration, 0) > 30) {
        throw new ValidationError(
          `Seevio ${label} reference durations must total no more than 30 seconds`,
          { provider: 'seevio' },
        );
      }
    }
    return { images: [...images, ...mediaImages], videos, audio };
  }

  private async pollTask(jobId: string): Promise<SeevioTask> {
    const now = Date.now();
    for (const [knownJobId, expiry] of this.nextPollAt) {
      if (expiry <= now) this.nextPollAt.delete(knownJobId);
    }
    const next = this.nextPollAt.get(jobId);
    if (next && now < next)
      throw new AIError(
        `Seevio tasks may be polled no more than once every 10 seconds; retry after ${Math.ceil((next - now) / 1000)} seconds`,
        'VIDEO_POLL_TOO_FREQUENT',
        'seevio',
      );
    const expiry = now + MIN_POLL_INTERVAL_MS;
    this.nextPollAt.set(jobId, expiry);
    const cleanup = setTimeout(() => {
      if (this.nextPollAt.get(jobId) === expiry) this.nextPollAt.delete(jobId);
    }, MIN_POLL_INTERVAL_MS);
    // Let idle Node workers exit rather than keeping the process alive for a
    // cadence cleanup timer. Browser timer handles do not expose `unref`.
    if (typeof cleanup === 'object' && 'unref' in cleanup) cleanup.unref();
    const task = await this.request<SeevioTask>(
      `/v1/tasks/${encodeURIComponent(jobId)}`,
    );
    if (task.status === 'completed') {
      // This is a bounded, short-lived handoff cache, not task history. A
      // completed task can be fetched without another status request only
      // within the provider's ten-second cadence window.
      if (!this.completedSnapshots.has(jobId)) {
        const oldestJobId = this.completedSnapshots.keys().next().value;
        if (
          this.completedSnapshots.size >= MAX_COMPLETED_SNAPSHOTS &&
          oldestJobId !== undefined
        ) {
          this.completedSnapshots.delete(oldestJobId);
        }
      }
      this.completedSnapshots.set(jobId, { task, recordedAt: Date.now() });
    }
    return task;
  }

  private completedSnapshot(jobId: string): SeevioTask | undefined {
    const snapshot = this.completedSnapshots.get(jobId);
    if (!snapshot) return undefined;
    if (Date.now() - snapshot.recordedAt >= COMPLETED_SNAPSHOT_TTL_MS) {
      this.completedSnapshots.delete(jobId);
      return undefined;
    }
    return snapshot.task;
  }

  /** Submits one unambiguous, non-retried Seedance 2.5 task. */
  async submitVideoGenerationJob(
    options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    const startTime = Date.now();
    const model = options.model || this.options.defaultModel || MODEL;
    if (model !== MODEL)
      throw new ValidationError(
        `Seevio provider supports the pinned model ${MODEL}`,
        { provider: 'seevio' },
      );
    if (!options.prompt?.trim())
      throw new ValidationError('Seevio requires a non-empty prompt', {
        provider: 'seevio',
      });
    if (options.seed !== undefined)
      throw new ValidationError(
        'seed is not supported by Seevio Seedance 2.5',
        { provider: 'seevio' },
      );
    const duration = options.durationSeconds ?? 5;
    if (!Number.isInteger(duration) || duration < 4 || duration > 30)
      throw new ValidationError(
        'Seevio durationSeconds must be an integer from 4 through 30',
        { provider: 'seevio' },
      );
    const resolution = options.resolution ?? '720p';
    if (resolution !== '480p' && resolution !== '720p')
      throw new ValidationError('Seevio resolution must be 480p or 720p', {
        provider: 'seevio',
      });
    const { images, videos, audio } = this.mediaUrls(options);
    const isImageToVideo =
      images.length >= 1 &&
      images.length <= 2 &&
      videos.length === 0 &&
      audio.length === 0;
    const generationType = isImageToVideo
      ? 'image-to-video'
      : images.length || videos.length || audio.length
        ? 'reference-to-video'
        : 'text-to-video';
    const aspectRatio = options.aspectRatio ?? 'adaptive';
    const supportedRatios: SeevioInput['aspect_ratio'][] = [
      'adaptive',
      '16:9',
      '9:16',
      '1:1',
      '4:3',
      '3:4',
      '21:9',
    ];
    if (!supportedRatios.includes(aspectRatio as SeevioInput['aspect_ratio']))
      throw new ValidationError('Unsupported Seevio aspectRatio', {
        provider: 'seevio',
      });
    if (isImageToVideo && aspectRatio !== 'adaptive')
      throw new ValidationError(
        'Seevio image-to-video requires aspectRatio: adaptive',
        { provider: 'seevio' },
      );
    const input: SeevioInput = {
      prompt: options.prompt.trim(),
      generation_type: generationType,
      duration,
      aspect_ratio: aspectRatio as SeevioInput['aspect_ratio'],
      resolution: resolution as '480p' | '720p',
      generate_audio: options.generateAudio ?? true,
      return_last_frame: options.returnLastFrame ?? false,
      ...(images.length ? { image_urls: images } : {}),
      ...(videos.length ? { video_urls: videos } : {}),
      ...(audio.length ? { audio_urls: audio } : {}),
    };
    const created = await this.request<SeevioCreateResponse>(
      '/v1/videos/generations',
      {
        method: 'POST',
        body: { model: MODEL, input },
        signal: options.signal,
        timeout: options.timeout,
      },
    );
    if (!created.taskId)
      throw new AIError(
        'Seevio accepted submission without a taskId',
        'SEEVIO_INVALID_RESPONSE',
        'seevio',
      );
    emitUsage(
      this.options,
      'seevio',
      'submitVideoGenerationJob',
      MODEL,
      undefined,
      startTime,
      {
        durationSeconds: String(duration),
        resolution,
        aspectRatio,
        ...options.usageTags,
      },
    );
    return {
      jobId: created.taskId,
      provider: 'seevio',
      model: MODEL,
      createdAt: new Date().toISOString(),
      raw:
        created.credits === undefined
          ? undefined
          : { credits: created.credits, billingStatus: 'reserved' },
    };
  }

  /** Returns a normalized task snapshot, enforcing Seevio's 10-second poll cadence. */
  async getVideoGenerationJob(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    return this.mapTask(await this.pollTask(handle.jobId));
  }

  /** Downloads a completed video while validating the initial URL and every redirect. */
  async fetchVideoGenerationResult(
    handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    const task =
      this.completedSnapshot(handle.jobId) ??
      (await this.pollTask(handle.jobId));
    const status = this.mapTask(task);
    if (status.status !== 'succeeded' || !status.result?.url)
      throw new AIError(
        `Seevio job ${handle.jobId} has not succeeded (status: ${status.status})`,
        'VIDEO_JOB_NOT_READY',
        'seevio',
        handle.model,
      );
    try {
      const downloaded = await this.downloadReviewedResult(status.result.url);
      return { ...status.result, ...downloaded };
    } finally {
      // The handoff cache exists only to make an immediate status → fetch
      // flow cadence-safe. Do not retain expired signed URLs after any fetch
      // attempt; a later fetch will authenticate a fresh task snapshot.
      this.completedSnapshots.delete(handle.jobId);
    }
  }

  /** Reports cancellation as unsupported because Seevio documents no cancellation endpoint. */
  async cancelVideoGenerationJob(_handle: VideoGenerationJob): Promise<void> {
    throw new AIError(
      'Seevio does not document a video-task cancellation endpoint',
      'NOT_IMPLEMENTED',
      'seevio',
    );
  }

  /** Performs an unbilled random task-id probe; an authenticated 404 is valid access. */
  async validateVideoGenerationAccess(): Promise<boolean> {
    const response = await this.rawRequest(
      `/v1/tasks/have-ai-access-probe-${crypto.randomUUID()}`,
      { allowNotFound: true },
    );
    return response.ok || response.status === 404;
  }

  private mapTask(task: SeevioTask): VideoGenerationStatusResult {
    const billing = normalizeBilling(task);
    if (task.status === 'queued')
      return { status: 'queued', ...(billing ? { billing } : {}) };
    if (task.status === 'generating')
      return { status: 'running', ...(billing ? { billing } : {}) };
    if (task.status === 'failed')
      return {
        status: 'failed',
        error: task.failed_reason || 'Seevio video generation failed',
        ...(billing ? { billing } : {}),
      };
    if (task.status !== 'completed')
      return {
        status: 'running',
        rawStatus: task.status,
        ...(billing ? { billing } : {}),
      };
    const url = task.data?.results?.[0];
    if (!url)
      return {
        status: 'failed',
        error: 'Seevio reported completion with no result URL',
        ...(billing ? { billing } : {}),
      };
    const result: VideoGenerationResult = {
      url: this.assertReviewedResultUrl(url),
      mimeType: 'video/mp4',
      ...(task.data?.video_expires_at
        ? { expiresAt: task.data.video_expires_at }
        : {}),
      ...(task.data?.last_frame_url
        ? {
            lastFrameUrl: this.assertReviewedResultUrl(
              task.data.last_frame_url,
            ),
          }
        : {}),
    };
    return { status: 'succeeded', result, ...(billing ? { billing } : {}) };
  }

  /** Lists the single intentional Seevio model selection. */
  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: MODEL,
        name: 'Seedance 2.5',
        description: 'Seevio Seedance 2.5 async video generation',
        contextLength: 0,
        capabilities: ['video_generation'],
        supportsFunctions: false,
        supportsVision: true,
      },
    ];
  }
  /** Reports Seevio's video-only capability surface. */
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
      ],
    };
  }

  private unsupported(): never {
    throw new AIError(
      'This operation is not supported by the Seevio video-only provider.',
      'NOT_IMPLEMENTED',
      'seevio',
    );
  }
  /** @inheritdoc */ async chat(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): Promise<AIResponse> {
    return this.unsupported();
  }
  /** @inheritdoc */ async complete(
    _prompt: string,
    _options?: CompletionOptions,
  ): Promise<AIResponse> {
    return this.unsupported();
  }
  /** @inheritdoc */ async message(
    _text: string,
    _options?: MessageOptions,
  ): Promise<string> {
    return this.unsupported();
  }
  /** @inheritdoc */ async embed(
    _text: string | string[],
    _options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    return this.unsupported();
  }
  /** @inheritdoc */ async embedImage(
    _image: string | Buffer,
    _options?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    return this.unsupported();
  }
  /** @inheritdoc */ async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options?: ImageDescriptionOptions,
  ): Promise<string> {
    return this.unsupported();
  }
  /** @inheritdoc */ async generateImage(
    _prompt: string,
    _options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    return this.unsupported();
  }
  /** @inheritdoc */ stream(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): AsyncIterable<string> {
    const error = new AIError(
      'Chat streaming is not supported by the Seevio video-only provider.',
      'NOT_IMPLEMENTED',
      'seevio',
    );
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    };
  }
  /** @inheritdoc */ async countTokens(_text: string): Promise<number> {
    return this.unsupported();
  }
  /** @inheritdoc */ async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    return this.unsupported();
  }
  /** @inheritdoc */ streamSpeech(
    _text: string,
    _options?: TTSOptions,
  ): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by the Seevio video-only provider.',
      'NOT_IMPLEMENTED',
      'seevio',
    );
    return {
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
    };
  }
  /** @inheritdoc */ async cloneVoice(
    _options: VoiceCloneOptions,
  ): Promise<Voice> {
    return this.unsupported();
  }
  /** @inheritdoc */ async designVoice(
    _options: VoiceDesignOptions,
  ): Promise<Voice> {
    return this.unsupported();
  }
  /** @inheritdoc */ async getVoices(
    _options?: VoiceListOptions,
  ): Promise<Voice[]> {
    return this.unsupported();
  }
}
