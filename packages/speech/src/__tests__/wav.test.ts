import { describe, expect, it } from 'vitest';
import {
  encodeWavPcm16,
  float32ToPcm16,
  MAX_RESAMPLE_OUTPUT_SAMPLES,
  parseWavPcm16,
  pcm16ToFloat32,
  resampleMono,
  WavFormatError,
} from '../pcm.js';

const PCM_GUID_TAIL = [
  0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b,
  0x71,
];

interface Chunk {
  id: string;
  body: Uint8Array;
  /** Declared size when it should differ from the body. */
  declared?: number;
}

function u16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}
function u32(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}
function tag(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function fmtBody(
  opts: {
    format?: number;
    channels?: number;
    rate?: number;
    bits?: number;
    align?: number;
    byteRate?: number;
  } = {},
): Uint8Array {
  const channels = opts.channels ?? 1;
  const rate = opts.rate ?? 16000;
  const bits = opts.bits ?? 16;
  const align = opts.align ?? channels * (bits / 8);
  return Uint8Array.from([
    ...u16(opts.format ?? 1),
    ...u16(channels),
    ...u32(rate),
    ...u32(opts.byteRate ?? rate * align),
    ...u16(align),
    ...u16(bits),
  ]);
}

function extensibleBody(
  subFormat = 1,
  tail = PCM_GUID_TAIL,
  validBits = 16,
): Uint8Array {
  return Uint8Array.from([
    ...fmtBody({ format: 0xfffe }),
    ...u16(22),
    ...u16(validBits),
    ...u32(4),
    ...u16(subFormat),
    ...tail,
  ]);
}

function build(chunks: Chunk[], opts: { riffSize?: number } = {}): Uint8Array {
  const parts: number[] = [];
  for (const chunk of chunks) {
    parts.push(
      ...tag(chunk.id),
      ...u32(chunk.declared ?? chunk.body.length),
      ...chunk.body,
    );
    if (chunk.body.length % 2) parts.push(0);
  }
  const riffSize = opts.riffSize ?? 4 + parts.length;
  return Uint8Array.from([
    ...tag('RIFF'),
    ...u32(riffSize),
    ...tag('WAVE'),
    ...parts,
  ]);
}

const dataBody = (frames: number) =>
  new Uint8Array(frames * 2).map((_, i) => i & 0x7f);
const good = () => [
  { id: 'fmt ', body: fmtBody() },
  { id: 'data', body: dataBody(8) },
];

function reasonOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(WavFormatError);
    return (error as WavFormatError).reason;
  }
  throw new Error('expected a WavFormatError');
}

describe('PCM conversion', () => {
  it('clamps, rounds and zeroes NaN when converting to PCM16', () => {
    const pcm = float32ToPcm16(
      Float32Array.from([0, 1, -1, 2, -2, Number.NaN, 0.5]),
    );
    expect([...pcm]).toEqual([0, 32767, -32768, 32767, -32768, 0, 16384]);
  });

  it('round-trips PCM16 through float', () => {
    const pcm = Int16Array.from([0, 1, -1, 12345, -32768, 32767]);
    expect([...float32ToPcm16(pcm16ToFloat32(pcm))]).toEqual([
      0, 1, -1, 12345, -32768, 32767,
    ]);
  });
});

describe('encodeWavPcm16 / parseWavPcm16', () => {
  it('round-trips float samples', () => {
    const input = Float32Array.from(
      { length: 160 },
      (_, i) => Math.sin(i / 7) * 0.8,
    );
    const wav = encodeWavPcm16(input, 16000);
    expect(wav.length).toBe(44 + 320);
    const parsed = parseWavPcm16(wav, { sampleRate: 16000, channels: 1 });
    expect(parsed).toMatchObject({
      sampleRate: 16000,
      channels: 1,
      frames: 160,
      durationMs: 10,
    });
    expect(parsed.data.length).toBe(320);
    for (const [i, s] of parsed.samples.entries()) {
      expect(Math.abs(s / 32768 - input[i])).toBeLessThan(1 / 16384);
    }
  });

  it('round-trips Int16 samples exactly', () => {
    const input = Int16Array.from([-32768, -1, 0, 1, 32767]);
    expect([...parseWavPcm16(encodeWavPcm16(input, 24000)).samples]).toEqual([
      ...input,
    ]);
  });

  it('parses a view with a byte offset', () => {
    const wav = encodeWavPcm16(Int16Array.from([5, 6]), 8000);
    const padded = new Uint8Array(wav.length + 3);
    padded.set(wav, 3);
    expect([...parseWavPcm16(padded.subarray(3)).samples]).toEqual([5, 6]);
  });

  it('skips unknown chunks, honouring odd-size padding, and ignores trailing bytes', () => {
    const wav = build([
      { id: 'LIST', body: Uint8Array.from([1, 2, 3]) },
      { id: 'fmt ', body: fmtBody() },
      { id: 'junk', body: Uint8Array.from([9]) },
      { id: 'data', body: dataBody(4) },
    ]);
    const withTrailing = Uint8Array.from([...wav, 1, 2, 3]);
    expect(parseWavPcm16(withTrailing).frames).toBe(4);
  });

  it('accepts WAVE_FORMAT_EXTENSIBLE with the PCM subtype', () => {
    const wav = build([
      { id: 'fmt ', body: extensibleBody() },
      { id: 'data', body: dataBody(4) },
    ]);
    expect(parseWavPcm16(wav).frames).toBe(4);
  });

  it('accepts stereo when not constrained and rejects it when mono is expected', () => {
    const wav = build([
      { id: 'fmt ', body: fmtBody({ channels: 2 }) },
      { id: 'data', body: dataBody(8) },
    ]);
    expect(parseWavPcm16(wav)).toMatchObject({ channels: 2, frames: 4 });
    expect(reasonOf(() => parseWavPcm16(wav, { channels: 1 }))).toBe(
      'channel_mismatch',
    );
  });

  it('rejects a mismatched sample rate', () => {
    expect(
      reasonOf(() => parseWavPcm16(build(good()), { sampleRate: 24000 })),
    ).toBe('rate_mismatch');
  });

  it('rejects invalid encode arguments', () => {
    for (const rate of [0, -1, 1.5, Number.NaN, 2 ** 31]) {
      expect(reasonOf(() => encodeWavPcm16(new Float32Array(1), rate))).toBe(
        'invalid_argument',
      );
    }
  });
});

describe('parseWavPcm16 hostile input', () => {
  it('rejects non-WAV and short input', () => {
    expect(reasonOf(() => parseWavPcm16(new Uint8Array(0)))).toBe('not_riff');
    expect(reasonOf(() => parseWavPcm16(Uint8Array.from(tag('RIFF'))))).toBe(
      'not_riff',
    );
    expect(
      reasonOf(() =>
        parseWavPcm16(
          Uint8Array.from([...tag('RIFX'), ...u32(4), ...tag('WAVE')]),
        ),
      ),
    ).toBe('not_riff');
    expect(
      reasonOf(() =>
        parseWavPcm16(
          Uint8Array.from([...tag('RIFF'), ...u32(4), ...tag('AVI ')]),
        ),
      ),
    ).toBe('not_riff');
  });

  it('rejects a header cut at every length', () => {
    const wav = encodeWavPcm16(new Float32Array(16), 16000);
    for (let length = 0; length < wav.length; length += 1) {
      expect(() => parseWavPcm16(wav.subarray(0, length))).toThrow(
        WavFormatError,
      );
    }
  });

  it('rejects a RIFF size beyond the buffer, including 0xFFFFFFFF', () => {
    expect(
      reasonOf(() => parseWavPcm16(build(good(), { riffSize: 0xffffffff }))),
    ).toBe('truncated');
    expect(reasonOf(() => parseWavPcm16(build(good(), { riffSize: 4 })))).toBe(
      'missing_fmt',
    );
    expect(reasonOf(() => parseWavPcm16(build(good(), { riffSize: 2 })))).toBe(
      'malformed_chunk',
    );
  });

  it('rejects a data chunk declaring more than is present, huge or slightly over', () => {
    for (const declared of [0xffffffff, 0x7fffffff, 17]) {
      const wav = build([
        { id: 'fmt ', body: fmtBody() },
        { id: 'data', body: dataBody(8), declared },
      ]);
      expect(reasonOf(() => parseWavPcm16(wav))).toBe('truncated');
    }
  });

  it('rejects a truncated buffer whose RIFF header still claims the full size', () => {
    const wav = build(good());
    expect(reasonOf(() => parseWavPcm16(wav.subarray(0, wav.length - 1)))).toBe(
      'truncated',
    );
  });

  it('does not allocate from a declared size', () => {
    const wav = build(
      [
        { id: 'fmt ', body: fmtBody() },
        { id: 'data', body: new Uint8Array(0), declared: 0xfffffff0 },
      ],
      { riffSize: 0xfffffff0 },
    );
    expect(reasonOf(() => parseWavPcm16(wav))).toBe('truncated');
  });

  it('rejects zero-length data', () => {
    const wav = build([
      { id: 'fmt ', body: fmtBody() },
      { id: 'data', body: new Uint8Array(0) },
    ]);
    expect(reasonOf(() => parseWavPcm16(wav))).toBe('empty_data');
  });

  it('rejects data that is not frame aligned', () => {
    const odd = build([
      { id: 'fmt ', body: fmtBody() },
      { id: 'data', body: new Uint8Array(7) },
    ]);
    expect(reasonOf(() => parseWavPcm16(odd))).toBe('misaligned_data');
    const stereo = build([
      { id: 'fmt ', body: fmtBody({ channels: 2 }) },
      { id: 'data', body: new Uint8Array(6) },
    ]);
    expect(reasonOf(() => parseWavPcm16(stereo))).toBe('misaligned_data');
  });

  it('rejects data before fmt, a missing fmt, a missing data, and a duplicate fmt', () => {
    const [fmt, data] = good();
    expect(reasonOf(() => parseWavPcm16(build([data, fmt])))).toBe(
      'data_before_fmt',
    );
    expect(reasonOf(() => parseWavPcm16(build([data])))).toBe(
      'data_before_fmt',
    );
    expect(
      reasonOf(() =>
        parseWavPcm16(build([{ id: 'LIST', body: new Uint8Array(4) }])),
      ),
    ).toBe('missing_fmt');
    expect(reasonOf(() => parseWavPcm16(build([fmt])))).toBe('missing_data');
    expect(reasonOf(() => parseWavPcm16(build([fmt, fmt, data])))).toBe(
      'duplicate_fmt',
    );
  });

  it('rejects a short fmt chunk and a chunk header cut off at the RIFF end', () => {
    expect(
      reasonOf(() =>
        parseWavPcm16(
          build([{ id: 'fmt ', body: new Uint8Array(14) }, good()[1]]),
        ),
      ),
    ).toBe('malformed_chunk');
    const wav = Uint8Array.from([...build(good()), 1, 2, 3]);
    const view = new DataView(wav.buffer);
    view.setUint32(4, wav.length - 8, true);
    // data chunk found first, so trailing garbage inside RIFF is never read
    expect(parseWavPcm16(wav).frames).toBe(8);
    const noData = build([
      { id: 'fmt ', body: fmtBody() },
      { id: 'xxxx', body: new Uint8Array(0) },
    ]);
    const cut = Uint8Array.from([...noData, 1, 2, 3]);
    new DataView(cut.buffer).setUint32(4, cut.length - 8, true);
    expect(reasonOf(() => parseWavPcm16(cut))).toBe('malformed_chunk');
  });

  it('rejects wrong bit depth, format tag, rate and channels', () => {
    const one = (opts: Parameters<typeof fmtBody>[0]) =>
      build([{ id: 'fmt ', body: fmtBody(opts) }, good()[1]]);
    expect(reasonOf(() => parseWavPcm16(one({ bits: 8 })))).toBe(
      'unsupported_bits',
    );
    expect(reasonOf(() => parseWavPcm16(one({ bits: 24 })))).toBe(
      'unsupported_bits',
    );
    expect(reasonOf(() => parseWavPcm16(one({ format: 3 })))).toBe(
      'unsupported_format',
    );
    expect(reasonOf(() => parseWavPcm16(one({ format: 0x55 })))).toBe(
      'unsupported_format',
    );
    expect(
      reasonOf(() =>
        parseWavPcm16(one({ channels: 0, align: 0, byteRate: 0 })),
      ),
    ).toBe('inconsistent_header');
    expect(reasonOf(() => parseWavPcm16(one({ rate: 0, byteRate: 0 })))).toBe(
      'inconsistent_header',
    );
    expect(reasonOf(() => parseWavPcm16(one({ align: 4 })))).toBe(
      'inconsistent_header',
    );
    expect(reasonOf(() => parseWavPcm16(one({ byteRate: 1 })))).toBe(
      'inconsistent_header',
    );
  });

  it('rejects WAVE_FORMAT_EXTENSIBLE with a non-PCM subtype or a bad GUID tail', () => {
    const wrap = (body: Uint8Array) => build([{ id: 'fmt ', body }, good()[1]]);
    expect(reasonOf(() => parseWavPcm16(wrap(extensibleBody(3))))).toBe(
      'unsupported_format',
    ); // IEEE float
    expect(
      reasonOf(() =>
        parseWavPcm16(
          wrap(extensibleBody(1, [...PCM_GUID_TAIL.slice(0, 13), 0x72])),
        ),
      ),
    ).toBe('unsupported_format');
    expect(
      reasonOf(() => parseWavPcm16(wrap(extensibleBody(1, PCM_GUID_TAIL, 24)))),
    ).toBe('unsupported_bits');
    expect(
      reasonOf(() => parseWavPcm16(wrap(extensibleBody().subarray(0, 30)))),
    ).toBe('malformed_chunk');
  });

  it('stays linear on many tiny chunks', () => {
    const chunks: Chunk[] = [{ id: 'fmt ', body: fmtBody() }];
    for (let i = 0; i < 50_000; i += 1)
      chunks.push({ id: 'pad ', body: new Uint8Array(0) });
    chunks.push({ id: 'data', body: dataBody(2) });
    const started = Date.now();
    expect(parseWavPcm16(build(chunks)).frames).toBe(2);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('resampleMono', () => {
  const tone = (freq: number, rate: number, seconds: number) =>
    Float32Array.from(
      { length: Math.floor(rate * seconds) },
      (_, i) => Math.sin((2 * Math.PI * freq * i) / rate) * 0.5,
    );

  /** Frequency estimated from rising zero crossings over the middle of the signal. */
  function estimateFrequency(samples: Float32Array, rate: number): number {
    const from = Math.floor(samples.length * 0.1);
    const to = Math.floor(samples.length * 0.9);
    const crossings: number[] = [];
    for (let i = from + 1; i < to; i += 1) {
      if (samples[i - 1] < 0 && samples[i] >= 0) {
        crossings.push(i - 1 + -samples[i - 1] / (samples[i] - samples[i - 1]));
      }
    }
    return (
      ((crossings.length - 1) * rate) /
      (crossings[crossings.length - 1] - crossings[0])
    );
  }

  const rms = (s: Float32Array, a: number, b: number) => {
    let sum = 0;
    for (let i = a; i < b; i += 1) sum += s[i] * s[i];
    return Math.sqrt(sum / (b - a));
  };

  it('returns a copy at equal rates', () => {
    const input = Float32Array.from([1, 2, 3]);
    const out = resampleMono(input, 16000, 16000);
    expect([...out]).toEqual([1, 2, 3]);
    expect(out).not.toBe(input);
  });

  it('produces floor(n * to / from) samples', () => {
    expect(resampleMono(new Float32Array(48000), 48000, 16000).length).toBe(
      16000,
    );
    expect(resampleMono(new Float32Array(44100), 44100, 16000).length).toBe(
      16000,
    );
    expect(resampleMono(new Float32Array(16000), 16000, 24000).length).toBe(
      24000,
    );
    expect(resampleMono(new Float32Array(0), 48000, 16000).length).toBe(0);
    expect(resampleMono(new Float32Array(2), 48000, 16000).length).toBe(0);
  });

  it('keeps a 440 Hz tone at 440 Hz and its level when 48k -> 16k', () => {
    const out = resampleMono(tone(440, 48000, 1), 48000, 16000);
    expect(Math.abs(estimateFrequency(out, 16000) - 440)).toBeLessThan(1);
    expect(rms(out, 2000, 14000)).toBeGreaterThan((0.5 / Math.SQRT2) * 0.97);
    expect(rms(out, 2000, 14000)).toBeLessThan((0.5 / Math.SQRT2) * 1.03);
  });

  it('keeps a 440 Hz tone when upsampling 16k -> 24k and 44.1k -> 16k', () => {
    expect(
      Math.abs(
        estimateFrequency(
          resampleMono(tone(440, 16000, 1), 16000, 24000),
          24000,
        ) - 440,
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs(
        estimateFrequency(
          resampleMono(tone(440, 44100, 1), 44100, 16000),
          16000,
        ) - 440,
      ),
    ).toBeLessThan(1);
  });

  it('attenuates content above the target Nyquist instead of aliasing it', () => {
    // 12 kHz at 48 kHz would alias to 4 kHz at 16 kHz without a low-pass.
    const out = resampleMono(tone(12000, 48000, 1), 48000, 16000);
    expect(rms(out, 2000, 14000)).toBeLessThan(0.01);
  });

  it('preserves DC, including at the edges', () => {
    const out = resampleMono(new Float32Array(4800).fill(0.25), 48000, 16000);
    for (const i of [0, 1, out.length - 1]) expect(out[i]).toBeCloseTo(0.25, 4);
  });

  it('rejects invalid rates and unbounded output', () => {
    for (const [from, to] of [
      [0, 16000],
      [16000, 0],
      [-1, 1],
      [Number.NaN, 1],
      [1, Number.POSITIVE_INFINITY],
    ]) {
      expect(reasonOf(() => resampleMono(new Float32Array(4), from, to))).toBe(
        'invalid_argument',
      );
    }
    expect(MAX_RESAMPLE_OUTPUT_SAMPLES).toBeGreaterThan(0);
    expect(reasonOf(() => resampleMono(new Float32Array(1000), 1, 1e12))).toBe(
      'invalid_argument',
    );
  });
});
