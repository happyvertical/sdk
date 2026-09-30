import {
  DEFAULT_MAX_AUDIO_BYTES,
  normalizeAudioInput,
} from '../shared/audio.js';
import { SpeechProviderError } from '../shared/errors.js';
import {
  appendOptionalFormValue,
  HttpSpeechAdapter,
  readTranscriptResponse,
  resolveOpenAICompatibleUrl,
} from '../shared/http.js';
import {
  resolveRetryOptions,
  type SpeechRetryOptions,
} from '../shared/retry.js';
import type {
  OpenAICompatibleTranscriberOptions,
  TimestampGranularity,
  Transcriber,
  TranscriptionRequest,
  TranscriptionResponseFormat,
  TranscriptResult,
} from '../shared/types.js';
import {
  audioSecondsFromProviderUsage,
  reportSpeechUsage,
  type SpeechUsage,
  type SpeechUsageCallback,
} from '../shared/usage.js';

const DEFAULT_MODEL = 'whisper-1';

/**
 * Models that only accept `json`/`text` and reject `verbose_json` and
 * `timestamp_granularities[]` (e.g. `gpt-4o-transcribe`,
 * `gpt-4o-mini-transcribe`, optionally gateway-prefixed like
 * `openai/gpt-4o-transcribe`).
 */
const JSON_ONLY_MODEL = /(^|\/)gpt-4o[\w.-]*-transcribe/i;

/** Provider 400/422 bodies that indicate an unsupported format option. */
const UNSUPPORTED_FORMAT_ERROR =
  /verbose_json|response_format|timestamp_granularit/i;

export function isJsonOnlyTranscriptionModel(model: string): boolean {
  return JSON_ONLY_MODEL.test(model);
}

interface TranscriptionWireOptions {
  model: string;
  responseFormat: TranscriptionResponseFormat;
  timestampGranularities?: TimestampGranularity[];
}

/**
 * OpenAI-compatible speech-to-text adapter (`POST <base>/audio/transcriptions`).
 * Works with OpenAI, Groq, Fireworks, LiteLLM/Bifrost gateways, vLLM,
 * speaches/faster-whisper-server, and whisper.cpp server.
 *
 * Server-side only: the adapter holds the API key.
 */
export class OpenAICompatibleTranscriber
  extends HttpSpeechAdapter
  implements Transcriber
{
  readonly type = 'openai-compatible' as const;

  private readonly endpoint: string;
  private readonly model: string;
  private readonly responseFormat?: TranscriptionResponseFormat;
  private readonly maxBytes: number;
  private readonly retry: Required<SpeechRetryOptions> | false;
  private readonly onUsage?: SpeechUsageCallback;

  constructor(options: OpenAICompatibleTranscriberOptions) {
    super(options);
    this.endpoint = resolveOpenAICompatibleUrl(
      options.baseUrl,
      'audio/transcriptions',
    );
    this.model = options.model?.trim() || DEFAULT_MODEL;
    this.responseFormat = options.responseFormat;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_AUDIO_BYTES;
    this.retry = resolveRetryOptions(options.retry);
    this.onUsage = options.onUsage;
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
    const audio = await normalizeAudioInput(request.audio, {
      mimeType: request.mimeType,
      maxBytes: request.maxBytes ?? this.maxBytes,
      adapter: this.type,
      signal: request.signal,
    });
    const wire = this.resolveWireOptions(request);

    const send = (options: TranscriptionWireOptions) => {
      const form = new FormData();
      form.append('file', audio.blob, audio.filename);
      form.set('model', options.model);
      appendOptionalFormValue(form, 'language', request.language);
      appendOptionalFormValue(form, 'prompt', request.prompt);
      appendOptionalFormValue(form, 'temperature', request.temperature);
      form.set('response_format', options.responseFormat);
      for (const granularity of options.timestampGranularities ?? []) {
        form.append('timestamp_granularities[]', granularity);
      }

      return this.post(
        this.type,
        this.endpoint,
        {
          body: form,
          headers: request.headers,
          signal: request.signal,
        },
        (response) => readTranscriptResponse(response, this.type),
        this.retry,
      );
    };

    let transcript: TranscriptResult;
    try {
      transcript = await send(wire);
    } catch (error) {
      if (!isUnsupportedFormatError(error, wire)) {
        throw error;
      }
      // The server rejected verbose_json/timestamps: fall back to plain JSON.
      transcript = await send({
        model: wire.model,
        responseFormat: 'json',
      });
    }

    const providerUsage = extractProviderUsage(transcript.raw);
    const usage: SpeechUsage = {
      operation: 'transcription',
      provider: this.type,
      model: transcript.model ?? wire.model,
      audioSeconds:
        transcript.durationSeconds ??
        audioSecondsFromProviderUsage(providerUsage) ??
        audio.durationSeconds,
      bytes: audio.bytes,
      providerUsage,
    };
    const result: TranscriptResult = {
      ...transcript,
      // Plain `text` responses end with a newline; JSON text is kept verbatim.
      text:
        transcript.raw === undefined ? transcript.text.trim() : transcript.text,
      provider: this.type,
      model: transcript.model ?? wire.model,
      usage,
    };

    await reportSpeechUsage(usage, this.onUsage, request.onUsage);
    return result;
  }

  private resolveWireOptions(
    request: TranscriptionRequest,
  ): TranscriptionWireOptions {
    const model = request.model?.trim() || this.model;
    const jsonOnly = isJsonOnlyTranscriptionModel(model);
    let responseFormat =
      request.responseFormat ??
      this.responseFormat ??
      (jsonOnly ? 'json' : 'verbose_json');

    if (jsonOnly && responseFormat === 'verbose_json') {
      responseFormat = 'json';
    }

    const timestampGranularities =
      responseFormat === 'verbose_json' &&
      request.timestampGranularities?.length
        ? [...new Set(request.timestampGranularities)]
        : undefined;

    return { model, responseFormat, timestampGranularities };
  }
}

function isUnsupportedFormatError(
  error: unknown,
  wire: TranscriptionWireOptions,
): boolean {
  return (
    error instanceof SpeechProviderError &&
    (error.status === 400 || error.status === 422) &&
    (wire.responseFormat === 'verbose_json' ||
      Boolean(wire.timestampGranularities?.length)) &&
    UNSUPPORTED_FORMAT_ERROR.test(error.responseBody ?? '')
  );
}

function extractProviderUsage(
  raw: unknown,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const usage = (raw as Record<string, unknown>).usage;
  return usage && typeof usage === 'object' && !Array.isArray(usage)
    ? (usage as Record<string, unknown>)
    : undefined;
}
