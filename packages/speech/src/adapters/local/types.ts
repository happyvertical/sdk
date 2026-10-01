/**
 * Public option types for the on-device (`local`) transcriber.
 *
 * Kept free of `@huggingface/transformers` types so the core entry can
 * reference them without depending on the optional peer.
 */

import type { SpeechUsageCallback } from '../../shared/usage.js';

/**
 * Inference device. `auto` picks WebGPU when the browser exposes a usable
 * adapter (falling back to WASM if WebGPU fails to initialise) and `cpu` in
 * Node. Other values are passed to transformers.js unchanged (Node also
 * supports `cuda`, `dml`, `coreml`, and `webgpu` where onnxruntime-node does).
 */
export type LocalTranscriberDevice =
  | 'auto'
  | 'webgpu'
  | 'wasm'
  | 'cpu'
  | 'gpu'
  | 'cuda'
  | 'dml'
  | 'coreml'
  | (string & {});

/**
 * Quantisation (`dtype`) forwarded to transformers.js: a single value such as
 * `q8`, `q4`, `fp16`, `fp32`, or a per-file map such as
 * `{ encoder_model: 'fp32', decoder_model_merged: 'q4' }`.
 */
export type LocalTranscriberDtype = string | Record<string, string>;

/** Model loading progress, as reported by transformers.js. */
export interface LocalTranscriberProgress {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
  [key: string]: unknown;
}

export type LocalTranscriberProgressCallback = (
  progress: LocalTranscriberProgress,
) => void;

/** Decoded audio returned by a {@link LocalAudioDecoder}. */
export interface DecodedAudio {
  /** Mono samples, or one array per channel (downmixed by averaging). */
  samples: Float32Array | Float32Array[];
  sampleRate: number;
}

/**
 * Caller-supplied decoder for formats the adapter cannot decode itself, e.g.
 * WebM/Opus, MP4/AAC, MP3, or FLAC in Node (where there is no `AudioContext`).
 * Return any sample rate; the adapter resamples to 16 kHz mono.
 */
export type LocalAudioDecoder = (audio: {
  bytes: Uint8Array;
  mimeType: string;
  signal?: AbortSignal;
}) => Promise<DecodedAudio>;

/** Loader for the transformers.js module, or the module itself. */
export type LocalTransformersRuntime =
  | Record<string, unknown>
  | (() => Promise<Record<string, unknown>>);

/** Settings shared by the `local` transcriber and `getTranscriber()`. */
export interface LocalTranscriberSettings {
  /** Hugging Face model id. Default `onnx-community/whisper-base`. */
  model?: string;
  /** Inference device. Default `auto`. */
  device?: LocalTranscriberDevice;
  /** Quantisation. Default: transformers.js chooses per device. */
  dtype?: LocalTranscriberDtype;
  /** Model revision (branch, tag, or commit). Default `main`. */
  revision?: string;
  /**
   * Node model cache directory. Browsers always use Cache Storage, so this is
   * ignored there.
   */
  cacheDir?: string;
  /**
   * Custom model host for self-hosted weights, e.g. `https://models.example.com/`.
   * Sets the process-wide transformers.js `env.remoteHost`.
   */
  modelHost?: string;
  /** Called with download and load progress (first load only). */
  onProgress?: LocalTranscriberProgressCallback;
  /** Decoder for formats without a built-in decoder. See {@link LocalAudioDecoder}. */
  decodeAudio?: LocalAudioDecoder;
  /**
   * Whisper chunk length in seconds for audio longer than one 30 s window.
   * Default 30; `0` disables chunking.
   */
  chunkLengthSeconds?: number;
  /** Input byte limit. Default 25 MB; `Infinity` disables it. */
  maxBytes?: number;
  /** Called with usage after every successful transcription. */
  onUsage?: SpeechUsageCallback;
  /**
   * Inject the transformers.js module (or a loader for it), e.g. a CDN build.
   * Default: `import('@huggingface/transformers')`.
   */
  transformers?: LocalTransformersRuntime;
  /**
   * Escape hatch to adjust the process-wide transformers.js `env` (for example
   * `localModelPath`, `allowRemoteModels`, or `backends.onnx.wasm`) before the
   * first model load.
   */
  configureEnv?: (env: Record<string, unknown>) => void;
}

export interface LocalTranscriberOptions extends LocalTranscriberSettings {
  type?: 'local';
}
