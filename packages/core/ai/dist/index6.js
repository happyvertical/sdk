class AIError extends Error {
  constructor(message, code, provider, model) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.model = model;
    this.name = "AIError";
  }
}
class AuthenticationError extends AIError {
  constructor(provider) {
    super("Authentication failed", "AUTH_ERROR", provider);
    this.name = "AuthenticationError";
  }
}
class RateLimitError extends AIError {
  constructor(provider, retryAfter) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ""}`,
      "RATE_LIMIT",
      provider
    );
    this.name = "RateLimitError";
  }
}
class ModelNotFoundError extends AIError {
  constructor(model, provider) {
    super(`Model not found: ${model}`, "MODEL_NOT_FOUND", provider, model);
    this.name = "ModelNotFoundError";
  }
}
class ContextLengthError extends AIError {
  constructor(provider, model) {
    super(
      "Input exceeds maximum context length",
      "CONTEXT_LENGTH_EXCEEDED",
      provider,
      model
    );
    this.name = "ContextLengthError";
  }
}
class ContentFilterError extends AIError {
  constructor(provider, model) {
    super(
      "Content filtered by safety systems",
      "CONTENT_FILTERED",
      provider,
      model
    );
    this.name = "ContentFilterError";
  }
}
export {
  AIError,
  AuthenticationError,
  ContentFilterError,
  ContextLengthError,
  ModelNotFoundError,
  RateLimitError
};
//# sourceMappingURL=index6.js.map
