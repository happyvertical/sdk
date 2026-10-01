import type { LocalTranscriberSettings } from '../adapters/local/types.js';
import type { SpeechRetryOptions } from './retry.js';
import type {
  GetStreamingTranscriberOptions,
  StreamingTranscriberType,
} from './streaming-types.js';
import type { SpeechUsage, SpeechUsageCallback } from './usage.js';

export type { SpeechRetryOptions } from './retry.js';
export type {
  SpeechOperation,
  SpeechUsage,
  SpeechUsageCallback,
} from './usage.js';

export type SpeechAdapterType =
  | 'studio-server'
  | 'qwen3-tts'
  | 'openai-compatible'
  | 'local'
  | StreamingTranscriberType;

/**
 * Request/response transcribers, including wrapped streaming adapters.
 * `local` requires importing `@happyvertical/speech/local` first.
 */
export type TranscriberType =
  | 'studio-server'
  | 'openai-compatible'
  | 'local'
  | StreamingTranscriberType;

export type SpeechSynthesizerType =
  | 'studio-server'
  | 'qwen3-tts'
  | 'openai-compatible';

export interface SpeechAdapterAvailability {
  transcribers: TranscriberType[];
  /** Adapters available through `getStreamingTranscriber()`. */
  streamingTranscribers: StreamingTranscriberType[];
  synthesizers: SpeechSynthesizerType[];
}

export type AudioBytes = ArrayBuffer | Uint8Array | Blob;

/**
 * Raw audio accepted by transcribers. `Buffer` is a `Uint8Array` subclass.
 * Streams are buffered (bounded by `maxBytes`) before upload.
 */
export type AudioSource = AudioBytes | ReadableStream<Uint8Array>;

export interface AudioInput {
  data: AudioSource;
  /** MIME type, e.g. `audio/webm;codecs=opus`. Alias of `contentType`. */
  mimeType?: string;
  contentType?: string;
  filename?: string;
  sampleRate?: number;
  channels?: number;
  durationSeconds?: number;
}

export interface WordTiming {
  word: string;
  startSeconds: number;
  endSeconds: number;
  confidence?: number;
  speakerId?: string;
}

export interface TranscriptSegment {
  text: string;
  startSeconds?: number;
  endSeconds?: number;
  confidence?: number;
  speakerId?: string;
}

export interface TranscriptResult {
  text: string;
  language?: string;
  durationSeconds?: number;
  words?: WordTiming[];
  segments?: TranscriptSegment[];
  provider?: string;
  model?: string;
  raw?: unknown;
  /** Usage for billing/attribution, when the adapter reports it. */
  usage?: SpeechUsage;
}

export type TranscriptionResponseFormat = 'json' | 'text' | 'verbose_json';

export type TimestampGranularity = 'word' | 'segment';

export interface TranscriptionRequest {
  /** Audio wrapper, or a bare Blob/Buffer/Uint8Array/ArrayBuffer/ReadableStream. */
  audio: AudioInput | AudioSource;
  /** MIME type for bare audio sources; wins over `AudioInput` and Blob types. */
  mimeType?: string;
  signal?: AbortSignal;
  language?: string;
  model?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: TranscriptionResponseFormat;
  /** Requested timestamp detail (OpenAI `timestamp_granularities[]`). */
  timestampGranularities?: TimestampGranularity[];
  /** Per-request headers, merged over adapter headers (e.g. a per-tenant `x-bf-vk`). */
  headers?: HeadersInit;
  /** Per-request byte limit; overrides the adapter `maxBytes`. */
  maxBytes?: number;
  /** Per-request usage callback, invoked after any adapter-level `onUsage`. */
  onUsage?: SpeechUsageCallback;
  metadata?: Record<string, unknown>;
}

export interface SpeechVoice {
  id?: string;
  name?: string;
  language?: string;
  speakerId?: string;
  /** Opaque pre-extracted prompt for providers that support voice cloning. */
  prompt?: string;
  metadata?: Record<string, unknown>;
}

export type SpeechVoiceInput = string | SpeechVoice;

export interface SynthesisRequest {
  text: string;
  signal?: AbortSignal;
  voice?: SpeechVoiceInput;
  model?: string;
  language?: string;
  outputFormat?: string;
  sampleRate?: number;
  speed?: number;
  pitch?: number;
  responseFormat?: 'audio' | 'json';
  metadata?: Record<string, unknown>;
}

export interface SynthesizedSpeech {
  audio: ArrayBuffer;
  contentType: string;
  format?: string;
  sampleRate?: number;
  channels?: number;
  durationSeconds?: number;
  words?: WordTiming[];
  provider?: string;
  model?: string;
  raw?: unknown;
}

export interface Transcriber {
  readonly type: TranscriberType;
  transcribe(request: TranscriptionRequest): Promise<TranscriptResult>;
}

export interface SpeechSynthesizer {
  readonly type: SpeechSynthesizerType;
  synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech>;
}

export interface Speech {
  readonly transcriber?: Transcriber;
  readonly synthesizer?: SpeechSynthesizer;
  transcribe(request: TranscriptionRequest): Promise<TranscriptResult>;
  synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech>;
}

export type SpeechFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpSpeechOptions {
  baseUrl: string;
  fetch?: SpeechFetch;
  apiKey?: string;
  headers?: HeadersInit;
  timeoutMs?: number;
}

export interface StudioServerTranscriberOptions extends HttpSpeechOptions {
  type?: 'studio-server';
  transcribePath?: string;
}

/**
 * Options for the OpenAI-compatible transcriber (`POST /audio/transcriptions`).
 * Server-side only: the adapter holds the API key.
 */
export interface OpenAICompatibleTranscriberOptions extends HttpSpeechOptions {
  type: 'openai-compatible';
  /**
   * Server root (`https://api.openai.com`), API root (`http://gateway/stt/v1`),
   * or the full endpoint (`.../audio/transcriptions`).
   */
  baseUrl: string;
  /** Default model. Default `whisper-1`. */
  model?: string;
  /** Default response format. Default `verbose_json` (or `json` for json-only models). */
  responseFormat?: TranscriptionResponseFormat;
  /** Upload limit in bytes. Default 25 MB; `Infinity` disables it. */
  maxBytes?: number;
  /** Retry policy for 429/5xx. Default 2 retries; `false` disables. */
  retry?: SpeechRetryOptions | false;
  /** Called with usage after every successful transcription. */
  onUsage?: SpeechUsageCallback;
}

export interface StudioServerSpeechSynthesizerOptions
  extends HttpSpeechOptions {
  type: 'studio-server';
  synthesizePath?: string;
  defaultVoice?: string;
}

export interface Qwen3SpeechSynthesizerOptions extends HttpSpeechOptions {
  type: 'qwen3-tts';
  speechPath?: string;
  defaultModel?: string;
  defaultVoice?: string;
}

export interface OpenAICompatibleSpeechSynthesizerOptions
  extends HttpSpeechOptions {
  type: 'openai-compatible';
  speechPath?: string;
  defaultModel?: string;
  defaultVoice?: string;
}

/**
 * Transcriber factory options. `local` settings (device, dtype, cacheDir, ...)
 * apply only to `type: 'local'`.
 */
export interface GetTranscriberOptions
  extends Partial<HttpSpeechOptions>,
    Omit<LocalTranscriberSettings, 'model' | 'maxBytes' | 'onUsage'> {
  type?: TranscriberType;
  /** Studio Server only. */
  transcribePath?: string;
  /** OpenAI-compatible and local. */
  model?: string;
  /** OpenAI-compatible only. */
  responseFormat?: TranscriptionResponseFormat;
  /** OpenAI-compatible and local. */
  maxBytes?: number;
  /** OpenAI-compatible only. */
  retry?: SpeechRetryOptions | false;
  /** OpenAI-compatible, local, and streaming types. */
  onUsage?: SpeechUsageCallback;
  /**
   * Streaming types only (e.g. `openai-realtime`): extra adapter settings such
   * as `turnDetection`, `WebSocket`, or `connectTimeoutMs`. Top-level fields
   * win over these.
   */
  streaming?: Omit<GetStreamingTranscriberOptions, 'type'>;
}

export interface GetSpeechSynthesizerOptions
  extends Partial<HttpSpeechOptions> {
  type?: SpeechSynthesizerType;
  synthesizePath?: string;
  speechPath?: string;
  defaultModel?: string;
  defaultVoice?: string;
}

export interface GetSpeechOptions {
  transcriber?: GetTranscriberOptions | false;
  synthesizer?: GetSpeechSynthesizerOptions | false;
}
