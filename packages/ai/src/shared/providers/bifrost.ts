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
  BifrostOptions,
  ChatOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
} from '../types';
import {
  BifrostAdmin,
  normalizeGatewayBaseUrl,
  resolveGatewayAdminBaseUrl,
} from './gateway-admin';
import { type OpenAICompatibleProfile, OpenAIProvider } from './openai';

const BIFROST_CAPABILITIES: AICapabilities = {
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

function isFilteredBifrostModel(modelId: string): boolean {
  return /moderation|transcrib|whisper|speech|tts|rerank/i.test(modelId);
}

function inferBifrostContextLength(modelId: string): number {
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

function inferBifrostFunctions(modelId: string): boolean {
  if (isEmbeddingModel(modelId)) return false;
  return /gpt|claude|gemini|command|llama|mistral|qwen|deepseek|o1|o3|o4/i.test(
    modelId,
  );
}

function inferBifrostVision(modelId: string): boolean {
  return /gpt-4o|gpt-4\.1|vision|claude-3|gemini|pixtral|llava|qwen.*vl|vl-/i.test(
    modelId,
  );
}

function inferBifrostCapabilities(modelId: string): string[] {
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

  if (inferBifrostFunctions(modelId)) {
    capabilities.push('functions');
  }

  if (inferBifrostVision(modelId)) {
    capabilities.push('vision');
  }

  return capabilities;
}

function ensureBifrostOptions(options: BifrostOptions): BifrostOptions {
  if (!options.baseUrl?.trim()) {
    throw new ValidationError('Bifrost baseUrl is required', {
      provider: 'bifrost',
      hint: 'Pass baseUrl like http://localhost:8080, http://localhost:8080/openai, or http://localhost:8080/v1 and optionally adminBaseUrl for governance endpoints',
    });
  }

  const baseUrl = normalizeGatewayBaseUrl(options.baseUrl);
  const inferenceBaseUrl = /\/(?:openai|v1|pydanticai\/v1)$/.test(baseUrl)
    ? baseUrl
    : `${baseUrl}/openai`;
  const headers = options.apiKey
    ? {
        ...options.headers,
        'x-bf-vk': options.apiKey,
        'x-api-key': options.apiKey,
      }
    : options.headers;

  return {
    ...options,
    baseUrl: inferenceBaseUrl,
    headers,
  };
}

const BIFROST_PROFILE: OpenAICompatibleProfile = {
  providerLabel: 'Bifrost',
  providerName: 'bifrost',
  defaultModel: 'openai/gpt-4o-mini',
  capabilities: BIFROST_CAPABILITIES,
  describeModel: (modelId) => `Bifrost model: ${modelId}`,
  getContextLength: inferBifrostContextLength,
  getModelCapabilities: inferBifrostCapabilities,
  shouldIncludeModel: (modelId) => !isFilteredBifrostModel(modelId),
  supportsFunctions: inferBifrostFunctions,
  supportsVision: inferBifrostVision,
};

type BifrostResolvedCapability =
  | 'chat'
  | 'vision'
  | 'embeddings'
  | 'image_generation';

function supportsCapability(
  model: AIModel,
  capability: BifrostResolvedCapability,
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
 * Bifrost provider implementation.
 *
 * Bifrost exposes OpenAI-compatible inference and governance admin APIs. This
 * provider reuses the OpenAI-compatible transport for inference and exposes
 * `admin` for tenant project and virtual-key provisioning.
 */
export class BifrostProvider extends OpenAIProvider {
  readonly admin: BifrostAdmin;
  private readonly configuredDefaultModel?: string;
  private readonly resolvedModelCache = new Map<
    BifrostResolvedCapability,
    Promise<string>
  >();

  constructor(options: BifrostOptions) {
    const normalized = ensureBifrostOptions(options);
    super(normalized, BIFROST_PROFILE);
    const adminKey = normalized.adminApiKey || normalized.apiKey;
    const adminUsername = normalized.adminUser || normalized.adminUsername;
    this.admin = new BifrostAdmin({
      provider: 'bifrost',
      baseUrl: resolveGatewayAdminBaseUrl(
        normalized.baseUrl,
        normalized.adminUrl || normalized.adminBaseUrl,
        'bifrost',
      ),
      apiKey: adminKey,
      username: adminUsername,
      password: normalized.adminPassword,
      headers:
        adminKey && !(adminUsername && normalized.adminPassword)
          ? {
              ...normalized.adminHeaders,
              'x-bf-vk': adminKey,
              'x-api-key': adminKey,
            }
          : normalized.adminHeaders,
      timeout: normalized.timeout,
    });
    this.configuredDefaultModel = normalized.defaultModel;
  }

  private async resolveModel(
    capability: BifrostResolvedCapability,
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
    capability: BifrostResolvedCapability,
  ): Promise<string> {
    const models = await super.getModels();
    const model = models.find((candidate) =>
      supportsCapability(candidate, capability),
    );

    if (!model) {
      throw new ValidationError(
        `No ${capability} model is available from the Bifrost gateway`,
        {
          provider: 'bifrost',
          capability,
          hint: 'Pass defaultModel explicitly or ensure the gateway returns a compatible model for this key',
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
      'bifrost',
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
      'bifrost',
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
      'bifrost',
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
      'bifrost',
      options.model,
    );
    return super.generateImage(prompt, {
      ...safe,
      model: await this.resolveModel('image_generation', safe.model),
    });
  }
}
