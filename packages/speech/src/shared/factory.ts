import { OpenAICompatibleSpeechSynthesizer } from '../adapters/openai-compatible.js';
import { OpenAICompatibleTranscriber } from '../adapters/openai-compatible-transcriber.js';
import { Qwen3SpeechSynthesizer } from '../adapters/qwen3.js';
import {
  StudioServerSpeechSynthesizer,
  StudioServerTranscriber,
} from '../adapters/studio-server.js';
import {
  defaultEnv,
  hasAnyEnv,
  hasTranscriberEnv,
  parseOptionalInteger,
  readEnv,
  resolveTranscriberConfig,
  type SpeechEnv,
  TRANSCRIBER_ENV_KEYS,
} from './env.js';
import {
  InvalidSpeechAdapterError,
  SpeechConfigurationError,
} from './errors.js';
import { compactJson } from './http.js';
import {
  getStreamingTranscriber,
  isStreamingTranscriberType,
  STREAMING_TRANSCRIBER_TYPES,
  wrapStreamingTranscriber,
} from './streaming-factory.js';
import type {
  GetStreamingTranscriberOptions,
  StreamingTranscriberType,
} from './streaming-types.js';
import {
  getOptionalTranscriberFactory,
  optionalTranscriberEntry,
  registeredOptionalTranscribers,
} from './registry.js';
import type {
  GetSpeechOptions,
  GetSpeechSynthesizerOptions,
  GetTranscriberOptions,
  OpenAICompatibleSpeechSynthesizerOptions,
  OpenAICompatibleTranscriberOptions,
  Qwen3SpeechSynthesizerOptions,
  Speech,
  SpeechAdapterAvailability,
  SpeechFetch,
  SpeechSynthesizer,
  StudioServerSpeechSynthesizerOptions,
  StudioServerTranscriberOptions,
  SynthesisRequest,
  SynthesizedSpeech,
  Transcriber,
  TranscriptionRequest,
  TranscriptResult,
} from './types.js';

export interface SpeechFactoryContext {
  env?: SpeechEnv;
  fetch?: SpeechFetch;
  headers?: HeadersInit;
}

/**
 * Creates a speech service from explicit options and/or environment variables.
 *
 * Explicit options win over environment defaults. If no STT or TTS config is
 * available, the returned service is still usable for dependency injection, but
 * calling the missing operation throws a configuration error.
 */
export async function getSpeech(
  options: GetSpeechOptions = {},
  context: SpeechFactoryContext = {},
): Promise<Speech> {
  const transcriber =
    options.transcriber === false
      ? undefined
      : await getOptionalTranscriber(options.transcriber, context);
  const synthesizer =
    options.synthesizer === false
      ? undefined
      : await getOptionalSpeechSynthesizer(options.synthesizer, context);

  return {
    transcriber,
    synthesizer,
    async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
      if (!transcriber) {
        throw new SpeechConfigurationError('No STT provider configured');
      }
      return transcriber.transcribe(request);
    },
    async synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech> {
      if (!synthesizer) {
        throw new SpeechConfigurationError('No TTS provider configured');
      }
      return synthesizer.synthesize(request);
    },
  };
}

export async function getTranscriber(
  options: GetTranscriberOptions = {},
  context: SpeechFactoryContext = {},
): Promise<Transcriber> {
  const streamingType =
    options.type ??
    readEnv(context.env ?? defaultEnv(), ...TRANSCRIBER_ENV_KEYS.type);
  if (isStreamingTranscriberType(streamingType)) {
    return getWrappedStreamingTranscriber(streamingType, options, context);
  }

  const optional = await getRegisteredTranscriber(options, context);
  if (optional) {
    return optional;
  }

  const resolved = normalizeTranscriberOptions(options, context);

  switch (resolved.type) {
    case 'studio-server':
      return new StudioServerTranscriber(resolved);
    case 'openai-compatible':
      return new OpenAICompatibleTranscriber(resolved);
    default:
      throw new InvalidSpeechAdapterError(
        (resolved as { type?: string }).type ?? 'unknown',
        'STT',
      );
  }
}

export async function getSpeechSynthesizer(
  options?: GetSpeechSynthesizerOptions,
  context: SpeechFactoryContext = {},
): Promise<SpeechSynthesizer> {
  const resolved = normalizeSpeechSynthesizerOptions(options, context);

  switch (resolved.type) {
    case 'studio-server':
      return new StudioServerSpeechSynthesizer(resolved);
    case 'qwen3-tts':
      return new Qwen3SpeechSynthesizer(resolved);
    case 'openai-compatible':
      return new OpenAICompatibleSpeechSynthesizer(resolved);
    default:
      throw new InvalidSpeechAdapterError(
        (resolved as { type?: string }).type ?? 'unknown',
        'TTS',
      );
  }
}

export function getAvailableSpeechAdapters(): SpeechAdapterAvailability {
  return {
    transcribers: [
      'studio-server',
      'openai-compatible',
      ...registeredOptionalTranscribers(),
      ...STREAMING_TRANSCRIBER_TYPES,
    ],
    streamingTranscribers: [...STREAMING_TRANSCRIBER_TYPES],
    synthesizers: ['studio-server', 'qwen3-tts', 'openai-compatible'],
  };
}

/**
 * Builds a streaming adapter from `getTranscriber()` options and wraps it as
 * a record-then-send `Transcriber`. Settings come from explicit options, then
 * `options.streaming`, then `HAVE_SPEECH_STREAMING_*`.
 */
function getWrappedStreamingTranscriber(
  type: StreamingTranscriberType,
  options: GetTranscriberOptions,
  context: SpeechFactoryContext,
): Transcriber {
  const streaming = getStreamingTranscriber(
    {
      ...options.streaming,
      ...(compactJson({
        type,
        baseUrl: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
        headers: options.headers,
        timeoutMs: options.timeoutMs,
        onUsage: options.onUsage,
      }) as GetStreamingTranscriberOptions),
    },
    { env: context.env, headers: context.headers },
  );
  return wrapStreamingTranscriber(streaming, { maxBytes: options.maxBytes });
}

/**
 * Builds opt-in adapters (e.g. `local`) registered by their subpath entry.
 * Returns `undefined` for built-in types.
 */
async function getRegisteredTranscriber(
  options: GetTranscriberOptions,
  context: SpeechFactoryContext,
): Promise<Transcriber | undefined> {
  const type = resolveTranscriberConfig(options, context).type;
  const entry = type ? optionalTranscriberEntry(type) : undefined;
  if (!type || !entry) {
    return undefined;
  }

  const factory = getOptionalTranscriberFactory(type);
  if (!factory) {
    throw new SpeechConfigurationError(
      `The '${type}' transcriber is opt-in: import '${entry}' before calling getTranscriber()`,
      type,
    );
  }
  return factory({ ...options, type: type as Transcriber['type'] }, context);
}

async function getOptionalTranscriber(
  options: GetTranscriberOptions | undefined,
  context: SpeechFactoryContext,
): Promise<Transcriber | undefined> {
  if (!options && !hasTranscriberEnv(context.env ?? defaultEnv())) {
    return undefined;
  }

  return getTranscriber(options, context);
}

async function getOptionalSpeechSynthesizer(
  options: GetSpeechSynthesizerOptions | undefined,
  context: SpeechFactoryContext,
): Promise<SpeechSynthesizer | undefined> {
  if (!options && !hasSynthesizerEnv(context.env ?? defaultEnv())) {
    return undefined;
  }

  return getSpeechSynthesizer(options, context);
}

function normalizeTranscriberOptions(
  options: GetTranscriberOptions = {},
  context: SpeechFactoryContext,
): StudioServerTranscriberOptions | OpenAICompatibleTranscriberOptions {
  const resolved = resolveTranscriberConfig(options, context);
  const type = resolved.type ?? 'studio-server';

  if (type !== 'studio-server' && type !== 'openai-compatible') {
    throw new InvalidSpeechAdapterError(type, 'STT');
  }

  if (!resolved.baseUrl) {
    throw new SpeechConfigurationError('STT baseUrl is required', type);
  }

  const shared = {
    baseUrl: resolved.baseUrl,
    fetch: resolved.fetch,
    headers: resolved.headers,
    apiKey: resolved.apiKey,
    timeoutMs: resolved.timeoutMs,
  };

  if (type === 'openai-compatible') {
    return {
      ...shared,
      type,
      model: resolved.model,
      responseFormat: options.responseFormat,
      maxBytes: resolved.maxBytes,
      retry: options.retry,
      onUsage: options.onUsage,
    };
  }

  return {
    ...shared,
    type,
    transcribePath: options.transcribePath ?? resolved.path,
  };
}

function normalizeSpeechSynthesizerOptions(
  options: GetSpeechSynthesizerOptions | undefined,
  context: SpeechFactoryContext,
):
  | StudioServerSpeechSynthesizerOptions
  | Qwen3SpeechSynthesizerOptions
  | OpenAICompatibleSpeechSynthesizerOptions {
  const env = context.env ?? defaultEnv();
  const type =
    options?.type ??
    (readEnv(
      env,
      'HAVE_SPEECH_TTS_TYPE',
      'HAVE_SPEECH_TTS_ADAPTER',
      'TTS_ADAPTER',
    ) as GetSpeechSynthesizerOptions['type'] | undefined);
  const baseUrl =
    options?.baseUrl ??
    readEnv(env, 'HAVE_SPEECH_TTS_BASE_URL', 'TTS_BASE_URL');

  if (!type) {
    throw new SpeechConfigurationError('TTS provider type is required');
  }

  if (
    type !== 'studio-server' &&
    type !== 'qwen3-tts' &&
    type !== 'openai-compatible'
  ) {
    throw new InvalidSpeechAdapterError(type, 'TTS');
  }

  if (!baseUrl?.trim()) {
    throw new SpeechConfigurationError('TTS baseUrl is required', type);
  }

  const shared = {
    type,
    baseUrl: baseUrl.trim(),
    fetch: options?.fetch ?? context.fetch,
    headers: options?.headers ?? context.headers,
    apiKey:
      options?.apiKey ??
      readEnv(env, 'HAVE_SPEECH_TTS_API_KEY', 'TTS_API_KEY', 'SPEECH_API_KEY'),
    timeoutMs:
      options?.timeoutMs ??
      parseOptionalInteger(
        readEnv(env, 'HAVE_SPEECH_TTS_TIMEOUT_MS', 'TTS_TIMEOUT_MS'),
      ),
  };

  if (type === 'studio-server') {
    return {
      ...shared,
      type,
      synthesizePath:
        options?.synthesizePath ??
        readEnv(env, 'HAVE_SPEECH_TTS_PATH', 'TTS_PATH'),
      defaultVoice:
        options?.defaultVoice ??
        readEnv(env, 'HAVE_SPEECH_TTS_VOICE', 'TTS_VOICE'),
    };
  }

  if (type === 'qwen3-tts') {
    return {
      ...shared,
      type,
      speechPath:
        options?.speechPath ?? readEnv(env, 'HAVE_SPEECH_TTS_PATH', 'TTS_PATH'),
      defaultModel:
        options?.defaultModel ??
        readEnv(env, 'HAVE_SPEECH_TTS_MODEL', 'TTS_MODEL'),
      defaultVoice:
        options?.defaultVoice ??
        readEnv(env, 'HAVE_SPEECH_TTS_VOICE', 'TTS_VOICE'),
    };
  }

  if (type === 'openai-compatible') {
    return {
      ...shared,
      type,
      speechPath:
        options?.speechPath ?? readEnv(env, 'HAVE_SPEECH_TTS_PATH', 'TTS_PATH'),
      defaultModel:
        options?.defaultModel ??
        readEnv(env, 'HAVE_SPEECH_TTS_MODEL', 'TTS_MODEL'),
      defaultVoice:
        options?.defaultVoice ??
        readEnv(env, 'HAVE_SPEECH_TTS_VOICE', 'TTS_VOICE'),
    };
  }

  throw new InvalidSpeechAdapterError(type, 'TTS');
}

function hasSynthesizerEnv(env: SpeechEnv): boolean {
  return hasAnyEnv(
    env,
    'HAVE_SPEECH_TTS_TYPE',
    'HAVE_SPEECH_TTS_ADAPTER',
    'HAVE_SPEECH_TTS_BASE_URL',
    'TTS_ADAPTER',
    'TTS_BASE_URL',
  );
}
