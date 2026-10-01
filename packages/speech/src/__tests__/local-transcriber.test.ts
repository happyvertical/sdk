// biome-ignore-all lint/style/useNamingConvention: Fixtures mirror transformers.js snake_case options and HAVE_SPEECH_* env keys.
/**
 * Unit tests for the on-device (`local`) transcriber. transformers.js is
 * replaced by an injected fake, so no model is ever downloaded.
 */

import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeWav, downmix, resample } from '../adapters/local/audio.js';
import { resolveLocalTranscriberOptions } from '../adapters/local/env.js';
import { detectAutoDevice } from '../adapters/local/runtime.js';
import {
  getAvailableSpeechAdapters,
  getSpeech,
  getTranscriber,
  SpeechConfigurationError,
  SpeechProviderError,
  type SpeechUsage,
} from '../index.js';
import {
  createLocalTranscriber,
  DEFAULT_LOCAL_MODEL,
  decodeToPcm16k,
  LOCAL_TRANSCRIBER_ENV_KEYS,
  LocalTranscriber,
  type LocalTranscriberOptions,
  LocalTranscriberWorkerClient,
  type LocalTranscriberWorkerClientOptions,
  type LocalWorkerEndpoint,
  serveLocalTranscriber,
} from '../local.js';

interface FakePipelineCall {
  samples: Float32Array;
  options: Record<string, unknown>;
}

interface FakeTransformersOptions {
  output?: unknown;
  modelType?: string;
  /** Throw from `pipeline()` for these devices. */
  failDevices?: string[];
  /** Delay inference until this promise settles. */
  inferenceGate?: Promise<void>;
}

function fakeTransformers(options: FakeTransformersOptions = {}) {
  const calls: FakePipelineCall[] = [];
  const interrupts: number[] = [];
  const env: Record<string, unknown> = {
    remoteHost: 'https://huggingface.co/',
  };
  const disposed: string[] = [];

  class InterruptableStoppingCriteria {
    interrupted = false;
    interrupt() {
      this.interrupted = true;
      interrupts.push(Date.now());
    }
  }

  const pipeline = vi.fn(
    async (
      _task: string,
      model: string,
      pipelineOptions: Record<string, unknown>,
    ) => {
      const device = pipelineOptions.device as string;
      if (options.failDevices?.includes(device)) {
        throw new Error(`device ${device} unavailable`);
      }
      const asr = Object.assign(
        async (samples: Float32Array, callOptions: Record<string, unknown>) => {
          calls.push({ samples, options: callOptions });
          if (options.inferenceGate) {
            await options.inferenceGate;
          }
          return options.output ?? { text: ' Hello world. ' };
        },
        {
          model: { config: { model_type: options.modelType ?? 'whisper' } },
          dispose: vi.fn(async () => {
            disposed.push(model);
          }),
        },
      );
      return asr;
    },
  );

  return {
    module: { pipeline, env, InterruptableStoppingCriteria },
    pipeline,
    calls,
    interrupts,
    env,
    disposed,
  };
}

/** Builds a RIFF/WAVE file from per-channel samples in [-1, 1]. */
function wav(
  channels: number[][],
  sampleRate: number,
  encoding: 'pcm16' | 'pcm24' | 'float32' | 'pcm8' = 'pcm16',
  { extensible = false }: { extensible?: boolean } = {},
): Uint8Array {
  const bits = { pcm8: 8, pcm16: 16, pcm24: 24, float32: 32 }[encoding];
  const width = bits / 8;
  const frames = channels[0]?.length ?? 0;
  const dataSize = frames * channels.length * width;
  const fmtSize = extensible ? 40 : 16;
  const buffer = new ArrayBuffer(12 + 8 + fmtSize + 8 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  const tag = encoding === 'float32' ? 3 : 1;

  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, fmtSize, true);
  view.setUint16(20, extensible ? 0xfffe : tag, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * width, true);
  view.setUint16(32, channels.length * width, true);
  view.setUint16(34, bits, true);
  if (extensible) {
    view.setUint16(36, 22, true);
    view.setUint16(38, bits, true);
    view.setUint32(40, 0, true);
    view.setUint16(44, tag, true);
  }
  const dataOffset = 20 + fmtSize;
  text(dataOffset, 'data');
  view.setUint32(dataOffset + 4, dataSize, true);

  let at = dataOffset + 8;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      const sample = channel[frame] ?? 0;
      if (encoding === 'pcm16') {
        view.setInt16(at, Math.round(sample * 32_767), true);
      } else if (encoding === 'pcm8') {
        view.setUint8(at, Math.round(sample * 127) + 128);
      } else if (encoding === 'pcm24') {
        const value = Math.round(sample * 8_388_607);
        view.setUint8(at, value & 0xff);
        view.setUint8(at + 1, (value >> 8) & 0xff);
        view.setInt8(at + 2, value >> 16);
      } else {
        view.setFloat32(at, sample, true);
      }
      at += width;
    }
  }
  return bytes;
}

/** `seconds` of a constant-value mono signal. */
function tone(seconds: number, sampleRate: number, value = 0.5) {
  return Array.from({ length: Math.round(seconds * sampleRate) }, () => value);
}

const MODEL = 'onnx-community/whisper-tiny.en';

function localTranscriber(
  fake: ReturnType<typeof fakeTransformers>,
  options: LocalTranscriberOptions = {},
) {
  return createLocalTranscriber(
    { model: MODEL, transformers: fake.module, ...options },
    { env: {} },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local transcriber: factory and environment', () => {
  it('registers type local with getTranscriber() and lists it as available', async () => {
    expect(getAvailableSpeechAdapters().transcribers).toContain('local');

    const fake = fakeTransformers();
    const transcriber = await getTranscriber(
      { type: 'local', model: MODEL, transformers: fake.module },
      { env: {} },
    );

    expect(transcriber).toBeInstanceOf(LocalTranscriber);
    expect(transcriber.type).toBe('local');
    // Construction is lazy: no model load until the first call.
    expect(fake.pipeline).not.toHaveBeenCalled();
  });

  it('selects local from HAVE_SPEECH_TRANSCRIBER_TYPE without a baseUrl', async () => {
    const fake = fakeTransformers();
    const speech = await getSpeech(
      { synthesizer: false },
      {
        env: {
          HAVE_SPEECH_TRANSCRIBER_TYPE: 'local',
          HAVE_SPEECH_TRANSCRIBER_MODEL: 'onnx-community/moonshine-tiny-ONNX',
        },
      },
    );
    expect(speech.transcriber?.type).toBe('local');

    // The env-built transcriber cannot see an injected runtime, so check its
    // resolved options instead of running it.
    const resolved = resolveLocalTranscriberOptions(
      { transformers: fake.module },
      {
        env: {
          HAVE_SPEECH_TRANSCRIBER_MODEL: 'onnx-community/moonshine-tiny-ONNX',
        },
      },
    );
    expect(resolved.model).toBe('onnx-community/moonshine-tiny-ONNX');
  });

  it('reads device, dtype, cache dir, model host, and max bytes from the environment', () => {
    const resolved = resolveLocalTranscriberOptions(
      {},
      {
        env: {
          HAVE_SPEECH_TRANSCRIBER_MODEL: 'onnx-community/whisper-small',
          HAVE_SPEECH_TRANSCRIBER_DEVICE: 'cuda',
          HAVE_SPEECH_TRANSCRIBER_DTYPE: 'fp16',
          HAVE_SPEECH_TRANSCRIBER_CACHE_DIR: '/var/cache/models',
          HAVE_SPEECH_TRANSCRIBER_MODEL_HOST: 'https://models.internal/',
          HAVE_SPEECH_TRANSCRIBER_MAX_BYTES: '1000',
        },
      },
    );

    expect(resolved).toMatchObject({
      type: 'local',
      model: 'onnx-community/whisper-small',
      device: 'cuda',
      dtype: 'fp16',
      cacheDir: '/var/cache/models',
      modelHost: 'https://models.internal/',
      maxBytes: 1000,
    });
    expect(LOCAL_TRANSCRIBER_ENV_KEYS.device).toEqual([
      'HAVE_SPEECH_TRANSCRIBER_DEVICE',
    ]);
  });

  it('lets explicit options win over the environment', () => {
    const resolved = resolveLocalTranscriberOptions(
      {
        model: 'explicit/model',
        device: 'wasm',
        dtype: 'q4',
        cacheDir: '/explicit',
        modelHost: 'https://explicit/',
        maxBytes: 5,
      },
      {
        env: {
          HAVE_SPEECH_TRANSCRIBER_MODEL: 'env/model',
          HAVE_SPEECH_TRANSCRIBER_DEVICE: 'cuda',
          HAVE_SPEECH_TRANSCRIBER_DTYPE: 'fp16',
          HAVE_SPEECH_TRANSCRIBER_CACHE_DIR: '/env',
          HAVE_SPEECH_TRANSCRIBER_MODEL_HOST: 'https://env/',
          HAVE_SPEECH_TRANSCRIBER_MAX_BYTES: '1000',
        },
      },
    );

    expect(resolved).toMatchObject({
      model: 'explicit/model',
      device: 'wasm',
      dtype: 'q4',
      cacheDir: '/explicit',
      modelHost: 'https://explicit/',
      maxBytes: 5,
    });
  });

  it('defaults to onnx-community/whisper-base', async () => {
    const fake = fakeTransformers();
    const transcriber = createLocalTranscriber(
      { transformers: fake.module },
      { env: {} },
    );
    await transcriber.transcribe({ audio: wav([tone(1, 16_000)], 16_000) });

    expect(DEFAULT_LOCAL_MODEL).toBe('onnx-community/whisper-base');
    expect(fake.pipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      'onnx-community/whisper-base',
      expect.any(Object),
    );
  });
});

describe('local transcriber: model loading', () => {
  it('passes device, dtype, revision, cache dir, and progress callback to the pipeline', async () => {
    const fake = fakeTransformers();
    const onProgress = vi.fn();
    const transcriber = localTranscriber(fake, {
      device: 'cpu',
      dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      revision: 'v1',
      cacheDir: '/tmp/models',
      onProgress,
    });

    await transcriber.preload();

    expect(fake.pipeline).toHaveBeenCalledWith(
      'automatic-speech-recognition',
      MODEL,
      {
        device: 'cpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
        revision: 'v1',
        cache_dir: '/tmp/models',
        progress_callback: onProgress,
      },
    );
  });

  it('resolves device auto to cpu in Node', async () => {
    const fake = fakeTransformers();
    await localTranscriber(fake).preload();

    expect(fake.pipeline.mock.calls[0]?.[2]).toEqual({ device: 'cpu' });
  });

  it('resolves device auto to webgpu in a browser with a GPU adapter, falling back to wasm', async () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: async () => ({}) },
    });
    expect(await detectAutoDevice()).toBe('webgpu');

    const fake = fakeTransformers({ failDevices: ['webgpu'] });
    await localTranscriber(fake).preload();

    expect(fake.pipeline.mock.calls.map((call) => call[2].device)).toEqual([
      'webgpu',
      'wasm',
    ]);
  });

  it('uses wasm in a browser without WebGPU, and never falls back from an explicit device', async () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('navigator', {});
    expect(await detectAutoDevice()).toBe('wasm');

    vi.stubGlobal('navigator', {
      gpu: { requestAdapter: async () => null },
    });
    expect(await detectAutoDevice()).toBe('wasm');

    const fake = fakeTransformers({ failDevices: ['webgpu'] });
    await expect(
      localTranscriber(fake, { device: 'webgpu' }).preload(),
    ).rejects.toBeInstanceOf(SpeechProviderError);
    expect(fake.pipeline).toHaveBeenCalledTimes(1);
  });

  it('applies modelHost and configureEnv to the transformers env before loading', async () => {
    const fake = fakeTransformers();
    const configureEnv = vi.fn((env: Record<string, unknown>) => {
      env.allowRemoteModels = false;
    });

    await localTranscriber(fake, {
      modelHost: 'https://models.example.com/',
      configureEnv,
    }).preload();

    expect(fake.env.remoteHost).toBe('https://models.example.com/');
    expect(fake.env.allowRemoteModels).toBe(false);
    expect(configureEnv).toHaveBeenCalledWith(fake.env);
  });

  it('loads each model once, caches it, and retries after a failed load', async () => {
    const fake = fakeTransformers();
    const transcriber = localTranscriber(fake);
    const audio = wav([tone(1, 16_000)], 16_000);

    await transcriber.transcribe({ audio });
    await transcriber.transcribe({ audio });
    await transcriber.transcribe({ audio, model: 'other/model' });
    expect(fake.pipeline.mock.calls.map((call) => call[1])).toEqual([
      MODEL,
      'other/model',
    ]);

    fake.pipeline.mockRejectedValueOnce(new Error('network down'));
    const failing = localTranscriber(fake);
    await expect(failing.preload()).rejects.toThrow(
      /Failed to load local model .*network down/,
    );
    await expect(failing.preload()).resolves.toBeUndefined();

    await transcriber.dispose();
    expect(fake.disposed).toEqual([MODEL, 'other/model']);
  });

  it('accepts a loader function and a CommonJS-style default export', async () => {
    const fake = fakeTransformers();
    const transcriber = localTranscriber(fake, {
      transformers: async () => ({ default: fake.module }),
    });

    await transcriber.preload();
    expect(fake.pipeline).toHaveBeenCalledTimes(1);
  });

  it('rejects a module without pipeline()', async () => {
    const transcriber = localTranscriber(fakeTransformers(), {
      transformers: { env: {} },
    });

    await expect(transcriber.preload()).rejects.toBeInstanceOf(
      SpeechConfigurationError,
    );
  });
});

describe('local transcriber: results and usage', () => {
  it('returns trimmed text, duration, model, and usage, and reports usage in order', async () => {
    const fake = fakeTransformers();
    const order: string[] = [];
    const adapterUsage = vi.fn((_usage: SpeechUsage) => {
      order.push('adapter');
    });
    const requestUsage = vi.fn((_usage: SpeechUsage) => {
      order.push('request');
    });
    const audio = wav([tone(2, 16_000)], 16_000);
    const transcriber = localTranscriber(fake, { onUsage: adapterUsage });

    const result = await transcriber.transcribe({
      audio,
      mimeType: 'audio/wav',
      onUsage: requestUsage,
    });

    const usage: SpeechUsage = {
      operation: 'transcription',
      provider: 'local',
      model: MODEL,
      audioSeconds: 2,
      bytes: audio.byteLength,
    };
    expect(result).toMatchObject({
      text: 'Hello world.',
      durationSeconds: 2,
      provider: 'local',
      model: MODEL,
      usage,
    });
    expect(adapterUsage).toHaveBeenCalledWith(usage);
    expect(requestUsage).toHaveBeenCalledWith(usage);
    expect(order).toEqual(['adapter', 'request']);
  });

  it('maps segment timestamps onto segments', async () => {
    const fake = fakeTransformers({
      output: {
        text: ' Hello there. General Kenobi.',
        chunks: [
          { text: ' Hello there.', timestamp: [0, 1.5] },
          { text: ' General Kenobi.', timestamp: [1.5, null] },
        ],
      },
    });

    const result = await localTranscriber(fake).transcribe({
      audio: wav([tone(3, 16_000)], 16_000),
      timestampGranularities: ['segment'],
    });

    expect(fake.calls[0]?.options.return_timestamps).toBe(true);
    expect(result.segments).toEqual([
      { text: 'Hello there.', startSeconds: 0, endSeconds: 1.5 },
      { text: 'General Kenobi.', startSeconds: 1.5, endSeconds: undefined },
    ]);
    expect(result.words).toBeUndefined();
  });

  it('maps word timestamps onto words', async () => {
    const fake = fakeTransformers({
      output: {
        text: ' Hello world',
        chunks: [
          { text: ' Hello', timestamp: [0, 0.5] },
          { text: ' world', timestamp: [0.5, null] },
        ],
      },
    });

    const result = await localTranscriber(fake).transcribe({
      audio: wav([tone(1, 16_000)], 16_000),
      timestampGranularities: ['segment', 'word'],
    });

    expect(fake.calls[0]?.options.return_timestamps).toBe('word');
    expect(result.words).toEqual([
      { word: 'Hello', startSeconds: 0, endSeconds: 0.5 },
      { word: 'world', startSeconds: 0.5, endSeconds: 0.5 },
    ]);
    expect(result.segments).toBeUndefined();
  });

  it('sends whisper language and chunking only when needed', async () => {
    const fake = fakeTransformers();
    const transcriber = localTranscriber(fake);

    await transcriber.transcribe({ audio: wav([tone(1, 16_000)], 16_000) });
    expect(fake.calls[0]?.options).toEqual({});

    await transcriber.transcribe({
      audio: wav([tone(31, 8_000)], 8_000),
      language: 'fr',
    });
    expect(fake.calls[1]?.options).toEqual({
      chunk_length_s: 30,
      language: 'fr',
      task: 'transcribe',
    });

    const unchunked = localTranscriber(fake, { chunkLengthSeconds: 0 });
    await unchunked.transcribe({ audio: wav([tone(31, 8_000)], 8_000) });
    expect(fake.calls[2]?.options).toEqual({});
  });

  it('does not send whisper-only options to Moonshine', async () => {
    const fake = fakeTransformers({ modelType: 'moonshine' });

    const result = await localTranscriber(fake).transcribe({
      audio: wav([tone(31, 8_000)], 8_000),
      language: 'en',
      timestampGranularities: ['word'],
    });

    expect(fake.calls[0]?.options).toEqual({});
    expect(result.text).toBe('Hello world.');
  });

  it('wraps inference failures in SpeechProviderError', async () => {
    const fake = fakeTransformers();
    const transcriber = localTranscriber(fake);
    await transcriber.preload();
    const asr = await fake.pipeline.mock.results[0]?.value;
    const failing = Object.assign(
      async () => {
        throw new Error('onnx exploded');
      },
      { model: asr.model },
    );
    fake.pipeline.mockResolvedValueOnce(failing);

    await expect(
      transcriber.transcribe({
        audio: wav([tone(1, 16_000)], 16_000),
        model: 'failing/model',
      }),
    ).rejects.toThrow(/Local transcription failed: onnx exploded/);
  });

  it('hints at timestamped models when word timestamps are unsupported', async () => {
    const fake = fakeTransformers();
    fake.pipeline.mockResolvedValueOnce(
      Object.assign(
        async () => {
          throw new Error('Model outputs must contain cross attentions');
        },
        { model: { config: { model_type: 'whisper' } } },
      ),
    );

    await expect(
      localTranscriber(fake).transcribe({
        audio: wav([tone(1, 16_000)], 16_000),
        timestampGranularities: ['word'],
      }),
    ).rejects.toThrow(/whisper-base_timestamped/);
  });
});

describe('local transcriber: audio input', () => {
  it('accepts Blob, Buffer, ArrayBuffer, and ReadableStream WAV input', async () => {
    const fake = fakeTransformers();
    const transcriber = localTranscriber(fake);
    const bytes = wav([tone(1, 16_000)], 16_000);

    await transcriber.transcribe({
      audio: new Blob([bytes], { type: 'audio/wav' }),
    });
    await transcriber.transcribe({ audio: Buffer.from(bytes) });
    await transcriber.transcribe({ audio: bytes.slice().buffer });
    await transcriber.transcribe({
      audio: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 100));
          controller.enqueue(bytes.subarray(100));
          controller.close();
        },
      }),
    });

    expect(fake.calls).toHaveLength(4);
    for (const call of fake.calls) {
      expect(call.samples).toBeInstanceOf(Float32Array);
      expect(call.samples).toHaveLength(16_000);
    }
  });

  it('enforces maxBytes before decoding', async () => {
    const fake = fakeTransformers();
    const transcriber = localTranscriber(fake, { maxBytes: 100 });

    await expect(
      transcriber.transcribe({ audio: wav([tone(1, 16_000)], 16_000) }),
    ).rejects.toBeInstanceOf(SpeechConfigurationError);
    expect(fake.pipeline).not.toHaveBeenCalled();
  });

  it('downmixes stereo 48 kHz WAV to 16 kHz mono', async () => {
    const fake = fakeTransformers();
    const left = tone(1, 48_000, 0.8);
    const right = tone(1, 48_000, 0.2);

    await localTranscriber(fake).transcribe({
      audio: wav([left, right], 48_000),
    });

    const samples = fake.calls[0]?.samples as Float32Array;
    expect(samples).toHaveLength(16_000);
    expect(samples[8_000]).toBeCloseTo(0.5, 3);
  });

  it.each([
    ['8-bit PCM', 'pcm8', false, 2],
    ['24-bit PCM', 'pcm24', false, 5],
    ['32-bit float', 'float32', false, 5],
    ['WAVE_FORMAT_EXTENSIBLE', 'pcm16', true, 4],
  ] as const)('decodes %s WAV', (_name, encoding, extensible, digits) => {
    const decoded = decodeWav(
      wav([[0.5, -0.25, 0]], 16_000, encoding, { extensible }),
    );

    expect(decoded.sampleRate).toBe(16_000);
    const [channel] = decoded.samples as Float32Array[];
    expect(channel?.[0]).toBeCloseTo(0.5, digits);
    expect(channel?.[1]).toBeCloseTo(-0.25, digits);
    expect(channel?.[2]).toBeCloseTo(0, digits);
  });

  it('rejects malformed and unsupported WAV data', () => {
    expect(() => decodeWav(new Uint8Array(4))).toThrow(
      SpeechConfigurationError,
    );
    const bytes = wav([[0.5]], 16_000);
    new DataView(bytes.buffer).setUint16(20, 2, true); // ADPCM
    expect(() => decodeWav(bytes)).toThrow(/Unsupported WAV encoding/);
  });

  it('decodes raw audio/pcm with rate and channel parameters', async () => {
    const stereo = new Int16Array([16_384, 0, 16_384, 0]);
    const samples = await decodeToPcm16k(new Uint8Array(stereo.buffer), {
      mimeType: 'audio/pcm;rate=16000;channels=2',
    });
    expect(Array.from(samples)).toEqual([0.25, 0.25]);

    const floats = new Float32Array([0.5, -0.5]);
    const fromInput = await decodeToPcm16k(new Uint8Array(floats.buffer), {
      mimeType: 'audio/pcm;encoding=f32le',
      sampleRate: 16_000,
    });
    expect(Array.from(fromInput)).toEqual([0.5, -0.5]);
  });

  it('reads raw PCM sample rate and channels from AudioInput', async () => {
    const fake = fakeTransformers();
    const pcm = new Int16Array(16_000 * 2).fill(8_192);

    await localTranscriber(fake).transcribe({
      audio: {
        data: new Uint8Array(pcm.buffer),
        mimeType: 'audio/pcm',
        sampleRate: 32_000,
        channels: 1,
      },
    });

    expect(fake.calls[0]?.samples).toHaveLength(16_000);
  });

  it('requires a sample rate for raw PCM', async () => {
    await expect(
      decodeToPcm16k(new Uint8Array(4), { mimeType: 'audio/pcm' }),
    ).rejects.toThrow(/needs a sample rate/);
  });

  it('uses the decodeAudio hook for compressed formats', async () => {
    const fake = fakeTransformers();
    const decodeAudio = vi.fn(async () => ({
      samples: [new Float32Array(24_000).fill(0.5)],
      sampleRate: 24_000,
    }));

    await localTranscriber(fake, { decodeAudio }).transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm;codecs=opus',
    });

    expect(decodeAudio).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm;codecs=opus',
      signal: undefined,
    });
    expect(fake.calls[0]?.samples).toHaveLength(16_000);
  });

  it('validates the decodeAudio result', async () => {
    await expect(
      decodeToPcm16k(new Uint8Array([1]), {
        mimeType: 'audio/mpeg',
        decodeAudio: async () => ({ samples: [], sampleRate: 0 }),
      }),
    ).rejects.toThrow(/decodeAudio must return/);
  });

  it('explains how to decode compressed audio in Node without a hook', async () => {
    await expect(
      localTranscriber(fakeTransformers()).transcribe({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/mp4',
      }),
    ).rejects.toThrow(/supply a decodeAudio hook/);
  });

  it('decodes compressed audio with OfflineAudioContext in browsers', async () => {
    const decodeAudioData = vi.fn(async (_buffer: ArrayBuffer) => ({
      numberOfChannels: 2,
      sampleRate: 16_000,
      getChannelData: (channel: number) =>
        new Float32Array(16_000).fill(channel === 0 ? 1 : 0),
    }));
    const contexts: unknown[][] = [];
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor(...args: unknown[]) {
          contexts.push(args);
        }
        decodeAudioData = decodeAudioData;
      },
    );

    const samples = await decodeToPcm16k(new Uint8Array([1, 2, 3]), {
      mimeType: 'audio/webm;codecs=opus',
    });

    expect(contexts).toEqual([[1, 1, 16_000]]);
    expect(samples).toHaveLength(16_000);
    expect(samples[0]).toBeCloseTo(0.5);
  });

  it('resamples with the expected length and preserves DC level', () => {
    expect(
      resample(new Float32Array(44_100).fill(0.3), 44_100, 16_000),
    ).toHaveLength(16_000);
    const upsampled = resample(
      new Float32Array(8_000).fill(0.3),
      8_000,
      16_000,
    );
    expect(upsampled).toHaveLength(16_000);
    expect(upsampled[123]).toBeCloseTo(0.3);
    expect(
      downmix([new Float32Array([1, 1]), new Float32Array([0, 0])]),
    ).toEqual(new Float32Array([0.5, 0.5]));
  });
});

describe('local transcriber: cancellation', () => {
  it('rejects an already-aborted request without loading a model', async () => {
    const fake = fakeTransformers();
    const controller = new AbortController();
    controller.abort(new Error('stop'));

    await expect(
      localTranscriber(fake).transcribe({
        audio: wav([tone(1, 16_000)], 16_000),
        signal: controller.signal,
      }),
    ).rejects.toThrow('stop');
    expect(fake.pipeline).not.toHaveBeenCalled();
  });

  it('rejects promptly and interrupts generation when aborted mid-inference', async () => {
    let release = () => {};
    const fake = fakeTransformers({
      inferenceGate: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });
    const controller = new AbortController();
    const transcriber = localTranscriber(fake);

    const pending = transcriber.transcribe({
      audio: wav([tone(1, 16_000)], 16_000),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    expect(fake.calls[0]?.options.stopping_criteria).toBeDefined();

    controller.abort(new Error('user cancelled'));
    await expect(pending).rejects.toThrow('user cancelled');
    expect(fake.interrupts).toHaveLength(1);

    // dispose() waits for the abandoned inference before releasing sessions.
    let disposed = false;
    const disposing = transcriber.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect(disposed).toBe(false);
    release();
    await disposing;
    expect(fake.disposed).toEqual([MODEL]);

    // The transcriber keeps working after a cancelled call.
    await expect(
      transcriber.transcribe({ audio: wav([tone(1, 16_000)], 16_000) }),
    ).resolves.toMatchObject({ text: 'Hello world.' });
  });

  it('rejects promptly when aborted while a decoder is still running', async () => {
    const fake = fakeTransformers();
    const neverSettles = () => new Promise<never>(() => {});
    const decodeAudio = vi.fn(neverSettles);
    const controller = new AbortController();

    const direct = localTranscriber(fake, { decodeAudio }).transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      signal: controller.signal,
    });
    const channel = new MessageChannel();
    channel.port1.start();
    const client = new LocalTranscriberWorkerClient(
      channel.port1 as unknown as LocalWorkerEndpoint,
      { decodeAudio },
    );
    const viaWorker = client.transcribe({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(decodeAudio).toHaveBeenCalledTimes(2));

    controller.abort(new Error('stop decoding'));
    await expect(direct).rejects.toThrow('stop decoding');
    await expect(viaWorker).rejects.toThrow('stop decoding');
    expect(fake.pipeline).not.toHaveBeenCalled();
    client.close();
    channel.port1.close();
  });

  it('rejects promptly when aborted while the model is loading', async () => {
    const fake = fakeTransformers();
    let finishLoad = () => {};
    fake.pipeline.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLoad = () =>
            resolve(Object.assign(async () => ({ text: '' }), {}));
        }),
    );
    const controller = new AbortController();

    const pending = localTranscriber(fake).transcribe({
      audio: wav([tone(1, 16_000)], 16_000),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fake.pipeline).toHaveBeenCalled());
    controller.abort(new Error('gave up'));

    await expect(pending).rejects.toThrow('gave up');
    finishLoad();
  });
});

describe('local transcriber: web worker', () => {
  function connect(
    fake: ReturnType<typeof fakeTransformers>,
    clientOptions: LocalTranscriberWorkerClientOptions = {},
  ) {
    const channel = new MessageChannel();
    channel.port1.start();
    channel.port2.start();
    const stop = serveLocalTranscriber(
      { model: MODEL, transformers: fake.module },
      channel.port2 as unknown as LocalWorkerEndpoint,
    );
    const client = new LocalTranscriberWorkerClient(
      channel.port1 as unknown as LocalWorkerEndpoint,
      clientOptions,
    );
    return {
      client,
      async close() {
        client.close();
        await stop();
        channel.port1.close();
        channel.port2.close();
      },
    };
  }

  it('decodes on the client, transcribes in the worker, and reports source bytes', async () => {
    const fake = fakeTransformers();
    const onUsage = vi.fn();
    const { client, close } = connect(fake, { onUsage });
    const audio = wav([tone(1, 48_000)], 48_000);

    const result = await client.transcribe({
      audio,
      language: 'en',
      timestampGranularities: ['segment'],
    });

    expect(client.type).toBe('local');
    expect(result).toMatchObject({ text: 'Hello world.', model: MODEL });
    expect(result.usage).toMatchObject({
      provider: 'local',
      audioSeconds: 1,
      bytes: audio.byteLength,
    });
    expect(onUsage).toHaveBeenCalledWith(result.usage);
    expect(fake.calls[0]?.samples).toHaveLength(16_000);
    expect(fake.calls[0]?.options).toMatchObject({
      language: 'en',
      return_timestamps: true,
    });
    await close();
  });

  it('forwards progress and preload, and propagates worker errors', async () => {
    const fake = fakeTransformers();
    fake.pipeline.mockImplementationOnce(async (_task, _model, options) => {
      (options.progress_callback as (info: unknown) => void)({
        status: 'progress',
        file: 'encoder_model.onnx',
        progress: 50,
        notCloneable: () => {},
      });
      throw new Error('disk full');
    });
    const onProgress = vi.fn();
    const { client, close } = connect(fake, { onProgress });

    const error = await client.preload().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechProviderError);
    expect((error as Error).message).toMatch(/disk full/);
    await vi.waitFor(() =>
      expect(onProgress).toHaveBeenCalledWith({
        status: 'progress',
        file: 'encoder_model.onnx',
        progress: 50,
      }),
    );
    await close();
  });

  it('cancels a worker call on abort', async () => {
    let release = () => {};
    const fake = fakeTransformers({
      inferenceGate: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });
    const { client, close } = connect(fake);
    const controller = new AbortController();

    const pending = client.transcribe({
      audio: wav([tone(1, 16_000)], 16_000),
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    controller.abort(new Error('cancelled'));

    await expect(pending).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(fake.interrupts).toHaveLength(1));
    release();
    await close();
  });
});
