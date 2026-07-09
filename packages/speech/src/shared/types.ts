export type SpeechAdapterType =
  | 'studio-server'
  | 'qwen3-tts'
  | 'openai-compatible';

export type TranscriberType = 'studio-server';

export type SpeechSynthesizerType =
  | 'studio-server'
  | 'qwen3-tts'
  | 'openai-compatible';

export interface SpeechAdapterAvailability {
  transcribers: TranscriberType[];
  synthesizers: SpeechSynthesizerType[];
}

export type AudioBytes = ArrayBuffer | Uint8Array | Blob;

export interface AudioInput {
  data: AudioBytes;
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
}

export interface TranscriptionRequest {
  audio: AudioInput;
  signal?: AbortSignal;
  language?: string;
  model?: string;
  prompt?: string;
  temperature?: number;
  responseFormat?: 'json' | 'text' | 'verbose_json';
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

export interface GetTranscriberOptions
  extends Partial<StudioServerTranscriberOptions> {
  type?: TranscriberType;
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
