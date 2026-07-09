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
  GetSpeechOptions,
  GetSpeechSynthesizerOptions,
  GetTranscriberOptions,
  OpenAICompatibleSpeechSynthesizerOptions,
  Qwen3SpeechSynthesizerOptions,
  Speech,
  SpeechAdapterAvailability,
  SpeechAdapterType,
  SpeechFetch,
  SpeechSynthesizer,
  SpeechSynthesizerType,
  SpeechVoice,
  SpeechVoiceInput,
  StudioServerSpeechSynthesizerOptions,
  StudioServerTranscriberOptions,
  SynthesisRequest,
  SynthesizedSpeech,
  Transcriber,
  TranscriberType,
  TranscriptionRequest,
  TranscriptResult,
  TranscriptSegment,
  WordTiming,
} from './shared/types.js';
