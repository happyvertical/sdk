import { SpeechConfigurationError, SpeechProviderError } from './errors.js';
import {
  parseRetryAfter,
  type SpeechRetryOptions,
  withSpeechRetry,
} from './retry.js';
import type {
  HttpSpeechOptions,
  SpeechFetch,
  SynthesisRequest,
  SynthesizedSpeech,
  TranscriptResult,
  TranscriptSegment,
  WordTiming,
} from './types.js';

/**
 * Parses a base URL, dropping any fragment and keeping any query string.
 * Throws {@link SpeechConfigurationError} for a blank or unparseable value.
 * The value is not echoed in the error because it may carry credentials.
 */
function parseBaseUrl(baseUrl: string): URL {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    throw new SpeechConfigurationError('Speech adapter baseUrl is required');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new SpeechConfigurationError(
      'Speech adapter baseUrl is not a valid absolute URL',
    );
  }

  url.hash = '';
  return url;
}

/**
 * Returns `baseUrl` with a trailing `/` on its path so relative paths resolve
 * beneath it. The query string is preserved and any fragment is dropped.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  const url = parseBaseUrl(baseUrl);
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }

  return url.toString();
}

/**
 * Resolves `path` against `baseUrl`. A relative path without its own query
 * inherits the base URL's query (for example a gateway `api-version`); an
 * absolute URL is returned unchanged.
 */
export function resolveSpeechUrl(baseUrl: string, path: string): string {
  const base = new URL(normalizeBaseUrl(baseUrl));
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(path);
  const resolved = new URL(isAbsolute ? path : path.replace(/^\//, ''), base);
  if (!isAbsolute && !resolved.search && base.search) {
    resolved.search = base.search;
  }

  return resolved.toString();
}

/**
 * Resolves an OpenAI-compatible endpoint from a base URL. Accepts a server
 * root (`https://api.openai.com` → `/v1/<resource>`), an API root ending in a
 * version segment (`http://gateway/stt/v1` → `/<resource>`), or the full
 * endpoint URL (used as-is). Only the path is rewritten: the query string is
 * preserved and any fragment is dropped.
 */
export function resolveOpenAICompatibleUrl(
  baseUrl: string,
  resource: string,
): string {
  const trimmedResource = resource.replace(/^\/+|\/+$/g, '');
  const url = parseBaseUrl(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');

  if (pathname.endsWith(`/${trimmedResource}`)) {
    url.pathname = pathname;
  } else if (/\/v\d+$/.test(pathname)) {
    url.pathname = `${pathname}/${trimmedResource}`;
  } else {
    url.pathname = `${pathname}/v1/${trimmedResource}`;
  }

  return url.toString();
}

export function resolveFetch(fetchOverride?: SpeechFetch): SpeechFetch {
  if (fetchOverride) {
    return fetchOverride;
  }

  const globalFetch = globalThis.fetch;
  if (!globalFetch) {
    throw new SpeechConfigurationError(
      'No fetch implementation available for speech adapter',
    );
  }

  return globalFetch.bind(globalThis);
}

export function mergeHeaders(
  options: Pick<HttpSpeechOptions, 'apiKey' | 'headers'>,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(options.headers);

  if (options.apiKey && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${options.apiKey}`);
  }

  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

export abstract class HttpSpeechAdapter {
  protected readonly baseUrl: string;
  protected readonly fetchImpl: SpeechFetch;
  protected readonly apiKey?: string;
  protected readonly headers?: HeadersInit;
  protected readonly timeoutMs?: number;

  constructor(options: HttpSpeechOptions) {
    this.baseUrl = options.baseUrl;
    this.fetchImpl = resolveFetch(options.fetch);
    this.apiKey = options.apiKey;
    this.headers = options.headers;
    this.timeoutMs = options.timeoutMs;
  }

  /**
   * POSTs to `path` (relative to `baseUrl`, or an absolute URL). The optional
   * `retry` policy retries 429/5xx responses; `timeoutMs` applies per attempt.
   * The request body must be re-sendable (string, Blob, FormData) when
   * retries are enabled.
   */
  protected async post<T>(
    adapterName: string,
    path: string,
    init: Omit<RequestInit, 'method'>,
    readResponse: (response: Response) => Promise<T>,
    retry: Required<SpeechRetryOptions> | false = false,
  ): Promise<T> {
    return withSpeechRetry(
      () => this.postOnce(adapterName, path, init, readResponse),
      retry,
      init.signal ?? undefined,
    );
  }

  private async postOnce<T>(
    adapterName: string,
    path: string,
    init: Omit<RequestInit, 'method'>,
    readResponse: (response: Response) => Promise<T>,
  ): Promise<T> {
    const timeoutController =
      this.timeoutMs && this.timeoutMs > 0 ? new AbortController() : undefined;
    const timeout =
      timeoutController && this.timeoutMs
        ? setTimeout(() => timeoutController.abort(), this.timeoutMs)
        : undefined;
    const requestSignal = composeAbortSignals(
      init.signal,
      timeoutController?.signal,
    );

    try {
      // Fail fast when the caller aborted before the request was sent.
      requestSignal.signal?.throwIfAborted();
      const response = await this.fetchImpl(
        resolveSpeechUrl(this.baseUrl, path),
        {
          ...init,
          method: 'POST',
          headers: mergeHeaders(
            { apiKey: this.apiKey, headers: this.headers },
            init.headers,
          ),
          signal: requestSignal.signal,
        },
      );
      await assertOk(response, adapterName, this.apiKey);
      return await readResponse(response);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      requestSignal.cleanup();
    }
  }
}

function composeAbortSignals(
  ...signals: Array<AbortSignal | undefined | null>
): { signal?: AbortSignal; cleanup: () => void } {
  const activeSignals = signals.filter((signal): signal is AbortSignal =>
    Boolean(signal),
  );

  if (activeSignals.length === 0) {
    return { cleanup: () => undefined };
  }

  if (activeSignals.length === 1) {
    return { signal: activeSignals[0], cleanup: () => undefined };
  }

  const controller = new AbortController();
  let cleanup = () => undefined;

  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
    cleanup();
  };

  const onAbort = (event: Event) => {
    abortFrom(event.target as AbortSignal);
  };

  cleanup = () => {
    for (const signal of activeSignals) {
      signal.removeEventListener('abort', onAbort);
    }
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abortFrom(signal);
      return { signal: controller.signal, cleanup: () => undefined };
    }
  }

  for (const signal of activeSignals) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return { signal: controller.signal, cleanup };
}

async function assertOk(
  response: Response,
  adapterName: string,
  apiKey?: string,
): Promise<void> {
  if (response.ok) {
    return;
  }

  const responseBody = await response.text().catch(() => undefined);
  throw new SpeechProviderError(
    adapterName,
    `${adapterName} speech request failed with HTTP ${response.status}`,
    {
      status: response.status,
      responseBody: redactSecret(responseBody, apiKey),
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
    },
  );
}

/** Removes an API key from provider-supplied text before it is surfaced. */
export function redactSecret(
  text: string | undefined,
  secret: string | undefined,
): string | undefined {
  if (!text || !secret) {
    return text;
  }

  return text.split(secret).join('[REDACTED]');
}

export function appendOptionalFormValue(
  form: FormData,
  name: string,
  value: unknown,
): void {
  if (value === undefined || value === null) {
    return;
  }

  form.append(name, String(value));
}

export function createHappyVerticalSynthesisForm(
  request: SynthesisRequest,
  defaultVoice?: string,
): FormData {
  const form = new FormData();
  const voice =
    request.voice && typeof request.voice !== 'string'
      ? request.voice
      : undefined;
  form.set('text', request.text);
  appendOptionalFormValue(
    form,
    'language',
    request.language ?? voice?.language,
  );
  appendOptionalFormValue(
    form,
    'speaker',
    voiceToString(request.voice, defaultVoice),
  );
  appendOptionalFormValue(form, 'speed', request.speed);

  appendOptionalFormValue(form, 'voice_prompt', voice?.prompt);

  return form;
}

export function voiceToString(
  voice:
    | string
    | { id?: string; name?: string; speakerId?: string }
    | undefined,
  fallback?: string,
): string | undefined {
  if (!voice) {
    return fallback;
  }

  if (typeof voice === 'string') {
    return voice;
  }

  return voice.id ?? voice.name ?? voice.speakerId ?? fallback;
}

export function compactJson(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}

export function contentTypeToFormat(contentType: string): string | undefined {
  const match = /^audio\/([^;]+)/.exec(contentType);
  return match?.[1];
}

export function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function decodeBase64(base64: string): ArrayBuffer {
  if (typeof Buffer !== 'undefined') {
    return arrayBufferFromBytes(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function getNumber(
  value: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number') {
      return candidate;
    }
  }

  return undefined;
}

function getString(
  value: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string') {
      return candidate;
    }
  }

  return undefined;
}

export function normalizeWordTimings(value: unknown): WordTiming[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry): WordTiming[] => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const word = getString(record, 'word', 'text', 'token');
    const startSeconds = getNumber(
      record,
      'startSeconds',
      'start',
      'start_time',
    );
    const endSeconds = getNumber(record, 'endSeconds', 'end', 'end_time');

    if (!word || startSeconds === undefined || endSeconds === undefined) {
      return [];
    }

    return [
      {
        word,
        startSeconds,
        endSeconds,
        confidence: getNumber(record, 'confidence'),
        speakerId: getString(record, 'speakerId', 'speaker', 'speaker_id'),
      },
    ];
  });
}

export function normalizeTranscriptSegments(
  value: unknown,
): TranscriptSegment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry): TranscriptSegment[] => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const text = getString(record, 'text', 'transcript');
    if (!text) {
      return [];
    }

    return [
      {
        text,
        startSeconds: getNumber(record, 'startSeconds', 'start', 'start_time'),
        endSeconds: getNumber(record, 'endSeconds', 'end', 'end_time'),
        confidence: getNumber(record, 'confidence'),
        speakerId: getString(record, 'speakerId', 'speaker', 'speaker_id'),
      },
    ];
  });
}

export async function readTranscriptResponse(
  response: Response,
  adapterName: string,
): Promise<TranscriptResult> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    return {
      text,
      provider: adapterName,
    };
  }

  const json = (await response.json()) as Record<string, unknown>;
  const text = getString(json, 'text', 'transcript', 'transcription') ?? '';

  return {
    text,
    language: getString(json, 'language', 'lang'),
    durationSeconds: getNumber(json, 'durationSeconds', 'duration'),
    words: normalizeWordTimings(
      json.words ?? json.wordTimings ?? json.word_timings,
    ),
    segments: normalizeTranscriptSegments(json.segments),
    provider: getString(json, 'provider') ?? adapterName,
    model: getString(json, 'model'),
    raw: json,
  };
}

export async function readSynthesizedSpeechResponse(
  response: Response,
  adapterName: string,
): Promise<SynthesizedSpeech> {
  const responseContentType =
    response.headers.get('content-type') ?? 'application/octet-stream';

  if (!responseContentType.includes('application/json')) {
    const audio = await response.arrayBuffer();
    const sampleRate = parseHeaderNumber(response, 'x-sample-rate');
    return {
      audio,
      contentType: responseContentType,
      format: contentTypeToFormat(responseContentType),
      sampleRate,
      provider: adapterName,
    };
  }

  const json = (await response.json()) as Record<string, unknown>;
  const contentType =
    getString(json, 'contentType', 'content_type', 'mimeType', 'mime_type') ??
    'application/octet-stream';
  const encodedAudio = getString(
    json,
    'audio',
    'audioContent',
    'audio_content',
  );

  if (!encodedAudio) {
    throw new SpeechProviderError(
      adapterName,
      `${adapterName} JSON speech response did not include base64 audio`,
    );
  }

  return {
    audio: decodeBase64(encodedAudio),
    contentType,
    format:
      getString(json, 'format', 'response_format') ??
      contentTypeToFormat(contentType),
    sampleRate: getNumber(json, 'sampleRate', 'sample_rate'),
    channels: getNumber(json, 'channels'),
    durationSeconds: getNumber(json, 'durationSeconds', 'duration'),
    words: normalizeWordTimings(
      json.words ?? json.wordTimings ?? json.word_timings,
    ),
    provider: getString(json, 'provider') ?? adapterName,
    model: getString(json, 'model'),
    raw: json,
  };
}

function parseHeaderNumber(
  response: Response,
  headerName: string,
): number | undefined {
  const value = response.headers.get(headerName);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
