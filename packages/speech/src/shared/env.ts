/**
 * Environment configuration for speech adapters.
 *
 * Transcriber settings resolve in this order (first wins):
 * explicit options → factory context → `HAVE_SPEECH_TRANSCRIBER_*` →
 * legacy `HAVE_SPEECH_STT_*` → gateway `STT_*` aliases.
 */

import { SpeechConfigurationError } from './errors.js';
import type { SpeechFetch } from './types.js';

export interface SpeechEnv {
  [key: string]: string | undefined;
}

/** Environment variable names read for each transcriber setting, in priority order. */
export const TRANSCRIBER_ENV_KEYS = {
  type: [
    'HAVE_SPEECH_TRANSCRIBER_TYPE',
    'HAVE_SPEECH_STT_TYPE',
    'HAVE_SPEECH_STT_ADAPTER',
    'STT_ADAPTER',
  ],
  baseUrl: [
    'HAVE_SPEECH_TRANSCRIBER_BASE_URL',
    'HAVE_SPEECH_STT_BASE_URL',
    'STT_BASE_URL',
  ],
  model: [
    'HAVE_SPEECH_TRANSCRIBER_MODEL',
    'HAVE_SPEECH_STT_MODEL',
    'STT_MODEL',
  ],
  apiKey: [
    'HAVE_SPEECH_TRANSCRIBER_API_KEY',
    'HAVE_SPEECH_STT_API_KEY',
    'STT_API_KEY',
    'SPEECH_API_KEY',
  ],
  timeoutMs: [
    'HAVE_SPEECH_TRANSCRIBER_TIMEOUT',
    'HAVE_SPEECH_TRANSCRIBER_TIMEOUT_MS',
    'HAVE_SPEECH_STT_TIMEOUT_MS',
    'STT_TIMEOUT_MS',
  ],
  maxBytes: ['HAVE_SPEECH_TRANSCRIBER_MAX_BYTES', 'STT_MAX_BYTES'],
  headers: ['HAVE_SPEECH_TRANSCRIBER_HEADERS', 'STT_HEADERS'],
  path: ['HAVE_SPEECH_TRANSCRIBER_PATH', 'HAVE_SPEECH_STT_PATH', 'STT_PATH'],
} as const;

/** Transcriber settings read from the environment. All fields are optional. */
export interface TranscriberEnvConfig {
  type?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  path?: string;
}

/** Options shape accepted by {@link resolveTranscriberConfig}. */
export interface TranscriberConfigInput {
  type?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: HeadersInit;
  fetch?: SpeechFetch;
}

export interface TranscriberConfigContext {
  env?: SpeechEnv;
  fetch?: SpeechFetch;
  headers?: HeadersInit;
}

/** Resolved transcriber settings. `headers` merges env → context → options. */
export interface ResolvedTranscriberConfig {
  type?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Headers;
  fetch?: SpeechFetch;
  path?: string;
}

export function readTranscriberEnv(env: SpeechEnv): TranscriberEnvConfig {
  return {
    type: readEnv(env, ...TRANSCRIBER_ENV_KEYS.type),
    baseUrl: readEnv(env, ...TRANSCRIBER_ENV_KEYS.baseUrl),
    model: readEnv(env, ...TRANSCRIBER_ENV_KEYS.model),
    apiKey: readEnv(env, ...TRANSCRIBER_ENV_KEYS.apiKey),
    timeoutMs: parseOptionalInteger(
      readEnv(env, ...TRANSCRIBER_ENV_KEYS.timeoutMs),
    ),
    maxBytes: parseOptionalInteger(
      readEnv(env, ...TRANSCRIBER_ENV_KEYS.maxBytes),
    ),
    headers: parseHeadersEnv(env, TRANSCRIBER_ENV_KEYS.headers),
    path: readEnv(env, ...TRANSCRIBER_ENV_KEYS.path),
  };
}

export function hasTranscriberEnv(env: SpeechEnv): boolean {
  return hasAnyEnv(
    env,
    ...TRANSCRIBER_ENV_KEYS.type,
    ...TRANSCRIBER_ENV_KEYS.baseUrl,
  );
}

/**
 * Merges explicit transcriber options with the factory context and the
 * environment. Explicit options always win; headers are merged so a
 * per-deployment env header (e.g. a gateway virtual key) can be combined with
 * explicit ones.
 */
export function resolveTranscriberConfig(
  options: TranscriberConfigInput = {},
  context: TranscriberConfigContext = {},
): ResolvedTranscriberConfig {
  const fromEnv = readTranscriberEnv(context.env ?? defaultEnv());
  const headers = mergeHeaderInits(
    fromEnv.headers,
    context.headers,
    options.headers,
  );

  return {
    type: options.type ?? fromEnv.type,
    baseUrl: (options.baseUrl ?? fromEnv.baseUrl)?.trim(),
    model: options.model ?? fromEnv.model,
    apiKey: options.apiKey ?? fromEnv.apiKey,
    timeoutMs: options.timeoutMs ?? fromEnv.timeoutMs,
    maxBytes: options.maxBytes ?? fromEnv.maxBytes,
    headers,
    fetch: options.fetch ?? context.fetch,
    path: fromEnv.path,
  };
}

/** Merges header sets left to right; later sets win per header name. */
export function mergeHeaderInits(
  ...sets: Array<HeadersInit | undefined>
): Headers | undefined {
  const present = sets.filter((set): set is HeadersInit => Boolean(set));
  if (present.length === 0) {
    return undefined;
  }

  const merged = new Headers();
  for (const set of present) {
    new Headers(set).forEach((value, key) => {
      merged.set(key, value);
    });
  }
  return merged;
}

export function readEnv(env: SpeechEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function hasAnyEnv(env: SpeechEnv, ...keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]?.trim()));
}

export function parseOptionalInteger(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function defaultEnv(): SpeechEnv {
  return globalThis.process?.env ?? {};
}

/**
 * Parses a JSON object of header names to string values. The raw value is
 * never echoed in errors because it may carry credentials.
 */
function parseHeadersEnv(
  env: SpeechEnv,
  keys: readonly string[],
): Record<string, string> | undefined {
  for (const key of keys) {
    const raw = env[key]?.trim();
    if (!raw) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SpeechConfigurationError(
        `${key} must be a JSON object of header names to string values`,
      );
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every((value) => typeof value === 'string')
    ) {
      throw new SpeechConfigurationError(
        `${key} must be a JSON object of header names to string values`,
      );
    }

    return parsed as Record<string, string>;
  }

  return undefined;
}
