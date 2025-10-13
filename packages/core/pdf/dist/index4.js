class PDFError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "PDFError";
  }
}
class PDFUnsupportedError extends PDFError {
  constructor(operation) {
    super(`Operation '${operation}' is not supported by this PDF reader`);
    this.code = "ENOTSUP";
    this.name = "PDFUnsupportedError";
  }
}
class PDFDependencyError extends PDFError {
  constructor(dependency, details) {
    super(
      `PDF dependency '${dependency}' is not available${details ? `: ${details}` : ""}`
    );
    this.code = "EDEP";
    this.name = "PDFDependencyError";
  }
}
export {
  PDFDependencyError,
  PDFError,
  PDFUnsupportedError
};
//# sourceMappingURL=index4.js.map
