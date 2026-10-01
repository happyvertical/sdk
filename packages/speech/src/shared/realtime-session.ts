/**
 * Protocol-agnostic realtime transcription session over a WebSocket.
 *
 * The session owns the socket lifecycle, write queue and backpressure,
 * timeouts, turn bookkeeping, events, and the final `TranscriptResult`. A
 * {@link RealtimeProtocol} supplies the wire format, so a sibling adapter
 * (for example a vLLM-served Voxtral realtime endpoint) only has to map its
 * own messages.
 */

import { SpeechError, SpeechProviderError } from './errors.js';
import { redactSecret } from './http.js';
import { audioSecondsForBytes, chunkToBytes, encodeBase64 } from './pcm.js';
import type {
  StreamingAudioChunk,
  StreamingAudioFormat,
  StreamingSession,
  StreamingSessionEventName,
  StreamingSessionEvents,
  StreamingSessionListener,
  StreamingSessionState,
  StreamingTurnDetection,
} from './streaming-types.js';
import type { TranscriptResult, TranscriptSegment } from './types.js';
import {
  audioSecondsFromProviderUsage,
  reportSpeechUsage,
  type SpeechUsage,
  type SpeechUsageCallback,
} from './usage.js';
import {
  messageDataToText,
  type SpeechWebSocket,
  type SpeechWebSocketCloseEvent,
  type SpeechWebSocketFactory,
} from './websocket.js';

export const DEFAULT_STREAMING_TIMEOUT_MS = 30_000;
export const DEFAULT_STREAMING_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_STREAMING_HIGH_WATER_MARK = 1024 * 1024;
export const DEFAULT_STREAMING_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
const DRAIN_POLL_MS = 10;

/** Normalised events a protocol parser returns for one server message. */
export type RealtimeProtocolEvent =
  | { type: 'session'; sessionId?: string }
  /** The provider committed a turn (from a client commit or server VAD). */
  | { type: 'committed'; itemId?: string }
  /** The provider rejected a commit because its buffer was empty. Not fatal. */
  | { type: 'commit_empty' }
  | { type: 'partial'; itemId?: string; delta: string }
  | {
      type: 'final';
      itemId?: string;
      text: string;
      providerUsage?: Record<string, unknown>;
      raw?: unknown;
      /**
       * `false` when the provider reports that the turn consumed no audio
       * (vLLM: `usage.prompt_tokens <= 1`). A turn that was sent audio but
       * consumed none means the provider's turn state is out of sync, and the
       * session fails instead of silently dropping that audio.
       */
      audioConsumed?: boolean;
    }
  | { type: 'speech_started'; itemId?: string; audioMs?: number }
  | { type: 'speech_stopped'; itemId?: string; audioMs?: number }
  /** A fatal provider error. */
  | { type: 'error'; message: string; code?: string; raw?: unknown };

/** Resolved per-session settings handed to the protocol. */
export interface RealtimeSessionConfig {
  model: string;
  format: StreamingAudioFormat;
  turnDetection: StreamingTurnDetection;
  language?: string;
  prompt?: string;
}

/** Wire format of one realtime provider. */
export interface RealtimeProtocol {
  /** Adapter name used for errors and usage, e.g. `openai-realtime`. */
  readonly provider: string;
  /**
   * How a client commit is acknowledged: by a `committed` event (OpenAI), or
   * only by the turn's `final` event (servers without a commit ack).
   */
  readonly commitAck: 'committed' | 'final';
  /**
   * Whether `end()` commits only when uncommitted audio remains
   * (`if-audio`), or always sends a final commit (`always`, for servers that
   * need an explicit end-of-stream marker).
   */
  readonly endCommit: 'if-audio' | 'always';
  /** Messages sent once the socket opens (session configuration). */
  sessionMessages(config: RealtimeSessionConfig): unknown[];
  /** One audio chunk, already base64-encoded. */
  appendMessage(base64Audio: string): unknown;
  /** Ends the current turn. `final` is true for the commit sent by `end()`. */
  commitMessage(options: { final: boolean }): unknown;
  /**
   * Opens a turn before its first audio, for servers that only start
   * generating after an explicit start signal (vLLM's non-final
   * `input_audio_buffer.commit`). When set, the session sends it before the
   * first append of every turn, and holds audio written after a commit until
   * every outstanding turn has been acknowledged, so a server that resets its
   * buffer between turns never drops audio.
   */
  turnStartMessage?(): unknown;
  /** Maps one parsed JSON server message to zero or more events. */
  parse(message: unknown): RealtimeProtocolEvent[];
}

/** Where and how to open the socket; resolved per session. */
export interface RealtimeConnection {
  url: string;
  protocols: string[];
  headers: Record<string, string>;
  /** Credentials to redact from surfaced provider text. */
  secrets: string[];
}

export interface RealtimeSessionInit {
  protocol: RealtimeProtocol;
  config: RealtimeSessionConfig;
  /** Resolves the connection (may mint a short-lived token). */
  connect: () => Promise<RealtimeConnection>;
  createWebSocket: SpeechWebSocketFactory;
  timeoutMs: number;
  connectTimeoutMs: number;
  highWaterMark: number;
  maxBufferedBytes: number;
  signal?: AbortSignal;
  /** Called in order with the aggregated usage when `end()` succeeds. */
  onUsage: Array<SpeechUsageCallback | undefined>;
}

type QueueItem =
  | {
      kind: 'audio';
      base64: string;
      bytes: number;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  | { kind: 'commit'; final: boolean };

interface FinalRecord {
  itemId?: string;
  text: string;
  providerUsage?: Record<string, unknown>;
  raw?: unknown;
  arrival: number;
}

const noop = () => undefined;

export class RealtimeTranscriptionSession implements StreamingSession {
  state: StreamingSessionState = 'connecting';
  sessionId?: string;
  readonly ready: Promise<void>;

  private readonly init: RealtimeSessionInit;
  private readonly provider: string;
  private resolveReady: () => void = noop;
  private rejectReady: (error: Error) => void = noop;
  private socket?: SpeechWebSocket;
  private opened = false;
  private secrets: string[] = [];
  private queue: QueueItem[] = [];
  private queued = 0;
  private pumping = false;
  private totalBytes = 0;
  private uncommittedBytes = 0;
  private outstandingCommits = 0;
  /** Per outstanding commit, in order: whether it carried audio. */
  private readonly commitHadAudio: boolean[] = [];
  private turnOpen = false;
  /** `Date.now()` of the last server message; bounds inactivity waits. */
  private lastServerMessageAt = 0;
  private readonly itemOrder: string[] = [];
  private readonly pendingItems = new Set<string>();
  private readonly vadStoppedItems = new Set<string>();
  private readonly partials = new Map<string, string>();
  private readonly finals: FinalRecord[] = [];
  private readonly listeners = new Map<
    StreamingSessionEventName,
    Set<(event: never) => void>
  >();
  private error?: Error;
  private endPromise?: Promise<TranscriptResult>;
  private endWaiter?: { resolve: () => void; reject: (error: Error) => void };
  private connectTimer?: ReturnType<typeof setTimeout>;
  private endTimer?: ReturnType<typeof setTimeout>;
  private closeEmitted = false;
  private readonly onAbort = () => {
    this.fail(toError(this.init.signal?.reason, this.provider));
  };

  constructor(init: RealtimeSessionInit) {
    this.init = init;
    this.provider = init.protocol.provider;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.ready.catch(noop);

    if (init.signal?.aborted) {
      this.fail(toError(init.signal.reason, this.provider));
      return;
    }
    init.signal?.addEventListener('abort', this.onAbort, { once: true });
    void this.connect();
  }

  get queuedBytes(): number {
    return this.queued;
  }

  write(chunk: StreamingAudioChunk): Promise<void> {
    const promise = this.enqueueAudio(chunk);
    promise.catch(noop);
    return promise;
  }

  commit(): void {
    if (this.isTerminal() || this.endPromise) {
      return;
    }
    this.queue.push({ kind: 'commit', final: false });
    void this.pump();
  }

  end(): Promise<TranscriptResult> {
    if (this.endPromise) {
      return this.endPromise;
    }

    if (this.error) {
      this.endPromise = Promise.reject(this.error);
      return this.endPromise;
    }

    this.state = 'ending';
    this.queue.push({ kind: 'commit', final: true });
    const settled = new Promise<void>((resolve, reject) => {
      this.endWaiter = { resolve, reject };
    });
    this.armEndTimer();
    this.endPromise = settled.then(() => this.finish());
    void this.pump();
    this.checkEnded();
    return this.endPromise;
  }

  /**
   * (Re)starts the end timeout. It measures provider inactivity: every server
   * message restarts it, so a long recording that is still being transcribed
   * is not cut off, while a silent provider still fails after `timeoutMs`.
   */
  private armEndTimer(): void {
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      this.fail(
        new SpeechProviderError(
          this.provider,
          `${this.provider} timed out after ${this.init.timeoutMs} ms waiting for the final transcript`,
        ),
      );
    }, this.init.timeoutMs);
  }

  abort(reason?: unknown): void {
    this.fail(toError(reason, this.provider));
  }

  on<E extends StreamingSessionEventName>(
    event: E,
    listener: StreamingSessionListener<E>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as (event: never) => void);
    return () => this.off(event, listener);
  }

  off<E extends StreamingSessionEventName>(
    event: E,
    listener: StreamingSessionListener<E>,
  ): void {
    this.listeners.get(event)?.delete(listener as (event: never) => void);
  }

  private enqueueAudio(chunk: StreamingAudioChunk): Promise<void> {
    if (this.error) {
      return Promise.reject(this.error);
    }
    if (this.endPromise || this.isTerminal()) {
      return Promise.reject(
        new SpeechError(
          'Cannot write to a streaming session after end()',
          'SPEECH_SESSION_ENDED',
          this.provider,
        ),
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = chunkToBytes(chunk, this.provider);
    } catch (error) {
      return Promise.reject(error);
    }
    if (bytes.byteLength === 0) {
      return Promise.resolve();
    }
    if (this.queued + bytes.byteLength > this.init.maxBufferedBytes) {
      return Promise.reject(
        new SpeechError(
          `Streaming write would queue more than maxBufferedBytes (${this.init.maxBufferedBytes}); await write() before sending more audio`,
          'SPEECH_BACKPRESSURE',
          this.provider,
        ),
      );
    }

    // Encode now so callers may reuse their buffer as soon as write() returns.
    const base64 = encodeBase64(bytes);
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        kind: 'audio',
        base64,
        bytes: bytes.byteLength,
        resolve,
        reject,
      });
      this.queued += bytes.byteLength;
      void this.pump();
    });
  }

  private async connect(): Promise<void> {
    this.connectTimer = setTimeout(() => {
      this.fail(
        new SpeechProviderError(
          this.provider,
          `${this.provider} connection timed out after ${this.init.connectTimeoutMs} ms`,
        ),
      );
    }, this.init.connectTimeoutMs);

    try {
      const connection = await this.init.connect();
      if (this.isTerminal()) {
        return;
      }
      this.secrets = connection.secrets;
      const socket = this.init.createWebSocket(connection.url, {
        protocols: connection.protocols,
        headers: connection.headers,
      });
      this.socket = socket;
      try {
        socket.binaryType = 'arraybuffer';
      } catch {
        // Some implementations expose a read-only binaryType.
      }
      socket.addEventListener('open', () => this.onOpen());
      socket.addEventListener('message', (event) => this.onMessage(event.data));
      socket.addEventListener('error', () => {
        this.fail(
          new SpeechProviderError(
            this.provider,
            `${this.provider} WebSocket error`,
          ),
        );
      });
      socket.addEventListener('close', (event) => this.onClose(event));
    } catch (error) {
      this.fail(toError(error, this.provider));
    }
  }

  private onOpen(): void {
    clearTimeout(this.connectTimer);
    if (this.isTerminal()) {
      this.closeSocket();
      return;
    }

    this.opened = true;
    for (const message of this.init.protocol.sessionMessages(
      this.init.config,
    )) {
      if (!this.send(message)) {
        return;
      }
    }
    if (this.state === 'connecting') {
      this.state = 'open';
    }
    this.resolveReady();
    this.emit('open', { sessionId: this.sessionId });
    void this.pump();
  }

  private onMessage(data: unknown): void {
    if (this.isTerminal()) {
      return;
    }

    this.lastServerMessageAt = Date.now();
    if (this.endWaiter) {
      this.armEndTimer();
    }

    const text = messageDataToText(data);
    if (text === undefined) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    let events: RealtimeProtocolEvent[];
    try {
      events = this.init.protocol.parse(parsed);
    } catch (error) {
      this.fail(toError(error, this.provider));
      return;
    }

    for (const event of events) {
      if (this.isTerminal()) {
        return;
      }
      this.handle(event);
    }
    this.checkEnded();
  }

  private handle(event: RealtimeProtocolEvent): void {
    switch (event.type) {
      case 'session':
        this.sessionId = event.sessionId ?? this.sessionId;
        return;
      case 'committed':
        if (event.itemId && !this.pendingItems.has(event.itemId)) {
          this.pendingItems.add(event.itemId);
          this.itemOrder.push(event.itemId);
        }
        // A turn whose speech_stopped we saw was committed by server VAD, so
        // it does not acknowledge one of our commits.
        if (
          this.init.protocol.commitAck === 'committed' &&
          !(event.itemId && this.vadStoppedItems.has(event.itemId))
        ) {
          this.ackCommit();
        }
        return;
      case 'commit_empty':
        this.ackCommit();
        return;
      case 'partial': {
        const key = event.itemId ?? '';
        const text = (this.partials.get(key) ?? '') + event.delta;
        this.partials.set(key, text);
        this.emit('partial', {
          delta: event.delta,
          text,
          itemId: event.itemId,
        });
        return;
      }
      case 'final': {
        let serverEnded = false;
        if (this.init.protocol.commitAck === 'final') {
          if (this.outstandingCommits === 0) {
            // A final we did not ask for: the server ended the open turn by
            // itself (vLLM does when the model context fills).
            serverEnded = true;
          } else if (this.ackCommit() && event.audioConsumed === false) {
            // Our turn carried audio but the server consumed none. vLLM does
            // this when a stale end-of-turn marker (left by a commit that
            // crossed a server-ended turn) ends the turn at once.
            this.fail(
              new SpeechProviderError(
                this.provider,
                `${this.provider} finished a turn without transcribing its audio (the server's turn state is out of sync, typically after a turn filled the model context); start a new session`,
              ),
            );
            return;
          }
        }
        if (event.itemId) {
          this.pendingItems.delete(event.itemId);
        }
        this.partials.delete(event.itemId ?? '');
        this.finals.push({
          itemId: event.itemId,
          text: event.text,
          providerUsage: event.providerUsage,
          raw: event.raw,
          arrival: this.finals.length,
        });
        this.emit('final', {
          text: event.text,
          itemId: event.itemId,
          providerUsage: event.providerUsage,
          raw: event.raw,
        });
        if (serverEnded) {
          // Fail closed: audio sent after the cut-off was never transcribed,
          // and the server may now be out of step with our turns.
          this.fail(
            new SpeechProviderError(
              this.provider,
              `${this.provider} ended a turn before it was committed, probably because the model context (max_model_len) filled; audio sent after that point was not transcribed. Call commit() more often and start a new session`,
            ),
          );
        }
        return;
      }
      case 'speech_started':
        this.emit(event.type, { itemId: event.itemId, audioMs: event.audioMs });
        return;
      case 'speech_stopped':
        if (event.itemId) {
          this.vadStoppedItems.add(event.itemId);
        }
        this.emit(event.type, { itemId: event.itemId, audioMs: event.audioMs });
        return;
      case 'error':
        this.fail(
          new SpeechProviderError(
            this.provider,
            this.redact(
              `${this.provider} error${event.code ? ` (${event.code})` : ''}: ${event.message}`,
            ) ?? `${this.provider} error`,
            {
              responseBody:
                event.raw === undefined
                  ? undefined
                  : this.redact(JSON.stringify(event.raw)),
            },
          ),
        );
        return;
    }
  }

  /** Acknowledges the oldest outstanding commit; returns whether it carried audio. */
  private ackCommit(): boolean {
    this.outstandingCommits = Math.max(0, this.outstandingCommits - 1);
    return this.commitHadAudio.shift() ?? false;
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.opened) {
      return;
    }

    this.pumping = true;
    try {
      while (this.queue.length > 0 && !this.isTerminal()) {
        await this.waitForDrain();
        if (!(await this.openTurnIfNeeded())) {
          break;
        }
        const item = this.queue.shift();
        if (!item || this.isTerminal()) {
          if (item?.kind === 'audio') {
            item.reject(this.error ?? new Error('Session closed'));
          }
          break;
        }

        if (item.kind === 'commit') {
          this.sendCommit(item.final);
          continue;
        }

        this.queued -= item.bytes;
        if (!this.send(this.init.protocol.appendMessage(item.base64))) {
          item.reject(this.error ?? new Error('Session closed'));
          break;
        }
        this.totalBytes += item.bytes;
        this.uncommittedBytes += item.bytes;
        await this.waitForDrain();
        if (this.error) {
          item.reject(this.error);
        } else {
          item.resolve();
        }
      }
    } finally {
      this.pumping = false;
    }
    this.checkEnded();
  }

  private sendCommit(final: boolean): void {
    const needed =
      this.uncommittedBytes > 0 ||
      (final && this.init.protocol.endCommit === 'always');
    if (!needed) {
      return;
    }
    if (this.send(this.init.protocol.commitMessage({ final }))) {
      this.commitHadAudio.push(this.uncommittedBytes > 0);
      this.uncommittedBytes = 0;
      this.outstandingCommits += 1;
      this.turnOpen = false;
    }
  }

  /**
   * For protocols with an explicit turn start: before the next audio, waits
   * for every outstanding turn to be acknowledged, then opens a new turn. Like
   * the end timeout, the wait is bounded by provider inactivity: it fails only
   * after `timeoutMs` without any server message. Returns false when the
   * session has failed.
   */
  private async openTurnIfNeeded(): Promise<boolean> {
    const start = this.init.protocol.turnStartMessage;
    if (!start || this.turnOpen || this.queue[0]?.kind !== 'audio') {
      return true;
    }

    const waitStartedAt = Date.now();
    while (!this.isTerminal() && this.outstandingCommits > 0) {
      const lastActivity = Math.max(waitStartedAt, this.lastServerMessageAt);
      if (Date.now() - lastActivity >= this.init.timeoutMs) {
        this.fail(
          new SpeechProviderError(
            this.provider,
            `${this.provider} timed out after ${this.init.timeoutMs} ms without a server message while waiting for the previous turn to finish`,
          ),
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
    }
    if (this.isTerminal() || !this.send(start.call(this.init.protocol))) {
      return false;
    }
    this.turnOpen = true;
    return true;
  }

  /**
   * Waits until the socket's send buffer is at or below `highWaterMark`. A
   * socket that stays congested for `timeoutMs` fails the session, so a
   * stalled connection can never leave `write()` pending forever.
   */
  private async waitForDrain(): Promise<void> {
    const deadline = Date.now() + this.init.timeoutMs;
    while (
      !this.isTerminal() &&
      this.socket &&
      this.socket.bufferedAmount > this.init.highWaterMark
    ) {
      if (Date.now() >= deadline) {
        this.fail(
          new SpeechProviderError(
            this.provider,
            `${this.provider} socket did not drain below highWaterMark within ${this.init.timeoutMs} ms`,
          ),
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
    }
  }

  private send(message: unknown): boolean {
    try {
      this.socket?.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.fail(toError(error, this.provider));
      return false;
    }
  }

  private checkEnded(): void {
    if (
      !this.endWaiter ||
      this.isTerminal() ||
      !this.opened ||
      this.pumping ||
      this.queue.length > 0 ||
      this.outstandingCommits > 0 ||
      this.pendingItems.size > 0
    ) {
      return;
    }

    clearTimeout(this.endTimer);
    const waiter = this.endWaiter;
    this.endWaiter = undefined;
    waiter.resolve();
  }

  private async finish(): Promise<TranscriptResult> {
    this.state = 'closed';
    this.cleanup();
    this.closeSocket();

    const ordered = [...this.finals].sort(
      (left, right) => this.rank(left) - this.rank(right),
    );
    const segments: TranscriptSegment[] = ordered
      .map((final) => final.text.trim())
      .filter(Boolean)
      .map((text) => ({ text }));
    const providerUsage = sumUsage(ordered.map((final) => final.providerUsage));
    const durationSeconds = audioSecondsForBytes(
      this.totalBytes,
      this.init.config.format,
    );
    const usage: SpeechUsage = {
      operation: 'transcription',
      provider: this.provider,
      model: this.init.config.model,
      audioSeconds:
        audioSecondsFromProviderUsage(providerUsage) ?? durationSeconds,
      bytes: this.totalBytes,
      providerUsage,
    };
    const result: TranscriptResult = {
      text: segments.map((segment) => segment.text).join(' '),
      language: this.init.config.language,
      durationSeconds,
      segments,
      provider: this.provider,
      model: this.init.config.model,
      raw: {
        sessionId: this.sessionId,
        finals: ordered.map((final) => final.raw),
      },
      usage,
    };

    await reportSpeechUsage(usage, ...this.init.onUsage);
    return result;
  }

  private rank(final: FinalRecord): number {
    const index = final.itemId ? this.itemOrder.indexOf(final.itemId) : -1;
    return index >= 0 ? index : this.itemOrder.length + final.arrival;
  }

  private onClose(event: SpeechWebSocketCloseEvent): void {
    clearTimeout(this.connectTimer);
    if (!this.isTerminal()) {
      const code = event.code ?? 1005;
      this.fail(
        new SpeechProviderError(
          this.provider,
          `${this.provider} socket closed unexpectedly (code ${code}${event.reason ? `: ${this.redact(event.reason)}` : ''})`,
        ),
      );
    }
    if (!this.closeEmitted) {
      this.closeEmitted = true;
      this.emit('close', {
        code: event.code ?? 1005,
        reason: this.redact(event.reason ?? '') ?? '',
      });
    }
  }

  private fail(error: Error): void {
    if (this.isTerminal()) {
      return;
    }

    this.error = error;
    this.state = 'failed';
    this.cleanup();
    const queue = this.queue;
    this.queue = [];
    this.queued = 0;
    for (const item of queue) {
      if (item.kind === 'audio') {
        item.reject(error);
      }
    }
    this.rejectReady(error);
    const waiter = this.endWaiter;
    this.endWaiter = undefined;
    waiter?.reject(error);
    this.emit('error', error);
    this.closeSocket();
  }

  private cleanup(): void {
    clearTimeout(this.connectTimer);
    clearTimeout(this.endTimer);
    this.init.signal?.removeEventListener('abort', this.onAbort);
  }

  private closeSocket(): void {
    try {
      this.socket?.close(1000);
    } catch {
      // Already closing.
    }
  }

  private emit<E extends StreamingSessionEventName>(
    event: E,
    payload: StreamingSessionEvents[E],
  ): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as StreamingSessionListener<E>)(payload);
      } catch (error) {
        // A throwing listener fails the session so the bug surfaces via end().
        if (event !== 'error' && event !== 'close') {
          this.fail(toError(error, this.provider));
        }
      }
    }
  }

  private isTerminal(): boolean {
    return this.state === 'closed' || this.state === 'failed';
  }

  private redact(text: string | undefined): string | undefined {
    let result = text;
    for (const secret of this.secrets) {
      result = redactSecret(result, secret);
    }
    return result;
  }
}

function toError(value: unknown, provider: string): Error {
  if (value instanceof Error) {
    return value;
  }
  return new SpeechError(
    value === undefined ? 'Streaming session aborted' : String(value),
    'SPEECH_ABORTED',
    provider,
  );
}

/**
 * Sums numeric fields of per-turn provider usage blocks (recursively), keeping
 * the first value of non-numeric fields such as `type`.
 */
export function sumUsage(
  blocks: Array<Record<string, unknown> | undefined>,
): Record<string, unknown> | undefined {
  const present = blocks.filter(
    (block): block is Record<string, unknown> =>
      Boolean(block) && typeof block === 'object',
  );
  if (present.length === 0) {
    return undefined;
  }

  const total: Record<string, unknown> = {};
  for (const block of present) {
    for (const [key, value] of Object.entries(block)) {
      const current = total[key];
      if (typeof value === 'number') {
        total[key] = (typeof current === 'number' ? current : 0) + value;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        total[key] = sumUsage([
          current as Record<string, unknown> | undefined,
          value as Record<string, unknown>,
        ]);
      } else if (current === undefined) {
        total[key] = value;
      }
    }
  }
  return total;
}
