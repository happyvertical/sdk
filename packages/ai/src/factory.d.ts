/**
 * Factory functions for creating AI provider instances
 */
import type { AIInterface, GetAIOptions } from './types.js';
/**
 * Creates an AI provider instance based on the provided options
 *
 * @param options - Configuration options for the AI provider
 * @returns Promise resolving to an AI provider instance
 * @throws ValidationError if the provider type is unsupported
 */
export declare function getAI(options: GetAIOptions): Promise<AIInterface>;
/**
 * Auto-detects AI provider based on available credentials in options
 *
 * @param options - Configuration options that may contain provider-specific credentials
 * @returns Promise resolving to an AI provider instance
 * @throws ValidationError if no provider can be detected from the options
 */
export declare function getAIAuto(options: Record<string, any>): Promise<AIInterface>;
//# sourceMappingURL=factory.d.ts.map