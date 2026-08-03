/**
 * Qwen3-TTS provider implementation
 *
 * Provides text-to-speech synthesis using Qwen3-TTS models.
 * Supports voice cloning from 3-second audio samples and
 * voice design via natural language descriptions.
 *
 * TTS service is typically co-located with ComfyUI for GPU sharing efficiency.
 *
 * @see https://github.com/QwenLM/Qwen3-TTS
 */

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
  Qwen3TTSOptions,
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

/**
 * Request body for TTS synthesis
 */
interface TTSSynthesizeRequest {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  output_format?: 'wav' | 'mp3' | 'ogg';
  include_word_timings?: boolean;
}

/**
 * Response from TTS synthesis
 */
interface TTSSynthesizeResponse {
  audio: string; // Base64 encoded audio
  mime_type: string;
  duration: number;
  sample_rate: number;
  word_timings?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
}

/**
 * Request body for voice cloning
 */
interface VoiceCloneRequest {
  sample_audio: string; // Base64 encoded audio
  sample_mime_type?: string;
  name?: string;
  description?: string;
  language?: string;
}

/**
 * Request body for voice design
 */
interface VoiceDesignRequest {
  description: string;
  language?: string;
  gender?: 'male' | 'female' | 'neutral';
}

/**
 * Voice response from the API
 */
interface VoiceResponse {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  is_cloned?: boolean;
  is_designed?: boolean;
  sample_url?: string;
  voice_data?: Record<string, any>;
}

/**
 * Rate limiter for controlling request frequency
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private activeRequests: number = 0;
  private readonly maxConcurrent: number;

  constructor(options: {
    requestsPerMinute?: number;
    maxConcurrent?: number;
  }) {
    this.maxTokens = options.requestsPerMinute ?? 60;
    this.refillRate = this.maxTokens / 60; // Convert to per-second
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.maxConcurrent = options.maxConcurrent ?? 5;
  }

  async acquire(): Promise<void> {
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;

    // Wait for concurrent slot
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Wait for token
    while (this.tokens < 1) {
      const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      const elapsed = (Date.now() - this.lastRefill) / 1000;
      this.tokens = Math.min(
        this.maxTokens,
        this.tokens + elapsed * this.refillRate,
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
 * Qwen3-TTS provider implementation for text-to-speech synthesis.
 *
 * This provider focuses on TTS capabilities and throws NOT_IMPLEMENTED
 * for text generation methods. Use alongside another provider for full
 * AI capabilities.
 *
 * @example
 * ```typescript
 * import { getAI } from '@happyvertical/ai';
 *
 * // Create TTS-only provider
 * const tts = await getAI({
 *   type: 'qwen3-tts',
 *   endpoint: 'http://localhost:8880'
 * });
 *
 * // Synthesize speech
 * const result = await tts.synthesizeSpeech('Hello, world!', {
 *   voice: 'news-anchor',
 *   includeWordTimings: true
 * });
 *
 * // Clone a voice
 * const sample = fs.readFileSync('voice-sample.wav');
 * const voice = await tts.cloneVoice({
 *   sampleAudio: sample,
 *   name: 'My Custom Voice'
 * });
 * ```
 */
export class Qwen3TTSProvider implements AIInterface {
  private options: Qwen3TTSOptions;
  private rateLimiter: RateLimiter;

  /**
   * Creates a new Qwen3-TTS provider instance
   * @param options - Configuration options for the TTS provider
   */
  constructor(options: Qwen3TTSOptions) {
    this.options = {
      defaultModel: 'qwen3-tts-1.7b',
      endpoint: 'http://localhost:8880',
      ...options,
    };

    this.rateLimiter = new RateLimiter(options.rateLimit ?? {});
  }

  /**
   * Get the TTS endpoint URL
   */
  private get endpoint(): string {
    return this.options.endpoint || 'http://localhost:8880';
  }

  /**
   * Make an HTTP request to the TTS service
   */
  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: unknown;
    } = {},
  ): Promise<T> {
    await this.rateLimiter.acquire();

    try {
      const url = `${this.endpoint}${path}`;
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: this.options.timeout
          ? AbortSignal.timeout(this.options.timeout)
          : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIError(
          `TTS request to ${url} failed: ${response.status} ${errorText}`,
          'TTS_REQUEST_FAILED',
          'qwen3-tts',
        );
      }

      return await response.json();
    } finally {
      this.rateLimiter.release();
    }
  }

  // ============================================================================
  // TTS Methods (Implemented)
  // ============================================================================

  /**
   * Synthesize speech from text
   */
  async synthesizeSpeech(
    text: string,
    options: TTSOptions = {},
  ): Promise<TTSResponse> {
    const request: TTSSynthesizeRequest = {
      text,
      voice: options.voice || this.options.defaultVoice,
      language: options.language || this.options.defaultLanguage,
      speed: options.speed,
      pitch: options.pitch,
      output_format: options.outputFormat,
      include_word_timings: options.includeWordTimings,
    };

    const response = await this.request<TTSSynthesizeResponse>(
      '/v1/tts/synthesize',
      {
        method: 'POST',
        body: request,
      },
    );

    return {
      audio: Buffer.from(response.audio, 'base64'),
      mimeType: response.mime_type,
      duration: response.duration,
      sampleRate: response.sample_rate,
      model: options.model || this.options.defaultModel,
      wordTimings: response.word_timings?.map((wt) => ({
        word: wt.word,
        start: wt.start,
        end: wt.end,
      })),
    };
  }

  /**
   * Stream speech synthesis for real-time playback
   */
  async *streamSpeech(
    text: string,
    options: TTSOptions = {},
  ): AsyncIterable<Buffer> {
    await this.rateLimiter.acquire();

    try {
      const request: TTSSynthesizeRequest = {
        text,
        voice: options.voice || this.options.defaultVoice,
        language: options.language || this.options.defaultLanguage,
        speed: options.speed,
        pitch: options.pitch,
        output_format: options.outputFormat,
      };

      const url = `${this.endpoint}/v1/tts/stream`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.headers || {}),
        },
        body: JSON.stringify(request),
        signal: this.options.timeout
          ? AbortSignal.timeout(this.options.timeout)
          : undefined,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new AIError(
          `TTS stream request failed: ${response.status} ${errorText}`,
          'TTS_STREAM_FAILED',
          'qwen3-tts',
        );
      }

      if (!response.body) {
        throw new AIError(
          'No response body for TTS stream',
          'TTS_STREAM_NO_BODY',
          'qwen3-tts',
        );
      }

      const reader = response.body.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield Buffer.from(value);
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      this.rateLimiter.release();
    }
  }

  /**
   * Clone a voice from an audio sample
   */
  async cloneVoice(options: VoiceCloneOptions): Promise<Voice> {
    const sampleBase64 =
      typeof options.sampleAudio === 'string'
        ? options.sampleAudio
        : options.sampleAudio.toString('base64');

    const request: VoiceCloneRequest = {
      sample_audio: sampleBase64,
      sample_mime_type: options.sampleMimeType,
      name: options.name,
      description: options.description,
      language: options.language,
    };

    const response = await this.request<VoiceResponse>('/v1/voices/clone', {
      method: 'POST',
      body: request,
    });

    return this.mapVoice(response);
  }

  /**
   * Design a voice using natural language description
   */
  async designVoice(options: VoiceDesignOptions): Promise<Voice> {
    const request: VoiceDesignRequest = {
      description: options.description,
      language: options.language,
      gender: options.gender,
    };

    const response = await this.request<VoiceResponse>('/v1/voices/design', {
      method: 'POST',
      body: request,
    });

    return this.mapVoice(response);
  }

  /**
   * List available voices
   */
  async getVoices(options: VoiceListOptions = {}): Promise<Voice[]> {
    const params = new URLSearchParams();
    if (options.language) params.set('language', options.language);
    if (options.gender) params.set('gender', options.gender);
    if (options.includeCloned !== undefined)
      params.set('include_cloned', String(options.includeCloned));
    if (options.includeDesigned !== undefined)
      params.set('include_designed', String(options.includeDesigned));

    const queryString = params.toString();
    const path = queryString ? `/v1/voices?${queryString}` : '/v1/voices';

    const response = await this.request<{ voices: VoiceResponse[] }>(path);
    return response.voices.map((v) => this.mapVoice(v));
  }

  /**
   * Map API voice response to Voice interface
   */
  private mapVoice(response: VoiceResponse): Voice {
    return {
      id: response.id,
      name: response.name,
      language: response.language,
      gender: response.gender,
      description: response.description,
      isCloned: response.is_cloned,
      isDesigned: response.is_designed,
      sampleUrl: response.sample_url,
      voiceData: response.voice_data,
    };
  }

  // ============================================================================
  // Text Generation Methods (Not Implemented - Use another provider)
  // ============================================================================

  async chat(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): Promise<AIResponse> {
    throw new AIError(
      'Chat is not supported by Qwen3-TTS provider. Use OpenAI, Anthropic, or another provider for text generation.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async complete(
    _prompt: string,
    _options?: CompletionOptions,
  ): Promise<AIResponse> {
    throw new AIError(
      'Complete is not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async message(_text: string, _options?: MessageOptions): Promise<string> {
    throw new AIError(
      'Message is not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async embed(
    _text: string | string[],
    _options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Embeddings are not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async embedImage(
    _image: string | Buffer,
    _options?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Image embeddings are not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options?: ImageDescriptionOptions,
  ): Promise<string> {
    throw new AIError(
      'Image description is not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async generateImage(
    _prompt: string,
    _options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse> {
    throw new AIError(
      'Image generation is not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async submitVideoGenerationJob(
    _options: VideoGenerationOptions,
  ): Promise<VideoGenerationJob> {
    throw new AIError(
      'Video generation is not supported by Qwen3-TTS provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async getVideoGenerationJob(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationStatusResult> {
    throw new AIError(
      'Video generation is not supported by Qwen3-TTS provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async fetchVideoGenerationResult(
    _handle: VideoGenerationJob,
  ): Promise<VideoGenerationResult> {
    throw new AIError(
      'Video generation is not supported by Qwen3-TTS provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async cancelVideoGenerationJob(_handle: VideoGenerationJob): Promise<void> {
    throw new AIError(
      'Video generation is not supported by Qwen3-TTS provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async validateVideoGenerationAccess(): Promise<boolean> {
    throw new AIError(
      'Video generation is not supported by Qwen3-TTS provider. Use gemini, byteplus-modelark, or openai-compat-video provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  stream(
    _messages: AIMessage[],
    _options?: ChatOptions,
  ): AsyncIterable<string> {
    const error = new AIError(
      'Chat streaming is not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async countTokens(_text: string): Promise<number> {
    throw new AIError(
      'Token counting is not supported by Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'qwen3-tts',
    );
  }

  async getModels(): Promise<AIModel[]> {
    return [
      {
        id: 'qwen3-tts-1.7b',
        name: 'Qwen3-TTS 1.7B',
        description: 'Higher quality TTS model (4.54GB VRAM)',
        contextLength: 0,
        capabilities: ['tts', 'voice-cloning', 'voice-design'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'qwen3-tts-0.6b',
        name: 'Qwen3-TTS 0.6B',
        description: 'Faster TTS model with lower VRAM (2.52GB)',
        contextLength: 0,
        capabilities: ['tts', 'voice-cloning', 'voice-design'],
        supportsFunctions: false,
        supportsVision: false,
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
      videoGeneration: false,
      tts: true,
      voiceCloning: true,
      voiceDesign: true,
      maxContextLength: 0,
      supportedOperations: [
        'synthesizeSpeech',
        'streamSpeech',
        'cloneVoice',
        'designVoice',
        'getVoices',
      ],
    };
  }
}
