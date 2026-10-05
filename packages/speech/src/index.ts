/**
 * @happyvertical/speech
 *
 * Speech provider abstraction for STT and TTS backends.
 *
 * @example
 * ```typescript
 * import { getSpeech } from '@happyvertical/speech';
 *
 * const speech = await getSpeech({
 *   transcriber: {
 *     type: 'studio-server',
 *     baseUrl: 'http://studio-server.studio-server.svc.cluster.local',
 *   },
 *   synthesizer: {
 *     type: 'qwen3-tts',
 *     baseUrl: 'http://qwen3-tts.qwen3-tts.svc.cluster.local',
 *   },
 * });
 * ```
 *
 * @packageDocumentation
 */

export {
  OPENAI_REALTIME_DEFAULT_MODEL,
  OPENAI_REALTIME_DEFAULT_URL,
  openAIRealtimeProtocol,
  openAIRealtimeTranscriptionSession,
  parseOpenAIRealtimeEvent,
  resolveOpenAIRealtimeFormat,
  resolveRealtimeUrl,
} from './adapters/openai-realtime.js';
export {
  parseVoxtralRealtimeEvent,
  resolveVoxtralRealtimeUrl,
  VOXTRAL_REALTIME_AUDIO_FORMAT,
  VOXTRAL_REALTIME_DEFAULT_MODEL,
  voxtralRealtimeProtocol,
} from './adapters/voxtral-realtime.js';
export {
  DEFAULT_MAX_AUDIO_BYTES,
  mimeTypeToAudioExtension,
} from './shared/audio.js';
export {
  type SpeechEnv,
  TRANSCRIBER_ENV_KEYS,
} from './shared/env.js';
export * from './shared/errors.js';
export {
  getAvailableSpeechAdapters,
  getSpeech,
  getSpeechSynthesizer,
  getTranscriber,
  type SpeechFactoryContext,
} from './shared/factory.js';
export {
  type TranscriberInputFormat,
  transcriberInputFormat,
} from './shared/input-format.js';
export {
  audioSecondsForBytes,
  bytesPerSecond,
  unwrapRawAudio,
} from './shared/pcm.js';
export {
  type RealtimeConnection,
  type RealtimeProtocol,
  type RealtimeProtocolEvent,
  type RealtimeSessionConfig,
  type RealtimeSessionInit,
  RealtimeTranscriptionSession,
} from './shared/realtime-session.js';
export {
  CLIENT_SECRET_TTL_RANGE,
  type CreateStreamingClientSecretOptions,
  createStreamingClientSecret,
  DEFAULT_CLIENT_SECRET_TTL_SECONDS,
  resolveClientSecretUrl,
  type StreamingClientSecretContext,
  type StreamingClientSecretResult,
} from './shared/streaming-client-secret.js';
export {
  getStreamingTranscriber,
  isStreamingTranscriberType,
  parseMaxTurnSeconds,
  STREAMING_TRANSCRIBER_ENV_KEYS,
  STREAMING_TRANSCRIBER_TYPES,
  type StreamingFactoryContext,
  type StreamingTranscriberWrapperOptions,
  wrapStreamingTranscriber,
} from './shared/streaming-factory.js';
export type {
  GetStreamingTranscriberOptions,
  OpenAIRealtimeTranscriberOptions,
  StreamingAudioChunk,
  StreamingAudioEncoding,
  StreamingAudioFormat,
  StreamingClientSecret,
  StreamingCloseEvent,
  StreamingFinalEvent,
  StreamingPartialEvent,
  StreamingRolloverOptions,
  StreamingSession,
  StreamingSessionEventName,
  StreamingSessionEvents,
  StreamingSessionListener,
  StreamingSessionOptions,
  StreamingSessionSettings,
  StreamingSessionState,
  StreamingSpeechEvent,
  StreamingTranscriber,
  StreamingTranscriberOptions,
  StreamingTranscriberType,
  StreamingTurnDetection,
  StreamingTurnLimit,
  VoxtralRealtimeTranscriberOptions,
} from './shared/streaming-types.js';
export {
  DEFAULT_MAX_TURN_SECONDS,
  DEFAULT_ROLLOVER_MIN_SILENCE_MS,
  DEFAULT_ROLLOVER_SILENCE_THRESHOLD,
  DEFAULT_ROLLOVER_WINDOW_SECONDS,
} from './shared/turn-limit.js';
export type {
  AudioBytes,
  AudioInput,
  AudioSource,
  GetSpeechOptions,
  GetSpeechSynthesizerOptions,
  GetTranscriberOptions,
  OpenAICompatibleSpeechSynthesizerOptions,
  OpenAICompatibleTranscriberOptions,
  Qwen3SpeechSynthesizerOptions,
  Speech,
  SpeechAdapterAvailability,
  SpeechAdapterType,
  SpeechFetch,
  SpeechOperation,
  SpeechRetryOptions,
  SpeechSynthesizer,
  SpeechSynthesizerType,
  SpeechUsage,
  SpeechUsageCallback,
  SpeechVoice,
  SpeechVoiceInput,
  StudioServerSpeechSynthesizerOptions,
  StudioServerTranscriberOptions,
  SynthesisRequest,
  SynthesizedSpeech,
  TimestampGranularity,
  Transcriber,
  TranscriberType,
  TranscriptionRequest,
  TranscriptionResponseFormat,
  TranscriptResult,
  TranscriptSegment,
  WordTiming,
} from './shared/types.js';
export {
  isBrowserRuntime,
  type SpeechWebSocket,
  type SpeechWebSocketConstructor,
  type SpeechWebSocketFactory,
  type SpeechWebSocketInit,
} from './shared/websocket.js';
