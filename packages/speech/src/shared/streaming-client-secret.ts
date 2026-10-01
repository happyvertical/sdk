/**
 * Server-side minting of short-lived browser credentials for realtime
 * transcription.
 *
 * A browser must never hold the long-lived provider key. Your server calls
 * {@link createStreamingClientSecret} once per tenant session (after its own
 * auth check), records the returned tenant/session attribution, and hands the
 * browser only `value` and `expiresAt`. The browser passes `value` as the
 * streaming adapter's `clientSecret`.
 *
 * - `openai-realtime`: `POST /v1/realtime/client_secrets` with
 *   `expires_after: { anchor: 'created_at', seconds }` and a
 *   `session.type: "transcription"` config, returning an `ek_…` secret
 *   (https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create).
 * - `voxtral-realtime`: vLLM has no ephemeral-token mechanism, so this throws
 *   `SpeechConfigurationError`. Browser Voxtral needs your own proxy or token
 *   gateway in front of vLLM.
 */

import {
  OPENAI_REALTIME_DEFAULT_MODEL,
  OPENAI_REALTIME_DEFAULT_URL,
  openAIRealtimeTranscriptionSession,
  resolveOpenAIRealtimeFormat,
} from '../adapters/openai-realtime.js';
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
  SpeechProviderError,
} from './errors.js';
import {
  HttpSpeechAdapter,
  redactSecret,
  resolveOpenAICompatibleUrl,
} from './http.js';
import { headerSecrets } from './realtime-auth.js';
import {
  isStreamingTranscriberType,
  parseTurnDetection,
  STREAMING_TRANSCRIBER_ENV_KEYS,
} from './streaming-factory.js';
import type {
  OpenAIRealtimeTranscriberOptions,
  StreamingAudioFormat,
  StreamingTranscriberType,
  StreamingTurnDetection,
} from './streaming-types.js';
import type { SpeechFetch } from './types.js';
import { isBrowserRuntime } from './websocket.js';

/** Default client-secret lifetime: long enough to connect, short if leaked. */
export const DEFAULT_CLIENT_SECRET_TTL_SECONDS = 60;
/** OpenAI's accepted `expires_after.seconds` range. */
export const CLIENT_SECRET_TTL_RANGE = { min: 10, max: 7200 } as const;

export interface CreateStreamingClientSecretOptions {
  /** Streaming adapter. Default `HAVE_SPEECH_STREAMING_TYPE`, then `openai-realtime`. */
  type?: StreamingTranscriberType;
  /** Long-lived server key. Default `HAVE_SPEECH_STREAMING_API_KEY`. */
  apiKey?: string;
  /**
   * API base. Accepts the same values as the streaming adapter
   * (`https://api.openai.com`, `…/v1`, or `wss://…/v1/realtime`). Default
   * `HAVE_SPEECH_STREAMING_BASE_URL`, then `https://api.openai.com/v1`.
   */
  baseUrl?: string;
  /** Secret lifetime in seconds, 10–7200. Default 60. */
  ttlSeconds?: number;
  /**
   * Tenant the secret is minted for. Echoed in the result for your usage
   * ledger; OpenAI's transcription client secrets carry no attribution field.
   */
  tenantId?: string;
  /** Your session id (e.g. the dictation session), echoed in the result. */
  sessionId?: string;
  /** Extra attribution echoed in the result. Never sent to the provider. */
  metadata?: Record<string, unknown>;
  /** Transcription model the secret is bound to. Default `HAVE_SPEECH_STREAMING_MODEL`, then `gpt-4o-transcribe`. */
  model?: string;
  language?: string;
  prompt?: string;
  /** Default `HAVE_SPEECH_STREAMING_TURN_DETECTION`, then `server_vad`. */
  turnDetection?: StreamingTurnDetection;
  /** Default PCM16 24 kHz mono. */
  format?: Partial<StreamingAudioFormat>;
  noiseReduction?: OpenAIRealtimeTranscriberOptions['noiseReduction'];
  include?: string[];
  /**
   * Extra `transcription` fields. The typed `model`, `language`, and `prompt`
   * take precedence, so the secret is bound to the model the result reports.
   */
  transcriptionOptions?: Record<string, unknown>;
  /**
   * Headers for the mint request, e.g. a per-tenant gateway virtual key
   * (`x-bf-vk`) for provider-side attribution. Merged over
   * `HAVE_SPEECH_STREAMING_HEADERS`.
   */
  headers?: HeadersInit;
  fetch?: SpeechFetch;
  signal?: AbortSignal;
  /** Request timeout. Default `HAVE_SPEECH_STREAMING_TIMEOUT[_MS]`, then 10000. */
  timeoutMs?: number;
}

/** A minted browser credential plus the attribution it was minted for. */
export interface StreamingClientSecretResult {
  type: StreamingTranscriberType;
  /** The short-lived secret. Send it to the browser as `clientSecret`. */
  value: string;
  /** Expiry as epoch milliseconds. */
  expiresAt: number;
  ttlSeconds: number;
  model: string;
  tenantId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  /** The provider's echoed session config. */
  session?: Record<string, unknown>;
}

export interface StreamingClientSecretContext {
  env?: SpeechEnv;
}

const OPENAI_CLIENT_SECRET_ENDPOINT = 'realtime/client_secrets';

/**
 * Mints a short-lived, session-scoped client secret for browser streaming.
 * Server-side only: throws in a browser runtime, and for adapters without an
 * ephemeral-token mechanism (`voxtral-realtime`).
 */
export async function createStreamingClientSecret(
  options: CreateStreamingClientSecretOptions = {},
  context: StreamingClientSecretContext = {},
): Promise<StreamingClientSecretResult> {
  const env = context.env ?? defaultEnv();
  const keys = STREAMING_TRANSCRIBER_ENV_KEYS;
  const type = options.type ?? readEnv(env, ...keys.type) ?? 'openai-realtime';
  if (!isStreamingTranscriberType(type)) {
    throw new InvalidSpeechAdapterError(type, 'streaming STT');
  }

  if (isBrowserRuntime()) {
    throw new SpeechConfigurationError(
      'createStreamingClientSecret runs on your server: it needs the long-lived API key, which must never reach a browser',
      type,
    );
  }

  if (type === 'voxtral-realtime') {
    throw new SpeechConfigurationError(
      'voxtral-realtime cannot mint browser credentials: vLLM has no ephemeral-token mechanism. Put your own proxy or token gateway in front of vLLM, mint its short-lived tokens yourself, and never send the vLLM API key to a browser',
      type,
    );
  }

  const ttlSeconds = options.ttlSeconds ?? DEFAULT_CLIENT_SECRET_TTL_SECONDS;
  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < CLIENT_SECRET_TTL_RANGE.min ||
    ttlSeconds > CLIENT_SECRET_TTL_RANGE.max
  ) {
    throw new SpeechConfigurationError(
      `ttlSeconds must be an integer from ${CLIENT_SECRET_TTL_RANGE.min} to ${CLIENT_SECRET_TTL_RANGE.max}`,
      type,
    );
  }

  const apiKey = options.apiKey ?? readEnv(env, ...keys.apiKey);
  if (!apiKey) {
    throw new SpeechConfigurationError(
      'createStreamingClientSecret requires apiKey (or HAVE_SPEECH_STREAMING_API_KEY)',
      type,
    );
  }

  const model =
    options.model?.trim() ||
    readEnv(env, ...keys.model)?.trim() ||
    OPENAI_REALTIME_DEFAULT_MODEL;
  const session = openAIRealtimeTranscriptionSession(
    {
      model,
      format: resolveOpenAIRealtimeFormat(options.format),
      turnDetection: options.turnDetection ??
        parseTurnDetection(readEnv(env, ...keys.turnDetection)) ?? {
          type: 'server_vad',
        },
      language: options.language ?? readEnv(env, ...keys.language),
      prompt: options.prompt,
    },
    options,
  );

  const endpoint = resolveClientSecretUrl(
    options.baseUrl?.trim() ||
      readEnv(env, ...keys.baseUrl)?.trim() ||
      OPENAI_REALTIME_DEFAULT_URL,
  );
  const headers = mergeHeaderInits(
    parseHeadersEnv(env, keys.headers),
    options.headers,
  );
  const client = new ClientSecretClient({
    baseUrl: endpoint,
    apiKey,
    fetch: options.fetch,
    headers,
    timeoutMs:
      options.timeoutMs ??
      parseOptionalInteger(readEnv(env, ...keys.timeoutMs)) ??
      10_000,
  });

  const body = await client
    .mint(
      endpoint,
      {
        expires_after: { anchor: 'created_at', seconds: ttlSeconds },
        session,
      },
      options.signal,
    )
    .catch((error: unknown) => {
      throw redactProviderError(error, headerSecrets(headers));
    });

  const value = body.value;
  if (typeof value !== 'string' || !value) {
    throw new SpeechProviderError(
      type,
      'openai-realtime client secret response did not include a value',
    );
  }
  const expiresAtSeconds = body.expires_at;

  return {
    type,
    value,
    expiresAt:
      typeof expiresAtSeconds === 'number' && Number.isFinite(expiresAtSeconds)
        ? expiresAtSeconds * 1000
        : Date.now() + ttlSeconds * 1000,
    ttlSeconds,
    model,
    tenantId: options.tenantId,
    sessionId: options.sessionId,
    metadata: options.metadata,
    session:
      body.session && typeof body.session === 'object'
        ? (body.session as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Resolves the client-secret endpoint from any accepted realtime base:
 * `ws(s)` becomes `http(s)`, a trailing `/realtime` and query are dropped,
 * then `/v1/realtime/client_secrets` (or `/realtime/client_secrets` under a
 * versioned root) is appended.
 */
export function resolveClientSecretUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol === 'ws:') {
    url.protocol = 'http:';
  } else if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  }
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/realtime$/, '');
  return resolveOpenAICompatibleUrl(
    url.toString(),
    OPENAI_CLIENT_SECRET_ENDPOINT,
  );
}

/**
 * The HTTP layer redacts the API key from provider error bodies; this also
 * removes gateway credentials sent in `headers` (e.g. `x-bf-vk`).
 */
function redactProviderError(error: unknown, secrets: string[]): unknown {
  if (!(error instanceof SpeechProviderError) || secrets.length === 0) {
    return error;
  }
  let responseBody = error.responseBody;
  let message = error.message;
  for (const secret of secrets) {
    responseBody = redactSecret(responseBody, secret);
    message = redactSecret(message, secret) ?? message;
  }
  if (responseBody === error.responseBody && message === error.message) {
    return error;
  }
  return new SpeechProviderError(error.adapter ?? 'openai-realtime', message, {
    status: error.status,
    responseBody,
    retryAfterMs: error.retryAfterMs,
  });
}

class ClientSecretClient extends HttpSpeechAdapter {
  mint(
    endpoint: string,
    payload: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ): Promise<Record<string, unknown>> {
    return this.post(
      'openai-realtime',
      endpoint,
      {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        signal,
      },
      async (response) => {
        const json = (await response.json().catch(() => undefined)) as unknown;
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
          throw new SpeechProviderError(
            'openai-realtime',
            'openai-realtime client secret response was not a JSON object',
          );
        }
        return json as Record<string, unknown>;
      },
    );
  }
}
