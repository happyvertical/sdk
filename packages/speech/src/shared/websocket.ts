/**
 * Minimal WebSocket surface used by streaming adapters. Browser, Node 22+
 * (`globalThis.WebSocket`), Deno, Bun, and the `ws` package all satisfy it.
 */

import { SpeechConfigurationError } from './errors.js';

/** `WebSocket.OPEN`. */
export const WEBSOCKET_OPEN = 1;

export interface SpeechWebSocketMessageEvent {
  data: unknown;
}

export interface SpeechWebSocketCloseEvent {
  code?: number;
  reason?: string;
}

/** The subset of the WHATWG `WebSocket` interface the adapters use. */
export interface SpeechWebSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType?: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: (event: unknown) => void): void;
  addEventListener(
    type: 'message',
    listener: (event: SpeechWebSocketMessageEvent) => void,
  ): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  addEventListener(
    type: 'close',
    listener: (event: SpeechWebSocketCloseEvent) => void,
  ): void;
}

/** Handshake details passed to a {@link SpeechWebSocketFactory}. */
export interface SpeechWebSocketInit {
  protocols: string[];
  /** Handshake headers; empty in browsers. */
  headers: Record<string, string>;
}

export type SpeechWebSocketFactory = (
  url: string,
  init: SpeechWebSocketInit,
) => SpeechWebSocket;

/**
 * A WebSocket constructor. Standard constructors accept `protocols`; Node's
 * built-in WebSocket also accepts `{ protocols, headers }`.
 */
export type SpeechWebSocketConstructor = new (
  url: string,
  protocols?:
    | string
    | string[]
    | { protocols?: string[]; headers?: Record<string, string> },
) => SpeechWebSocket;

/** True in browsers and web workers, where API keys must never be used. */
export function isBrowserRuntime(): boolean {
  const scope = globalThis as {
    document?: unknown;
    WorkerGlobalScope?: unknown;
    process?: { versions?: { node?: string } };
  };
  if (scope.process?.versions?.node) {
    return false;
  }
  return (
    typeof scope.document !== 'undefined' ||
    typeof scope.WorkerGlobalScope !== 'undefined'
  );
}

/**
 * Resolves a socket factory from explicit options, falling back to
 * `globalThis.WebSocket`. Headers are only passed when present, so standard
 * constructors that cannot send them are never handed an options object.
 */
export function resolveWebSocketFactory(
  adapter: string,
  options: {
    createWebSocket?: SpeechWebSocketFactory;
    WebSocket?: SpeechWebSocketConstructor;
  },
): SpeechWebSocketFactory {
  if (options.createWebSocket) {
    return options.createWebSocket;
  }

  const Ctor =
    options.WebSocket ??
    (globalThis as { WebSocket?: SpeechWebSocketConstructor }).WebSocket;
  if (!Ctor) {
    throw new SpeechConfigurationError(
      'No WebSocket implementation available; pass `WebSocket` or `createWebSocket`',
      adapter,
    );
  }

  return (url, init) =>
    Object.keys(init.headers).length > 0
      ? new Ctor(url, { protocols: init.protocols, headers: init.headers })
      : new Ctor(url, init.protocols);
}

/** Converts `http(s)://` to `ws(s)://`; leaves `ws(s)://` unchanged. */
export function toWebSocketUrl(url: string, adapter: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  } else if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  } else if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new SpeechConfigurationError(
      `Unsupported streaming URL protocol: ${parsed.protocol}`,
      adapter,
    );
  }
  return parsed.toString();
}

/** Converts a message payload to text; returns `undefined` for unsupported data. */
export function messageDataToText(data: unknown): string | undefined {
  if (typeof data === 'string') {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  return undefined;
}
