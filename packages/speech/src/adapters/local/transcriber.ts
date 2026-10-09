import {
  DEFAULT_MAX_AUDIO_BYTES,
  normalizeAudioInput,
} from '../../shared/audio.js';
import {
  SpeechConfigurationError,
  SpeechProviderError,
} from '../../shared/errors.js';
import type {
  AudioInput,
  AudioSource,
  Transcriber,
  TranscriptionRequest,
  TranscriptResult,
  TranscriptSegment,
  WordTiming,
} from '../../shared/types.js';
import {
  reportSpeechUsage,
  type SpeechUsage,
  type SpeechUsageCallback,
} from '../../shared/usage.js';
import { raceAbort } from './abort.js';
import { decodeToPcm16k, LOCAL_SAMPLE_RATE } from './audio.js';
import {
  type AsrOutput,
  type AsrPipeline,
  createAsrPipeline,
  loadTransformers,
  type TransformersModule,
} from './runtime.js';
import type { LocalTranscriberOptions } from './types.js';

/** Small multilingual Whisper (~80 MB at the default q8 quantisation). */
export const DEFAULT_LOCAL_MODEL = 'onnx-community/whisper-base';

const DEFAULT_CHUNK_LENGTH_SECONDS = 30;
const WHISPER_WINDOW_SECONDS = 30;
const WHISPER_MODEL_TYPES = new Set(['whisper', 'lite-whisper']);

interface LoadedPipeline {
  pipeline: AsrPipeline;
  device: string;
}

/**
 * On-device speech-to-text with transformers.js (Whisper or Moonshine ONNX).
 * Runs on WebGPU/WASM in browsers and onnxruntime-node in Node; no audio
 * leaves the device and no API key is involved.
 */
export class LocalTranscriber implements Transcriber {
  readonly type = 'local' as const;

  private readonly options: LocalTranscriberOptions;
  private readonly model: string;
  private readonly maxBytes: number;
  private readonly onUsage?: SpeechUsageCallback;
  private runtime?: Promise<TransformersModule>;
  private readonly pipelines = new Map<string, Promise<LoadedPipeline>>();
  /** Serialises inference: ONNX sessions (especially WebGPU) run one call at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: LocalTranscriberOptions = {}) {
    this.options = options;
    this.model = options.model?.trim() || DEFAULT_LOCAL_MODEL;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES;
    this.onUsage = options.onUsage;
  }

  /**
   * Downloads (first time) and initialises the model so the first
   * `transcribe()` is fast. Progress goes to `onProgress`.
   */
  async preload(model?: string, signal?: AbortSignal): Promise<void> {
    await raceAbort(this.loadPipeline(model?.trim() || this.model), signal);
  }

  /**
   * Whether every file `model` needs is already in the model cache (Cache
   * Storage in browsers), so a `preload()` would download nothing. Resolves
   * `false` when the runtime cannot tell. Does not load the model.
   */
  async isCached(model?: string): Promise<boolean> {
    try {
      const transformers = await this.loadRuntime();
      if (!transformers.ModelRegistry) {
        return false;
      }
      const { dtype, revision, cacheDir } = this.options;
      return await transformers.ModelRegistry.is_pipeline_cached(
        'automatic-speech-recognition',
        model?.trim() || this.model,
        {
          ...(dtype ? { dtype } : {}),
          ...(revision ? { revision } : {}),
          ...(cacheDir ? { cache_dir: cacheDir } : {}),
        },
      );
    } catch {
      return false;
    }
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
    const { signal } = request;
    const audio = await normalizeAudioInput(request.audio, {
      mimeType: request.mimeType,
      maxBytes: request.maxBytes ?? this.maxBytes,
      adapter: this.type,
      signal,
    });
    const format = pcmFormat(request.audio);
    const samples = await decodeToPcm16k(
      new Uint8Array(await audio.blob.arrayBuffer()),
      {
        mimeType: audio.mimeType,
        sampleRate: format.sampleRate,
        channels: format.channels,
        decodeAudio: this.options.decodeAudio,
        signal,
      },
    );
    signal?.throwIfAborted();

    const model = request.model?.trim() || this.model;
    const loaded = await raceAbort(this.loadPipeline(model), signal);
    const audioSeconds = samples.length / LOCAL_SAMPLE_RATE;
    // The queue tracks the real inference; the caller stops waiting on abort.
    const output = await raceAbort(
      this.enqueue(() =>
        this.run(loaded.pipeline, samples, audioSeconds, request, model),
      ),
      signal,
    );

    const usage: SpeechUsage = {
      operation: 'transcription',
      provider: this.type,
      model,
      audioSeconds,
      bytes: audio.bytes,
    };
    const result: TranscriptResult = {
      ...mapAsrOutput(
        output,
        request.timestampGranularities?.includes('word') ?? false,
      ),
      language: request.language,
      durationSeconds: audioSeconds,
      provider: this.type,
      model,
      raw: output,
      usage,
    };

    await reportSpeechUsage(usage, this.onUsage, request.onUsage);
    return result;
  }

  /** Waits for in-flight inference, then releases every loaded model session. */
  async dispose(): Promise<void> {
    await this.queue;
    const loaded = [...this.pipelines.values()];
    this.pipelines.clear();
    await Promise.all(
      loaded.map(async (entry) => {
        const { pipeline } = await entry.catch(() => ({ pipeline: undefined }));
        await pipeline?.dispose?.();
      }),
    );
  }

  private async run(
    pipeline: AsrPipeline,
    samples: Float32Array,
    audioSeconds: number,
    request: TranscriptionRequest,
    model: string,
  ): Promise<AsrOutput> {
    const { signal } = request;
    signal?.throwIfAborted();

    const transformers = await this.loadRuntime();
    const options: Record<string, unknown> = {};
    const isWhisper = WHISPER_MODEL_TYPES.has(
      pipeline.model?.config?.model_type ?? 'whisper',
    );

    if (isWhisper) {
      const granularities = request.timestampGranularities ?? [];
      if (granularities.includes('word')) {
        options.return_timestamps = 'word';
      } else if (granularities.includes('segment')) {
        options.return_timestamps = true;
      }
      const chunkLength =
        this.options.chunkLengthSeconds ?? DEFAULT_CHUNK_LENGTH_SECONDS;
      if (chunkLength > 0 && audioSeconds > WHISPER_WINDOW_SECONDS) {
        options.chunk_length_s = chunkLength;
      }
      // English-only Whisper (`*.en`) rejects `language` and `task` outright.
      if (request.language && !isEnglishOnly(pipeline, model)) {
        options.language = request.language;
        options.task = 'transcribe';
      }
    }

    // Stops generation between tokens when the caller aborts.
    let stopping: { interrupt(): void } | undefined;
    if (signal && transformers.InterruptableStoppingCriteria) {
      stopping = new transformers.InterruptableStoppingCriteria();
      options.stopping_criteria = stopping;
    }
    const onAbort = () => stopping?.interrupt();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const output = await pipeline(samples, options);
      return Array.isArray(output) ? (output[0] ?? { text: '' }) : output;
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason;
      }
      const hint =
        options.return_timestamps === 'word' &&
        /cross attentions/i.test(errorMessage(error))
          ? ' (word timestamps need a model exported with cross attentions, e.g. onnx-community/whisper-base_timestamped)'
          : '';
      throw new SpeechProviderError(
        this.type,
        `Local transcription failed: ${errorMessage(error)}${hint}`,
        { cause: error },
      );
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private loadRuntime(): Promise<TransformersModule> {
    if (!this.runtime) {
      const { transformers, configureEnv, modelHost } = this.options;
      this.runtime = loadTransformers(transformers).then((module) => {
        if (module.env) {
          if (modelHost) {
            module.env.remoteHost = modelHost;
          }
          configureEnv?.(module.env);
        }
        return module;
      });
      // A failed load (e.g. missing peer) is retried on the next call.
      this.runtime.catch(() => {
        this.runtime = undefined;
      });
    }
    return this.runtime;
  }

  private loadPipeline(model: string): Promise<LoadedPipeline> {
    let loaded = this.pipelines.get(model);
    if (!loaded) {
      loaded = this.loadRuntime().then((transformers) =>
        createAsrPipeline(transformers, {
          model,
          device: this.options.device ?? 'auto',
          dtype: this.options.dtype,
          revision: this.options.revision,
          cacheDir: this.options.cacheDir,
          onProgress: this.options.onProgress,
        }).catch((error: unknown) => {
          if (error instanceof SpeechConfigurationError) {
            throw error;
          }
          throw new SpeechProviderError(
            this.type,
            `Failed to load local model '${model}': ${errorMessage(error)}`,
            { cause: error },
          );
        }),
      );
      this.pipelines.set(model, loaded);
      loaded.catch(() => {
        if (this.pipelines.get(model) === loaded) {
          this.pipelines.delete(model);
        }
      });
    }
    return loaded;
  }
}

/**
 * Maps transformers.js chunks onto `words` (when word timestamps were
 * requested) or `segments`.
 */
export function mapAsrOutput(
  output: AsrOutput,
  wordLevel: boolean,
): Pick<TranscriptResult, 'text' | 'segments' | 'words'> {
  const result: Pick<TranscriptResult, 'text' | 'segments' | 'words'> = {
    text: (output.text ?? '').trim(),
  };
  const chunks = output.chunks;
  if (!chunks?.length) {
    return result;
  }

  if (wordLevel) {
    result.words = chunks
      .filter((chunk) => chunk.text.trim())
      .map(
        (chunk): WordTiming => ({
          word: chunk.text.trim(),
          startSeconds: chunk.timestamp[0],
          endSeconds: chunk.timestamp[1] ?? chunk.timestamp[0],
        }),
      );
  } else {
    result.segments = chunks.map(
      (chunk): TranscriptSegment => ({
        text: chunk.text.trim(),
        startSeconds: chunk.timestamp[0],
        endSeconds: chunk.timestamp[1] ?? undefined,
      }),
    );
  }
  return result;
}

/** Whether this Whisper only transcribes English (it rejects `language`/`task`). */
function isEnglishOnly(pipeline: AsrPipeline, model: string): boolean {
  const multilingual = pipeline.model?.generation_config?.is_multilingual;
  if (typeof multilingual === 'boolean') {
    return !multilingual;
  }
  return /\.en(?:$|[-_])/i.test(model);
}

function pcmFormat(audio: AudioInput | AudioSource): {
  sampleRate?: number;
  channels?: number;
} {
  if (
    audio &&
    typeof audio === 'object' &&
    'data' in audio &&
    !(audio instanceof Uint8Array)
  ) {
    return { sampleRate: audio.sampleRate, channels: audio.channels };
  }
  return {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
