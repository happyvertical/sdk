/**
 * Node.js-specific factory functions for creating AI provider instances
 * Includes support for environment variable detection
 */

import { loadEnvConfig, ValidationError } from '@happyvertical/utils';
import { getAI as getAIUniversal } from '../shared/factory';

import type {
  AIInterface,
  AIProviderType,
  AnthropicOptions,
  BedrockOptions,
  GeminiOptions,
  GetAIOptions,
  HuggingFaceOptions,
  LiteLLMOptions,
  OllamaOptions,
  OpenAIOptions,
} from '../shared/types';
import { AI_PROVIDER_TYPES } from '../shared/types';

/**
 * Re-export the universal getAI function
 */
export { getAI } from '../shared/factory';

/**
 * Node.js-enhanced auto-detection of AI provider based on available credentials
 * Includes support for environment variables
 *
 * Supports both HAVE_AI_* environment variables and provider-specific variables:
 * - HAVE_AI_PROVIDER / HAVE_AI_TYPE → provider type
 * - HAVE_AI_API_KEY → fallback API key
 * - LITELLM_BASE_URL / LITELLM_API_KEY → LiteLLM-specific gateway config
 * - OLLAMA_HOST / OLLAMA_BASE_URL / OLLAMA_API_KEY → Ollama host/auth config
 * - OPENAI_API_KEY → OpenAI-specific key
 * - ANTHROPIC_API_KEY → Anthropic-specific key
 * - GEMINI_API_KEY / GOOGLE_API_KEY → Gemini-specific key
 * - HF_TOKEN → Hugging Face token
 * - AWS_* → AWS Bedrock credentials
 *
 * @param options - Configuration options that may contain provider-specific credentials
 * @returns Promise resolving to an AI provider instance
 * @throws ValidationError if no provider can be detected from the options
 */
export async function getAIAuto(
  options: Record<string, any> = {},
): Promise<AIInterface> {
  // Load HAVE_AI_* environment variables first
  const config = loadEnvConfig(options, {
    packageName: 'ai',
    schema: {
      provider: 'string',
      type: 'string',
      model: 'string',
      defaultModel: 'string',
      timeout: 'number',
      maxRetries: 'number',
      apiKey: 'string',
      baseUrl: 'string',
    },
  }) as GetAIOptions;

  // Normalize 'provider' field to 'type'
  if ('provider' in config && !config.type) {
    (config as any).type = (config as any).provider;
  }

  // If type is specified (either from options or env vars), use getAI directly
  if (config.type) {
    return getAIUniversal(config);
  }

  // First try universal detection with loaded config
  try {
    return await import('../shared/factory.js').then((m) =>
      m.getAIAuto(config),
    );
  } catch (_error) {
    // If universal detection fails, try Node.js-specific environment variables
  }

  // Auto-detect provider based on available credentials including environment variables
  if ((config.baseUrl || process.env.LITELLM_BASE_URL) && !config.type) {
    return getAIUniversal({
      ...config,
      type: 'litellm',
      baseUrl: config.baseUrl || process.env.LITELLM_BASE_URL,
      apiKey: config.apiKey || process.env.LITELLM_API_KEY,
    } as LiteLLMOptions);
  }

  if (
    (process.env.OLLAMA_HOST ||
      process.env.OLLAMA_BASE_URL ||
      (process.env.OLLAMA_API_KEY && !process.env.OPENAI_API_KEY)) &&
    !config.type
  ) {
    return getAIUniversal({
      ...config,
      type: 'ollama',
      baseUrl:
        config.baseUrl ||
        process.env.OLLAMA_BASE_URL ||
        process.env.OLLAMA_HOST,
      apiKey: (config as any).apiKey || process.env.OLLAMA_API_KEY,
    } as OllamaOptions);
  }

  if ((config.apiKey || process.env.OPENAI_API_KEY) && !config.type) {
    // Default to OpenAI if apiKey is provided without explicit type
    return getAIUniversal({
      ...config,
      type: 'openai',
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    } as OpenAIOptions);
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return getAIUniversal({
      ...config,
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
    } as AnthropicOptions);
  }

  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return getAIUniversal({
      ...config,
      type: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    } as GeminiOptions);
  }

  if ((config as any).apiToken || process.env.HF_TOKEN) {
    // Hugging Face uses apiToken or HF_TOKEN
    return getAIUniversal({
      ...config,
      type: 'huggingface',
      apiToken: (config as any).apiToken || process.env.HF_TOKEN,
    } as HuggingFaceOptions);
  }

  if (
    ((config as any).region || process.env.AWS_DEFAULT_REGION) &&
    ((config as any).credentials || process.env.AWS_ACCESS_KEY_ID)
  ) {
    // AWS Bedrock uses region and AWS credentials (explicit or from env)
    const bedrockOptions: BedrockOptions = {
      ...config,
      type: 'bedrock',
      region: (config as any).region || process.env.AWS_DEFAULT_REGION,
    };

    // Add credentials if available in environment
    if (
      !(config as any).credentials &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY
    ) {
      bedrockOptions.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    return getAIUniversal(bedrockOptions);
  }

  throw new ValidationError(
    'Could not auto-detect AI provider from options or environment',
    {
      hint: 'Please specify a "type" field in options or provide provider-specific credentials/environment variables',
      supportedTypes: [...AI_PROVIDER_TYPES] as AIProviderType[],
      providedOptions: Object.keys(config),
      checkedEnvVars: [
        'HAVE_AI_PROVIDER',
        'HAVE_AI_TYPE',
        'HAVE_AI_API_KEY',
        'LITELLM_BASE_URL',
        'LITELLM_API_KEY',
        'OLLAMA_HOST',
        'OLLAMA_BASE_URL',
        'OLLAMA_API_KEY',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'HF_TOKEN',
        'AWS_ACCESS_KEY_ID',
        'AWS_DEFAULT_REGION',
      ],
    },
  );
}
