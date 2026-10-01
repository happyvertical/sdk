/**
 * vLLM realtime transcription adapter (`voxtral-realtime`), for Mistral's
 * Voxtral Realtime models (e.g. `mistralai/Voxtral-Mini-4B-Realtime-2602`)
 * served by vLLM at `/v1/realtime`.
 *
 * vLLM's protocol borrows OpenAI event names but is not OpenAI-compatible.
 * Verified against vLLM's `entrypoints/speech_to_text/realtime` source and a
 * live server:
 *
 * 1. The server sends `session.created` (`{ id, created }`) on connect.
 * 2. The client sends `session.update` with a top-level `model` (no nested
 *    `session` object, no acknowledgement; an unknown model yields an
 *    `error` with code `model_not_found`).
 * 3. A non-final `input_audio_buffer.commit` starts generation for a turn.
 * 4. `input_audio_buffer.append` carries base64 PCM16 at 16 kHz mono. Audio
 *    appended before the start commit is kept.
 * 5. The server streams `transcription.delta` (`{ delta }`, often empty) while
 *    audio arrives, at roughly real-time speed.
 * 6. `input_audio_buffer.commit` with `final: true` ends the turn; the server
 *    replies `transcription.done` (`{ text, usage }`, token usage only) and
 *    clears its buffer. A further start commit opens the next turn on the same
 *    socket.
 * 7. Errors arrive as `{ type: 'error', error: string, code }` and leave the
 *    socket open; this adapter treats every error as fatal.
 * 8. A turn whose audio and tokens exceed `max_model_len` (~12.5 tokens per
 *    audio second plus a 39-token prompt) ends in `error` `processing_error`.
 * 9. A stray final commit leaves a stale end marker: the next turn ends at once
 *    with `prompt_tokens: 1` (any audio costs 39) and its audio is dropped.
 *    The session fails closed on that, and on any `done` for a turn it did
 *    not commit, rather than losing audio silently.
 */

import { SpeechConfigurationError } from '../shared/errors.js';
import { resolveOpenAICompatibleUrl } from '../shared/http.js';
import {
  assertNoBrowserApiKey,
  CLIENT_SECRET_SUBPROTOCOL_PREFIX,
  mergeHeaderRecords,
  realtimeConnector,
} from '../shared/realtime-auth.js';
import {
  DEFAULT_STREAMING_CONNECT_TIMEOUT_MS,
  DEFAULT_STREAMING_HIGH_WATER_MARK,
  DEFAULT_STREAMING_MAX_BUFFERED_BYTES,
  DEFAULT_STREAMING_TIMEOUT_MS,
  type RealtimeProtocol,
  type RealtimeProtocolEvent,
  RealtimeTranscriptionSession,
} from '../shared/realtime-session.js';
import type {
  StreamingAudioFormat,
  StreamingSession,
  StreamingSessionOptions,
  StreamingTranscriber,
  StreamingTurnDetection,
  VoxtralRealtimeTranscriberOptions,
} from '../shared/streaming-types.js';
import {
  resolveWebSocketFactory,
  type SpeechWebSocketFactory,
  toWebSocketUrl,
} from '../shared/websocket.js';

const ADAPTER = 'voxtral-realtime';

/** vLLM's default served model name for Voxtral Mini Realtime. */
export const VOXTRAL_REALTIME_DEFAULT_MODEL =
  'mistralai/Voxtral-Mini-4B-Realtime-2602';

/** The only input format vLLM's realtime endpoint accepts. */
export const VOXTRAL_REALTIME_AUDIO_FORMAT: Readonly<StreamingAudioFormat> =
  Object.freeze({ encoding: 'pcm16', sampleRate: 16_000, channels: 1 });

/** The vLLM realtime wire protocol. */
export const voxtralRealtimeProtocol = (): RealtimeProtocol => ({
  provider: ADAPTER,
  // vLLM never acknowledges a commit; `transcription.done` closes the turn.
  commitAck: 'final',
  // The start commit is sent lazily before a turn's first audio, so a session
  // with no uncommitted audio has no open turn and needs no end commit.
  endCommit: 'if-audio',
  sessionMessages(config) {
    return [{ type: 'session.update', model: config.model }];
  },
  turnStartMessage() {
    return { type: 'input_audio_buffer.commit' };
  },
  appendMessage(base64Audio) {
    return { type: 'input_audio_buffer.append', audio: base64Audio };
  },
  commitMessage() {
    // Every turn end is a final commit; the next turn gets a new start commit.
    return { type: 'input_audio_buffer.commit', final: true };
  },
  parse: parseVoxtralRealtimeEvent,
});

/** Maps one vLLM realtime server event to normalised session events. */
export function parseVoxtralRealtimeEvent(
  message: unknown,
): RealtimeProtocolEvent[] {
  if (!message || typeof message !== 'object') {
    return [];
  }

  const event = message as Record<string, unknown>;
  switch (event.type) {
    case 'session.created':
      return [
        {
          type: 'session',
          sessionId: typeof event.id === 'string' ? event.id : undefined,
        },
      ];
    case 'transcription.delta': {
      const delta = typeof event.delta === 'string' ? event.delta : '';
      return delta ? [{ type: 'partial', delta }] : [];
    }
    case 'transcription.done': {
      const usage =
        event.usage &&
        typeof event.usage === 'object' &&
        !Array.isArray(event.usage)
          ? (event.usage as Record<string, unknown>)
          : undefined;
      // Any audio, even one sample, costs the turn's full audio prompt
      // (39 tokens on Voxtral Mini Realtime); a turn that consumed no audio
      // reports `prompt_tokens: 1`.
      const promptTokens = usage?.prompt_tokens;
      return [
        {
          type: 'final',
          text: typeof event.text === 'string' ? event.text.trim() : '',
          providerUsage: usage,
          raw: event,
          audioConsumed:
            typeof promptTokens === 'number' ? promptTokens > 1 : undefined,
        },
      ];
    }
    case 'error':
      return [
        {
          type: 'error',
          message:
            typeof event.error === 'string' ? event.error : 'unknown error',
          code: typeof event.code === 'string' ? event.code : undefined,
          raw: event,
        },
      ];
    default:
      return [];
  }
}

/**
 * Realtime transcriber for Voxtral Realtime served by vLLM.
 *
 * - Audio: PCM16, 16 kHz, mono only; write whole samples (even byte counts).
 * - Turns: manual only. vLLM has no VAD; it streams partials continuously and
 *   produces one final per `commit()` / `end()`.
 * - `language` and `prompt` are not sent: vLLM's realtime session accepts
 *   only `model`.
 * - Auth: `apiKey` → `Authorization: Bearer` (Node only). vLLM has no
 *   ephemeral tokens, so browsers must connect through the consumer's own
 *   proxy or token gateway, passing that gateway's short-lived `clientSecret`
 *   (sent as the `openai-insecure-api-key.<secret>` subprotocol next to
 *   `realtime`; the gateway must echo `realtime`).
 */
export class VoxtralRealtimeTranscriber implements StreamingTranscriber {
  readonly type = ADAPTER;
  readonly audioFormat: StreamingAudioFormat = {
    ...VOXTRAL_REALTIME_AUDIO_FORMAT,
  };

  private readonly options: VoxtralRealtimeTranscriberOptions;
  private readonly url: string;
  private readonly createWebSocket: SpeechWebSocketFactory;
  private readonly protocol = voxtralRealtimeProtocol();

  constructor(options: VoxtralRealtimeTranscriberOptions = {}) {
    assertNoBrowserApiKey(ADAPTER, options.apiKey);
    if (!options.baseUrl?.trim()) {
      throw new SpeechConfigurationError(
        'voxtral-realtime requires baseUrl (the vLLM server, e.g. http://localhost:8000 or its /v1 root)',
        ADAPTER,
      );
    }

    this.options = options;
    this.url = resolveVoxtralRealtimeUrl(options.baseUrl);
    this.createWebSocket = resolveWebSocketFactory(ADAPTER, options);
    assertFormat(options.format);
    assertTurnDetection(options.turnDetection);
  }

  start(options: StreamingSessionOptions = {}): StreamingSession {
    assertFormat(options.format);
    assertTurnDetection(options.turnDetection);
    const connect = realtimeConnector({
      adapter: ADAPTER,
      url: this.url,
      apiKey: this.options.apiKey,
      headers: mergeHeaderRecords(this.options.headers, options.headers),
      clientSecret: options.clientSecret ?? this.options.clientSecret,
      // A plain vLLM server selects no subprotocol, so offer none unless a
      // gateway token must travel in one.
      protocols: (secret) =>
        secret
          ? ['realtime', `${CLIENT_SECRET_SUBPROTOCOL_PREFIX}${secret}`]
          : [],
    });

    return new RealtimeTranscriptionSession({
      protocol: this.protocol,
      config: {
        model:
          options.model?.trim() ||
          this.options.model?.trim() ||
          VOXTRAL_REALTIME_DEFAULT_MODEL,
        format: { ...VOXTRAL_REALTIME_AUDIO_FORMAT },
        turnDetection: { type: 'manual' },
        language: options.language ?? this.options.language,
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
    });
  }
}

/**
 * Resolves vLLM's realtime WebSocket URL: `http(s)` becomes `ws(s)`, a server
 * root gets `/v1/realtime`, a versioned API root (e.g. a gateway's
 * `/stt/v1`) gets `/realtime`, and a URL ending in `/realtime` is kept.
 */
export function resolveVoxtralRealtimeUrl(baseUrl: string): string {
  return toWebSocketUrl(
    resolveOpenAICompatibleUrl(baseUrl, 'realtime'),
    ADAPTER,
  );
}

function assertFormat(format: Partial<StreamingAudioFormat> | undefined): void {
  const expected = VOXTRAL_REALTIME_AUDIO_FORMAT;
  if (
    format &&
    ((format.encoding !== undefined && format.encoding !== expected.encoding) ||
      (format.sampleRate !== undefined &&
        format.sampleRate !== expected.sampleRate) ||
      (format.channels !== undefined && format.channels !== expected.channels))
  ) {
    throw new SpeechConfigurationError(
      `voxtral-realtime requires pcm16 at 16000 Hz mono (got ${format.encoding ?? 'pcm16'} at ${format.sampleRate ?? 16_000} Hz, ${format.channels ?? 1} channel(s)); resample before streaming`,
      ADAPTER,
    );
  }
}

function assertTurnDetection(
  turnDetection: StreamingTurnDetection | undefined,
): void {
  if (turnDetection && turnDetection.type !== 'manual') {
    throw new SpeechConfigurationError(
      `voxtral-realtime has no server turn detection (got ${turnDetection.type}); use manual turns with commit()/end()`,
      ADAPTER,
    );
  }
}
