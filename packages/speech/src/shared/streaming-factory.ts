/**
 * Streaming transcriber factory, environment configuration, and the
 * record-then-send `Transcriber` wrapper.
 */

import { OpenAIRealtimeTranscriber } from '../adapters/openai-realtime.js';
import { VoxtralRealtimeTranscriber } from '../adapters/voxtral-realtime.js';
import { DEFAULT_MAX_AUDIO_BYTES, normalizeAudioInput } from './audio.js';
import {
  defaultEnv,
  mergeHeaderInits,
  parseHeadersEnv,
  parseOptionalInteger,
  readEnv,
  type SpeechEnv,
} from './env.js';
import {
  InvalidSpeechAdapterError,
  SpeechConfigurationError,
} from './errors.js';
import { unwrapRawAudio } from './pcm.js';
import type {
  GetStreamingTranscriberOptions,
  StreamingTranscriber,
  StreamingTranscriberType,
  StreamingTurnDetection,
} from './streaming-types.js';
import type {
  Transcriber,
  TranscriptionRequest,
  TranscriptResult,
} from './types.js';

/** Streaming adapters `getStreamingTranscriber()` can build. */
export const STREAMING_TRANSCRIBER_TYPES: readonly StreamingTranscriberType[] =
  ['openai-realtime', 'voxtral-realtime'];

/** Environment variable names read for each streaming setting, in priority order. */
export const STREAMING_TRANSCRIBER_ENV_KEYS = {
  type: ['HAVE_SPEECH_STREAMING_TYPE'],
  baseUrl: ['HAVE_SPEECH_STREAMING_BASE_URL'],
  model: ['HAVE_SPEECH_STREAMING_MODEL'],
  apiKey: ['HAVE_SPEECH_STREAMING_API_KEY'],
  language: ['HAVE_SPEECH_STREAMING_LANGUAGE'],
  turnDetection: ['HAVE_SPEECH_STREAMING_TURN_DETECTION'],
  timeoutMs: [
    'HAVE_SPEECH_STREAMING_TIMEOUT',
    'HAVE_SPEECH_STREAMING_TIMEOUT_MS',
  ],
  connectTimeoutMs: ['HAVE_SPEECH_STREAMING_CONNECT_TIMEOUT_MS'],
  headers: ['HAVE_SPEECH_STREAMING_HEADERS'],
} as const;

export interface StreamingFactoryContext {
  env?: SpeechEnv;
  /** Headers merged under explicit `headers` (env → context → options). */
  headers?: HeadersInit;
}

export function isStreamingTranscriberType(
  type: string | undefined,
): type is StreamingTranscriberType {
  return (
    type !== undefined &&
    (STREAMING_TRANSCRIBER_TYPES as readonly string[]).includes(type)
  );
}

/**
 * Creates a realtime streaming transcriber. Explicit options win over
 * `HAVE_SPEECH_STREAMING_*` environment variables. The type defaults to
 * `openai-realtime`.
 */
export function getStreamingTranscriber(
  options: GetStreamingTranscriberOptions = {},
  context: StreamingFactoryContext = {},
): StreamingTranscriber {
  const env = context.env ?? defaultEnv();
  const keys = STREAMING_TRANSCRIBER_ENV_KEYS;
  const type = options.type ?? readEnv(env, ...keys.type) ?? 'openai-realtime';

  if (!isStreamingTranscriberType(type)) {
    throw new InvalidSpeechAdapterError(type, 'streaming STT');
  }

  const headers = mergeHeaderInits(
    parseHeadersEnv(env, keys.headers),
    context.headers,
    options.headers,
  );
  const resolved = {
    ...options,
    type,
    baseUrl: (options.baseUrl ?? readEnv(env, ...keys.baseUrl))?.trim(),
    model: options.model ?? readEnv(env, ...keys.model),
    apiKey: options.apiKey ?? readEnv(env, ...keys.apiKey),
    language: options.language ?? readEnv(env, ...keys.language),
    turnDetection:
      options.turnDetection ??
      parseTurnDetection(readEnv(env, ...keys.turnDetection)),
    timeoutMs:
      options.timeoutMs ??
      parseOptionalInteger(readEnv(env, ...keys.timeoutMs)),
    connectTimeoutMs:
      options.connectTimeoutMs ??
      parseOptionalInteger(readEnv(env, ...keys.connectTimeoutMs)),
    headers,
  };

  switch (type) {
    case 'openai-realtime':
      return new OpenAIRealtimeTranscriber({ ...resolved, type });
    case 'voxtral-realtime':
      return new VoxtralRealtimeTranscriber({ ...resolved, type });
    default:
      throw new InvalidSpeechAdapterError(type, 'streaming STT');
  }
}

export function parseTurnDetection(
  value: string | undefined,
): StreamingTurnDetection | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === 'server_vad' || normalized === 'semantic_vad') {
    return { type: normalized };
  }
  if (normalized === 'manual' || normalized === 'none') {
    return { type: 'manual' };
  }
  throw new SpeechConfigurationError(
    'HAVE_SPEECH_STREAMING_TURN_DETECTION must be server_vad, semantic_vad, or manual',
  );
}

export interface StreamingTranscriberWrapperOptions {
  /** Bytes per `write()`. Default 64 KiB. */
  chunkBytes?: number;
  /** Upload limit in bytes. Default 25 MB; `Infinity` disables it. */
  maxBytes?: number;
  /**
   * Turn detection for wrapped sessions. Default `manual`: the whole clip is
   * one turn, committed by `end()`.
   */
  turnDetection?: StreamingTurnDetection;
}

/**
 * Adapts a streaming transcriber to the request/response `Transcriber`
 * interface for record-then-send callers. Each `transcribe()` opens one
 * session, streams the recording, and returns `session.end()`.
 *
 * Input must be raw audio: a PCM16/G.711 WAV file, `audio/pcm` or
 * `audio/L16` (optionally with `rate`/`channels` parameters), `audio/pcmu`,
 * `audio/pcma`, or untyped bytes in the adapter's default format. WAV headers
 * and MIME parameters set the session format; compressed recordings are
 * rejected, so use an HTTP transcriber for WebM/MP4/Ogg.
 */
export function wrapStreamingTranscriber(
  streaming: StreamingTranscriber,
  options: StreamingTranscriberWrapperOptions = {},
): Transcriber {
  const chunkBytes = options.chunkBytes ?? 64 * 1024;
  if (!Number.isInteger(chunkBytes) || chunkBytes <= 0) {
    throw new SpeechConfigurationError(
      'chunkBytes must be a positive integer',
      streaming.type,
    );
  }

  return {
    type: streaming.type,
    async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
      const audio = await normalizeAudioInput(request.audio, {
        mimeType: request.mimeType,
        maxBytes:
          request.maxBytes ?? options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES,
        adapter: streaming.type,
        signal: request.signal,
        deriveExtension: false,
      });
      const bytes = new Uint8Array(await audio.blob.arrayBuffer());
      const raw = unwrapRawAudio(bytes, audio.mimeType, streaming.type);
      const declared =
        request.audio &&
        typeof request.audio === 'object' &&
        'data' in request.audio
          ? request.audio
          : undefined;
      const format = {
        ...raw.format,
        sampleRate: raw.format.sampleRate ?? declared?.sampleRate,
        channels: raw.format.channels ?? declared?.channels,
      };

      const session = streaming.start({
        format: Object.fromEntries(
          Object.entries(format).filter(([, value]) => value !== undefined),
        ),
        language: request.language,
        model: request.model,
        prompt: request.prompt,
        headers: request.headers,
        signal: request.signal,
        onUsage: request.onUsage,
        metadata: request.metadata,
        turnDetection: options.turnDetection ?? { type: 'manual' },
      });

      try {
        for (
          let offset = 0;
          offset < raw.bytes.byteLength;
          offset += chunkBytes
        ) {
          await session.write(raw.bytes.subarray(offset, offset + chunkBytes));
        }
      } catch (error) {
        session.abort(error);
        throw error;
      }
      return session.end();
    },
  };
}
