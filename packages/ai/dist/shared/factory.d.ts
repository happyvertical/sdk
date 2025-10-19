import { AIInterface, GetAIOptions } from './types';
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
export declare function getAI(options?: GetAIOptions): Promise<AIInterface>;
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
export declare function getAIAuto(options: Record<string, any>): Promise<AIInterface>;
//# sourceMappingURL=factory.d.ts.map