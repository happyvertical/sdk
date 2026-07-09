import { OpenAICompatibleSpeechSynthesizer } from '../adapters/openai-compatible.js';
import { Qwen3SpeechSynthesizer } from '../adapters/qwen3.js';
import {
  StudioServerSpeechSynthesizer,
  StudioServerTranscriber,
} from '../adapters/studio-server.js';
import {
  InvalidSpeechAdapterError,
  SpeechConfigurationError,
} from './errors.js';
import type {
  GetSpeechOptions,
  GetSpeechSynthesizerOptions,
  GetTranscriberOptions,
  OpenAICompatibleSpeechSynthesizerOptions,
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

interface SpeechEnv {
  [key: string]: string | undefined;
}

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
  const resolved = normalizeTranscriberOptions(options, context);

  switch (resolved.type) {
    case 'studio-server':
      return new StudioServerTranscriber(resolved);
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
    transcribers: ['studio-server'],
    synthesizers: ['studio-server', 'qwen3-tts', 'openai-compatible'],
  };
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
): StudioServerTranscriberOptions {
  const env = context.env ?? defaultEnv();
  const type =
    options.type ??
    readEnv(
      env,
      'HAVE_SPEECH_STT_TYPE',
      'HAVE_SPEECH_STT_ADAPTER',
      'STT_ADAPTER',
    ) ??
    'studio-server';
  const baseUrl =
    options.baseUrl ?? readEnv(env, 'HAVE_SPEECH_STT_BASE_URL', 'STT_BASE_URL');

  if (type !== 'studio-server') {
    throw new InvalidSpeechAdapterError(type, 'STT');
  }

  if (!baseUrl?.trim()) {
    throw new SpeechConfigurationError('STT baseUrl is required', type);
  }

  return {
    ...options,
    type,
    baseUrl: baseUrl.trim(),
    fetch: options.fetch ?? context.fetch,
    headers: options.headers ?? context.headers,
    apiKey:
      options.apiKey ??
      readEnv(env, 'HAVE_SPEECH_STT_API_KEY', 'STT_API_KEY', 'SPEECH_API_KEY'),
    timeoutMs:
      options.timeoutMs ??
      parseOptionalInteger(
        readEnv(env, 'HAVE_SPEECH_STT_TIMEOUT_MS', 'STT_TIMEOUT_MS'),
      ),
    transcribePath:
      options.transcribePath ??
      readEnv(env, 'HAVE_SPEECH_STT_PATH', 'STT_PATH'),
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

function hasTranscriberEnv(env: SpeechEnv): boolean {
  return hasAnyEnv(
    env,
    'HAVE_SPEECH_STT_TYPE',
    'HAVE_SPEECH_STT_ADAPTER',
    'HAVE_SPEECH_STT_BASE_URL',
    'STT_ADAPTER',
    'STT_BASE_URL',
  );
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

function readEnv(env: SpeechEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function hasAnyEnv(env: SpeechEnv, ...keys: string[]): boolean {
  return keys.some((key) => Boolean(env[key]?.trim()));
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultEnv(): SpeechEnv {
  return globalThis.process?.env ?? {};
}
