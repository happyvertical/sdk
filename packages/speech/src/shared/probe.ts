/**
 * Readiness probes (#1345): check that a configured speech endpoint answers,
 * accepts the credentials, and (where the server lists models) serves the
 * configured model, without sending audio or text to synthesize.
 */

import { SpeechConfigurationError } from './errors.js';
import { mergeHeaders, resolveFetch } from './http.js';
import type { SpeechFetch } from './types.js';

/** Why a probe could not confirm the endpoint is ready. */
export type SpeechProbeFailureReason =
  /** The adapter's own configuration is invalid (e.g. an unparseable `baseUrl`). */
  | 'misconfigured'
  /** No HTTP response: DNS, refused or reset connection, TLS. */
  | 'unreachable'
  /** No response within the probe timeout. */
  | 'timeout'
  /** The server answered 401 or 403. */
  | 'unauthorized'
  /** The server's model list does not include the configured model. */
  | 'model_not_found'
  /** Any other error status, or a model list that could not be read. */
  | 'provider_error'
  /** This adapter cannot check readiness without real work (see README). */
  | 'unsupported';

/** What a successful probe confirmed. */
export type SpeechProbeCheck =
  /** The server listed the configured model. */
  | 'model'
  /** A server answered and accepted the credentials; the model is unconfirmed. */
  | 'reachability';

export type SpeechProbeResult =
  | {
      ok: true;
      adapter: string;
      checked: SpeechProbeCheck;
      /** The model that was looked for, when the adapter sends one. */
      model?: string;
      latencyMs: number;
    }
  | {
      ok: false;
      adapter: string;
      reason: SpeechProbeFailureReason;
      /** HTTP status, for `unauthorized` and `provider_error`. */
      status?: number;
      model?: string;
      /** A fixed description; never the URL, a credential, or a response body. */
      message: string;
      latencyMs: number;
    };

export interface SpeechProbeOptions {
  /** Aborting rejects the probe with the abort reason. */
  signal?: AbortSignal;
  /** Extra request headers, merged over the adapter's. */
  headers?: HeadersInit;
  /**
   * Probe timeout in milliseconds. Defaults to the adapter's `timeoutMs`,
   * else {@link DEFAULT_SPEECH_PROBE_TIMEOUT_MS}.
   */
  timeoutMs?: number;
}

export const DEFAULT_SPEECH_PROBE_TIMEOUT_MS = 10_000;

/** A model list from `GET /models` is read up to this many bytes. */
const MAX_MODEL_LIST_BYTES = 4 * 1024 * 1024;

export interface HttpProbeTarget {
  adapter: string;
  /**
   * The URL to `GET`. A thunk so URL resolution errors become a
   * `misconfigured` result instead of a throw.
   */
  url: () => string;
  /** `true` for an OpenAI-style `GET /models` listing. */
  listsModels: boolean;
  /** Model to look for in the listing; omitted, only reachability is checked. */
  model?: string;
  fetch?: SpeechFetch;
  apiKey?: string;
  headers?: HeadersInit;
  /** The adapter's own `timeoutMs`. */
  timeoutMs?: number;
}

/**
 * Derives the OpenAI-style model list URL from a resolved endpoint: the
 * trailing `/<resource>` is replaced with `/models` (the query is kept). An
 * endpoint that does not end in `resource` gets `models` resolved beside it.
 */
export function modelsUrlFor(endpoint: string, resource: string): string {
  const url = new URL(endpoint);
  const suffix = `/${resource.replace(/^\/+|\/+$/g, '')}`;
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith(suffix)
    ? `${pathname.slice(0, -suffix.length)}/models`
    : `${pathname.replace(/\/[^/]*$/, '')}/models`;
  url.hash = '';
  return url.toString();
}

/** `ws:`/`wss:` to `http:`/`https:`; other URLs are returned unchanged. */
export function toHttpUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
  else if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
  return parsed.toString();
}

export function unsupportedProbe(
  adapter: string,
  message: string,
): SpeechProbeResult {
  return { ok: false, adapter, reason: 'unsupported', message, latencyMs: 0 };
}

/**
 * Sends one `GET` and classifies the outcome. Resolves for every outcome
 * except a caller abort, which rejects with the signal's reason.
 */
export async function probeHttpEndpoint(
  target: HttpProbeTarget,
  options: SpeechProbeOptions = {},
): Promise<SpeechProbeResult> {
  const startedAt = Date.now();
  const { adapter, model } = target;
  const fail = (
    reason: SpeechProbeFailureReason,
    message: string,
    status?: number,
  ): SpeechProbeResult => ({
    ok: false,
    adapter,
    reason,
    ...(status !== undefined ? { status } : {}),
    ...(model !== undefined ? { model } : {}),
    message,
    latencyMs: Date.now() - startedAt,
  });
  const pass = (checked: SpeechProbeCheck): SpeechProbeResult => ({
    ok: true,
    adapter,
    checked,
    ...(model !== undefined ? { model } : {}),
    latencyMs: Date.now() - startedAt,
  });

  options.signal?.throwIfAborted();

  let url: string;
  let fetchImpl: SpeechFetch;
  let headers: Headers;
  try {
    url = target.url();
    fetchImpl = resolveFetch(target.fetch);
    headers = mergeHeaders(
      { apiKey: target.apiKey, headers: target.headers },
      options.headers,
    );
  } catch (error) {
    if (error instanceof SpeechConfigurationError) {
      return fail('misconfigured', error.message);
    }
    // e.g. a header value with a newline: the platform's message may quote
    // the value, so it is not surfaced.
    return fail(
      'misconfigured',
      `${adapter} has an invalid header or credential`,
    );
  }
  if (target.listsModels) headers.set('accept', 'application/json');

  // A probe always ends: a missing, zero or non-finite timeout (an adapter's
  // `timeoutMs: 0` means "no request timeout") falls back to the default.
  const timeoutMs =
    [options.timeoutMs, target.timeoutMs].find(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0,
    ) ?? DEFAULT_SPEECH_PROBE_TIMEOUT_MS;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout.signal])
    : timeout.signal;

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, { method: 'GET', headers, signal });
    } catch {
      if (options.signal?.aborted) throw options.signal.reason;
      if (timeout.signal.aborted) {
        return fail('timeout', `${adapter} did not answer in ${timeoutMs} ms`);
      }
      return fail(
        'unreachable',
        `${adapter} speech service could not be reached`,
      );
    }

    if (response.status === 401 || response.status === 403) {
      await discard(response);
      return fail(
        'unauthorized',
        `${adapter} rejected the credentials (HTTP ${response.status})`,
        response.status,
      );
    }

    if (!target.listsModels) {
      await discard(response);
      // Any answer below 500 shows a server is there; the model is unknown.
      return response.status < 500
        ? pass('reachability')
        : fail(
            'provider_error',
            `${adapter} answered HTTP ${response.status}`,
            response.status,
          );
    }

    // Servers without a model list (e.g. whisper.cpp) still answered.
    if ([404, 405, 501].includes(response.status)) {
      await discard(response);
      return pass('reachability');
    }
    if (!response.ok) {
      await discard(response);
      return fail(
        'provider_error',
        `${adapter} model list failed with HTTP ${response.status}`,
        response.status,
      );
    }

    let ids: string[] | undefined;
    try {
      ids = readModelIds(await readBounded(response, MAX_MODEL_LIST_BYTES));
    } catch {
      if (options.signal?.aborted) throw options.signal.reason;
      if (timeout.signal.aborted) {
        return fail('timeout', `${adapter} did not answer in ${timeoutMs} ms`);
      }
      // Unreadable or oversized: reported as provider_error below.
    }
    if (!ids) {
      return fail(
        'provider_error',
        `${adapter} model list was not an OpenAI-style { data: [{ id }] } list`,
        response.status,
      );
    }
    if (model === undefined) return pass('reachability');
    return ids.includes(model)
      ? pass('model')
      : fail(
          'model_not_found',
          `${adapter} does not list the configured model`,
          response.status,
        );
  } finally {
    clearTimeout(timer);
  }
}

function readModelIds(text: string): string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return undefined;
  return data
    .map((entry) => (entry as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string');
}

async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new Error('model list too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}
