/**
 * `@happyvertical/speech/pcm`: pure PCM and WAV utilities for the realtime
 * transcribers. No Node APIs, no DOM; safe in browsers, workers and Node.
 */

export { WavFormatError, type WavFormatErrorReason } from './shared/errors.js';
export {
  MAX_RESAMPLE_OUTPUT_SAMPLES,
  resampleMono,
} from './shared/resample.js';
export {
  createUtteranceCollector,
  createVadSegmenter,
  frameEnergy,
  resolveVadOptions,
  type UtteranceCollector,
  type UtteranceCollectorOptions,
  VAD_DEFAULTS,
  VAD_FRAME_MS,
  type VadEndReason,
  type VadEvent,
  type VadOptions,
  type VadSegmenter,
  type VadStep,
  type VadUtterance,
} from './shared/vad.js';
export {
  encodeWavPcm16,
  float32ToPcm16,
  type ParsedWavPcm16,
  parseWavPcm16,
  pcm16ToFloat32,
  type WavExpectation,
} from './shared/wav.js';
