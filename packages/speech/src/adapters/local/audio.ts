/**
 * Audio decoding for on-device inference: turns encoded bytes into 16 kHz
 * mono Float32 PCM, the input Whisper and Moonshine expect.
 *
 * - WAV (PCM 8/16/24/32-bit, IEEE float 32/64, WAVE_FORMAT_EXTENSIBLE) and raw
 *   `audio/pcm` are decoded in-process in every runtime, including workers.
 * - Anything else goes to the caller's `decodeAudio` hook, or, in browsers,
 *   to `OfflineAudioContext.decodeAudioData` (MediaRecorder WebM/Opus, Safari
 *   `audio/mp4`, MP3, ...).
 */

import { normalizeMimeType } from '../../shared/audio.js';
import { SpeechConfigurationError } from '../../shared/errors.js';
import { raceAbort } from './abort.js';
import type { DecodedAudio, LocalAudioDecoder } from './types.js';

/** Sample rate expected by Whisper and Moonshine feature extractors. */
export const LOCAL_SAMPLE_RATE = 16_000;

const ADAPTER = 'local';

const WAV_MIME_TYPES = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/vnd.wave',
]);
const PCM_MIME_TYPES = new Set(['audio/pcm', 'audio/x-pcm', 'audio/raw']);

export interface DecodeToPcmOptions {
  /** Full MIME type including parameters (`audio/pcm;rate=16000`). */
  mimeType: string;
  /** Sample rate for raw PCM when the MIME type has no `rate` parameter. */
  sampleRate?: number;
  /** Channel count for raw PCM when the MIME type has no `channels` parameter. */
  channels?: number;
  decodeAudio?: LocalAudioDecoder;
  signal?: AbortSignal;
}

/**
 * Decodes `bytes` and returns 16 kHz mono Float32 samples.
 *
 * Raw PCM (`audio/pcm`) is little-endian signed 16-bit by default; pass
 * `encoding=f32le` for Float32. The rate comes from the `rate` MIME parameter
 * or `sampleRate`, the channel count from `channels` (default 1).
 */
export async function decodeToPcm16k(
  bytes: Uint8Array,
  options: DecodeToPcmOptions,
): Promise<Float32Array> {
  // Decoders (caller hooks, decodeAudioData) cannot be cancelled: stop waiting on abort.
  const decoded = await raceAbort(
    decodeAudioBytes(bytes, options),
    options.signal,
  );
  return toPcm16k(decoded);
}

/** Downmixes decoded audio to mono and resamples it to 16 kHz. */
export function toPcm16k(decoded: DecodedAudio): Float32Array {
  return resample(
    downmix(decoded.samples),
    decoded.sampleRate,
    LOCAL_SAMPLE_RATE,
  );
}

/**
 * True for WAV and raw PCM, which this module decodes itself in every
 * runtime, including Web Workers.
 */
export function isInProcessDecodable(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  const essence = normalizeMimeType(mimeType);
  return Boolean(
    (essence && (WAV_MIME_TYPES.has(essence) || PCM_MIME_TYPES.has(essence))) ||
      isRiffWave(bytes),
  );
}

/**
 * Decodes a format without an in-process decoder through the caller's
 * `decodeAudio` hook or, in browsers, `OfflineAudioContext`. Resolves
 * `undefined` when neither is available.
 */
export async function decodeExternally(
  bytes: Uint8Array,
  options: Omit<DecodeToPcmOptions, 'sampleRate' | 'channels'>,
): Promise<DecodedAudio | undefined> {
  if (options.decodeAudio) {
    const decoded = await options.decodeAudio({
      bytes,
      mimeType: options.mimeType,
      signal: options.signal,
    });
    assertDecodedAudio(decoded);
    return decoded;
  }

  if (hasOfflineAudioContext()) {
    return decodeWithAudioContext(bytes);
  }

  return undefined;
}

async function decodeAudioBytes(
  bytes: Uint8Array,
  options: DecodeToPcmOptions,
): Promise<DecodedAudio> {
  const essence = normalizeMimeType(options.mimeType);

  if ((essence && WAV_MIME_TYPES.has(essence)) || isRiffWave(bytes)) {
    return decodeWav(bytes);
  }

  if (essence && PCM_MIME_TYPES.has(essence)) {
    return decodeRawPcm(bytes, options);
  }

  const decoded = await decodeExternally(bytes, options);
  if (decoded) {
    return decoded;
  }

  throw new SpeechConfigurationError(
    `Cannot decode '${options.mimeType}' audio on this runtime: pass WAV or audio/pcm, ` +
      'or supply a decodeAudio hook (e.g. ffmpeg) for compressed formats',
    ADAPTER,
  );
}

function isRiffWave(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WAVE'
  );
}

/** Parses a RIFF/WAVE file into per-channel Float32 samples. */
export function decodeWav(bytes: Uint8Array): DecodedAudio {
  if (!isRiffWave(bytes)) {
    throw new SpeechConfigurationError(
      'Invalid WAV data: missing RIFF/WAVE header',
      ADAPTER,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: WavFormat | undefined;
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ') {
      format = readWavFormat(view, body, size);
    } else if (id === 'data') {
      if (!format) {
        throw new SpeechConfigurationError(
          'Invalid WAV data: data chunk before fmt chunk',
          ADAPTER,
        );
      }
      // Streamed WAVs may leave the size as 0 or 0xFFFFFFFF; clamp to the bytes we have.
      const available = bytes.byteLength - body;
      const length = size === 0 || size > available ? available : size;
      return {
        samples: deinterleave(
          bytes.subarray(body, body + length),
          format.channels,
          format.encoding,
        ),
        sampleRate: format.sampleRate,
      };
    }

    offset = body + size + (size % 2);
  }

  throw new SpeechConfigurationError(
    'Invalid WAV data: no data chunk',
    ADAPTER,
  );
}

type PcmEncoding = 'u8' | 's16le' | 's24le' | 's32le' | 'f32le' | 'f64le';

interface WavFormat {
  channels: number;
  sampleRate: number;
  encoding: PcmEncoding;
}

const WAVE_FORMAT_PCM = 1;
const WAVE_FORMAT_IEEE_FLOAT = 3;
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

function readWavFormat(view: DataView, body: number, size: number): WavFormat {
  if (size < 16) {
    throw new SpeechConfigurationError(
      'Invalid WAV data: fmt chunk too short',
      ADAPTER,
    );
  }

  let tag = view.getUint16(body, true);
  const channels = view.getUint16(body + 2, true);
  const sampleRate = view.getUint32(body + 4, true);
  const bitsPerSample = view.getUint16(body + 14, true);

  if (tag === WAVE_FORMAT_EXTENSIBLE && size >= 26) {
    // The first two bytes of the SubFormat GUID carry the real format tag.
    tag = view.getUint16(body + 24, true);
  }

  const encoding =
    tag === WAVE_FORMAT_PCM
      ? ({ 8: 'u8', 16: 's16le', 24: 's24le', 32: 's32le' } as const)[
          bitsPerSample
        ]
      : tag === WAVE_FORMAT_IEEE_FLOAT
        ? ({ 32: 'f32le', 64: 'f64le' } as const)[bitsPerSample]
        : undefined;

  if (!encoding || channels < 1 || sampleRate < 1) {
    throw new SpeechConfigurationError(
      `Unsupported WAV encoding (format ${tag}, ${bitsPerSample}-bit, ${channels} channels); ` +
        'use PCM or IEEE float, or supply a decodeAudio hook',
      ADAPTER,
    );
  }

  return { channels, sampleRate, encoding };
}

function decodeRawPcm(
  bytes: Uint8Array,
  options: DecodeToPcmOptions,
): DecodedAudio {
  const params = mimeParameters(options.mimeType);
  const sampleRate =
    positiveInteger(params.rate) ??
    explicitPositiveInteger(options.sampleRate, 'sampleRate');
  const channels =
    positiveInteger(params.channels) ??
    explicitPositiveInteger(options.channels, 'channels') ??
    1;
  const encoding = (params.encoding ?? 's16le').toLowerCase();

  if (!sampleRate) {
    throw new SpeechConfigurationError(
      "Raw PCM audio needs a sample rate: use 'audio/pcm;rate=16000' or AudioInput.sampleRate",
      ADAPTER,
    );
  }
  if (encoding !== 's16le' && encoding !== 'f32le') {
    throw new SpeechConfigurationError(
      `Unsupported raw PCM encoding '${encoding}' (expected s16le or f32le)`,
      ADAPTER,
    );
  }

  return {
    samples: deinterleave(bytes, channels, encoding),
    sampleRate,
  };
}

const BYTES_PER_SAMPLE: Record<PcmEncoding, number> = {
  u8: 1,
  s16le: 2,
  s24le: 3,
  s32le: 4,
  f32le: 4,
  f64le: 8,
};

function deinterleave(
  bytes: Uint8Array,
  channels: number,
  encoding: PcmEncoding,
): Float32Array[] {
  const width = BYTES_PER_SAMPLE[encoding];
  const frames = Math.floor(bytes.byteLength / (width * channels));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = Array.from(
    { length: channels },
    () => new Float32Array(frames),
  );

  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const at = (frame * channels + channel) * width;
      (output[channel] as Float32Array)[frame] = readSample(view, at, encoding);
    }
  }

  return output;
}

function readSample(view: DataView, at: number, encoding: PcmEncoding): number {
  switch (encoding) {
    case 'u8':
      return (view.getUint8(at) - 128) / 128;
    case 's16le':
      return view.getInt16(at, true) / 32_768;
    case 's24le': {
      const value =
        view.getUint8(at) |
        (view.getUint8(at + 1) << 8) |
        (view.getInt8(at + 2) << 16);
      return value / 8_388_608;
    }
    case 's32le':
      return view.getInt32(at, true) / 2_147_483_648;
    case 'f32le':
      return view.getFloat32(at, true);
    case 'f64le':
      return view.getFloat64(at, true);
  }
}

/** Averages channels into one mono track. */
export function downmix(samples: Float32Array | Float32Array[]): Float32Array {
  if (samples instanceof Float32Array) {
    return samples;
  }
  if (samples.length === 1) {
    return samples[0] as Float32Array;
  }

  const length = Math.min(...samples.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (const channel of samples) {
    for (let index = 0; index < length; index++) {
      (mono as Float32Array)[index] =
        (mono[index] as number) + (channel[index] as number) / samples.length;
    }
  }
  return mono;
}

/**
 * Resamples mono audio with linear interpolation. When downsampling, a box
 * filter one source period wide is applied first to limit aliasing; this is
 * adequate for speech recognition, not for music playback.
 */
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || samples.length === 0) {
    return samples;
  }

  const ratio = fromRate / toRate;
  const source = ratio > 1 ? boxFilter(samples, Math.round(ratio)) : samples;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(length);

  for (let index = 0; index < length; index++) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, source.length - 1);
    const fraction = position - left;
    output[index] =
      (source[left] as number) * (1 - fraction) +
      (source[right] as number) * fraction;
  }

  return output;
}

function boxFilter(samples: Float32Array, width: number): Float32Array {
  if (width <= 1) {
    return samples;
  }

  const output = new Float32Array(samples.length);
  const half = Math.floor(width / 2);
  let sum = 0;
  let count = 0;
  let start = 0;
  let end = 0;

  for (let index = 0; index < samples.length; index++) {
    const windowStart = Math.max(0, index - half);
    const windowEnd = Math.min(samples.length, index - half + width);
    while (end < windowEnd) {
      sum += samples[end] as number;
      count++;
      end++;
    }
    while (start < windowStart) {
      sum -= samples[start] as number;
      count--;
      start++;
    }
    output[index] = sum / count;
  }

  return output;
}

function hasOfflineAudioContext(): boolean {
  return typeof globalThis.OfflineAudioContext === 'function';
}

/**
 * Browser decode path. Decoding through a 16 kHz `OfflineAudioContext` makes
 * the browser resample with its own high-quality resampler. Not available in
 * Web Workers: decode on the main thread (see the worker client).
 */
async function decodeWithAudioContext(
  bytes: Uint8Array,
): Promise<DecodedAudio> {
  const context = new OfflineAudioContext(1, 1, LOCAL_SAMPLE_RATE);
  // decodeAudioData detaches its input, so hand it a private copy.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(copy.buffer);
  } catch (error) {
    throw new SpeechConfigurationError(
      `The browser could not decode the audio: ${errorMessage(error)}`,
      ADAPTER,
    );
  }

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  return { samples: channels, sampleRate: buffer.sampleRate };
}

function assertDecodedAudio(decoded: DecodedAudio): void {
  const channels =
    decoded?.samples instanceof Float32Array
      ? [decoded.samples]
      : decoded?.samples;
  if (
    !Array.isArray(channels) ||
    channels.length === 0 ||
    !channels.every((channel) => channel instanceof Float32Array) ||
    !(decoded.sampleRate > 0)
  ) {
    throw new SpeechConfigurationError(
      'decodeAudio must return { samples: Float32Array | Float32Array[], sampleRate }',
      ADAPTER,
    );
  }
}

function mimeParameters(mimeType: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const part of mimeType.split(';').slice(1)) {
    const [key, value] = part.split('=');
    if (key && value) {
      params[key.trim().toLowerCase()] = value.trim().replace(/^"|"$/g, '');
    }
  }
  return params;
}

function positiveInteger(value: string | undefined): number | undefined {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/** Validates a caller-supplied `AudioInput.sampleRate`/`channels`. */
function explicitPositiveInteger(
  value: number | undefined,
  name: 'sampleRate' | 'channels',
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new SpeechConfigurationError(
      `AudioInput.${name} must be a positive integer, got ${String(value)}`,
      ADAPTER,
    );
  }
  return value;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
