var ErrorCode = /* @__PURE__ */ ((ErrorCode2) => {
  ErrorCode2["VALIDATION_ERROR"] = "VALIDATION_ERROR";
  ErrorCode2["API_ERROR"] = "API_ERROR";
  ErrorCode2["FILE_ERROR"] = "FILE_ERROR";
  ErrorCode2["NETWORK_ERROR"] = "NETWORK_ERROR";
  ErrorCode2["DATABASE_ERROR"] = "DATABASE_ERROR";
  ErrorCode2["PARSING_ERROR"] = "PARSING_ERROR";
  ErrorCode2["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
  ErrorCode2["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
  return ErrorCode2;
})(ErrorCode || {});
class BaseError extends Error {
  /** Error classification code */
  code;
  /** Additional context data for debugging */
  context;
  /** When the error occurred */
  timestamp;
  constructor(message, code = "UNKNOWN_ERROR", context) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    this.timestamp = /* @__PURE__ */ new Date();
    Error.captureStackTrace?.(this, this.constructor);
  }
  /**
   * Serializes the error to a JSON-compatible object
   * @returns Object containing all error properties
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }
}
class ValidationError extends BaseError {
  constructor(message, context) {
    super(message, "VALIDATION_ERROR", context);
  }
}
class ApiError extends BaseError {
  constructor(message, context) {
    super(message, "API_ERROR", context);
  }
}
class FileError extends BaseError {
  constructor(message, context) {
    super(message, "FILE_ERROR", context);
  }
}
class NetworkError extends BaseError {
  constructor(message, context) {
    super(message, "NETWORK_ERROR", context);
  }
}
class DatabaseError extends BaseError {
  constructor(message, context) {
    super(message, "DATABASE_ERROR", context);
  }
}
class ParsingError extends BaseError {
  constructor(message, context) {
    super(message, "PARSING_ERROR", context);
  }
}
class TimeoutError extends BaseError {
  constructor(message, context) {
    super(message, "TIMEOUT_ERROR", context);
  }
}
export {
  ApiError,
  BaseError,
  DatabaseError,
  ErrorCode,
  FileError,
  NetworkError,
  ParsingError,
  TimeoutError,
  ValidationError
};
//# sourceMappingURL=index6.js.map
