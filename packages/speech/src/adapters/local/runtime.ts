// biome-ignore-all lint/style/useNamingConvention: transformers.js options and outputs use snake_case and PascalCase exports.
/**
 * Loads the optional `@huggingface/transformers` peer dependency and builds
 * `automatic-speech-recognition` pipelines from it.
 *
 * This is the only module that names the peer. It is reachable only from the
 * `@happyvertical/speech/local` entry, never from the core entry.
 */

import { SpeechConfigurationError } from '../../shared/errors.js';
import type {
  LocalTranscriberDevice,
  LocalTranscriberDtype,
  LocalTranscriberProgressCallback,
  LocalTransformersRuntime,
} from './types.js';

export const TRANSFORMERS_PACKAGE = '@huggingface/transformers';

export const TRANSFORMERS_INSTALL_HINT =
  `Local transcription needs the optional peer dependency ${TRANSFORMERS_PACKAGE}. ` +
  `Install it with \`pnpm add ${TRANSFORMERS_PACKAGE}\` (or npm/yarn equivalent).`;

/** One ASR result as returned by transformers.js. */
export interface AsrOutput {
  text: string;
  chunks?: Array<{ text: string; timestamp: [number, number | null] }>;
}

/** Callable `automatic-speech-recognition` pipeline (structural subset). */
export interface AsrPipeline {
  (
    audio: Float32Array,
    options?: Record<string, unknown>,
  ): Promise<AsrOutput | AsrOutput[]>;
  dispose?: () => Promise<void>;
  model?: { config?: { model_type?: string } };
}

/** The parts of the transformers.js module this adapter uses. */
export interface TransformersModule {
  pipeline: (
    task: 'automatic-speech-recognition',
    model: string,
    options: Record<string, unknown>,
  ) => Promise<AsrPipeline>;
  env?: Record<string, unknown>;
  InterruptableStoppingCriteria?: new () => { interrupt(): void };
}

/**
 * Resolves the transformers.js module: an injected module or loader, else a
 * dynamic import of the peer. A missing peer becomes a
 * `SpeechConfigurationError` with an install hint.
 */
export async function loadTransformers(
  runtime: LocalTransformersRuntime | undefined,
): Promise<TransformersModule> {
  let loaded: unknown;
  try {
    loaded =
      typeof runtime === 'function'
        ? await runtime()
        : (runtime ?? (await importTransformers()));
  } catch (error) {
    if (error instanceof SpeechConfigurationError) {
      throw error;
    }
    const configurationError = new SpeechConfigurationError(
      `${TRANSFORMERS_INSTALL_HINT} (${errorMessage(error)})`,
      'local',
    );
    configurationError.cause = error;
    throw configurationError;
  }

  // Accept both the ES namespace and a CommonJS-style `default` wrapper.
  const candidate = loaded as
    | (Partial<TransformersModule> & { default?: TransformersModule })
    | undefined;
  const module =
    typeof candidate?.pipeline === 'function'
      ? (candidate as TransformersModule)
      : candidate?.default;

  if (typeof module?.pipeline !== 'function') {
    throw new SpeechConfigurationError(
      `${TRANSFORMERS_PACKAGE} did not export pipeline(); expected v4 or later`,
      'local',
    );
  }
  return module;
}

/** Isolated so tests can observe whether the peer was ever imported. */
export function importTransformers(): Promise<unknown> {
  return import('@huggingface/transformers');
}

export interface CreatePipelineOptions {
  model: string;
  device: LocalTranscriberDevice;
  dtype?: LocalTranscriberDtype;
  revision?: string;
  cacheDir?: string;
  onProgress?: LocalTranscriberProgressCallback;
}

/**
 * Creates the ASR pipeline. `device: 'auto'` resolves to WebGPU when a
 * browser adapter is available (retrying on WASM if WebGPU fails to
 * initialise) and to CPU elsewhere.
 */
export async function createAsrPipeline(
  transformers: TransformersModule,
  options: CreatePipelineOptions,
): Promise<{ pipeline: AsrPipeline; device: string }> {
  const device =
    options.device === 'auto' ? await detectAutoDevice() : options.device;
  const build = (selected: string) =>
    transformers.pipeline('automatic-speech-recognition', options.model, {
      device: selected,
      ...(options.dtype ? { dtype: options.dtype } : {}),
      ...(options.revision ? { revision: options.revision } : {}),
      ...(options.cacheDir ? { cache_dir: options.cacheDir } : {}),
      ...(options.onProgress ? { progress_callback: options.onProgress } : {}),
    });

  try {
    return { pipeline: await build(device), device };
  } catch (error) {
    if (options.device === 'auto' && device === 'webgpu') {
      return { pipeline: await build('wasm'), device: 'wasm' };
    }
    throw error;
  }
}

/** `webgpu` when a browser exposes a usable adapter, `wasm` in other browsers, `cpu` in Node. */
export async function detectAutoDevice(): Promise<string> {
  if (isNodeRuntime()) {
    return 'cpu';
  }

  const gpu = (
    globalThis.navigator as
      | { gpu?: { requestAdapter(): Promise<unknown> } }
      | undefined
  )?.gpu;
  if (gpu) {
    try {
      if (await gpu.requestAdapter()) {
        return 'webgpu';
      }
    } catch {
      // No usable adapter: fall through to WASM.
    }
  }
  return 'wasm';
}

export function isNodeRuntime(): boolean {
  return Boolean(
    (globalThis as { process?: { versions?: { node?: string } } }).process
      ?.versions?.node,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
