import { AIInterface } from '../shared/types';
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
export declare function getAIAuto(options?: Record<string, any>): Promise<AIInterface>;
//# sourceMappingURL=factory.d.ts.map