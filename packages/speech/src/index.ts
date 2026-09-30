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
