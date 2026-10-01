/**
 * Web Worker support for the `local` transcriber.
 *
 * Inference runs in a worker (`serveLocalTranscriber`) so long recordings never
 * block the UI thread. The main-thread client (`LocalTranscriberWorkerClient`)
 * decodes audio with `AudioContext` (which workers lack), resamples it to
 * 16 kHz mono Float32, and transfers the samples to the worker without copying.
 */

import {
  DEFAULT_MAX_AUDIO_BYTES,
  normalizeAudioInput,
} from '../../shared/audio.js';
import {
  SpeechConfigurationError,
  SpeechError,
  SpeechProviderError,
} from '../../shared/errors.js';
import type {
  TimestampGranularity,
  Transcriber,
  TranscriptionRequest,
  TranscriptResult,
} from '../../shared/types.js';
import {
  reportSpeechUsage,
  type SpeechUsage,
  type SpeechUsageCallback,
} from '../../shared/usage.js';
import { decodeToPcm16k, LOCAL_SAMPLE_RATE } from './audio.js';
import { resolveLocalTranscriberOptions } from './env.js';
import { LocalTranscriber } from './transcriber.js';
import type {
  LocalAudioDecoder,
  LocalTranscriberOptions,
  LocalTranscriberProgress,
  LocalTranscriberProgressCallback,
} from './types.js';

/** Minimal `postMessage` endpoint: a `Worker`, `DedicatedWorkerGlobalScope`, or `MessagePort`. */
export interface LocalWorkerEndpoint {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
}

/** Messages from the client to the worker. */
export type LocalWorkerRequest =
  | {
      kind: 'transcribe';
      id: number;
      /** 16 kHz mono samples. */
      pcm: Float32Array;
      model?: string;
      language?: string;
      timestampGranularities?: TimestampGranularity[];
    }
  | { kind: 'preload'; id: number; model?: string }
  | { kind: 'abort'; id: number };

/** Messages from the worker to the client. */
export type LocalWorkerResponse =
  | { kind: 'result'; id: number; result?: TranscriptResult }
  | {
      kind: 'error';
      id: number;
      error: { name: string; message: string; code?: string };
    }
  | { kind: 'progress'; progress: LocalTranscriberProgress };

const PCM_MIME_TYPE = `audio/pcm;rate=${LOCAL_SAMPLE_RATE};encoding=f32le`;

/**
 * Runs a {@link LocalTranscriber} inside a worker and answers client
 * requests. Call it from your worker module:
 *
 * ```ts
 * // transcriber.worker.ts
 * import { serveLocalTranscriber } from '@happyvertical/speech/local';
 * serveLocalTranscriber({ model: 'onnx-community/whisper-base' });
 * ```
 *
 * Returns a function that stops listening and disposes the model.
 */
export function serveLocalTranscriber(
  options: LocalTranscriberOptions = {},
  endpoint: LocalWorkerEndpoint = globalThis as unknown as LocalWorkerEndpoint,
): () => Promise<void> {
  const userProgress = options.onProgress;
  const transcriber = new LocalTranscriber({
    ...resolveLocalTranscriberOptions(options),
    // The client already enforced its byte limit on the encoded input.
    maxBytes: Number.POSITIVE_INFINITY,
    onProgress: (progress) => {
      userProgress?.(progress);
      endpoint.postMessage({
        kind: 'progress',
        progress: toCloneable(progress),
      } satisfies LocalWorkerResponse);
    },
  });
  const pending = new Map<number, AbortController>();

  const reply = (message: LocalWorkerResponse) => endpoint.postMessage(message);
  const listener = (event: MessageEvent) => {
    const message = event.data as LocalWorkerRequest;
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.kind === 'abort') {
      pending.get(message.id)?.abort();
      return;
    }

    const controller = new AbortController();
    pending.set(message.id, controller);
    const work =
      message.kind === 'preload'
        ? transcriber.preload(message.model, controller.signal).then(() => {
            reply({ kind: 'result', id: message.id });
          })
        : transcriber
            .transcribe({
              audio: new Uint8Array(
                message.pcm.buffer,
                message.pcm.byteOffset,
                message.pcm.byteLength,
              ),
              mimeType: PCM_MIME_TYPE,
              model: message.model,
              language: message.language,
              timestampGranularities: message.timestampGranularities,
              signal: controller.signal,
            })
            .then((result) => {
              reply({ kind: 'result', id: message.id, result });
            });

    work
      .catch((error: unknown) => {
        reply({ kind: 'error', id: message.id, error: serializeError(error) });
      })
      .finally(() => pending.delete(message.id));
  };

  endpoint.addEventListener('message', listener);
  return async () => {
    endpoint.removeEventListener('message', listener);
    for (const controller of pending.values()) {
      controller.abort();
    }
    await transcriber.dispose();
  };
}

export interface LocalTranscriberWorkerClientOptions {
  /** Encoded input byte limit, checked on the main thread. Default 25 MB. */
  maxBytes?: number;
  /** Main-thread decoder for formats `AudioContext` cannot decode. */
  decodeAudio?: LocalAudioDecoder;
  /** Model download/load progress forwarded from the worker. */
  onProgress?: LocalTranscriberProgressCallback;
  /** Called with usage after every successful transcription. */
  onUsage?: SpeechUsageCallback;
}

/**
 * Main-thread {@link Transcriber} that delegates inference to a worker running
 * {@link serveLocalTranscriber}.
 *
 * ```ts
 * const worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), { type: 'module' });
 * const transcriber = new LocalTranscriberWorkerClient(worker, { onProgress });
 * const { text } = await transcriber.transcribe({ audio: recordingBlob });
 * ```
 */
export class LocalTranscriberWorkerClient implements Transcriber {
  readonly type = 'local' as const;

  private readonly endpoint: LocalWorkerEndpoint;
  private readonly options: LocalTranscriberWorkerClientOptions;
  private readonly calls = new Map<
    number,
    {
      resolve: (result: TranscriptResult | undefined) => void;
      reject: (error: unknown) => void;
    }
  >();
  private nextId = 1;
  private readonly listener = (event: MessageEvent) =>
    this.onMessage(event.data as LocalWorkerResponse);

  constructor(
    endpoint: LocalWorkerEndpoint,
    options: LocalTranscriberWorkerClientOptions = {},
  ) {
    this.endpoint = endpoint;
    this.options = options;
    endpoint.addEventListener('message', this.listener);
  }

  /** Loads the model in the worker ahead of the first transcription. */
  async preload(model?: string, signal?: AbortSignal): Promise<void> {
    await this.call({ kind: 'preload', model }, signal);
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
    const { signal } = request;
    const audio = await normalizeAudioInput(request.audio, {
      mimeType: request.mimeType,
      maxBytes:
        request.maxBytes ?? this.options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES,
      adapter: this.type,
      signal,
    });
    const wrapped =
      typeof request.audio === 'object' && 'data' in request.audio
        ? request.audio
        : undefined;
    const pcm = await decodeToPcm16k(
      new Uint8Array(await audio.blob.arrayBuffer()),
      {
        mimeType: audio.mimeType,
        sampleRate: wrapped?.sampleRate,
        channels: wrapped?.channels,
        decodeAudio: this.options.decodeAudio,
        signal,
      },
    );
    // Decoders may return a view of a larger or shared buffer; transfer a tight copy.
    const transferable =
      pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength
        ? pcm
        : pcm.slice();

    const result = await this.call(
      {
        kind: 'transcribe',
        pcm: transferable,
        model: request.model,
        language: request.language,
        timestampGranularities: request.timestampGranularities,
      },
      signal,
      [transferable.buffer as ArrayBuffer],
    );
    if (!result) {
      throw new SpeechProviderError(this.type, 'Worker returned no result');
    }

    const usage: SpeechUsage = {
      ...(result.usage ?? { operation: 'transcription', provider: this.type }),
      bytes: audio.bytes,
    };
    await reportSpeechUsage(usage, this.options.onUsage, request.onUsage);
    return { ...result, usage };
  }

  /** Stops listening and rejects in-flight calls. Does not terminate the worker. */
  close(): void {
    this.endpoint.removeEventListener('message', this.listener);
    for (const call of this.calls.values()) {
      call.reject(
        new SpeechConfigurationError('Worker client closed', 'local'),
      );
    }
    this.calls.clear();
  }

  private call(
    message:
      | Omit<Extract<LocalWorkerRequest, { kind: 'transcribe' }>, 'id'>
      | Omit<Extract<LocalWorkerRequest, { kind: 'preload' }>, 'id'>,
    signal: AbortSignal | undefined,
    transfer: Transferable[] = [],
  ): Promise<TranscriptResult | undefined> {
    signal?.throwIfAborted();
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.calls.delete(id);
        this.endpoint.postMessage({ kind: 'abort', id });
        reject(signal?.reason);
      };
      const settle = () => signal?.removeEventListener('abort', onAbort);
      this.calls.set(id, {
        resolve: (result) => {
          settle();
          resolve(result);
        },
        reject: (error) => {
          settle();
          reject(error);
        },
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      this.endpoint.postMessage({ ...message, id }, transfer);
    });
  }

  private onMessage(message: LocalWorkerResponse): void {
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.kind === 'progress') {
      this.options.onProgress?.(message.progress);
      return;
    }

    const call = this.calls.get(message.id);
    if (!call) {
      return;
    }
    this.calls.delete(message.id);
    if (message.kind === 'result') {
      call.resolve(message.result);
    } else {
      call.reject(deserializeError(message.error));
    }
  }
}

function serializeError(error: unknown): {
  name: string;
  message: string;
  code?: string;
} {
  if (error instanceof SpeechError) {
    return { name: error.name, message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'Error', message: String(error) };
}

function deserializeError(error: {
  name: string;
  message: string;
  code?: string;
}): Error {
  switch (error.name) {
    case 'SpeechConfigurationError':
      return new SpeechConfigurationError(error.message, 'local');
    case 'SpeechProviderError':
      return new SpeechProviderError('local', error.message);
    case 'AbortError':
      return new DOMException(error.message, 'AbortError');
    default: {
      const restored = new Error(error.message);
      restored.name = error.name;
      return restored;
    }
  }
}

/** Progress objects cross `postMessage`, so drop anything not cloneable. */
function toCloneable(
  progress: LocalTranscriberProgress,
): LocalTranscriberProgress {
  const clone: LocalTranscriberProgress = { status: progress.status };
  for (const [key, value] of Object.entries(progress)) {
    if (
      value === null ||
      ['string', 'number', 'boolean'].includes(typeof value)
    ) {
      clone[key] = value;
    }
  }
  return clone;
}
