/**
 * Universal factory functions for creating AI provider instances
 * Works in both browser and Node.js environments
 */

import { ValidationError, loadEnvConfig } from '@have/utils';

import type {
  AIInterface,
  AnthropicOptions,
  BedrockOptions,
  ClaudeCliOptions,
  GeminiOptions,
  GetAIOptions,
  HuggingFaceOptions,
  OpenAIOptions,
} from './types';

/**
 * Type guards for provider options
 */

/**
 * Checks if the options are for OpenAI provider
 * @param options - The AI provider options to check
 * @returns True if options are for OpenAI provider (including default case)
 */
function isOpenAIOptions(options: GetAIOptions): options is OpenAIOptions {
  return !options.type || options.type === 'openai';
}

/**
 * Checks if the options are for Google Gemini provider
 * @param options - The AI provider options to check
 * @returns True if options are for Gemini provider
 */
function isGeminiOptions(options: GetAIOptions): options is GeminiOptions {
  return options.type === 'gemini';
}

/**
 * Checks if the options are for Anthropic Claude provider
 * @param options - The AI provider options to check
 * @returns True if options are for Anthropic provider
 */
function isAnthropicOptions(
  options: GetAIOptions,
): options is AnthropicOptions {
  return options.type === 'anthropic';
}

/**
 * Checks if the options are for Hugging Face provider
 * @param options - The AI provider options to check
 * @returns True if options are for Hugging Face provider
 */
function isHuggingFaceOptions(
  options: GetAIOptions,
): options is HuggingFaceOptions {
  return options.type === 'huggingface';
}

/**
 * Checks if the options are for AWS Bedrock provider
 * @param options - The AI provider options to check
 * @returns True if options are for Bedrock provider
 */
function isBedrockOptions(options: GetAIOptions): options is BedrockOptions {
  return options.type === 'bedrock';
}

/**
 * Checks if the options are for Claude CLI provider
 * @param options - The AI provider options to check
 * @returns True if options are for Claude CLI provider
 */
function isClaudeCliOptions(
  options: GetAIOptions,
): options is ClaudeCliOptions {
  return options.type === 'claude-cli';
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
 * @param options - Configuration options for the AI provider. Must include provider type and credentials.
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
 * ```
 */
export async function getAI(options: GetAIOptions = {}): Promise<AIInterface> {
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
    },
  }) as GetAIOptions;

  // Normalize 'provider' field to 'type' for consistency
  if ('provider' in options && !options.type) {
    (options as any).type = (options as any).provider;
  }

  if (isOpenAIOptions(options)) {
    const { OpenAIProvider } = await import('./providers/openai.js');
    return new OpenAIProvider(options);
  }

  if (isGeminiOptions(options)) {
    const { GeminiProvider } = await import('./providers/gemini.js');
    return new GeminiProvider(options);
  }

  if (isAnthropicOptions(options)) {
    const { AnthropicProvider } = await import('./providers/anthropic.js');
    return new AnthropicProvider(options);
  }

  if (isHuggingFaceOptions(options)) {
    const { HuggingFaceProvider } = await import('./providers/huggingface.js');
    return new HuggingFaceProvider(options);
  }

  if (isBedrockOptions(options)) {
    const { BedrockProvider } = await import('./providers/bedrock.js');
    return new BedrockProvider(options);
  }

  if (isClaudeCliOptions(options)) {
    const { ClaudeCliProvider } = await import('./providers/claude-cli.js');
    return new ClaudeCliProvider(options);
  }

  throw new ValidationError('Unsupported AI provider type', {
    supportedTypes: [
      'openai',
      'gemini',
      'anthropic',
      'huggingface',
      'bedrock',
      'claude-cli',
    ],
    providedType: (options as any).type,
  });
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
  // Auto-detect provider based on available credentials
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
    supportedTypes: ['openai', 'gemini', 'anthropic', 'huggingface', 'bedrock'],
    providedOptions: Object.keys(options),
  });
}
