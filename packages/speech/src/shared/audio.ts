/**
 * Audio input normalisation shared by speech adapters: accepts the input
 * shapes callers actually have (Blob, Buffer, Uint8Array, ArrayBuffer,
 * ReadableStream), enforces byte limits while buffering, and derives a
 * multipart filename whose extension matches the MIME type.
 */

import { SpeechConfigurationError } from './errors.js';
import type { AudioInput, AudioSource } from './types.js';

/** OpenAI caps `/audio/transcriptions` uploads at 25 MB. */
export const DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'video/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mpga': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

/**
 * Strips parameters (e.g. `;codecs=opus`) and lower-cases a MIME type.
 * Returns `undefined` for blank input.
 */
export function normalizeMimeType(
  mimeType: string | undefined | null,
): string | undefined {
  const essence = mimeType?.split(';')[0]?.trim().toLowerCase();
  return essence ? essence : undefined;
}

/**
 * Maps an audio MIME type to the file extension OpenAI-compatible servers use
 * to detect the container format. Codec parameters are ignored, so
 * `audio/webm;codecs=opus` maps to `webm`. Returns `undefined` when unknown.
 */
export function mimeTypeToAudioExtension(
  mimeType: string | undefined | null,
): string | undefined {
  const essence = normalizeMimeType(mimeType);
  return essence ? MIME_EXTENSIONS[essence] : undefined;
}

export interface NormalizeAudioOptions {
  /** MIME type override; wins over `AudioInput.mimeType`/`contentType` and Blob type. */
  mimeType?: string;
  /**
   * Maximum payload size in bytes. `undefined` or `Infinity` disables the
   * limit. Streams are cancelled as soon as they exceed it.
   */
  maxBytes?: number;
  /** Adapter name recorded on configuration errors. */
  adapter?: string;
  /** Aborts buffering (including a pending stream read) with the signal's reason. */
  signal?: AbortSignal;
  /** Base filename (without extension) used when the input has none. */
  defaultBasename?: string;
  /** Append a MIME-derived extension to the default filename. Default `true`. */
  deriveExtension?: boolean;
}

export interface NormalizedAudio {
  blob: Blob;
  /** Full MIME type including parameters, or `application/octet-stream`. */
  mimeType: string;
  bytes: number;
  /** Explicit filename, or `<basename>.<ext>` derived from the MIME type. */
  filename: string;
  durationSeconds?: number;
}

/**
 * Accepts either an {@link AudioInput} wrapper or a bare {@link AudioSource}
 * and returns a size-checked Blob plus the metadata needed for multipart
 * uploads.
 */
export async function normalizeAudioInput(
  input: AudioInput | AudioSource,
  options: NormalizeAudioOptions = {},
): Promise<NormalizedAudio> {
  const wrapped: AudioInput = isAudioInput(input) ? input : { data: input };
  const { adapter, signal } = options;
  signal?.throwIfAborted();
  const maxBytes = resolveMaxBytes(options.maxBytes, adapter);
  const data = wrapped.data;

  const blobType =
    typeof Blob !== 'undefined' && data instanceof Blob ? data.type : undefined;
  const mimeType =
    options.mimeType ??
    wrapped.mimeType ??
    wrapped.contentType ??
    (blobType || undefined) ??
    'application/octet-stream';

  let blob: Blob;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    assertWithinLimit(data.size, maxBytes, adapter);
    blob = data.type === mimeType ? data : new Blob([data], { type: mimeType });
  } else if (data instanceof Uint8Array) {
    assertWithinLimit(data.byteLength, maxBytes, adapter);
    blob = new Blob([copyBytes(data)], { type: mimeType });
  } else if (data instanceof ArrayBuffer) {
    assertWithinLimit(data.byteLength, maxBytes, adapter);
    blob = new Blob([data], { type: mimeType });
  } else if (isReadableStream(data)) {
    const chunks = await readStreamWithLimit(data, maxBytes, adapter, signal);
    blob = new Blob(chunks, { type: mimeType });
  } else {
    throw new SpeechConfigurationError(
      'Unsupported audio input: expected Blob, Buffer, Uint8Array, ArrayBuffer, or ReadableStream',
      adapter,
    );
  }

  if (blob.size === 0) {
    throw new SpeechConfigurationError('Audio input is empty', adapter);
  }

  const extension =
    options.deriveExtension === false
      ? undefined
      : mimeTypeToAudioExtension(mimeType);
  const basename = options.defaultBasename ?? 'audio';
  const filename =
    wrapped.filename ?? (extension ? `${basename}.${extension}` : basename);

  return {
    blob,
    mimeType,
    bytes: blob.size,
    filename,
    durationSeconds: wrapped.durationSeconds,
  };
}

function isAudioInput(value: AudioInput | AudioSource): value is AudioInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    !(typeof Blob !== 'undefined' && value instanceof Blob) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof ArrayBuffer) &&
    !isReadableStream(value)
  );
}

function isReadableStream(value: unknown): value is ReadableStream<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReadableStream).getReader === 'function'
  );
}

function resolveMaxBytes(
  maxBytes: number | undefined,
  adapter: string | undefined,
): number {
  if (maxBytes === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (Number.isNaN(maxBytes) || maxBytes <= 0) {
    throw new SpeechConfigurationError(
      'maxBytes must be a positive number',
      adapter,
    );
  }

  return maxBytes;
}

function assertWithinLimit(
  bytes: number,
  maxBytes: number,
  adapter: string | undefined,
): void {
  if (bytes > maxBytes) {
    throw new SpeechConfigurationError(
      `Audio input exceeds maxBytes (${bytes} > ${maxBytes} bytes)`,
      adapter,
    );
  }
}

async function readStreamWithLimit(
  stream: ReadableStream<unknown>,
  maxBytes: number,
  adapter: string | undefined,
  signal: AbortSignal | undefined,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total = 0;
  // Cancelling the reader settles any pending read, so an abort cannot hang.
  const onAbort = () => {
    reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        break;
      }

      // Check the size before copying so one oversized chunk is never duplicated.
      total += chunkByteLength(value, adapter);
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new SpeechConfigurationError(
          `Audio stream exceeds maxBytes (more than ${maxBytes} bytes)`,
          adapter,
        );
      }
      chunks.push(toBytes(value));
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }

  return chunks;
}

function chunkByteLength(value: unknown, adapter: string | undefined): number {
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  throw new SpeechConfigurationError(
    'Audio stream chunks must be Uint8Array or ArrayBuffer',
    adapter,
  );
}

function toBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return value instanceof Uint8Array
    ? copyBytes(value)
    : new Uint8Array((value as ArrayBuffer).slice(0));
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
