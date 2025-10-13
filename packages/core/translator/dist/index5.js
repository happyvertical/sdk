class TranslationError extends Error {
  constructor(message, code, provider) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.name = "TranslationError";
  }
}
class UnsupportedLanguageError extends TranslationError {
  constructor(language, provider) {
    super(
      `Unsupported language: ${language}`,
      "UNSUPPORTED_LANGUAGE",
      provider
    );
    this.name = "UnsupportedLanguageError";
  }
}
class QuotaExceededError extends TranslationError {
  constructor(provider) {
    super("Translation quota exceeded", "QUOTA_EXCEEDED", provider);
    this.name = "QuotaExceededError";
  }
}
class AuthenticationError extends TranslationError {
  constructor(provider) {
    super("Authentication failed", "AUTH_ERROR", provider);
    this.name = "AuthenticationError";
  }
}
class InvalidTextError extends TranslationError {
  constructor(reason, provider) {
    super(`Invalid text: ${reason}`, "INVALID_TEXT", provider);
    this.name = "InvalidTextError";
  }
}
export {
  AuthenticationError,
  InvalidTextError,
  QuotaExceededError,
  TranslationError,
  UnsupportedLanguageError
};
//# sourceMappingURL=index5.js.map
