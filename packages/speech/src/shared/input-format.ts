import { VOXTRAL_REALTIME_AUDIO_FORMAT } from '../adapters/voxtral-realtime.js';
import type { TranscriberType } from './types.js';

/** What audio a transcriber type accepts from a caller. */
export type TranscriberInputFormat =
  | { kind: 'compressed' }
  | { kind: 'pcm16'; sampleRate: number; channels: 1 };

/** The `openai-realtime` default wire format: `audio/pcm`, 24 kHz mono. */
const OPENAI_REALTIME_PCM_RATE = 24_000;

/**
 * Says what to record for a transcriber type. `pcm16` types reject compressed
 * containers (webm, ogg, mp3) and need 16-bit little-endian mono PCM, raw or in
 * a WAV, at exactly `sampleRate`; use `@happyvertical/speech/browser` or
 * `/pcm` to produce it. `compressed` types decode containers themselves
 * (HTTP APIs, and the on-device transcriber, which decodes with the platform).
 * For `openai-realtime` this is the default format; G.711 is an explicit
 * adapter option and not a capture format.
 */
export function transcriberInputFormat(
  type: TranscriberType,
): TranscriberInputFormat {
  switch (type) {
    case 'voxtral-realtime':
      return {
        kind: 'pcm16',
        sampleRate: VOXTRAL_REALTIME_AUDIO_FORMAT.sampleRate ?? 16_000,
        channels: 1,
      };
    case 'openai-realtime':
      return {
        kind: 'pcm16',
        sampleRate: OPENAI_REALTIME_PCM_RATE,
        channels: 1,
      };
    case 'studio-server':
    case 'openai-compatible':
    case 'local':
      return { kind: 'compressed' };
    default: {
      const unknown: never = type;
      throw new Error(`Unknown transcriber type: ${String(unknown)}`);
    }
  }
}
