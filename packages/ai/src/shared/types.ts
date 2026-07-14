/**
 * Core types and interfaces for the AI library
 */

/**
 * Thinking level options for Gemini 3 models
 * Controls the amount of internal reasoning the model performs
 */
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Cost and output limits applied to every generative request.
 *
 * Provider instances merge partial overrides with the exported safe defaults.
 */
export interface AIGenerationLimits {
  /** Maximum text tokens a single request may generate. */
  maxOutputTokens: number;

  /** Maximum reasoning/thinking tokens a single request may generate. */
  maxReasoningTokens: number;

  /** Maximum images a single image-generation request may produce. */
  maxImagesPerRequest: number;

  /** Behavior when a request exceeds one of the configured limits. */
  onExceeded: 'error' | 'clamp';
}

/** Provider-neutral reasoning controls for a single generation request. */
export interface AIReasoningOptions {
  effort?: 'none' | GeminiThinkingLevel;
  maxTokens?: number;
  includeThoughts?: boolean;
}

/** Request-scoped cancellation, timeout, and reasoning controls. */
export interface AIRequestControls {
  /** Caller cancellation signal. Provider timeouts are composed with this signal. */
  signal?: AbortSignal;

  /** Request timeout in milliseconds. Overrides the provider default. */
  timeout?: number;

  /** Provider-neutral reasoning controls. */
  reasoning?: AIReasoningOptions;

  /** Sanitized dimensions attached to lifecycle and usage events. */
  usageTags?: Record<string, string>;
}

/** Operations reported through {@link AIRequestEvent}. */
export type AIRequestOperation =
  | 'chat'
  | 'complete'
  | 'message'
  | 'embed'
  | 'embedImage'
  | 'describeImage'
  | 'generateImage'
  | 'stream';

/** Terminal lifecycle state for a provider request. */
export type AIRequestStatus =
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'aborted'
  | 'rejected';

/**
 * Prompt-free request lifecycle event.
 *
 * This intentionally excludes request and response content and credentials.
 */
export interface AIRequestEvent {
  provider: string;
  model: string;
  operation: AIRequestOperation;
  status: AIRequestStatus;
  attempts: number;
  requestedMaxOutputTokens?: number;
  effectiveMaxOutputTokens?: number;
  duration: number;
  errorCode?: string;
  tags?: Record<string, string>;
}

/**
 * Supported AI provider types
 */
export const AI_PROVIDER_TYPES = [
  'openai',
  'litellm',
  'bifrost',
  'ollama',
  'gemini',
  'anthropic',
  'huggingface',
  'bedrock',
  'claude-cli',
  'qwen3-tts',
] as const;

/**
 * Supported AI provider type union
 */
export type AIProviderType = (typeof AI_PROVIDER_TYPES)[number];

/**
 * Text content part for multimodal messages
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/**
 * Image content part for vision-capable models
 */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    /** Image URL (http/https) or base64 data URL */
    url: string;
    /** Image detail level for processing */
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Union type for all content parts in multimodal messages
 */
export type ContentPart = TextContentPart | ImageContentPart;

/**
 * Extract text content from a message content field.
 *
 * Handles both simple string content and multimodal content arrays,
 * extracting only the text parts and concatenating them.
 *
 * @param content - The message content (string or ContentPart array)
 * @returns The extracted text content
 */
export function extractTextContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }
  // Extract text from content parts
  return content
    .filter((part): part is TextContentPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * AI message structure for chat interactions
 *
 * Supports both simple string content and multimodal content arrays
 * for vision-capable models.
 *
 * @example Simple text message
 * ```typescript
 * const message: AIMessage = {
 *   role: 'user',
 *   content: 'Hello, how are you?'
 * };
 * ```
 *
 * @example Multimodal message with image
 * ```typescript
 * const message: AIMessage = {
 *   role: 'user',
 *   content: [
 *     { type: 'text', text: 'What is in this image?' },
 *     { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 *   ]
 * };
 * ```
 */
export interface AIMessage {
  /**
   * Role of the message sender
   */
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';

  /**
   * Content of the message.
   *
   * Can be a simple string for text-only messages, or an array of content parts
   * for multimodal messages (e.g., text + images for vision models).
   */
  content: string | ContentPart[];

  /**
   * Optional name for the message sender
   */
  name?: string;

  /**
   * Optional tool calls
   */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * Options for chat completion requests
 */
export interface ChatOptions extends AIRequestControls {
  /**
   * Model to use for completion
   */
  model?: string;

  /**
   * Maximum number of tokens to generate
   */
  maxTokens?: number;

  /**
   * Sampling temperature (0-2)
   */
  temperature?: number;

  /**
   * Top-p sampling parameter
   */
  topP?: number;

  /**
   * Number of completions to generate
   */
  n?: number;

  /**
   * Sequences that stop generation
   */
  stop?: string | string[];

  /**
   * Whether to stream the response
   */
  stream?: boolean;

  /**
   * Penalty for frequency of tokens
   */
  frequencyPenalty?: number;

  /**
   * Penalty for presence of tokens
   */
  presencePenalty?: number;

  /**
   * User identifier for monitoring
   */
  user?: string;

  /**
   * Available tools/functions
   */
  tools?: AITool[];

  /**
   * Tool choice behavior
   */
  toolChoice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };

  /**
   * Response format specification
   */
  responseFormat?: { type: 'text' | 'json_object' };

  /**
   * Random seed for deterministic results
   */
  seed?: number;

  /**
   * Callback for streaming responses
   */
  onProgress?: (chunk: string) => void;

  /**
   * Thinking level for providers that expose reasoning controls.
   * Gemini 3 models use named levels:
   * - 'minimal': No thinking for most queries (Gemini 3 Flash only)
   * - 'low': Minimizes latency and cost, good for simple tasks
   * - 'medium': Balanced thinking for most tasks (Gemini 3 Flash only)
   * - 'high': Maximizes reasoning depth (default for Gemini 3)
   *
   * Ollama also accepts `false` to explicitly disable visible/internal thinking
   * for models that support it.
   * @deprecated Use `reasoning.effort` and `reasoning.maxTokens` instead.
   */
  thinkingLevel?: GeminiThinkingLevel | false;

  /**
   * Whether to include the model's internal thoughts in the response
   * Only applicable for Gemini 3 models with thinking enabled
   * @deprecated Use `reasoning.includeThoughts` instead.
   */
  includeThoughts?: boolean;

  /**
   * Custom tags to attach to the usage event for this call.
   * Merged over any global `usageTags` from provider options.
   */
  usageTags?: Record<string, string>;
}

/**
 * Options for text completion requests (non-chat models)
 */
export interface CompletionOptions extends AIRequestControls {
  /**
   * Model to use for completion
   */
  model?: string;

  /**
   * Maximum number of tokens to generate
   */
  maxTokens?: number;

  /**
   * Sampling temperature
   */
  temperature?: number;

  /**
   * Top-p sampling parameter
   */
  topP?: number;

  /**
   * Number of completions to generate
   */
  n?: number;

  /**
   * Sequences that stop generation
   */
  stop?: string | string[];

  /**
   * Whether to stream the response
   */
  stream?: boolean;

  /**
   * Callback for streaming responses
   */
  onProgress?: (chunk: string) => void;

  /**
   * Custom tags to attach to the usage event for this call.
   * Merged over any global `usageTags` from provider options.
   */
  usageTags?: Record<string, string>;
}

/**
 * Options for embedding generation
 */
export interface EmbeddingOptions {
  /**
   * Model to use for embeddings
   */
  model?: string;

  /**
   * User identifier for monitoring
   */
  user?: string;

  /**
   * Encoding format for embeddings
   */
  encodingFormat?: 'float' | 'base64';

  /**
   * Number of dimensions for the embedding
   */
  dimensions?: number;

  /**
   * Custom tags to attach to the usage event for this call.
   * Merged over any global `usageTags` from provider options.
   */
  usageTags?: Record<string, string>;
}

/**
 * Options for image embedding generation
 */
export interface ImageEmbeddingOptions {
  /**
   * Model to use for image embeddings
   * - Gemini: 'multimodalembedding@001' or similar
   * - OpenAI: Uses describe-then-embed with text-embedding-3-small
   */
  model?: string;

  /**
   * Number of dimensions for the embedding output
   */
  dimensions?: number;

  /**
   * User identifier for monitoring
   */
  user?: string;
}

/**
 * Options for image description generation
 */
export interface ImageDescriptionOptions extends AIRequestControls {
  /**
   * Model to use for image description
   * - OpenAI: defaults to 'gpt-4o'
   * - Gemini: defaults to 'gemini-2.5-flash'
   */
  model?: string;

  /**
   * Maximum tokens for the description
   */
  maxTokens?: number;

  /**
   * Detail level for image processing (OpenAI-specific)
   */
  detail?: 'auto' | 'low' | 'high';
}

/**
 * Options for image generation
 */
export interface ImageGenerationOptions extends AIRequestControls {
  /**
   * Model to use for image generation
   * - OpenAI: 'dall-e-3' (default), 'dall-e-2'
   * - Gemini: 'imagen-3.0-generate-002' (default)
   */
  model?: string;

  /**
   * Input image for image-to-image workflows
   * Can be a URL (http/https), base64 data URL, or Buffer
   */
  imageInput?: string | Buffer;

  /**
   * Aspect ratio for the generated image
   * e.g., "16:9", "1:1", "4:3", "3:4", "9:16"
   */
  aspectRatio?: string;

  /**
   * Output format for the generated image
   * - 'buffer': Returns raw image bytes (default)
   * - 'base64': Returns base64-encoded string
   * - 'url': Returns temporary URL (provider-dependent, may expire)
   */
  outputFormat?: 'buffer' | 'base64' | 'url';

  /**
   * Number of images to generate (provider-dependent)
   * - DALL-E 3: Only 1 supported
   * - Imagen 3: 1-4 supported
   */
  n?: number;

  /**
   * Image style (OpenAI DALL-E 3 specific)
   */
  style?: 'vivid' | 'natural';

  /**
   * Quality setting
   * - OpenAI: 'standard' | 'hd'
   */
  quality?: string;

  /**
   * Size specification (for providers that use fixed sizes)
   * - OpenAI DALL-E 3: '1024x1024' | '1792x1024' | '1024x1792'
   */
  size?: string;
}

/**
 * Response from image generation
 */
export interface ImageGenerationResponse {
  /**
   * Generated image(s) - format depends on outputFormat option
   */
  images: Array<{
    /**
     * Image data - Buffer for 'buffer' format, string for 'base64' or 'url'
     */
    data: Buffer | string;
    /**
     * MIME type of the image (e.g., 'image/png', 'image/jpeg')
     */
    mimeType: string;
    /**
     * Revised prompt (if provider modified the original)
     */
    revisedPrompt?: string;
  }>;

  /**
   * Model used for generation
   */
  model?: string;
}

/**
 * Options for simple message requests (convenience method)
 * This provides a simpler interface than chat() for single-turn interactions
 */
export interface MessageOptions extends AIRequestControls {
  /**
   * Model to use for completion
   */
  model?: string;

  /**
   * Role of the message sender (default: 'user')
   */
  role?: 'user' | 'assistant' | 'system';

  /**
   * Conversation history (previous messages)
   */
  history?: AIMessage[];

  /**
   * Maximum number of tokens to generate
   */
  maxTokens?: number;

  /**
   * Sampling temperature (0-2)
   */
  temperature?: number;

  /**
   * Top-p sampling parameter
   */
  topP?: number;

  /**
   * Sequences that stop generation
   */
  stop?: string | string[];

  /**
   * Whether to stream the response
   */
  stream?: boolean;

  /**
   * Penalty for frequency of tokens
   */
  frequencyPenalty?: number;

  /**
   * Penalty for presence of tokens
   */
  presencePenalty?: number;

  /**
   * Response format specification
   */
  responseFormat?: { type: 'text' | 'json_object' };

  /**
   * Random seed for deterministic results
   */
  seed?: number;

  /**
   * Available tools/functions
   */
  tools?: AITool[];

  /**
   * Tool choice behavior
   */
  toolChoice?:
    | 'auto'
    | 'none'
    | { type: 'function'; function: { name: string } };

  /**
   * Callback for streaming responses
   */
  onProgress?: (chunk: string) => void;

  /**
   * Custom tags to attach to the usage event for this call.
   * Merged over any global `usageTags` from provider options.
   */
  usageTags?: Record<string, string>;
}

/**
 * Tool/function definition for AI models
 */
export interface AITool {
  /**
   * Type of tool
   */
  type: 'function';

  /**
   * Function definition
   */
  function: {
    /**
     * Function name
     */
    name: string;

    /**
     * Function description
     */
    description?: string;

    /**
     * JSON schema for function parameters
     */
    parameters?: Record<string, any>;
  };
}

/**
 * Model information structure
 */
export interface AIModel {
  /**
   * Model identifier
   */
  id: string;

  /**
   * Human-readable model name
   */
  name: string;

  /**
   * Model description
   */
  description?: string;

  /**
   * Maximum context length in tokens
   */
  contextLength: number;

  /**
   * Supported capabilities
   */
  capabilities: string[];

  /**
   * Whether the model supports function calling
   */
  supportsFunctions: boolean;

  /**
   * Whether the model supports vision/multimodal input
   */
  supportsVision: boolean;

  /**
   * Cost per input token (if available)
   */
  inputCostPer1k?: number;

  /**
   * Cost per output token (if available)
   */
  outputCostPer1k?: number;
}

/**
 * Budget configuration for AI gateway admin operations.
 *
 * Providers translate this to their native field names:
 * - Bifrost: `budget.max_limit` / `budget.reset_duration`
 * - LiteLLM: `max_budget` / `budget_duration`
 */
export interface AIAdminBudget {
  /**
   * Maximum spend in USD.
   */
  maxLimit?: number;

  /**
   * Reset duration such as `1h`, `1d`, `30d`, or `1M`.
   */
  resetDuration?: string;

  /**
   * Bifrost only: reset at calendar boundaries for day/week/month/year periods.
   */
  calendarAligned?: boolean;
}

/**
 * Rate-limit configuration for AI gateway admin operations.
 */
export interface AIAdminRateLimit {
  /**
   * Provider-agnostic token limit.
   *
   * Bifrost maps this to `token_max_limit`; LiteLLM maps it to `tpm_limit`.
   */
  tokenMaxLimit?: number;

  /**
   * Bifrost token reset duration such as `1h`.
   */
  tokenResetDuration?: string;

  /**
   * Provider-agnostic request limit.
   *
   * Bifrost maps this to `request_max_limit`; LiteLLM maps it to `rpm_limit`.
   */
  requestMaxLimit?: number;

  /**
   * Bifrost request reset duration such as `1m`.
   */
  requestResetDuration?: string;

  /**
   * LiteLLM tokens-per-minute limit. Overrides `tokenMaxLimit` for LiteLLM.
   */
  tpmLimit?: number;

  /**
   * LiteLLM requests-per-minute limit. Overrides `requestMaxLimit` for LiteLLM.
   */
  rpmLimit?: number;
}

/**
 * Bifrost virtual-key routing configuration.
 */
export interface AIAdminProviderConfig {
  /**
   * Provider identifier such as `openai` or `anthropic`.
   */
  provider: string;

  /**
   * Routing weight for this provider.
   */
  weight?: number;

  /**
   * Models this virtual key may use for the provider.
   */
  allowedModels?: string[];

  /**
   * Bifrost provider key IDs that this virtual key may use.
   */
  keyIds?: string[];
}

/**
 * Options for creating a gateway-scoped project.
 *
 * In Bifrost, projects are implemented as governance teams, optionally attached
 * to a customer via `tenantId`. In LiteLLM, projects are implemented as teams.
 */
export interface CreateAIProjectOptions {
  /**
   * Stable project ID. LiteLLM requires one; if omitted, a slug is derived from
   * the tenant and project name. Bifrost generates its own team ID.
   */
  id?: string;

  /**
   * Human-readable project name.
   */
  name: string;

  /**
   * Tenant/customer identifier to attach the project to where supported.
   */
  tenantId?: string;

  /**
   * Human-readable description. Stored in metadata for providers that support it.
   */
  description?: string;

  /**
   * Models the project may access.
   */
  models?: string[];

  /**
   * Shared project budget.
   */
  budget?: AIAdminBudget;

  /**
   * Shared project rate limits.
   */
  rateLimit?: AIAdminRateLimit;

  /**
   * Provider-specific metadata.
   */
  metadata?: Record<string, unknown>;

  /**
   * Whether the project should be blocked on creation where supported.
   */
  isBlocked?: boolean;

  /**
   * Provider-specific request body overrides.
   */
  raw?: Record<string, unknown>;
}

/**
 * Gateway project descriptor returned by admin providers.
 */
export interface AIAdminProject {
  /**
   * Provider project ID.
   */
  id: string;

  /**
   * Human-readable project name.
   */
  name: string;

  /**
   * Tenant/customer identifier where available.
   */
  tenantId?: string;

  /**
   * Provider budget ID where available.
   */
  budgetId?: string;

  /**
   * Admin provider that created this project.
   */
  provider: string;

  /**
   * Raw provider response.
   */
  raw?: unknown;
}

/**
 * Options for creating a gateway virtual key.
 */
export interface CreateAIVirtualKeyOptions {
  /**
   * Human-readable key name or alias.
   */
  name: string;

  /**
   * Human-readable key description.
   */
  description?: string;

  /**
   * Project/team ID to attach the key to.
   */
  projectId?: string;

  /**
   * Tenant/customer ID to attach the key to when no project is supplied, or to
   * record in LiteLLM metadata.
   */
  tenantId?: string;

  /**
   * Optional end-user ID associated with the key.
   */
  userId?: string;

  /**
   * Models this key may access.
   */
  models?: string[];

  /**
   * Bifrost provider routing configuration.
   */
  providerConfigs?: AIAdminProviderConfig[];

  /**
   * Key-level budget.
   */
  budget?: AIAdminBudget;

  /**
   * Key-level rate limits.
   */
  rateLimit?: AIAdminRateLimit;

  /**
   * Key duration such as `30d`, `1h`, or `permanent` where supported.
   */
  duration?: string;

  /**
   * Provider-specific metadata.
   */
  metadata?: Record<string, unknown>;

  /**
   * Bifrost provider API key IDs this virtual key may use. Use `["*"]` to allow
   * all configured provider keys.
   */
  keyIds?: string[];

  /**
   * Whether the key should be active on creation.
   */
  isActive?: boolean;

  /**
   * LiteLLM model aliases for this key.
   */
  aliases?: Record<string, string>;

  /**
   * LiteLLM key-specific config.
   */
  config?: Record<string, unknown>;

  /**
   * LiteLLM key-specific permissions.
   */
  permissions?: Record<string, unknown>;

  /**
   * Provider-specific request body overrides.
   */
  raw?: Record<string, unknown>;
}

/**
 * Gateway virtual key descriptor returned by admin providers.
 */
export interface AIVirtualKey {
  /**
   * Provider key ID, when returned separately from the key value.
   */
  id?: string;

  /**
   * Human-readable key name or alias.
   */
  name?: string;

  /**
   * Newly generated key value. Some provider list/detail responses may only
   * expose a masked value.
   */
  key?: string;

  /**
   * Masked key value or key name, when provided.
   */
  maskedKey?: string;

  /**
   * Attached project/team ID.
   */
  projectId?: string;

  /**
   * Attached tenant/customer ID.
   */
  tenantId?: string;

  /**
   * Expiration timestamp where supported.
   */
  expiresAt?: string;

  /**
   * Admin provider that created this key.
   */
  provider: string;

  /**
   * Raw provider response.
   */
  raw?: unknown;
}

/**
 * Admin operations exposed by gateway providers that support provisioning.
 */
export interface AIAdminInterface {
  /**
   * Create a project/team for a tenant.
   */
  createProject(options: CreateAIProjectOptions): Promise<AIAdminProject>;

  /**
   * Create a virtual key, optionally attached to a project or tenant.
   */
  createVirtualKey(options: CreateAIVirtualKeyOptions): Promise<AIVirtualKey>;
}

/**
 * AI provider capabilities
 */
export interface AICapabilities {
  /**
   * Whether the provider supports chat completions
   */
  chat: boolean;

  /**
   * Whether the provider supports text completions
   */
  completion: boolean;

  /**
   * Whether the provider supports embeddings
   */
  embeddings: boolean;

  /**
   * Whether the provider supports streaming
   */
  streaming: boolean;

  /**
   * Whether the provider supports function calling
   */
  functions: boolean;

  /**
   * Whether the provider supports vision/multimodal
   */
  vision: boolean;

  /**
   * Whether the provider supports fine-tuning
   */
  fineTuning: boolean;

  /**
   * Whether the provider supports image embeddings
   */
  imageEmbeddings: boolean;

  /**
   * Whether the provider supports image generation
   */
  imageGeneration: boolean;

  /**
   * Whether the provider supports text-to-speech synthesis
   */
  tts: boolean;

  /**
   * Whether the provider supports voice cloning from samples
   */
  voiceCloning: boolean;

  /**
   * Whether the provider supports voice design via description
   */
  voiceDesign: boolean;

  /**
   * Maximum context length supported
   */
  maxContextLength: number;

  /**
   * Supported operations
   */
  supportedOperations: string[];
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /**
   * Number of prompt tokens
   */
  promptTokens: number;

  /**
   * Number of completion tokens
   */
  completionTokens: number;

  /**
   * Total tokens used
   */
  totalTokens: number;
}

/**
 * Usage event emitted via the `onUsage` callback after each API call.
 * Provides token usage, timing, and context for tracking and analytics.
 *
 * @example
 * ```typescript
 * const ai = await getAI({
 *   type: 'openai',
 *   apiKey: '...',
 *   onUsage: (event) => {
 *     console.log(`[${event.provider}/${event.model}] ${event.operation}: ${event.usage?.totalTokens} tokens in ${event.duration}ms`);
 *   },
 * });
 * ```
 */
export interface UsageEvent {
  /** Provider that handled the request (e.g. 'openai', 'anthropic', 'gemini') */
  provider: string;

  /** Model that was used (e.g. 'gpt-4o', 'claude-3-5-sonnet-20241022') */
  model: string;

  /** Operation type that generated this usage */
  operation: AIRequestOperation;

  /** Token usage breakdown, if available from the provider */
  usage?: TokenUsage;

  /** Wall-clock duration of the API call in milliseconds */
  duration: number;

  /** Timestamp when the call completed */
  timestamp: Date;

  /** Custom tags from global `usageTags` and per-call `usageTags`, merged */
  tags?: Record<string, string>;
}

/**
 * AI response structure
 */
export interface AIResponse {
  /**
   * Generated content
   */
  content: string;

  /**
   * Token usage information
   */
  usage?: TokenUsage;

  /**
   * Model used for generation
   */
  model?: string;

  /**
   * Finish reason
   */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';

  /**
   * Tool calls made by the model
   */
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * Embedding response structure
 */
export interface EmbeddingResponse {
  /**
   * Generated embeddings
   */
  embeddings: number[][];

  /**
   * Token usage information
   */
  usage?: TokenUsage;

  /**
   * Model used for embeddings
   */
  model?: string;
}

/**
 * Core AI interface that all providers must implement
 */
export interface AIInterface {
  /**
   * Optional admin surface for gateway providers that support provisioning.
   */
  admin?: AIAdminInterface;

  /**
   * Generate a chat completion from a sequence of messages.
   *
   * @param messages - Conversation messages (system, user, assistant, tool roles)
   * @param options - Chat options including model, temperature, tools, etc.
   * @returns Promise resolving to the model's response with content and usage info
   * @throws {AIError} When the request fails
   * @throws {AuthenticationError} When credentials are invalid
   * @throws {RateLimitError} When the provider's rate limit is exceeded
   */
  chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;

  /**
   * Generate a text completion from a prompt string (non-chat interface).
   *
   * @param prompt - The text prompt to complete
   * @param options - Completion options including model, temperature, etc.
   * @returns Promise resolving to the model's response
   * @throws {AIError} When the request fails
   */
  complete(prompt: string, options?: CompletionOptions): Promise<AIResponse>;

  /**
   * Simple message interface for single-turn interactions
   *
   * This is a convenience method that wraps chat() for simpler use cases.
   * It accepts a text string and optional configuration, returning just
   * the response content as a string.
   *
   * Supports conversation history via the `history` option for multi-turn
   * conversations while maintaining a simple API.
   *
   * @param text - The message text to send
   * @param options - Configuration options including history, model, etc.
   * @returns Promise resolving to the response content string
   *
   * @example
   * ```typescript
   * // Simple single-turn usage
   * const response = await ai.message('Hello, how are you?');
   *
   * // With options
   * const response = await ai.message('Analyze this data', {
   *   model: 'gpt-4o',
   *   responseFormat: { type: 'json_object' },
   *   maxTokens: 1000
   * });
   *
   * // With conversation history
   * const response = await ai.message('What did I ask before?', {
   *   history: [
   *     { role: 'user', content: 'Hello' },
   *     { role: 'assistant', content: 'Hi there!' }
   *   ]
   * });
   * ```
   */
  message(text: string, options?: MessageOptions): Promise<string>;

  /**
   * Generate vector embeddings for one or more text inputs.
   *
   * @param text - A single string or array of strings to embed
   * @param options - Embedding options including model and dimensions
   * @returns Promise resolving to embedding vectors and usage info
   * @throws {AIError} When embeddings are not supported by this provider or request fails
   */
  embed(
    text: string | string[],
    options?: EmbeddingOptions,
  ): Promise<EmbeddingResponse>;

  /**
   * Generate embeddings for an image
   *
   * Implementation varies by provider:
   * - Gemini: Uses native multimodal embeddings
   * - OpenAI: Uses describe-then-embed pattern (describeImage → embed)
   * - Others: Throws NOT_IMPLEMENTED
   *
   * @param image - Image as URL, base64 data URL, or Buffer
   * @param options - Optional configuration for image embeddings
   * @returns Promise resolving to embeddings response
   * @throws {AIError} When embeddings are not supported or request fails
   *
   * @example
   * ```typescript
   * // From URL
   * const embedding = await ai.embedImage('https://example.com/image.jpg');
   *
   * // From Buffer
   * const buffer = fs.readFileSync('image.png');
   * const embedding = await ai.embedImage(buffer);
   *
   * // With options
   * const embedding = await ai.embedImage(imageUrl, { dimensions: 768 });
   * ```
   */
  embedImage(
    image: string | Buffer,
    options?: ImageEmbeddingOptions,
  ): Promise<EmbeddingResponse>;

  /**
   * Generate a text description of an image
   *
   * @param image - Image as URL, base64 data URL, or Buffer
   * @param prompt - Custom prompt for description (optional)
   * @param options - Optional configuration
   * @returns Promise resolving to the description string
   * @throws {AIError} When vision is not supported or request fails
   *
   * @example
   * ```typescript
   * // Default description for search indexing
   * const description = await ai.describeImage('https://example.com/image.jpg');
   *
   * // Custom prompt
   * const description = await ai.describeImage(imageBuffer, 'What product is shown?');
   *
   * // With options
   * const description = await ai.describeImage(imageUrl, undefined, {
   *   model: 'gpt-4o',
   *   maxTokens: 500,
   *   detail: 'high'
   * });
   * ```
   */
  describeImage(
    image: string | Buffer,
    prompt?: string,
    options?: ImageDescriptionOptions,
  ): Promise<string>;

  /**
   * Generate an image from a text prompt
   *
   * @param prompt - Text description of the image to generate
   * @param options - Optional configuration for image generation
   * @returns Promise resolving to generated image(s)
   * @throws {AIError} When image generation is not supported or request fails
   *
   * @example
   * ```typescript
   * // Basic generation (returns Buffer by default)
   * const result = await ai.generateImage('A sunset over mountains');
   * fs.writeFileSync('image.png', result.images[0].data);
   *
   * // With options
   * const result = await ai.generateImage('A cat wearing a hat', {
   *   outputFormat: 'base64',
   *   size: '1024x1024',
   *   style: 'vivid'
   * });
   * ```
   */
  generateImage(
    prompt: string,
    options?: ImageGenerationOptions,
  ): Promise<ImageGenerationResponse>;

  /**
   * Stream a chat completion, yielding text chunks as they arrive.
   *
   * @param messages - Conversation messages
   * @param options - Chat options including model, temperature, etc.
   * @returns Async iterable of string chunks
   * @throws {AIError} When the request fails
   */
  stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>;

  /**
   * Estimate or calculate the token count for a text string.
   *
   * @param text - The text to tokenize
   * @returns Promise resolving to the token count
   */
  countTokens(text: string): Promise<number>;

  /**
   * List models available from this provider.
   *
   * @returns Promise resolving to an array of model descriptors
   */
  getModels(): Promise<AIModel[]>;

  /**
   * Query the capabilities supported by this provider (chat, embeddings, vision, TTS, etc.).
   *
   * @returns Promise resolving to a capabilities descriptor
   */
  getCapabilities(): Promise<AICapabilities>;

  // ============================================================================
  // Text-to-Speech Methods
  // ============================================================================

  /**
   * Synthesize speech from text
   *
   * @param text - The text to synthesize into speech
   * @param options - Optional configuration for TTS synthesis
   * @returns Promise resolving to audio data with metadata
   * @throws {AIError} When TTS is not supported or request fails
   *
   * @example
   * ```typescript
   * // Basic synthesis
   * const result = await ai.synthesizeSpeech('Hello, world!');
   * fs.writeFileSync('speech.wav', result.audio);
   *
   * // With options
   * const result = await ai.synthesizeSpeech('News broadcast text', {
   *   voice: 'news-anchor-1',
   *   speed: 1.1,
   *   includeWordTimings: true
   * });
   * console.log(`Duration: ${result.duration}s`);
   * ```
   */
  synthesizeSpeech(text: string, options?: TTSOptions): Promise<TTSResponse>;

  /**
   * Stream speech synthesis for real-time playback
   *
   * @param text - The text to synthesize into speech
   * @param options - Optional configuration for TTS synthesis
   * @returns AsyncIterable of audio chunks
   * @throws {AIError} When TTS streaming is not supported or request fails
   *
   * @example
   * ```typescript
   * const chunks: Buffer[] = [];
   * for await (const chunk of ai.streamSpeech('Long text...')) {
   *   chunks.push(chunk);
   *   // Or stream directly to audio output
   * }
   * ```
   */
  streamSpeech(text: string, options?: TTSOptions): AsyncIterable<Buffer>;

  /**
   * Clone a voice from an audio sample
   *
   * Creates a new voice profile from a 3+ second audio sample.
   * The cloned voice can be used in subsequent synthesizeSpeech calls.
   *
   * @param options - Voice cloning configuration including audio sample
   * @returns Promise resolving to the cloned voice profile
   * @throws {AIError} When voice cloning is not supported or request fails
   *
   * @example
   * ```typescript
   * const sample = fs.readFileSync('voice-sample.wav');
   * const voice = await ai.cloneVoice({
   *   sampleAudio: sample,
   *   name: 'News Anchor Voice',
   *   language: 'en-US'
   * });
   *
   * // Use the cloned voice
   * const speech = await ai.synthesizeSpeech('Breaking news...', {
   *   voice: voice.id
   * });
   * ```
   */
  cloneVoice(options: VoiceCloneOptions): Promise<Voice>;

  /**
   * Design a voice using natural language description
   *
   * Creates a new voice profile from a text description of the desired voice.
   * The designed voice can be used in subsequent synthesizeSpeech calls.
   *
   * @param options - Voice design configuration including description
   * @returns Promise resolving to the designed voice profile
   * @throws {AIError} When voice design is not supported or request fails
   *
   * @example
   * ```typescript
   * const voice = await ai.designVoice({
   *   description: 'warm female voice, slight British accent, professional news anchor',
   *   language: 'en-US',
   *   gender: 'female'
   * });
   *
   * // Use the designed voice
   * const speech = await ai.synthesizeSpeech('Good evening...', {
   *   voice: voice.id
   * });
   * ```
   */
  designVoice(options: VoiceDesignOptions): Promise<Voice>;

  /**
   * List available voices for TTS synthesis
   *
   * @param options - Optional filters for the voice list
   * @returns Promise resolving to array of available voices
   * @throws {AIError} When TTS is not supported or request fails
   *
   * @example
   * ```typescript
   * // List all voices
   * const voices = await ai.getVoices();
   *
   * // Filter by language
   * const englishVoices = await ai.getVoices({ language: 'en' });
   *
   * // Include cloned voices
   * const allVoices = await ai.getVoices({ includeCloned: true });
   * ```
   */
  getVoices(options?: VoiceListOptions): Promise<Voice[]>;
}

/**
 * Shared rate-limit configuration for AI providers.
 *
 * The pacing wrapper activates only when one of the pacing fields
 * (`enabled`, `key`, `cooldownMs`, `initialDelayMs`, `maxAttempts`) is set.
 *
 * `qwen3-tts` also uses `requestsPerMinute` and `maxConcurrent` from this
 * object for its local token bucket limiter.
 */
export interface AIRateLimitOptions {
  /**
   * Enable shared in-process request pacing for this client.
   */
  enabled?: boolean;

  /**
   * Shared budget key used to coordinate pacing across multiple clients.
   * If omitted, a provider-scoped key is derived from the configured credentials.
   */
  key?: string;

  /**
   * Minimum delay in milliseconds between successful calls sharing the same key.
   */
  cooldownMs?: number;

  /**
   * Fallback delay in milliseconds before retrying a rate-limited call when
   * the provider does not return a `Retry-After` hint.
   */
  initialDelayMs?: number;

  /**
   * Maximum attempts for retryable rate-limit failures, including the first call.
   */
  maxAttempts?: number;

  /**
   * Qwen3-TTS only: maximum requests per minute for its local token bucket.
   */
  requestsPerMinute?: number;

  /**
   * Qwen3-TTS only: maximum concurrent requests allowed by its local limiter.
   */
  maxConcurrent?: number;
}

/**
 * Base configuration options for all providers
 */
export interface BaseAIOptions {
  /**
   * API timeout in milliseconds
   */
  timeout?: number;

  /**
   * Maximum number of retries
   */
  maxRetries?: number;

  /**
   * Per-request generation guardrails. Partial overrides are merged with the
   * package defaults; raising a ceiling must therefore be deliberate.
   */
  generationLimits?: Partial<AIGenerationLimits>;

  /**
   * Custom headers
   */
  headers?: Record<string, string>;

  /**
   * Default model to use
   */
  defaultModel?: string;

  /**
   * Callback invoked after each API call with usage details.
   * Use this to track token consumption, costs, and performance across providers.
   *
   * Errors thrown inside this callback are silently caught and will not
   * affect the API call result.
   *
   * @param event - Usage event with provider, model, operation, tokens, and timing
   */
  onUsage?: (event: UsageEvent) => void;

  /**
   * Callback invoked once for every terminal request outcome, including local
   * limit rejection and timeout. Prompt and response content are never emitted.
   */
  onRequest?: (event: AIRequestEvent) => void;

  /**
   * Global tags to include in every usage event.
   * Per-call `usageTags` on `ChatOptions` / `EmbeddingOptions` / etc.
   * will be merged on top of these.
   */
  usageTags?: Record<string, string>;

  /**
   * Optional shared pacing / retry configuration.
   */
  rateLimit?: AIRateLimitOptions;
}

/**
 * OpenAI provider options
 */
export interface OpenAIOptions extends BaseAIOptions {
  type?: 'openai';
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
}

/**
 * LiteLLM provider options
 *
 * LiteLLM exposes an OpenAI-compatible API surface and requires a custom
 * base URL such as `https://llm.happyvertical.com/v1`.
 */
export interface LiteLLMOptions extends BaseAIOptions {
  type: 'litellm';
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  adminApiKey?: string;
  adminBaseUrl?: string;
  adminUrl?: string;
  adminHeaders?: Record<string, string>;
}

/**
 * Bifrost provider options.
 *
 * Bifrost exposes OpenAI-compatible inference through endpoints such as
 * `/openai` and `/v1`, plus governance admin endpoints at `/api/governance/*`.
 */
export interface BifrostOptions extends BaseAIOptions {
  type: 'bifrost';
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  /**
   * Optional virtual key for admin routes. Bifrost OSS admin APIs typically use
   * username/password Basic auth instead; use `adminUser` / `adminPassword`
   * when governance auth is enabled without enterprise bearer-token support.
   */
  adminApiKey?: string;
  /**
   * Admin API root. Alias: `adminUrl`.
   */
  adminBaseUrl?: string;
  /**
   * Admin API root. Kept as a friendly alias for env vars such as
   * `BIFROST_ADMIN_URL`.
   */
  adminUrl?: string;
  /**
   * Bifrost admin username for HTTP Basic auth.
   */
  adminUser?: string;
  /**
   * Bifrost admin username for HTTP Basic auth.
   */
  adminUsername?: string;
  /**
   * Bifrost admin password for HTTP Basic auth.
   */
  adminPassword?: string;
  adminHeaders?: Record<string, string>;
}

/**
 * Ollama provider options
 *
 * Ollama defaults to the local host at `http://localhost:11434` and can also
 * target remote hosts such as `https://ollama.com/api` when paired with an
 * API key.
 */
export interface OllamaOptions extends BaseAIOptions {
  type: 'ollama';
  apiKey?: string;
  baseUrl?: string;
  /**
   * Default keep-alive duration for model requests, for example `5m` or `0`.
   */
  keepAlive?: string | number;
}

/**
 * Gemini provider options
 */
export interface GeminiOptions extends BaseAIOptions {
  type: 'gemini';
  apiKey?: string;
  baseUrl?: string;
  projectId?: string;
  location?: string;
  /**
   * Thinking level for Gemini 3 models (gemini-3-flash-preview, gemini-3-pro)
   * Controls internal reasoning depth:
   * - 'minimal': No thinking for most queries (Gemini 3 Flash only)
   * - 'low': Minimizes latency and cost, good for simple tasks
   * - 'medium': Balanced thinking for most tasks (Gemini 3 Flash only)
   * - 'high': Maximizes reasoning depth (default for Gemini 3)
   *
   * Note: Only works with Gemini 3 models. Gemini 2.5 uses thinkingBudget instead.
   *
   * @deprecated Use request-level `reasoning` controls instead. This alias is
   * normalized through `generationLimits.maxReasoningTokens`.
   */
  thinkingLevel?: GeminiThinkingLevel;
}

/**
 * Anthropic provider options
 */
export interface AnthropicOptions extends BaseAIOptions {
  type: 'anthropic';
  apiKey?: string;
  baseUrl?: string;
  anthropicVersion?: string;
}

/**
 * Hugging Face provider options
 */
export interface HuggingFaceOptions extends BaseAIOptions {
  type: 'huggingface';
  apiToken?: string;
  endpoint?: string;
  model?: string;
  useCache?: boolean;
  waitForModel?: boolean;
}

/**
 * AWS Bedrock provider options
 */
export interface BedrockOptions extends BaseAIOptions {
  type: 'bedrock';
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  endpoint?: string;
}

/**
 * Claude CLI provider options
 * Uses the local Claude Code CLI instead of API keys
 */
export interface ClaudeCliOptions extends BaseAIOptions {
  type: 'claude-cli';
  /**
   * Optional custom path to claude binary
   * If not specified, will search in PATH
   */
  cliPath?: string;
}

/**
 * Qwen3-TTS provider options
 * Uses Qwen3-TTS for text-to-speech synthesis
 *
 * TTS is co-located with ComfyUI for GPU sharing efficiency.
 */
export interface Qwen3TTSOptions extends BaseAIOptions {
  type: 'qwen3-tts';

  /**
   * TTS service endpoint URL
   * e.g., 'http://localhost:8880' or 'http://qwen-tts:8000'
   */
  endpoint?: string;

  /**
   * Default model variant
   * - 'qwen3-tts-1.7b': Higher quality (4.54GB VRAM)
   * - 'qwen3-tts-0.6b': Faster, lower VRAM (2.52GB)
   */
  defaultModel?: 'qwen3-tts-1.7b' | 'qwen3-tts-0.6b';

  /**
   * Default voice ID to use for synthesis
   */
  defaultVoice?: string;

  /**
   * Default language for synthesis
   */
  defaultLanguage?: string;

  /**
   * Rate limiting configuration for the local TTS adapter.
   * Reuses `BaseAIOptions.rateLimit` and reads `requestsPerMinute` / `maxConcurrent`.
   */
  rateLimit?: AIRateLimitOptions;
}

/**
 * Union type for all provider options
 */
export type GetAIOptions =
  | OpenAIOptions
  | LiteLLMOptions
  | BifrostOptions
  | OllamaOptions
  | GeminiOptions
  | AnthropicOptions
  | HuggingFaceOptions
  | BedrockOptions
  | ClaudeCliOptions
  | Qwen3TTSOptions;

/**
 * Base error class for all AI operations.
 * Provider-specific errors are mapped to subclasses for structured error handling.
 *
 * @param message - Human-readable error description
 * @param code - Machine-readable error code (e.g., 'AUTH_ERROR', 'RATE_LIMIT')
 * @param provider - Provider that raised the error (e.g., 'openai', 'anthropic')
 * @param model - Model involved in the error, if applicable
 */
export class AIError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: string,
    public model?: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Thrown when API key or credentials are invalid or missing.
 *
 * @param provider - Provider that rejected authentication
 */
export class AuthenticationError extends AIError {
  constructor(provider?: string) {
    super('Authentication failed', 'AUTH_ERROR', provider, undefined, false);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when the provider's rate limit has been exceeded.
 *
 * @param provider - Provider that enforced the rate limit
 * @param retryAfter - Seconds to wait before retrying, if provided by the API
 */
export class RateLimitError extends AIError {
  public retryAfter?: number;

  constructor(provider?: string, retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
      'RATE_LIMIT',
      provider,
      undefined,
      true,
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when the requested model does not exist or is not available.
 *
 * @param model - The model identifier that was not found
 * @param provider - Provider that was queried
 */
export class ModelNotFoundError extends AIError {
  constructor(model: string, provider?: string) {
    super(
      `Model not found: ${model}`,
      'MODEL_NOT_FOUND',
      provider,
      model,
      false,
    );
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Thrown when the input exceeds the model's maximum context window.
 *
 * @param provider - Provider that reported the error
 * @param model - Model whose context limit was exceeded
 */
export class ContextLengthError extends AIError {
  constructor(provider?: string, model?: string) {
    super(
      'Input exceeds maximum context length',
      'CONTEXT_LENGTH_EXCEEDED',
      provider,
      model,
      false,
    );
    this.name = 'ContextLengthError';
  }
}

/**
 * Thrown when content is blocked by the provider's safety/content filters.
 *
 * @param provider - Provider that filtered the content
 * @param model - Model that triggered the filter
 */
export class ContentFilterError extends AIError {
  constructor(provider?: string, model?: string) {
    super(
      'Content filtered by safety systems',
      'CONTENT_FILTERED',
      provider,
      model,
      false,
    );
    this.name = 'ContentFilterError';
  }
}

// ============================================================================
// Text-to-Speech (TTS) Types
// ============================================================================

/**
 * Options for text-to-speech synthesis
 */
export interface TTSOptions {
  /**
   * TTS model to use (e.g., 'qwen3-tts-1.7b', 'qwen3-tts-0.6b')
   */
  model?: string;

  /**
   * Voice ID or profile reference to use for synthesis
   */
  voice?: string;

  /**
   * ISO language code (e.g., 'en-US', 'zh-CN')
   * Supported: Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian
   */
  language?: string;

  /**
   * Speech rate multiplier (0.5 - 2.0, default: 1.0)
   */
  speed?: number;

  /**
   * Pitch adjustment in semitones (-20 to 20, default: 0)
   */
  pitch?: number;

  /**
   * Output audio format
   */
  outputFormat?: 'wav' | 'mp3' | 'ogg';

  /**
   * Whether to stream the audio output
   */
  stream?: boolean;

  /**
   * Whether to include word-level timing information for lip-sync
   */
  includeWordTimings?: boolean;
}

/**
 * Options for voice cloning from audio samples
 */
export interface VoiceCloneOptions {
  /**
   * Model to use for voice cloning
   */
  model?: string;

  /**
   * Audio sample for cloning (3+ seconds recommended)
   * Can be a Buffer or base64-encoded string
   */
  sampleAudio: Buffer | string;

  /**
   * MIME type of the sample audio (e.g., 'audio/wav', 'audio/mp3')
   */
  sampleMimeType?: string;

  /**
   * Name for the cloned voice profile
   */
  name?: string;

  /**
   * Description of the voice
   */
  description?: string;

  /**
   * Language of the voice sample
   */
  language?: string;
}

/**
 * Options for voice design via natural language description
 */
export interface VoiceDesignOptions {
  /**
   * Model to use for voice design
   */
  model?: string;

  /**
   * Natural language description of the desired voice
   * e.g., "warm female voice with slight British accent, professional news anchor tone"
   */
  description: string;

  /**
   * Primary language for the voice
   */
  language?: string;

  /**
   * Target gender for the voice
   */
  gender?: 'male' | 'female' | 'neutral';
}

/**
 * Word timing information for lip-sync alignment
 */
export interface WordTiming {
  /**
   * The word or phoneme
   */
  word: string;

  /**
   * Start time in seconds
   */
  start: number;

  /**
   * End time in seconds
   */
  end: number;
}

/**
 * Response from text-to-speech synthesis
 */
export interface TTSResponse {
  /**
   * Generated audio data
   */
  audio: Buffer;

  /**
   * MIME type of the audio (e.g., 'audio/wav', 'audio/mp3')
   */
  mimeType: string;

  /**
   * Duration of the audio in seconds
   */
  duration: number;

  /**
   * Word-level timing information for lip-sync (if requested)
   */
  wordTimings?: WordTiming[];

  /**
   * Model used for generation
   */
  model?: string;

  /**
   * Sample rate in Hz (e.g., 22050, 44100)
   */
  sampleRate?: number;
}

/**
 * Voice profile information
 */
export interface Voice {
  /**
   * Unique identifier for the voice
   */
  id: string;

  /**
   * Human-readable name for the voice
   */
  name: string;

  /**
   * Primary language of the voice (ISO code)
   */
  language: string;

  /**
   * Gender of the voice
   */
  gender?: 'male' | 'female' | 'neutral';

  /**
   * Description of the voice characteristics
   */
  description?: string;

  /**
   * Whether this is a cloned voice
   */
  isCloned?: boolean;

  /**
   * Whether this was designed via natural language
   */
  isDesigned?: boolean;

  /**
   * URL to a sample of this voice (if available)
   */
  sampleUrl?: string;

  /**
   * Provider-specific voice data/embedding
   */
  voiceData?: Record<string, any>;
}

/**
 * Options for listing available voices
 */
export interface VoiceListOptions {
  /**
   * Filter by language
   */
  language?: string;

  /**
   * Filter by gender
   */
  gender?: 'male' | 'female' | 'neutral';

  /**
   * Include cloned voices
   */
  includeCloned?: boolean;

  /**
   * Include designed voices
   */
  includeDesigned?: boolean;
}
