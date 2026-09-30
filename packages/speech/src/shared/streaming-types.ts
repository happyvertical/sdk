/**
 * Streaming (realtime) speech-to-text contract.
 *
 * A {@link StreamingTranscriber} opens one {@link StreamingSession} per
 * utterance or conversation. Callers push raw audio with `write()`, listen for
 * `partial` and `final` events, and call `end()` for the whole transcript.
 */

import type { TranscriptResult } from './types.js';
import type { SpeechUsageCallback } from './usage.js';
import type {
  SpeechWebSocketConstructor,
  SpeechWebSocketFactory,
} from './websocket.js';

/** Streaming adapter identifiers. */
export type StreamingTranscriberType = 'openai-realtime';

/**
 * Raw audio sample encodings. Streaming adapters never decode containers
 * (WebM, MP4, Ogg) or resample: callers send audio in the negotiated format.
 *
 * - `pcm16`: signed 16-bit little-endian PCM, interleaved when multi-channel.
 * - `g711_ulaw` / `g711_alaw`: 8-bit G.711 companded audio.
 */
export type StreamingAudioEncoding = 'pcm16' | 'g711_ulaw' | 'g711_alaw';

/** Explicit audio format for a streaming session. */
export interface StreamingAudioFormat {
  encoding: StreamingAudioEncoding;
  /** Samples per second, e.g. `24000`. */
  sampleRate: number;
  /** Channel count. Realtime providers generally require mono (`1`). */
  channels: number;
}

/**
 * Turn detection (voice activity detection).
 *
 * - `server_vad`: the provider commits a turn after `silenceDurationMs` of
 *   silence and emits a `final` per turn. The default for live sessions.
 * - `semantic_vad`: the provider decides turn ends from content.
 * - `manual`: nothing is committed until `session.commit()` or `end()`. The
 *   default for the record-then-send `Transcriber` wrapper.
 */
export type StreamingTurnDetection =
  | {
      type: 'server_vad';
      /** Activation threshold 0-1. Provider default `0.5`. */
      threshold?: number;
      /** Audio kept before detected speech. Provider default `300`. */
      prefixPaddingMs?: number;
      /** Silence that ends a turn. Provider default `500`. */
      silenceDurationMs?: number;
    }
  | {
      type: 'semantic_vad';
      eagerness?: 'low' | 'medium' | 'high' | 'auto';
    }
  | { type: 'manual' };

/** Audio accepted by {@link StreamingSession.write}. `Buffer` is a `Uint8Array`. */
export type StreamingAudioChunk = Uint8Array | ArrayBuffer | ArrayBufferView;

/**
 * A short-lived browser credential, or a function that mints one per session
 * (for example by calling your server, which asks the provider for an
 * ephemeral client secret scoped to the current tenant).
 */
export type StreamingClientSecret = string | (() => string | Promise<string>);

/** Settings shared by adapter construction and individual sessions. */
export interface StreamingSessionSettings {
  /** Transcription model. */
  model?: string;
  /** ISO-639-1 language hint, e.g. `en`. */
  language?: string;
  /** Vocabulary or style prompt. */
  prompt?: string;
  /** Turn detection. Adapter default `server_vad`. */
  turnDetection?: StreamingTurnDetection;
  /** Audio format; unset fields use the adapter default. */
  format?: Partial<StreamingAudioFormat>;
  /**
   * Extra headers sent on the WebSocket handshake (e.g. gateway `x-bf-vk`).
   * Node-only: browsers cannot set WebSocket headers.
   */
  headers?: HeadersInit;
  /** Short-lived credential sent as a WebSocket subprotocol (browser-safe). */
  clientSecret?: StreamingClientSecret;
  /** Called with aggregated usage when `end()` succeeds. */
  onUsage?: SpeechUsageCallback;
}

/** Options for {@link StreamingTranscriber.start}. Values override adapter defaults. */
export interface StreamingSessionOptions extends StreamingSessionSettings {
  /** Aborting fails the session and closes the socket. */
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

/** Session lifecycle states. `closed` and `failed` are terminal. */
export type StreamingSessionState =
  | 'connecting'
  | 'open'
  | 'ending'
  | 'closed'
  | 'failed';

export interface StreamingPartialEvent {
  /** Newly recognised text. */
  delta: string;
  /** Text recognised so far for this turn (all deltas joined). */
  text: string;
  /** Provider turn/item id, when the protocol has one. */
  itemId?: string;
}

export interface StreamingFinalEvent {
  /** Final text for one committed turn. */
  text: string;
  itemId?: string;
  /** Provider usage block for this turn, passed through untouched. */
  providerUsage?: Record<string, unknown>;
  raw?: unknown;
}

export interface StreamingSpeechEvent {
  itemId?: string;
  /** Offset into the session audio, in milliseconds. */
  audioMs?: number;
}

export interface StreamingCloseEvent {
  code: number;
  reason: string;
}

/** Events emitted by a {@link StreamingSession}. */
export interface StreamingSessionEvents {
  /** The socket is open and the session configuration has been sent. */
  open: { sessionId?: string };
  partial: StreamingPartialEvent;
  final: StreamingFinalEvent;
  speech_started: StreamingSpeechEvent;
  speech_stopped: StreamingSpeechEvent;
  /**
   * A fatal session error. Emitted once; `end()` and pending `write()` calls
   * reject with the same error.
   */
  error: Error;
  /** The socket closed (normally after `end()`, or unexpectedly). */
  close: StreamingCloseEvent;
}

export type StreamingSessionEventName = keyof StreamingSessionEvents;

export type StreamingSessionListener<E extends StreamingSessionEventName> = (
  event: StreamingSessionEvents[E],
) => void;

/**
 * One realtime transcription session over a WebSocket.
 *
 * **Backpressure.** `write()` returns a promise that resolves once the chunk
 * has been handed to the socket and the socket's send buffer has drained to
 * `highWaterMark` or below. Await each write to stream at the rate the network
 * accepts. Writes are queued in order, including before the socket opens; a
 * write that would push queued, unsent audio past `maxBufferedBytes` rejects
 * instead of growing memory without bound.
 *
 * **Reconnect policy.** None. The provider holds the audio buffer and turn
 * state, so a mid-session socket drop cannot be resumed without losing or
 * duplicating text. An unexpected close fails the session: queued audio is
 * discarded, pending `write()` calls and `end()` reject with a
 * `SpeechProviderError`, and `error` then `close` are emitted. Start a new
 * session to continue; finals already emitted remain valid.
 */
export interface StreamingSession {
  readonly state: StreamingSessionState;
  /** Provider session id, once known. */
  readonly sessionId?: string;
  /** Resolves when the session is open; rejects if it fails first. */
  readonly ready: Promise<void>;
  /** Queued audio bytes not yet handed to the socket. */
  readonly queuedBytes: number;
  /** Queues audio in the session's negotiated format. See backpressure above. */
  write(chunk: StreamingAudioChunk): Promise<void>;
  /** Ends the current turn now (manual turn detection). Ordered after queued writes. */
  commit(): void;
  /**
   * Flushes queued audio, commits any uncommitted audio, waits for every
   * pending turn's final transcript (bounded by `timeoutMs`), closes the
   * socket, and resolves with the joined transcript and usage. Idempotent.
   */
  end(): Promise<TranscriptResult>;
  /** Fails the session immediately and closes the socket. */
  abort(reason?: unknown): void;
  /** Adds a listener; returns a function that removes it. */
  on<E extends StreamingSessionEventName>(
    event: E,
    listener: StreamingSessionListener<E>,
  ): () => void;
  off<E extends StreamingSessionEventName>(
    event: E,
    listener: StreamingSessionListener<E>,
  ): void;
}

/** Factory for realtime sessions against one configured provider. */
export interface StreamingTranscriber {
  readonly type: StreamingTranscriberType;
  /** Default audio format for new sessions. */
  readonly audioFormat: StreamingAudioFormat;
  /** Opens a session. Connection happens in the background; see `session.ready`. */
  start(options?: StreamingSessionOptions): StreamingSession;
}

/** Adapter options shared by WebSocket streaming transcribers. */
export interface StreamingTranscriberOptions extends StreamingSessionSettings {
  /**
   * WebSocket URL or HTTP(S) base URL. `http` becomes `ws` and `https`
   * becomes `wss`. A server root gets `/v1/realtime`; a base ending in a
   * version segment gets `/realtime`; a URL ending in `/realtime` is used as-is.
   */
  baseUrl?: string;
  /**
   * Long-lived API key sent as `Authorization: Bearer`. Node-only: refused in
   * browsers. Browsers use `clientSecret`.
   */
  apiKey?: string;
  /**
   * Maximum wait for final transcripts after `end()`, and for a congested
   * socket to drain during `write()`. Default `30000`.
   */
  timeoutMs?: number;
  /** Maximum wait for the socket to open. Default `10000`. */
  connectTimeoutMs?: number;
  /** Socket send-buffer size at which `write()` waits. Default 1 MiB. */
  highWaterMark?: number;
  /** Queued, unsent audio at which `write()` rejects. Default 16 MiB. */
  maxBufferedBytes?: number;
  /**
   * WebSocket constructor. Defaults to `globalThis.WebSocket` (Node 22+,
   * browsers, Deno, Bun). Handshake headers are passed as
   * `new WebSocket(url, { protocols, headers })`, which Node's built-in
   * WebSocket supports; use `createWebSocket` for other clients such as `ws`.
   */
  WebSocket?: SpeechWebSocketConstructor;
  /** Full control over socket creation; wins over `WebSocket`. */
  createWebSocket?: SpeechWebSocketFactory;
}

/** Options for the `openai-realtime` adapter. */
export interface OpenAIRealtimeTranscriberOptions
  extends StreamingTranscriberOptions {
  type?: 'openai-realtime';
  /** Default `wss://api.openai.com/v1/realtime`. */
  baseUrl?: string;
  /** Default `gpt-4o-transcribe`. */
  model?: string;
  /** `audio.input.noise_reduction.type`. Omitted by default. */
  noiseReduction?: 'near_field' | 'far_field';
  /** Session `include` list, e.g. `['item.input_audio_transcription.logprobs']`. */
  include?: string[];
  /**
   * Extra fields merged into `audio.input.transcription`, e.g.
   * `{ delay: 'low', languages: ['en', 'fr'] }` for `gpt-live-transcribe`.
   */
  transcriptionOptions?: Record<string, unknown>;
}

/** Options accepted by `getStreamingTranscriber()`. */
export interface GetStreamingTranscriberOptions
  extends Omit<OpenAIRealtimeTranscriberOptions, 'type'> {
  type?: StreamingTranscriberType;
}
