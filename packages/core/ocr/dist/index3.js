class OCRError extends Error {
  constructor(message, provider, context) {
    super(message);
    this.provider = provider;
    this.context = context;
    this.name = "OCRError";
  }
}
class OCRDependencyError extends OCRError {
  constructor(provider, message, context) {
    super(
      `OCR dependency error for ${provider}: ${message}`,
      provider,
      context
    );
    this.name = "OCRDependencyError";
  }
}
class OCRUnsupportedError extends OCRError {
  constructor(provider, operation, context) {
    super(
      `OCR operation '${operation}' not supported by ${provider}`,
      provider,
      context
    );
    this.name = "OCRUnsupportedError";
  }
}
class OCRProcessingError extends OCRError {
  constructor(provider, message, context) {
    super(
      `OCR processing error for ${provider}: ${message}`,
      provider,
      context
    );
    this.name = "OCRProcessingError";
  }
}
export {
  OCRDependencyError,
  OCRError,
  OCRProcessingError,
  OCRUnsupportedError
};
//# sourceMappingURL=index3.js.map
