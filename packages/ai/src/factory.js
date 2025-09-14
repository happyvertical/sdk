/**
 * Factory functions for creating AI provider instances
 */
import { ValidationError } from '@have/utils';
/**
 * Type guards for provider options
 */
function isOpenAIOptions(options) {
    return !options.type || options.type === 'openai';
}
function isGeminiOptions(options) {
    return options.type === 'gemini';
}
function isAnthropicOptions(options) {
    return options.type === 'anthropic';
}
function isHuggingFaceOptions(options) {
    return options.type === 'huggingface';
}
function isBedrockOptions(options) {
    return options.type === 'bedrock';
}
/**
 * Creates an AI provider instance based on the provided options
 *
 * @param options - Configuration options for the AI provider
 * @returns Promise resolving to an AI provider instance
 * @throws ValidationError if the provider type is unsupported
 */
export async function getAI(options) {
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
    throw new ValidationError('Unsupported AI provider type', {
        supportedTypes: ['openai', 'gemini', 'anthropic', 'huggingface', 'bedrock'],
        providedType: options.type,
    });
}
/**
 * Auto-detects AI provider based on available credentials in options
 *
 * @param options - Configuration options that may contain provider-specific credentials
 * @returns Promise resolving to an AI provider instance
 * @throws ValidationError if no provider can be detected from the options
 */
export async function getAIAuto(options) {
    // Auto-detect provider based on available credentials
    if (options.apiKey && !options.type) {
        // Default to OpenAI if apiKey is provided without explicit type
        return getAI({ ...options, type: 'openai' });
    }
    if (options.apiToken) {
        // Hugging Face uses apiToken
        return getAI({ ...options, type: 'huggingface' });
    }
    if (options.region && (options.credentials || process.env.AWS_ACCESS_KEY_ID)) {
        // AWS Bedrock uses region and AWS credentials
        return getAI({ ...options, type: 'bedrock' });
    }
    if (options.projectId || options.anthropicVersion) {
        // Try to detect based on provider-specific options
        if (options.anthropicVersion) {
            return getAI({ ...options, type: 'anthropic' });
        }
        if (options.projectId) {
            return getAI({ ...options, type: 'gemini' });
        }
    }
    throw new ValidationError('Could not auto-detect AI provider from options', {
        hint: 'Please specify a "type" field in options or provide provider-specific credentials',
        supportedTypes: ['openai', 'gemini', 'anthropic', 'huggingface', 'bedrock'],
        providedOptions: Object.keys(options),
    });
}
