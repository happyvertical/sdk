/**
 * Raw-audio helpers for streaming adapters: byte views, base64 encoding,
 * duration from byte counts, and WAV/`audio/L16` unwrapping for the
 * record-then-send wrapper. Nothing here decodes compressed audio or resamples.
 */

import { normalizeMimeType } from './audio.js';
import { SpeechConfigurationError } from './errors.js';
import type {
  StreamingAudioChunk,
  StreamingAudioEncoding,
  StreamingAudioFormat,
} from './streaming-types.js';

const ENCODING_BYTES_PER_SAMPLE: Record<StreamingAudioEncoding, number> = {
  pcm16: 2,
  g711_ulaw: 1,
  g711_alaw: 1,
};

/** Returns a byte view over a chunk without copying. */
export function chunkToBytes(
  chunk: StreamingAudioChunk,
  adapter?: string,
): Uint8Array {
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new SpeechConfigurationError(
    'Streaming audio chunks must be Uint8Array, ArrayBuffer, or an ArrayBuffer view',
    adapter,
  );
}

export function encodeBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString('base64');
  }

  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

/** Bytes per second of audio in `format`. */
export function bytesPerSecond(format: StreamingAudioFormat): number {
  return (
    format.sampleRate *
    format.channels *
    ENCODING_BYTES_PER_SAMPLE[format.encoding]
  );
}

/** Audio duration in seconds for `bytes` of `format`, rounded to milliseconds. */
export function audioSecondsForBytes(
  bytes: number,
  format: StreamingAudioFormat,
): number {
  return Math.round((bytes / bytesPerSecond(format)) * 1000) / 1000;
}

export interface RawAudio {
  bytes: Uint8Array;
  /** Format fields the input declared (WAV header, MIME parameters, or `AudioInput`). */
  format: Partial<StreamingAudioFormat>;
}

const WAV_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/vnd.wave',
]);
const RAW_PCM_TYPES = new Set([
  'audio/pcm',
  'audio/l16',
  'audio/raw',
  'audio/x-raw',
]);
/** Untyped bytes: the streaming transcriber's default format applies. */
const UNTYPED = 'application/octet-stream';
const MULAW_TYPES = new Set(['audio/pcmu', 'audio/basic', 'audio/x-mulaw']);
const ALAW_TYPES = new Set(['audio/pcma', 'audio/x-alaw']);

/**
 * Interprets a finished recording as raw audio for a streaming session.
 * Accepts PCM/G.711 WAV files, `audio/pcm`/`audio/L16` (with optional `rate`
 * and `channels` parameters), `audio/pcmu`/`audio/pcma`, and untyped bytes.
 * Compressed containers are rejected with a `SpeechConfigurationError`.
 */
export function unwrapRawAudio(
  bytes: Uint8Array,
  mimeType: string,
  adapter: string,
): RawAudio {
  const essence = normalizeMimeType(mimeType) ?? 'application/octet-stream';
  const params = parseMimeParameters(mimeType);
  const rate = parsePositiveInt(params.rate);
  const channels = parsePositiveInt(params.channels);

  if (WAV_TYPES.has(essence) || isRiffWave(bytes)) {
    return parseWav(bytes, adapter);
  }
  if (essence === UNTYPED) {
    // No encoding: `start()` keeps the adapter's `audioFormat` (e.g. G.711).
    return { bytes, format: compact({ sampleRate: rate, channels }) };
  }
  if (RAW_PCM_TYPES.has(essence)) {
    if (essence === 'audio/l16' && bytes.byteLength % 2 !== 0) {
      throw new SpeechConfigurationError(
        `audio/L16 payload has an odd byte length (${bytes.byteLength}); 16-bit samples need an even number of bytes`,
        adapter,
      );
    }
    return {
      // RFC 2586: audio/L16 samples are big-endian; pcm16 is little-endian.
      bytes: essence === 'audio/l16' ? swapBytePairs(bytes) : bytes,
      format: compact({ encoding: 'pcm16', sampleRate: rate, channels }),
    };
  }
  if (MULAW_TYPES.has(essence)) {
    return {
      bytes,
      format: compact({ encoding: 'g711_ulaw', sampleRate: rate, channels }),
    };
  }
  if (ALAW_TYPES.has(essence)) {
    return {
      bytes,
      format: compact({ encoding: 'g711_alaw', sampleRate: rate, channels }),
    };
  }

  throw new SpeechConfigurationError(
    `${adapter} streams raw audio and cannot decode ${essence}; send PCM WAV or raw PCM, or use an HTTP transcriber for compressed recordings`,
    adapter,
  );
}

/** Returns a copy with each 16-bit sample's bytes swapped. */
function swapBytePairs(bytes: Uint8Array): Uint8Array {
  const swapped = new Uint8Array(bytes.byteLength);
  for (let index = 0; index + 1 < bytes.byteLength; index += 2) {
    swapped[index] = bytes[index + 1] ?? 0;
    swapped[index + 1] = bytes[index] ?? 0;
  }
  return swapped;
}

function isRiffWave(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WAVE'
  );
}

function parseWav(bytes: Uint8Array, adapter: string): RawAudio {
  if (!isRiffWave(bytes)) {
    throw new SpeechConfigurationError('Invalid WAV header', adapter);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let format: Partial<StreamingAudioFormat> | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ' && body + 16 <= bytes.byteLength) {
      const audioFormat = view.getUint16(body, true);
      const channels = view.getUint16(body + 2, true);
      const sampleRate = view.getUint32(body + 4, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      format = {
        encoding: wavEncoding(audioFormat, bitsPerSample, adapter),
        sampleRate,
        channels,
      };
    } else if (id === 'data') {
      if (!format) {
        throw new SpeechConfigurationError(
          'WAV data chunk precedes its fmt chunk',
          adapter,
        );
      }
      const end = Math.min(bytes.byteLength, body + size);
      return { bytes: bytes.subarray(body, end), format };
    }

    // Chunks are padded to an even size.
    offset = body + size + (size % 2);
  }

  throw new SpeechConfigurationError('WAV file has no data chunk', adapter);
}

function wavEncoding(
  audioFormat: number,
  bitsPerSample: number,
  adapter: string,
): StreamingAudioEncoding {
  // 0xfffe is WAVE_FORMAT_EXTENSIBLE; its common PCM case is treated as PCM.
  if ((audioFormat === 1 || audioFormat === 0xfffe) && bitsPerSample === 16) {
    return 'pcm16';
  }
  if (audioFormat === 7 && bitsPerSample === 8) {
    return 'g711_ulaw';
  }
  if (audioFormat === 6 && bitsPerSample === 8) {
    return 'g711_alaw';
  }
  throw new SpeechConfigurationError(
    `Unsupported WAV encoding (format ${audioFormat}, ${bitsPerSample}-bit); expected 16-bit PCM or 8-bit G.711`,
    adapter,
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function parseMimeParameters(mimeType: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of mimeType.split(';').slice(1)) {
    const [key, value] = part.split('=');
    if (key && value) {
      params[key.trim().toLowerCase()] = value.trim();
    }
  }
  return params;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function compact(
  format: Partial<StreamingAudioFormat>,
): Partial<StreamingAudioFormat> {
  return Object.fromEntries(
    Object.entries(format).filter(([, value]) => value !== undefined),
  ) as Partial<StreamingAudioFormat>;
}
