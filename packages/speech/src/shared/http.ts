import { SpeechConfigurationError, SpeechProviderError } from './errors.js';
import type {
  AudioInput,
  HttpSpeechOptions,
  SpeechFetch,
  SynthesisRequest,
  SynthesizedSpeech,
  TranscriptResult,
  TranscriptSegment,
  WordTiming,
} from './types.js';

export function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl.trim()) {
    throw new SpeechConfigurationError('Speech adapter baseUrl is required');
  }

  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export function resolveSpeechUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\//, ''), normalizeBaseUrl(baseUrl)).toString();
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

  protected async post<T>(
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
      await assertOk(response, adapterName);
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
      responseBody,
    },
  );
}

export function appendAudioInput(
  form: FormData,
  audio: AudioInput,
  fieldName = 'audio',
): void {
  const filename = audio.filename ?? 'audio';
  const data = audio.data;

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const contentType =
      audio.contentType ?? (data.type || 'application/octet-stream');
    const blob =
      data.type === contentType
        ? data
        : new Blob([data], { type: contentType });
    form.append(fieldName, blob, filename);
    return;
  }

  const contentType = audio.contentType ?? 'application/octet-stream';
  const blobPart =
    data instanceof Uint8Array ? arrayBufferFromBytes(data) : data;
  form.append(fieldName, new Blob([blobPart], { type: contentType }), filename);
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
