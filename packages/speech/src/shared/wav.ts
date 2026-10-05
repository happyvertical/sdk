/**
 * Pure, dependency-free 16-bit PCM WAV helpers. No Node APIs and no DOM: they
 * run in the browser, in Node and in workers. Exposed as
 * `@happyvertical/speech/pcm`.
 *
 * `parseWavPcm16` is strict because it reads untrusted bytes: every declared
 * size is checked against the buffer before it is trusted, nothing is
 * allocated from a declared (rather than present) size, and work is linear in
 * the input length.
 */

import { WavFormatError } from './errors.js';

const HEADER_BYTES = 44;
const MAX_UINT32 = 0xffff_ffff;
const FORMAT_PCM = 1;
const FORMAT_EXTENSIBLE = 0xfffe;
/** `KSDATAFORMAT_SUBTYPE_PCM` minus its leading format tag: 00000000-0010-8000-00AA-00389B71. */
const PCM_GUID_TAIL = [
  0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b,
  0x71,
];

/**
 * Converts float samples (-1..1) to 16-bit PCM (scale 32768, the inverse of
 * `pcm16ToFloat32`, so Int16 round-trips exactly). Clamps; NaN becomes 0.
 */
export function float32ToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index];
    if (Number.isNaN(value)) continue; // stays 0
    const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
    out[index] = Math.min(0x7fff, Math.round(clamped * 0x8000));
  }
  return out;
}

/** Converts 16-bit PCM to float samples in -1..1 (divides by 32768). */
export function pcm16ToFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    out[index] = samples[index] / 0x8000;
  }
  return out;
}

function assertSampleRate(sampleRate: number, what: string): void {
  // byteRate = sampleRate * 2 must fit an unsigned 32-bit field.
  if (
    !Number.isInteger(sampleRate) ||
    sampleRate < 1 ||
    sampleRate * 2 > MAX_UINT32
  ) {
    throw new WavFormatError(
      'invalid_argument',
      `${what} must be a positive integer sample rate (got ${String(sampleRate)})`,
    );
  }
}

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let index = 0; index < tag.length; index += 1) {
    view.setUint8(offset + index, tag.charCodeAt(index));
  }
}

/**
 * Encodes mono samples as a canonical 44-byte-header 16-bit PCM WAV. Float
 * input is clamped and converted; `Int16Array` is written as is.
 */
export function encodeWavPcm16(
  samples: Float32Array | Int16Array,
  sampleRate: number,
): Uint8Array {
  assertSampleRate(sampleRate, 'sampleRate');
  const dataBytes = samples.length * 2;
  if (dataBytes + HEADER_BYTES - 8 > MAX_UINT32) {
    throw new WavFormatError(
      'invalid_argument',
      'too many samples for a single WAV (4 GiB limit)',
    );
  }
  const pcm = samples instanceof Int16Array ? samples : float32ToPcm16(samples);
  const bytes = new Uint8Array(HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);
  writeTag(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeTag(view, 8, 'WAVE');
  writeTag(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, FORMAT_PCM, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(HEADER_BYTES + index * 2, pcm[index], true);
  }
  return bytes;
}

/** Constraints `parseWavPcm16` enforces on the declared format. */
export interface WavExpectation {
  /** Required sample rate in Hz. */
  sampleRate?: number;
  /** Required channel count. */
  channels?: number;
}

/** A validated 16-bit PCM WAV. */
export interface ParsedWavPcm16 {
  sampleRate: number;
  channels: number;
  /** Frames (one sample per channel). */
  frames: number;
  durationMs: number;
  /** Interleaved samples, decoded to native endianness (a copy). */
  samples: Int16Array;
  /** The little-endian PCM bytes, a view into the input. */
  data: Uint8Array;
}

function fail(
  reason: ConstructorParameters<typeof WavFormatError>[0],
  message: string,
): never {
  throw new WavFormatError(reason, message);
}

function tagAt(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

interface Fmt {
  channels: number;
  sampleRate: number;
}

function readFmt(
  view: DataView,
  bytes: Uint8Array,
  body: number,
  size: number,
): Fmt {
  if (size < 16) {
    fail('malformed_chunk', `fmt chunk is ${size} bytes; at least 16 required`);
  }
  let format = view.getUint16(body, true);
  const channels = view.getUint16(body + 2, true);
  const sampleRate = view.getUint32(body + 4, true);
  const byteRate = view.getUint32(body + 8, true);
  const blockAlign = view.getUint16(body + 12, true);
  const bits = view.getUint16(body + 14, true);

  if (format === FORMAT_EXTENSIBLE) {
    if (size < 40) {
      fail(
        'malformed_chunk',
        `WAVE_FORMAT_EXTENSIBLE fmt chunk is ${size} bytes; at least 40 required`,
      );
    }
    const cbSize = view.getUint16(body + 16, true);
    if (cbSize < 22 || 18 + cbSize > size) {
      fail(
        'malformed_chunk',
        `WAVE_FORMAT_EXTENSIBLE extension (${cbSize} bytes) is under 22 or runs past its fmt chunk`,
      );
    }
    const validBits = view.getUint16(body + 18, true);
    if (validBits !== 0 && validBits !== 16) {
      fail(
        'unsupported_bits',
        `WAVE_FORMAT_EXTENSIBLE valid bits is ${validBits}; only 16 supported`,
      );
    }
    const guid = body + 24;
    const subFormat = view.getUint16(guid, true);
    const tailMatches = PCM_GUID_TAIL.every(
      (byte, index) => bytes[guid + 2 + index] === byte,
    );
    if (subFormat !== FORMAT_PCM || !tailMatches) {
      fail('unsupported_format', 'WAVE_FORMAT_EXTENSIBLE subtype is not PCM');
    }
    format = FORMAT_PCM;
  }

  if (format !== FORMAT_PCM) {
    fail('unsupported_format', `WAV format tag ${format} is not PCM`);
  }
  if (bits !== 16) {
    fail(
      'unsupported_bits',
      `WAV is ${bits}-bit; only 16-bit PCM is supported`,
    );
  }
  if (channels < 1) {
    fail('inconsistent_header', 'WAV declares zero channels');
  }
  if (sampleRate < 1) {
    fail('inconsistent_header', 'WAV declares a zero sample rate');
  }
  if (blockAlign !== channels * 2) {
    fail(
      'inconsistent_header',
      `WAV block align ${blockAlign} is not channels x 2 (${channels * 2})`,
    );
  }
  if (byteRate !== sampleRate * blockAlign) {
    fail(
      'inconsistent_header',
      'WAV byte rate is not sample rate x block align',
    );
  }
  return { channels, sampleRate };
}

/**
 * Strictly parses a 16-bit PCM WAV. Rejects (with `WavFormatError`) anything
 * that is not a well-formed RIFF/WAVE with a `fmt ` chunk before its `data`
 * chunk, format tag 1 (or WAVE_FORMAT_EXTENSIBLE with the PCM subtype), 16
 * bits, a consistent header, and a declared data length that lies within the
 * buffer, is non-zero and is a whole number of frames. Nothing is clamped or
 * guessed. Every chunk inside the declared RIFF is bounds-checked, including
 * those after `data`; bytes beyond the RIFF are ignored.
 */
export function parseWavPcm16(
  bytes: Uint8Array,
  expect: WavExpectation = {},
): ParsedWavPcm16 {
  if (
    bytes.length < 12 ||
    tagAt(bytes, 0) !== 'RIFF' ||
    tagAt(bytes, 8) !== 'WAVE'
  ) {
    fail('not_riff', 'not a RIFF/WAVE file');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd < 12) {
    fail('malformed_chunk', 'RIFF size is too small');
  }
  if (riffEnd > bytes.length) {
    fail(
      'truncated',
      `RIFF declares ${riffEnd} bytes but only ${bytes.length} are present`,
    );
  }

  let fmt: Fmt | undefined;
  let dataAt: number | undefined;
  let dataSize = 0;
  let offset = 12;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) {
      fail('malformed_chunk', 'chunk header runs past the end of the RIFF');
    }
    const id = tagAt(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (body + size > riffEnd) {
      fail(
        'truncated',
        `${JSON.stringify(id)} chunk declares ${size} bytes but only ${riffEnd - body} remain`,
      );
    }

    if (id === 'fmt ') {
      if (fmt) fail('duplicate_fmt', 'WAV has more than one fmt chunk');
      fmt = readFmt(view, bytes, body, size);
      if (
        expect.sampleRate !== undefined &&
        fmt.sampleRate !== expect.sampleRate
      ) {
        fail(
          'rate_mismatch',
          `WAV is ${fmt.sampleRate} Hz; expected ${expect.sampleRate} Hz`,
        );
      }
      if (expect.channels !== undefined && fmt.channels !== expect.channels) {
        fail(
          'channel_mismatch',
          `WAV has ${fmt.channels} channel(s); expected ${expect.channels}`,
        );
      }
    } else if (id === 'data') {
      if (dataAt !== undefined) {
        fail('malformed_chunk', 'WAV has more than one data chunk');
      }
      if (!fmt)
        fail('data_before_fmt', 'WAV data chunk precedes its fmt chunk');
      if (size === 0) fail('empty_data', 'WAV data chunk is empty');
      const frameBytes = fmt.channels * 2;
      if (size % frameBytes !== 0) {
        fail(
          'misaligned_data',
          `WAV data (${size} bytes) is not a whole number of ${frameBytes}-byte frames`,
        );
      }
      dataAt = body;
      dataSize = size;
    }
    // RIFF chunks are word aligned: an odd size is followed by one pad byte,
    // which must also lie inside the RIFF.
    const next = body + size + (size % 2);
    if (next > riffEnd) {
      fail('truncated', `${JSON.stringify(id)} chunk is missing its pad byte`);
    }
    offset = next;
  }
  if (!fmt || dataAt === undefined) {
    return fail(
      fmt ? 'missing_data' : 'missing_fmt',
      fmt ? 'WAV has no data chunk' : 'WAV has no fmt chunk',
    );
  }
  // Every chunk inside the RIFF has now been bounds-checked; decode.
  const data = bytes.subarray(dataAt, dataAt + dataSize);
  const samples = new Int16Array(dataSize / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(dataAt + index * 2, true);
  }
  const frames = dataSize / (fmt.channels * 2);
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    frames,
    durationMs: Math.round((frames / fmt.sampleRate) * 1000),
    samples,
    data,
  };
}
