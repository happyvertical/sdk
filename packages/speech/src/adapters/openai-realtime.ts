/**
 * OpenAI Realtime transcription adapter (`openai-realtime`).
 *
 * Targets the GA Realtime API transcription session (no `OpenAI-Beta`
 * header): connect to `wss://api.openai.com/v1/realtime?intent=transcription`,
 * send `session.update` with `session.type: "transcription"`, stream
 * `input_audio_buffer.append`, and read
 * `conversation.item.input_audio_transcription.delta` / `.completed`.
 * Reference: https://developers.openai.com/api/docs/guides/realtime-transcription
 * and https://developers.openai.com/api/reference/resources/realtime/client-events
 */

import { SpeechConfigurationError } from '../shared/errors.js';
import { compactJson, resolveOpenAICompatibleUrl } from '../shared/http.js';
import {
  assertNoBrowserApiKey,
  CLIENT_SECRET_SUBPROTOCOL_PREFIX,
  mergeHeaderRecords,
  realtimeConnector,
} from '../shared/realtime-auth.js';
import {
  assertTurnLimitFitsProtocol,
  DEFAULT_STREAMING_CONNECT_TIMEOUT_MS,
  DEFAULT_STREAMING_HIGH_WATER_MARK,
  DEFAULT_STREAMING_MAX_BUFFERED_BYTES,
  DEFAULT_STREAMING_TIMEOUT_MS,
  type RealtimeProtocol,
  type RealtimeProtocolEvent,
  type RealtimeSessionConfig,
  RealtimeTranscriptionSession,
} from '../shared/realtime-session.js';
import type {
  OpenAIRealtimeTranscriberOptions,
  StreamingAudioFormat,
  StreamingSession,
  StreamingSessionOptions,
  StreamingTranscriber,
  StreamingTurnDetection,
  StreamingTurnLimit,
} from '../shared/streaming-types.js';
import {
  describeTurnLimit,
  resolveTurnLimit,
  type TurnLimit,
} from '../shared/turn-limit.js';
import {
  resolveWebSocketFactory,
  type SpeechWebSocketFactory,
  toWebSocketUrl,
} from '../shared/websocket.js';

const ADAPTER = 'openai-realtime';
export const OPENAI_REALTIME_DEFAULT_URL = 'wss://api.openai.com/v1/realtime';
export const OPENAI_REALTIME_DEFAULT_MODEL = 'gpt-4o-transcribe';

/** GA realtime input formats: 24 kHz mono PCM16, or 8 kHz mono G.711. */
const WIRE_FORMATS: Record<
  StreamingAudioFormat['encoding'],
  { type: string; sampleRate: number }
> = {
  pcm16: { type: 'audio/pcm', sampleRate: 24_000 },
  g711_ulaw: { type: 'audio/pcmu', sampleRate: 8_000 },
  g711_alaw: { type: 'audio/pcma', sampleRate: 8_000 },
};

/** The OpenAI Realtime transcription wire protocol. */
export const openAIRealtimeProtocol = (
  extras: Pick<
    OpenAIRealtimeTranscriberOptions,
    'noiseReduction' | 'include' | 'transcriptionOptions'
  > = {},
): RealtimeProtocol => ({
  provider: ADAPTER,
  commitAck: 'committed',
  endCommit: 'if-audio',
  // No per-turn cap by default: server VAD ends turns. Manual sessions may opt
  // in with `maxTurnSeconds`.
  // OpenAI rejects a commit with under 100 ms of audio as empty.
  minCommitSeconds: 0.1,
  sessionMessages(config: RealtimeSessionConfig) {
    return [
      {
        type: 'session.update',
        session: openAIRealtimeTranscriptionSession(config, extras),
      },
    ];
  },
  appendMessage(base64Audio: string) {
    return { type: 'input_audio_buffer.append', audio: base64Audio };
  },
  commitMessage() {
    return { type: 'input_audio_buffer.commit' };
  },
  parse: parseOpenAIRealtimeEvent,
});

/**
 * The GA transcription session object (`session.type: "transcription"`),
 * shared by `session.update` and the client-secret mint request.
 */
export function openAIRealtimeTranscriptionSession(
  config: RealtimeSessionConfig,
  extras: Pick<
    OpenAIRealtimeTranscriberOptions,
    'noiseReduction' | 'include' | 'transcriptionOptions'
  > = {},
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    format:
      config.format.encoding === 'pcm16'
        ? { type: 'audio/pcm', rate: config.format.sampleRate }
        : { type: WIRE_FORMATS[config.format.encoding].type },
    // Extension fields first: the typed settings must win, so the model
    // sent (or bound to a minted client secret) always matches the model
    // reported in usage.
    transcription: {
      ...compactJson(extras.transcriptionOptions ?? {}),
      ...compactJson({
        model: config.model,
        language: config.language,
        prompt: config.prompt,
      }),
    },
    turn_detection: turnDetectionToWire(config.turnDetection),
  };
  if (extras.noiseReduction) {
    input.noise_reduction = { type: extras.noiseReduction };
  }

  return compactJson({
    type: 'transcription',
    audio: { input },
    include: extras.include,
  });
}

/** Maps one OpenAI Realtime server event to normalised session events. */
export function parseOpenAIRealtimeEvent(
  message: unknown,
): RealtimeProtocolEvent[] {
  if (!message || typeof message !== 'object') {
    return [];
  }

  const event = message as Record<string, unknown>;
  const itemId = stringField(event, 'item_id');

  switch (event.type) {
    case 'session.created':
    case 'session.updated':
    case 'transcription_session.created':
    case 'transcription_session.updated': {
      const session = event.session as Record<string, unknown> | undefined;
      return [
        { type: 'session', sessionId: session && stringField(session, 'id') },
      ];
    }
    case 'input_audio_buffer.committed':
      return [{ type: 'committed', itemId }];
    case 'input_audio_buffer.speech_started':
      return [
        {
          type: 'speech_started',
          itemId,
          audioMs: numberField(event, 'audio_start_ms'),
        },
      ];
    case 'input_audio_buffer.speech_stopped':
      return [
        {
          type: 'speech_stopped',
          itemId,
          audioMs: numberField(event, 'audio_end_ms'),
        },
      ];
    case 'conversation.item.input_audio_transcription.delta': {
      const delta = stringField(event, 'delta');
      return delta ? [{ type: 'partial', itemId, delta }] : [];
    }
    case 'conversation.item.input_audio_transcription.completed': {
      const usage = event.usage;
      return [
        {
          type: 'final',
          itemId,
          text: stringField(event, 'transcript') ?? '',
          providerUsage:
            usage && typeof usage === 'object' && !Array.isArray(usage)
              ? (usage as Record<string, unknown>)
              : undefined,
          raw: event,
        },
      ];
    }
    case 'conversation.item.input_audio_transcription.failed': {
      const error = (event.error ?? {}) as Record<string, unknown>;
      return [
        {
          type: 'error',
          message: stringField(error, 'message') ?? 'transcription failed',
          code: stringField(error, 'code'),
          raw: event,
        },
      ];
    }
    case 'error': {
      const error = (event.error ?? {}) as Record<string, unknown>;
      const code = stringField(error, 'code');
      if (code === 'input_audio_buffer_commit_empty') {
        return [{ type: 'commit_empty' }];
      }
      return [
        {
          type: 'error',
          message: stringField(error, 'message') ?? 'unknown error',
          code,
          raw: event,
        },
      ];
    }
    default:
      return [];
  }
}

/**
 * Realtime transcriber for OpenAI and OpenAI-Realtime-compatible servers.
 *
 * Auth: `apiKey` is sent as `Authorization: Bearer` (Node only). In browsers,
 * pass `clientSecret` (an ephemeral client secret minted by your server); it
 * is sent as the `openai-insecure-api-key.<secret>` subprotocol. Supplying
 * `apiKey` or `headers` in a browser throws.
 */
export class OpenAIRealtimeTranscriber implements StreamingTranscriber {
  readonly type = ADAPTER;
  readonly audioFormat: StreamingAudioFormat;

  private readonly options: OpenAIRealtimeTranscriberOptions;
  private readonly url: string;
  private readonly createWebSocket: SpeechWebSocketFactory;
  private readonly protocol: RealtimeProtocol;

  constructor(options: OpenAIRealtimeTranscriberOptions = {}) {
    assertNoBrowserApiKey(ADAPTER, options.apiKey);

    this.options = options;
    this.url = resolveRealtimeUrl(
      options.baseUrl ?? OPENAI_REALTIME_DEFAULT_URL,
    );
    this.createWebSocket = resolveWebSocketFactory(ADAPTER, options);
    this.audioFormat = resolveOpenAIRealtimeFormat(options.format);
    this.protocol = openAIRealtimeProtocol(options);
    resolveTurnLimit(ADAPTER, undefined, options);
  }

  /**
   * A turn limit applies only to `manual` sessions with `maxTurnSeconds` set;
   * under server or semantic VAD the provider ends turns itself.
   */
  turnLimit(
    options: StreamingSessionOptions = {},
  ): StreamingTurnLimit | undefined {
    return describeTurnLimit(
      this.resolveTurnLimit(options),
      this.sessionFormat(options),
    );
  }

  private sessionFormat(
    options: StreamingSessionOptions,
  ): StreamingAudioFormat {
    // A different encoding starts from that encoding's defaults.
    return resolveOpenAIRealtimeFormat(
      options.format?.encoding &&
        options.format.encoding !== this.audioFormat.encoding
        ? options.format
        : { ...this.audioFormat, ...options.format },
    );
  }

  private resolveTurnLimit(
    options: StreamingSessionOptions,
  ): TurnLimit | undefined {
    const limit = resolveTurnLimit(
      ADAPTER,
      this.protocol.maxTurnSeconds,
      options,
      this.options,
    );
    if (this.turnDetection(options).type !== 'manual') {
      return undefined;
    }
    assertTurnLimitFitsProtocol(this.protocol, limit);
    return limit;
  }

  private turnDetection(
    options: StreamingSessionOptions,
  ): StreamingTurnDetection {
    return (
      options.turnDetection ??
      this.options.turnDetection ?? { type: 'server_vad' }
    );
  }

  start(options: StreamingSessionOptions = {}): StreamingSession {
    const format = this.sessionFormat(options);
    const connect = realtimeConnector({
      adapter: ADAPTER,
      url: this.url,
      apiKey: this.options.apiKey,
      headers: mergeHeaderRecords(this.options.headers, options.headers),
      clientSecret: options.clientSecret ?? this.options.clientSecret,
      protocols: (secret) =>
        secret
          ? ['realtime', `${CLIENT_SECRET_SUBPROTOCOL_PREFIX}${secret}`]
          : ['realtime'],
    });

    return new RealtimeTranscriptionSession({
      protocol: this.protocol,
      config: {
        model:
          options.model?.trim() ||
          this.options.model?.trim() ||
          OPENAI_REALTIME_DEFAULT_MODEL,
        format,
        turnDetection: this.turnDetection(options),
        language: options.language ?? this.options.language,
        prompt: options.prompt ?? this.options.prompt,
      },
      connect,
      createWebSocket: this.createWebSocket,
      timeoutMs: this.options.timeoutMs ?? DEFAULT_STREAMING_TIMEOUT_MS,
      connectTimeoutMs:
        this.options.connectTimeoutMs ?? DEFAULT_STREAMING_CONNECT_TIMEOUT_MS,
      highWaterMark:
        this.options.highWaterMark ?? DEFAULT_STREAMING_HIGH_WATER_MARK,
      maxBufferedBytes:
        this.options.maxBufferedBytes ?? DEFAULT_STREAMING_MAX_BUFFERED_BYTES,
      signal: options.signal,
      onUsage: [this.options.onUsage, options.onUsage],
      turnLimit: this.resolveTurnLimit(options),
    });
  }
}

/**
 * Resolves a realtime WebSocket URL: `http(s)` becomes `ws(s)`, a server root
 * gets `/v1/realtime`, a versioned API root gets `/realtime`, and
 * `intent=transcription` is added unless an `intent` is already present. No
 * `model` query parameter is added: the model travels in `session.update`.
 */
export function resolveRealtimeUrl(baseUrl: string): string {
  const url = new URL(
    toWebSocketUrl(resolveOpenAICompatibleUrl(baseUrl, 'realtime'), ADAPTER),
  );
  if (!url.searchParams.has('intent')) {
    url.searchParams.set('intent', 'transcription');
  }
  return url.toString();
}

export function resolveOpenAIRealtimeFormat(
  format: Partial<StreamingAudioFormat> | undefined,
): StreamingAudioFormat {
  const encoding = format?.encoding ?? 'pcm16';
  const wire = WIRE_FORMATS[encoding];
  if (!wire) {
    throw new SpeechConfigurationError(
      `openai-realtime does not support encoding ${String(encoding)}`,
      ADAPTER,
    );
  }

  const resolved: StreamingAudioFormat = {
    encoding,
    sampleRate: format?.sampleRate ?? wire.sampleRate,
    channels: format?.channels ?? 1,
  };
  if (resolved.sampleRate !== wire.sampleRate || resolved.channels !== 1) {
    throw new SpeechConfigurationError(
      `openai-realtime requires ${encoding} at ${wire.sampleRate} Hz mono (got ${resolved.sampleRate} Hz, ${resolved.channels} channel(s)); resample before streaming`,
      ADAPTER,
    );
  }
  return resolved;
}

function turnDetectionToWire(
  turnDetection: StreamingTurnDetection,
): Record<string, unknown> | null {
  switch (turnDetection.type) {
    case 'manual':
      return null;
    case 'server_vad':
      return compactJson({
        type: 'server_vad',
        threshold: turnDetection.threshold,
        prefix_padding_ms: turnDetection.prefixPaddingMs,
        silence_duration_ms: turnDetection.silenceDurationMs,
      });
    case 'semantic_vad':
      return compactJson({
        type: 'semantic_vad',
        eagerness: turnDetection.eagerness,
      });
    default:
      throw new SpeechConfigurationError(
        `Unknown turn detection type: ${String((turnDetection as { type?: unknown }).type)}`,
        ADAPTER,
      );
  }
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function numberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}
