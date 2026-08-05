/**
 * Universal factory functions for creating AI provider instances
 * Works in both browser and Node.js environments
 */

import { loadEnvConfig, ValidationError } from '@happyvertical/utils';

import type { AIClientOptions } from './client';
import { createRateLimitedAI } from './rate-limit';
import { createObservedAI, normalizeBaseAIOptions } from './safety';
import type {
  AIInterface,
  AIProviderType,
  AnthropicOptions,
  BedrockOptions,
  BifrostOptions,
  ByteplusModelArkOptions,
  ClaudeCliOptions,
  GeminiOptions,
  GetAIOptions,
  HuggingFaceOptions,
  LiteLLMOptions,
  OllamaOptions,
  OpenAICompatVideoOptions,
  OpenAIOptions,
  Qwen3TTSOptions,
} from './types';
import { AI_PROVIDER_TYPES } from './types';

/**
 * Type guards for provider options
 */

/**
 * Checks if the options are for OpenAI provider
 * @param options - The AI provider options to check
 * @returns True if options are for OpenAI provider (including default case)
 */
function isOpenAIOptions(
  options: GetAIOptions | AIClientOptions,
): options is OpenAIOptions {
  return !options.type || options.type === 'openai';
}

/**
 * Checks if the options are for LiteLLM provider
 * @param options - The AI provider options to check
 * @returns True if options are for LiteLLM provider
 */
function isLiteLLMOptions(
  options: GetAIOptions | AIClientOptions,
): options is LiteLLMOptions {
  return options.type === 'litellm';
}

/**
 * Checks if the options are for Bifrost provider
 * @param options - The AI provider options to check
 * @returns True if options are for Bifrost provider
 */
function isBifrostOptions(
  options: GetAIOptions | AIClientOptions,
): options is BifrostOptions {
  return options.type === 'bifrost';
}

/**
 * Checks if the options are for Ollama provider
 * @param options - The AI provider options to check
 * @returns True if options are for Ollama provider
 */
function isOllamaOptions(
  options: GetAIOptions | AIClientOptions,
): options is OllamaOptions {
  return options.type === 'ollama';
}

/**
 * Checks if the options are for Google Gemini provider
 * @param options - The AI provider options to check
 * @returns True if options are for Gemini provider
 */
function isGeminiOptions(
  options: GetAIOptions | AIClientOptions,
): options is GeminiOptions {
  return options.type === 'gemini';
}

/**
 * Checks if the options are for Anthropic Claude provider
 * @param options - The AI provider options to check
 * @returns True if options are for Anthropic provider
 */
function isAnthropicOptions(
  options: GetAIOptions | AIClientOptions,
): options is AnthropicOptions {
  return options.type === 'anthropic';
}

/**
 * Checks if the options are for Hugging Face provider
 * @param options - The AI provider options to check
 * @returns True if options are for Hugging Face provider
 */
function isHuggingFaceOptions(
  options: GetAIOptions | AIClientOptions,
): options is HuggingFaceOptions {
  return options.type === 'huggingface';
}

/**
 * Checks if the options are for AWS Bedrock provider
 * @param options - The AI provider options to check
 * @returns True if options are for Bedrock provider
 */
function isBedrockOptions(
  options: GetAIOptions | AIClientOptions,
): options is BedrockOptions {
  return options.type === 'bedrock';
}

/**
 * Checks if the options are for Claude CLI provider
 * @param options - The AI provider options to check
 * @returns True if options are for Claude CLI provider
 */
function isClaudeCliOptions(
  options: GetAIOptions | AIClientOptions,
): options is ClaudeCliOptions {
  return options.type === 'claude-cli';
}

/**
 * Checks if the options are for Qwen3-TTS provider
 * @param options - The AI provider options to check
 * @returns True if options are for Qwen3-TTS provider
 */
function isQwen3TTSOptions(
  options: GetAIOptions | AIClientOptions,
): options is Qwen3TTSOptions {
  return options.type === 'qwen3-tts';
}

/**
 * Checks if the options are for the OpenAI-compatible video-generation provider
 * @param options - The AI provider options to check
 * @returns True if options are for the openai-compat-video provider
 */
function isOpenAICompatVideoOptions(
  options: GetAIOptions | AIClientOptions,
): options is OpenAICompatVideoOptions {
  return options.type === 'openai-compat-video';
}

/**
 * Checks if the options are for the BytePlus ModelArk (Seedance) provider
 * @param options - The AI provider options to check
 * @returns True if options are for the byteplus-modelark provider
 */
function isByteplusModelArkOptions(
  options: GetAIOptions | AIClientOptions,
): options is ByteplusModelArkOptions {
  return options.type === 'byteplus-modelark';
}

/**
 * Creates an AI provider instance based on the provided options.
 * Universal version that works in both browser and Node.js environments.
 *
 * Supports environment variable configuration using the pattern:
 * - HAVE_AI_PROVIDER → provider type (string)
 * - HAVE_AI_MODEL → defaultModel (string)
 * - HAVE_AI_TIMEOUT → timeout (number)
 * - HAVE_AI_MAX_RETRIES → maxRetries (number)
 * - HAVE_AI_API_KEY → apiKey (string) - fallback if provider-specific key not set
 * - HAVE_AI_BASE_URL → baseUrl (string)
 *
 * User-provided options always take precedence over environment variables.
 *
 * Accepts both GetAIOptions (provider-specific options with literal types)
 * and AIClientOptions (legacy interface with generic string type) for
 * backward compatibility with existing code.
 *
 * @param options - Configuration options for the AI provider. Can be GetAIOptions or AIClientOptions.
 * @returns Promise resolving to an AI provider instance that implements the AIInterface
 * @throws {ValidationError} When the provider type is unsupported or invalid
 *
 * @example
 * ```typescript
 * // Create OpenAI client with explicit options
 * const openai = await getAI({
 *   type: 'openai',
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   defaultModel: 'gpt-4o'
 * });
 *
 * // Or use environment variables (HAVE_AI_PROVIDER=openai, HAVE_AI_API_KEY=sk-...)
 * const client = await getAI({});
 *
 * // Create Anthropic client
 * const anthropic = await getAI({
 *   type: 'anthropic',
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 *   defaultModel: 'claude-3-5-sonnet-20241022'
 * });
 *
 * // Works with AIClientOptions (legacy interface)
 * const clientOptions: AIClientOptions = { type: 'openai', apiKey: '...' };
 * const legacy = await getAI(clientOptions);
 * ```
 */
export async function getAI(
  options: GetAIOptions | AIClientOptions = {},
): Promise<AIInterface> {
  // Load environment variables with user options taking precedence
  options = loadEnvConfig(options as Record<string, any>, {
    packageName: 'ai',
    schema: {
      provider: 'string',
      type: 'string', // Alias for provider
      model: 'string',
      defaultModel: 'string',
      timeout: 'number',
      maxRetries: 'number',
      apiKey: 'string',
      baseUrl: 'string',
      adminApiKey: 'string',
      adminBaseUrl: 'string',
      adminUrl: 'string',
      adminUser: 'string',
      adminUsername: 'string',
      adminPassword: 'string',
    },
  }) as GetAIOptions;

  // Normalize 'provider' field to 'type' for consistency
  if ('provider' in options && !options.type) {
    (options as any).type = (options as any).provider;
  }

  // Normalize 'model' field to 'defaultModel' for consistency
  if ('model' in options && !options.defaultModel) {
    (options as any).defaultModel = (options as any).model;
  }

  options = normalizeBaseAIOptions(options as GetAIOptions);

  let client: AIInterface;

  if (isOpenAIOptions(options)) {
    const { OpenAIProvider } = await import('./providers/openai.js');
    client = new OpenAIProvider(options);
  } else if (isLiteLLMOptions(options)) {
    const { LiteLLMProvider } = await import('./providers/litellm.js');
    client = new LiteLLMProvider(options);
  } else if (isBifrostOptions(options)) {
    const { BifrostProvider } = await import('./providers/bifrost.js');
    client = new BifrostProvider(options);
  } else if (isOllamaOptions(options)) {
    const { OllamaProvider } = await import('./providers/ollama.js');
    client = new OllamaProvider(options);
  } else if (isGeminiOptions(options)) {
    const { GeminiProvider } = await import('./providers/gemini.js');
    client = new GeminiProvider(options);
  } else if (isAnthropicOptions(options)) {
    const { AnthropicProvider } = await import('./providers/anthropic.js');
    client = new AnthropicProvider(options);
  } else if (isHuggingFaceOptions(options)) {
    const { HuggingFaceProvider } = await import('./providers/huggingface.js');
    client = new HuggingFaceProvider(options);
  } else if (isBedrockOptions(options)) {
    const { BedrockProvider } = await import('./providers/bedrock.js');
    client = new BedrockProvider(options);
  } else if (isClaudeCliOptions(options)) {
    const { ClaudeCliProvider } = await import('./providers/claude-cli.js');
    client = new ClaudeCliProvider(options);
  } else if (isQwen3TTSOptions(options)) {
    const { Qwen3TTSProvider } = await import('./providers/qwen-tts.js');
    client = new Qwen3TTSProvider(options);
  } else if (isOpenAICompatVideoOptions(options)) {
    const { OpenAICompatVideoProvider } = await import(
      './providers/openai-compat-video.js'
    );
    client = new OpenAICompatVideoProvider(options);
  } else if (isByteplusModelArkOptions(options)) {
    const { ByteplusModelArkProvider } = await import(
      './providers/byteplus-modelark.js'
    );
    client = new ByteplusModelArkProvider(options);
  } else {
    throw new ValidationError('Unsupported AI provider type', {
      supportedTypes: [...AI_PROVIDER_TYPES],
      providedType: (options as any).type,
    });
  }

  return createObservedAI(createRateLimitedAI(client, options), options);
}

/**
 * Browser-compatible auto-detection of AI provider based on available credentials.
 * Does not rely on process.env, making it suitable for browser environments.
 *
 * @param options - Configuration options that may contain provider-specific credentials
 * @returns Promise resolving to an AI provider instance based on detected credentials
 * @throws {ValidationError} When no provider can be detected from the provided options
 *
 * @example
 * ```typescript
 * // Auto-detect OpenAI from apiKey
 * const client1 = await getAIAuto({
 *   apiKey: 'sk-...', // Detected as OpenAI
 *   defaultModel: 'gpt-4o'
 * });
 *
 * // Auto-detect Hugging Face from apiToken
 * const client2 = await getAIAuto({
 *   apiToken: 'hf_...', // Detected as Hugging Face
 *   model: 'microsoft/DialoGPT-medium'
 * });
 *
 * // Auto-detect AWS Bedrock from region and credentials
 * const client3 = await getAIAuto({
 *   region: 'us-east-1',
 *   credentials: {
 *     accessKeyId: 'AKIA...',
 *     secretAccessKey: 'xxx'
 *   }
 * });
 * ```
 */
export async function getAIAuto(
  options: Record<string, any>,
): Promise<AIInterface> {
  const baseUrl = String((options as any).baseUrl || '');
  const hasKeepAliveOption =
    'keepAlive' in options && (options as any).keepAlive !== undefined;

  // Auto-detect provider based on available credentials
  if (
    /((?:localhost|127\.0\.0\.1)(?::11434)?(?:\/(?:api|v1))?|ollama(?:\.com)?(?:\/(?:api|v1))?)\/?$/i.test(
      baseUrl,
    ) ||
    hasKeepAliveOption
  ) {
    return getAI({ ...options, type: 'ollama' } as OllamaOptions);
  }

  if (options.apiKey && !options.type) {
    // Default to OpenAI if apiKey is provided without explicit type
    return getAI({ ...options, type: 'openai' } as OpenAIOptions);
  }

  if (options.apiToken) {
    // Hugging Face uses apiToken
    return getAI({ ...options, type: 'huggingface' } as HuggingFaceOptions);
  }

  if (options.region && options.credentials) {
    // AWS Bedrock uses region and explicit credentials
    return getAI({ ...options, type: 'bedrock' } as BedrockOptions);
  }

  if (options.projectId || options.anthropicVersion) {
    // Try to detect based on provider-specific options
    if (options.anthropicVersion) {
      return getAI({ ...options, type: 'anthropic' } as AnthropicOptions);
    }
    if (options.projectId) {
      return getAI({ ...options, type: 'gemini' } as GeminiOptions);
    }
  }

  throw new ValidationError('Could not auto-detect AI provider from options', {
    hint: 'Please specify a "type" field in options or provide provider-specific credentials',
    supportedTypes: [...AI_PROVIDER_TYPES] as AIProviderType[],
    providedOptions: Object.keys(options),
  });
}
