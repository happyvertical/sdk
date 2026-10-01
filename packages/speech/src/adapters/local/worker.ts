/**
 * Web Worker support for the `local` transcriber.
 *
 * Inference runs in a worker (`serveLocalTranscriber`) so long recordings never
 * block the UI thread. The main-thread client (`LocalTranscriberWorkerClient`)
 * transfers WAV and raw PCM bytes to the worker, which parses, downmixes, and
 * resamples them there. Only formats that need `AudioContext` (which workers
 * lack) or the client's `decodeAudio` hook are decoded on the main thread;
 * their Float32 channels are then transferred and resampled in the worker.
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
  AudioInput,
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
import { raceAbort } from './abort.js';
import {
  decodeExternally,
  isInProcessDecodable,
  LOCAL_SAMPLE_RATE,
  toPcm16k,
} from './audio.js';
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

/** Audio sent to the worker. Its buffers are transferred, not copied. */
export type LocalWorkerAudio =
  | {
      /** WAV or raw PCM bytes (or any format the worker's `decodeAudio` handles). */
      kind: 'encoded';
      bytes: Uint8Array;
      mimeType: string;
      sampleRate?: number;
      channels?: number;
    }
  | {
      /** Channels decoded on the main thread; the worker downmixes and resamples. */
      kind: 'decoded';
      samples: Float32Array[];
      sampleRate: number;
    };

/** Messages from the client to the worker. */
export type LocalWorkerRequest =
  | {
      kind: 'transcribe';
      id: number;
      audio: LocalWorkerAudio;
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
        : Promise.resolve()
            .then(() =>
              transcriber.transcribe({
                audio: toAudioInput(message.audio),
                model: message.model,
                language: message.language,
                timestampGranularities: message.timestampGranularities,
                signal: controller.signal,
              }),
            )
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
  /**
   * Main-thread decoder for formats other than WAV and raw PCM. Formats with
   * neither this hook nor `AudioContext` go to the worker's own `decodeAudio`.
   */
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
  private closed = false;
  /** Aborted by `close()` to reject calls still buffering or decoding. */
  private readonly closing = new AbortController();
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
    this.assertOpen();
    const { signal } = request;
    // Buffering and main-thread decoding count as in flight: close() rejects them.
    const { audio, bytes } = await raceAbort(
      this.prepare(request),
      this.closing.signal,
    );

    const result = await this.call(
      {
        kind: 'transcribe',
        audio,
        model: request.model,
        language: request.language,
        timestampGranularities: request.timestampGranularities,
      },
      signal,
      transferList(audio),
    );
    if (!result) {
      throw new SpeechProviderError(this.type, 'Worker returned no result');
    }

    const usage: SpeechUsage = {
      ...(result.usage ?? { operation: 'transcription', provider: this.type }),
      bytes,
    };
    await reportSpeechUsage(usage, this.options.onUsage, request.onUsage);
    return { ...result, usage };
  }

  /**
   * Stops listening, rejects in-flight and later calls, and asks the worker to
   * abort posted work. Does not terminate the worker.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.endpoint.removeEventListener('message', this.listener);
    this.closing.abort(closedError());
    for (const [id, call] of this.calls) {
      this.endpoint.postMessage({
        kind: 'abort',
        id,
      } satisfies LocalWorkerRequest);
      call.reject(closedError());
    }
    this.calls.clear();
  }

  /** Buffers the input and, only when the worker cannot, decodes it here. */
  private async prepare(
    request: TranscriptionRequest,
  ): Promise<{ audio: LocalWorkerAudio; bytes: number }> {
    const { signal } = request;
    const normalized = await normalizeAudioInput(request.audio, {
      mimeType: request.mimeType,
      maxBytes:
        request.maxBytes ?? this.options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES,
      adapter: this.type,
      signal,
    });
    const bytes = new Uint8Array(await normalized.blob.arrayBuffer());

    if (!isInProcessDecodable(bytes, normalized.mimeType)) {
      // Decoders (caller hooks, decodeAudioData) cannot be cancelled: stop waiting on abort.
      const decoded = await raceAbort(
        decodeExternally(bytes, {
          mimeType: normalized.mimeType,
          decodeAudio: this.options.decodeAudio,
          signal,
        }),
        signal,
      );
      if (decoded) {
        const channels =
          decoded.samples instanceof Float32Array
            ? [decoded.samples]
            : decoded.samples;
        return {
          audio: {
            kind: 'decoded',
            samples: channels.map(ownedCopy),
            sampleRate: decoded.sampleRate,
          },
          bytes: normalized.bytes,
        };
      }
    }

    const wrapped =
      typeof request.audio === 'object' &&
      'data' in request.audio &&
      !(request.audio instanceof Uint8Array)
        ? request.audio
        : undefined;
    return {
      audio: {
        kind: 'encoded',
        bytes: ownedCopy(bytes),
        mimeType: normalized.mimeType,
        sampleRate: wrapped?.sampleRate,
        channels: wrapped?.channels,
      },
      bytes: normalized.bytes,
    };
  }

  private assertOpen(): void {
    if (this.closed) {
      throw closedError();
    }
  }

  private call(
    message:
      | Omit<Extract<LocalWorkerRequest, { kind: 'transcribe' }>, 'id'>
      | Omit<Extract<LocalWorkerRequest, { kind: 'preload' }>, 'id'>,
    signal: AbortSignal | undefined,
    transfer: Transferable[] = [],
  ): Promise<TranscriptResult | undefined> {
    this.assertOpen();
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

function closedError(): SpeechConfigurationError {
  return new SpeechConfigurationError('Worker client closed', 'local');
}

/** Rebuilds the transcriber input from a worker message, resampling decoded channels here. */
function toAudioInput(audio: LocalWorkerAudio): AudioInput {
  if (audio.kind === 'decoded') {
    const pcm = toPcm16k({
      samples: audio.samples,
      sampleRate: audio.sampleRate,
    });
    return {
      data: new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
      mimeType: PCM_MIME_TYPE,
    };
  }
  return {
    data: audio.bytes,
    mimeType: audio.mimeType,
    sampleRate: audio.sampleRate,
    channels: audio.channels,
  };
}

/**
 * Returns `view` when it spans a whole ordinary `ArrayBuffer` (safe to
 * transfer), otherwise a copy. Views of a larger buffer would transfer
 * unrelated bytes, and a `SharedArrayBuffer` cannot be transferred at all.
 */
function ownedCopy<T extends Uint8Array | Float32Array>(view: T): T {
  const { buffer } = view;
  return isPlainArrayBuffer(buffer) &&
    view.byteOffset === 0 &&
    view.byteLength === buffer.byteLength
    ? view
    : (view.slice() as T);
}

function isPlainArrayBuffer(buffer: ArrayBufferLike): buffer is ArrayBuffer {
  // Tag check rather than instanceof: buffers may come from another realm.
  return Object.prototype.toString.call(buffer) === '[object ArrayBuffer]';
}

/** Distinct buffers to transfer (two channels may share one). */
function transferList(audio: LocalWorkerAudio): ArrayBuffer[] {
  const views = audio.kind === 'decoded' ? audio.samples : [audio.bytes];
  return [...new Set(views.map((view) => view.buffer as ArrayBuffer))];
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
