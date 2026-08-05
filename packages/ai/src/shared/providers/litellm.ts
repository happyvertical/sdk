import { ValidationError } from '@happyvertical/utils';

import {
  normalizeChatOptions,
  normalizeImageGenerationOptions,
} from '../safety';
import type {
  AICapabilities,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  LiteLLMOptions,
} from '../types';
import { LiteLLMAdmin, resolveGatewayAdminBaseUrl } from './gateway-admin';
import { type OpenAICompatibleProfile, OpenAIProvider } from './openai';

const LITELLM_CAPABILITIES: AICapabilities = {
  chat: true,
  completion: true,
  embeddings: true,
  streaming: true,
  functions: true,
  vision: true,
  fineTuning: false,
  imageEmbeddings: true,
  imageGeneration: true,
  videoGeneration: false,
  tts: false,
  voiceCloning: false,
  voiceDesign: false,
  maxContextLength: 128000,
  supportedOperations: [
    'chat',
    'completion',
    'embedding',
    'streaming',
    'functions',
    'vision',
    'image_embedding',
    'image_generation',
  ],
};

function isEmbeddingModel(modelId: string): boolean {
  return /embed/i.test(modelId);
}

function isImageEmbeddingModel(modelId: string): boolean {
  return /titan-embed-image|multimodalembedding|image[-_]?embed|clip/i.test(
    modelId,
  );
}

function isImageGenerationModel(modelId: string): boolean {
  return /gpt-image|dall-e|imagen|stable[-_ ]diffusion|sdxl|flux|titan-image|image-generator/i.test(
    modelId,
  );
}

function isFilteredLiteLLMModel(modelId: string): boolean {
  return /moderation|transcrib|whisper|speech|tts|rerank/i.test(modelId);
}

function inferLiteLLMContextLength(modelId: string): number {
  if (isEmbeddingModel(modelId)) return 8192;
  if (/gemini-1\.5|gemini-2\.0|gemini-2\.5|gemini-3/i.test(modelId)) {
    return 1000000;
  }
  if (/claude/i.test(modelId)) return 200000;
  if (/gpt-4o|gpt-4\.1|o1|o3|o4|llama|mistral|qwen|deepseek/i.test(modelId)) {
    return 128000;
  }
  return 32768;
}

function inferLiteLLMFunctions(modelId: string): boolean {
  if (isEmbeddingModel(modelId)) return false;
  return /gpt|claude|gemini|command|llama|mistral|qwen|deepseek|o1|o3|o4/i.test(
    modelId,
  );
}

function inferLiteLLMVision(modelId: string): boolean {
  return /gpt-4o|gpt-4\.1|vision|claude-3|gemini|pixtral|llava|qwen.*vl|vl-/i.test(
    modelId,
  );
}

function inferLiteLLMCapabilities(modelId: string): string[] {
  if (isImageGenerationModel(modelId)) {
    return ['image_generation'];
  }

  if (isImageEmbeddingModel(modelId)) {
    return ['embeddings', 'image_embedding'];
  }

  if (isEmbeddingModel(modelId)) {
    return ['embeddings'];
  }

  const capabilities = ['text', 'chat'];

  if (inferLiteLLMFunctions(modelId)) {
    capabilities.push('functions');
  }

  if (inferLiteLLMVision(modelId)) {
    capabilities.push('vision');
  }

  return capabilities;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function ensureLiteLLMOptions(options: LiteLLMOptions): LiteLLMOptions {
  if (!options.baseUrl?.trim()) {
    throw new ValidationError('LiteLLM baseUrl is required', {
      provider: 'litellm',
      hint: 'Pass baseUrl like https://llm.happyvertical.com/v1 or set HAVE_AI_BASE_URL / LITELLM_BASE_URL',
    });
  }

  return {
    ...options,
    baseUrl: normalizeBaseUrl(options.baseUrl.trim()),
  };
}

const LITELLM_PROFILE: OpenAICompatibleProfile = {
  providerLabel: 'LiteLLM',
  providerName: 'litellm',
  defaultModel: 'gpt-4',
  capabilities: LITELLM_CAPABILITIES,
  describeModel: (modelId) => `LiteLLM model: ${modelId}`,
  getContextLength: inferLiteLLMContextLength,
  getModelCapabilities: inferLiteLLMCapabilities,
  shouldIncludeModel: (modelId) => !isFilteredLiteLLMModel(modelId),
  supportsFunctions: inferLiteLLMFunctions,
  supportsVision: inferLiteLLMVision,
};

type LiteLLMResolvedCapability =
  | 'chat'
  | 'vision'
  | 'embeddings'
  | 'image_generation';

function supportsCapability(
  model: AIModel,
  capability: LiteLLMResolvedCapability,
): boolean {
  if (capability === 'vision') {
    return (
      model.capabilities.includes('vision') || model.supportsVision === true
    );
  }

  if (capability === 'embeddings') {
    return model.capabilities.includes('embeddings');
  }

  if (capability === 'image_generation') {
    return model.capabilities.includes('image_generation');
  }

  return model.capabilities.includes('chat');
}

/**
 * LiteLLM provider implementation.
 *
 * LiteLLM exposes an OpenAI-compatible API surface, so this provider reuses the
 * OpenAI transport while customizing provider identity, model discovery, and
 * capability heuristics for gateway-backed deployments.
 */
export class LiteLLMProvider extends OpenAIProvider {
  readonly admin: LiteLLMAdmin;
  private readonly configuredDefaultModel?: string;
  private readonly resolvedModelCache = new Map<
    LiteLLMResolvedCapability,
    Promise<string>
  >();

  constructor(options: LiteLLMOptions) {
    const normalized = ensureLiteLLMOptions(options);
    super(normalized, LITELLM_PROFILE);
    this.admin = new LiteLLMAdmin({
      provider: 'litellm',
      baseUrl: resolveGatewayAdminBaseUrl(
        normalized.baseUrl,
        normalized.adminUrl || normalized.adminBaseUrl,
        'litellm',
      ),
      apiKey: normalized.adminApiKey || normalized.apiKey,
      headers: normalized.adminHeaders,
      timeout: normalized.timeout,
    });
    this.configuredDefaultModel = normalized.defaultModel;
  }

  private async resolveModel(
    capability: LiteLLMResolvedCapability,
    explicitModel?: string,
  ): Promise<string> {
    if (explicitModel) {
      return explicitModel;
    }

    if (
      this.configuredDefaultModel &&
      (capability === 'chat' || capability === 'vision')
    ) {
      return this.configuredDefaultModel;
    }

    const cached = this.resolvedModelCache.get(capability);
    if (cached) {
      return cached;
    }

    const pending = this.selectModel(capability).catch((error) => {
      this.resolvedModelCache.delete(capability);
      throw error;
    });
    this.resolvedModelCache.set(capability, pending);
    return pending;
  }

  private async selectModel(
    capability: LiteLLMResolvedCapability,
  ): Promise<string> {
    const models = await super.getModels();
    const model = models.find((candidate) =>
      supportsCapability(candidate, capability),
    );

    if (!model) {
      throw new ValidationError(
        `No ${capability} model is available from the LiteLLM gateway`,
        {
          provider: 'litellm',
          capability,
          hint: 'Pass defaultModel explicitly or ensure /models returns a compatible model for this key',
        },
      );
    }

    return model.id;
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const safe = normalizeChatOptions(
      this.options,
      options,
      'litellm',
      options.model || this.options.defaultModel,
    );
    return super.chat(messages, {
      ...safe,
      model: await this.resolveModel('chat', safe.model),
    });
  }

  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    const safe = normalizeChatOptions(
      this.options,
      options,
      'litellm',
      options.model || this.options.defaultModel,
    );
    yield* super.stream(messages, {
      ...safe,
      model: await this.resolveModel('chat', safe.model),
    });
  }

  async describeImage(
    image: string | Buffer,
    prompt?: string,
    options: ImageDescriptionOptions = {},
  ): Promise<string> {
    const safe = normalizeChatOptions(
      this.options,
      options,
      'litellm',
      options.model || this.options.defaultModel,
    );
    return super.describeImage(image, prompt, {
      ...safe,
      model: await this.resolveModel('vision', safe.model),
    });
  }

  async embed(
    text: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    return super.embed(text, {
      ...options,
      model: await this.resolveModel('embeddings', options.model),
    });
  }

  async embedImage(
    image: string | Buffer,
    options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    return super.embedImage(image, {
      ...options,
      model: await this.resolveModel('embeddings', options.model),
    });
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    const safe = normalizeImageGenerationOptions(
      this.options,
      options,
      'litellm',
      options.model,
    );
    return super.generateImage(prompt, {
      ...safe,
      model: await this.resolveModel('image_generation', safe.model),
    });
  }
}
