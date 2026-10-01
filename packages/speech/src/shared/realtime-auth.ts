/**
 * Credential handling shared by realtime (WebSocket) adapters.
 *
 * Node callers authenticate with a long-lived `apiKey` in the
 * `Authorization` header. Browsers cannot set WebSocket headers and must never
 * hold a long-lived key, so they pass a short-lived `clientSecret`, which is
 * sent as a WebSocket subprotocol.
 */

import { SpeechConfigurationError } from './errors.js';
import type { RealtimeConnection } from './realtime-session.js';
import type { StreamingClientSecret } from './streaming-types.js';
import { isBrowserRuntime } from './websocket.js';

/** Subprotocol prefix that carries a client secret (OpenAI's convention). */
export const CLIENT_SECRET_SUBPROTOCOL_PREFIX = 'openai-insecure-api-key.';

/**
 * Long-lived OpenAI-style keys (`sk-…`, `sk-proj-…`, `sk-svcacct-…`). A
 * browser `clientSecret` that looks like one is refused: browsers accept only
 * short-lived tokens such as OpenAI's `ek_…` client secrets.
 */
const LONG_LIVED_KEY = /^sk-/;

/** Throws when an adapter is given a long-lived `apiKey` in a browser. */
export function assertNoBrowserApiKey(
  adapter: string,
  apiKey: string | undefined,
): void {
  if (apiKey && isBrowserRuntime()) {
    throw new SpeechConfigurationError(
      `${adapter} refuses apiKey in a browser; mint a short-lived clientSecret on your server instead`,
      adapter,
    );
  }
}

/** Resolves a static or per-session client secret and validates its shape. */
export async function resolveClientSecret(
  adapter: string,
  secret: StreamingClientSecret | undefined,
): Promise<string | undefined> {
  const value = typeof secret === 'function' ? await secret() : secret;
  const trimmed = value?.trim();
  if (trimmed === undefined) {
    return undefined;
  }
  if (!/^[\x21-\x7e]+$/.test(trimmed)) {
    throw new SpeechConfigurationError(
      'clientSecret must be a non-empty token without spaces',
      adapter,
    );
  }
  if (isBrowserRuntime() && LONG_LIVED_KEY.test(trimmed)) {
    throw new SpeechConfigurationError(
      'clientSecret looks like a long-lived API key; browsers accept only short-lived tokens minted by your server (see createStreamingClientSecret)',
      adapter,
    );
  }
  return trimmed;
}

export interface RealtimeConnectorOptions {
  adapter: string;
  url: string;
  apiKey?: string;
  headers: Record<string, string>;
  clientSecret?: StreamingClientSecret;
  /** Subprotocols to offer, given the resolved client secret (if any). */
  protocols: (secret: string | undefined) => string[];
}

/**
 * Builds the per-session `connect` callback: refuses handshake headers in a
 * browser, resolves the client secret, and sets `Authorization` from
 * `apiKey` unless a header already supplies it.
 */
export function realtimeConnector(
  options: RealtimeConnectorOptions,
): () => Promise<RealtimeConnection> {
  if (isBrowserRuntime() && Object.keys(options.headers).length > 0) {
    throw new SpeechConfigurationError(
      'Browsers cannot send WebSocket headers; remove `headers` or connect from a server',
      options.adapter,
    );
  }

  return async () => {
    const secret = await resolveClientSecret(
      options.adapter,
      options.clientSecret,
    );
    const headers = { ...options.headers };
    // Gateway credentials (e.g. `x-bf-vk`, an explicit Authorization) are
    // redacted from surfaced provider text just like the API key.
    const secrets: string[] = headerSecrets(headers);
    if (secret) {
      secrets.push(secret);
    }
    if (options.apiKey) {
      secrets.push(options.apiKey);
      if (!hasHeader(headers, 'authorization')) {
        headers.authorization = `Bearer ${options.apiKey}`;
      }
    }
    return {
      url: options.url,
      protocols: options.protocols(secret),
      headers,
      secrets,
    };
  };
}

/** Values of other headers shorter than this are not treated as credentials. */
const MIN_HEADER_SECRET_LENGTH = 8;

/**
 * Header names that carry credentials (`authorization`, `x-api-key`,
 * `x-bf-vk`, `*-token`, `*-secret`, …). Their values are redacted at any
 * length.
 */
const CREDENTIAL_HEADER = /auth|key|token|secret|password|credential|-vk$/i;

/**
 * Values of caller-supplied headers to redact from provider error text.
 * Credential-named headers are redacted whatever their length; for
 * `Authorization`, the credential after the scheme is included too. Other
 * headers may also carry tenant secrets, so their values are redacted when
 * they are at least 8 characters long, which keeps short values such as
 * `1` from mangling messages.
 */
export function headerSecrets(headers: HeadersInit | undefined): string[] {
  const secrets: string[] = [];
  for (const [key, value] of Object.entries(mergeHeaderRecords(headers))) {
    const credential = CREDENTIAL_HEADER.test(key);
    const candidates = [value];
    if (key.toLowerCase() === 'authorization') {
      candidates.push(value.replace(/^\S+\s+/, ''));
    }
    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      const long = trimmed.length >= MIN_HEADER_SECRET_LENGTH;
      if (trimmed && (credential || long) && !secrets.includes(trimmed)) {
        secrets.push(trimmed);
      }
    }
  }
  // Longest first, so a full `Bearer <token>` is replaced before its token.
  return secrets.sort((left, right) => right.length - left.length);
}

export function mergeHeaderRecords(
  ...sets: Array<HeadersInit | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const set of sets) {
    if (set) {
      new Headers(set).forEach((value, key) => {
        merged[key] = value;
      });
    }
  }
  return merged;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}
