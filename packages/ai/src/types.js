/**
 * Core types and interfaces for the AI library
 */
/**
 * Error types for AI operations
 */
export class AIError extends Error {
    code;
    provider;
    model;
    constructor(message, code, provider, model) {
        super(message);
        this.code = code;
        this.provider = provider;
        this.model = model;
        this.name = 'AIError';
    }
}
export class AuthenticationError extends AIError {
    constructor(provider) {
        super('Authentication failed', 'AUTH_ERROR', provider);
        this.name = 'AuthenticationError';
    }
}
export class RateLimitError extends AIError {
    constructor(provider, retryAfter) {
        super(`Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`, 'RATE_LIMIT', provider);
        this.name = 'RateLimitError';
    }
}
export class ModelNotFoundError extends AIError {
    constructor(model, provider) {
        super(`Model not found: ${model}`, 'MODEL_NOT_FOUND', provider, model);
        this.name = 'ModelNotFoundError';
    }
}
export class ContextLengthError extends AIError {
    constructor(provider, model) {
        super('Input exceeds maximum context length', 'CONTEXT_LENGTH_EXCEEDED', provider, model);
        this.name = 'ContextLengthError';
    }
}
export class ContentFilterError extends AIError {
    constructor(provider, model) {
        super('Content filtered by safety systems', 'CONTENT_FILTERED', provider, model);
        this.name = 'ContentFilterError';
    }
}
