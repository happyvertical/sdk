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
  BifrostOptions,
  ByteplusModelArkOptions,
  GeminiOptions,
  GetAIOptions,
  HuggingFaceOptions,
  LiteLLMOptions,
  OllamaOptions,
  OpenAICompatVideoOptions,
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
 * - LITELLM_BASE_URL / LITELLM_API_KEY / LITELLM_ADMIN_API_KEY → LiteLLM-specific gateway config
 * - BIFROST_BASE_URL / BIFROST_API_KEY / BIFROST_ADMIN_URL / BIFROST_ADMIN_USER / BIFROST_ADMIN_PASSWORD → Bifrost gateway config
 * - OLLAMA_HOST / OLLAMA_BASE_URL / OLLAMA_API_KEY → Ollama host/auth config
 * - OPENAI_API_KEY → OpenAI-specific key
 * - ANTHROPIC_API_KEY → Anthropic-specific key
 * - GEMINI_API_KEY / GOOGLE_API_KEY → Gemini-specific key
 * - HF_TOKEN → Hugging Face token
 * - AWS_* → AWS Bedrock credentials
 * - OPENAI_COMPAT_VIDEO_BASE_URL / OPENAI_COMPAT_VIDEO_API_KEY → openai-compat-video gateway config (checked last)
 * - MODELARK_API_KEY / ARK_API_KEY / MODELARK_BASE_URL → BytePlus ModelArk (Seedance) config (checked last)
 *
 * The two video-only provider types above are intentionally checked *after*
 * every general-purpose provider: they throw `NOT_IMPLEMENTED` for chat()
 * and everything else, so their env signals must never hijack a bare
 * `getAIAuto()` call away from a general-purpose provider. Prefer explicit
 * `type: 'byteplus-modelark'` / `type: 'openai-compat-video'` when you want
 * one of these on purpose.
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
      adminApiKey: 'string',
      adminBaseUrl: 'string',
      adminUrl: 'string',
      adminUser: 'string',
      adminUsername: 'string',
      adminPassword: 'string',
    },
  }) as GetAIOptions;

  // Normalize 'provider' field to 'type'
  if ('provider' in config && !config.type) {
    (config as any).type = (config as any).provider;
  }

  const adminConfig = config as {
    adminApiKey?: string;
    adminBaseUrl?: string;
    adminUrl?: string;
    adminUser?: string;
    adminUsername?: string;
    adminPassword?: string;
  };

  // Caller options always win over env: collapse alias pairs (adminUrl/adminBaseUrl
  // and adminUser/adminUsername) on the caller side first, so that an env override
  // for one alias cannot mask an explicit caller value supplied via the other.
  const callerAdminUrl = adminConfig.adminUrl || adminConfig.adminBaseUrl;
  const callerAdminUser = adminConfig.adminUser || adminConfig.adminUsername;

  // If type is specified (either from options or env vars), use getAI directly
  if (config.type) {
    if (config.type === 'byteplus-modelark') {
      return getAIUniversal({
        ...config,
        apiKey:
          config.apiKey ||
          process.env.MODELARK_API_KEY ||
          process.env.ARK_API_KEY,
        baseUrl: config.baseUrl || process.env.MODELARK_BASE_URL,
      } as ByteplusModelArkOptions);
    }

    if (config.type === 'openai-compat-video') {
      return getAIUniversal({
        ...config,
        apiKey: config.apiKey || process.env.OPENAI_COMPAT_VIDEO_API_KEY,
        baseUrl: config.baseUrl || process.env.OPENAI_COMPAT_VIDEO_BASE_URL,
      } as OpenAICompatVideoOptions);
    }

    if (config.type === 'bifrost') {
      const resolvedAdminUrl =
        callerAdminUrl ||
        process.env.BIFROST_ADMIN_URL ||
        process.env.BIFROST_ADMIN_BASE_URL;
      const resolvedAdminUser =
        callerAdminUser ||
        process.env.BIFROST_ADMIN_USER ||
        process.env.BIFROST_ADMIN_USERNAME;

      return getAIUniversal({
        ...config,
        baseUrl: config.baseUrl || process.env.BIFROST_BASE_URL,
        apiKey: config.apiKey || process.env.BIFROST_API_KEY,
        adminApiKey:
          adminConfig.adminApiKey || process.env.BIFROST_ADMIN_API_KEY,
        adminBaseUrl: resolvedAdminUrl,
        adminUrl: resolvedAdminUrl,
        adminUser: resolvedAdminUser,
        adminUsername: resolvedAdminUser,
        adminPassword:
          adminConfig.adminPassword || process.env.BIFROST_ADMIN_PASSWORD,
      } as BifrostOptions);
    }

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
  const hasLiteLLMSignal = Boolean(
    process.env.LITELLM_BASE_URL || process.env.LITELLM_API_KEY,
  );
  const hasBifrostSignal = Boolean(process.env.BIFROST_BASE_URL);

  if (hasBifrostSignal && !config.type) {
    return getAIUniversal({
      ...config,
      type: 'bifrost',
      baseUrl: config.baseUrl || process.env.BIFROST_BASE_URL,
      apiKey: config.apiKey || process.env.BIFROST_API_KEY,
      adminApiKey: adminConfig.adminApiKey || process.env.BIFROST_ADMIN_API_KEY,
      adminBaseUrl:
        adminConfig.adminBaseUrl || process.env.BIFROST_ADMIN_BASE_URL,
      adminUrl: adminConfig.adminUrl || process.env.BIFROST_ADMIN_URL,
      adminUser:
        adminConfig.adminUser ||
        adminConfig.adminUsername ||
        process.env.BIFROST_ADMIN_USER ||
        process.env.BIFROST_ADMIN_USERNAME,
      adminPassword:
        adminConfig.adminPassword || process.env.BIFROST_ADMIN_PASSWORD,
    } as BifrostOptions);
  }

  if (hasLiteLLMSignal && !config.type) {
    return getAIUniversal({
      ...config,
      type: 'litellm',
      baseUrl: config.baseUrl || process.env.LITELLM_BASE_URL,
      apiKey: config.apiKey || process.env.LITELLM_API_KEY,
      adminApiKey: adminConfig.adminApiKey || process.env.LITELLM_ADMIN_API_KEY,
      adminBaseUrl:
        adminConfig.adminBaseUrl || process.env.LITELLM_ADMIN_BASE_URL,
      adminUrl: adminConfig.adminUrl || process.env.LITELLM_ADMIN_URL,
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

  // Video-only provider detection runs last, deliberately after every
  // general-purpose provider check above: these providers throw
  // NOT_IMPLEMENTED for chat() and every other non-video method, so a bare
  // getAIAuto() must never let a video-only credential (e.g. MODELARK_API_KEY
  // set alongside OPENAI_API_KEY for an unrelated pipeline step) hijack
  // selection away from a general-purpose provider. Explicit
  // `type: 'byteplus-modelark'` / `type: 'openai-compat-video'` selection is
  // the intended way to reach these providers; auto-detection is a
  // last-resort fallback for when nothing general-purpose matches.
  const hasModelArkSignal = Boolean(
    process.env.MODELARK_API_KEY ||
      process.env.ARK_API_KEY ||
      process.env.MODELARK_BASE_URL,
  );
  const hasOpenAICompatVideoSignal = Boolean(
    process.env.OPENAI_COMPAT_VIDEO_BASE_URL,
  );

  if (hasModelArkSignal && !config.type) {
    return getAIUniversal({
      ...config,
      type: 'byteplus-modelark',
      apiKey:
        config.apiKey ||
        process.env.MODELARK_API_KEY ||
        process.env.ARK_API_KEY,
      baseUrl: config.baseUrl || process.env.MODELARK_BASE_URL,
    } as ByteplusModelArkOptions);
  }

  if (hasOpenAICompatVideoSignal && !config.type) {
    return getAIUniversal({
      ...config,
      type: 'openai-compat-video',
      apiKey: config.apiKey || process.env.OPENAI_COMPAT_VIDEO_API_KEY,
      baseUrl: config.baseUrl || process.env.OPENAI_COMPAT_VIDEO_BASE_URL,
    } as OpenAICompatVideoOptions);
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
        'OPENAI_COMPAT_VIDEO_BASE_URL',
        'OPENAI_COMPAT_VIDEO_API_KEY',
        'MODELARK_API_KEY',
        'ARK_API_KEY',
        'MODELARK_BASE_URL',
      ],
    },
  );
}
