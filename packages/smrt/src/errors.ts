/**
 * Comprehensive error handling system for SMRT framework
 *
 * Provides specialized error types for different failure scenarios
 * with proper error codes, messages, and debugging information.
 */

/**
 * Base error class for all SMRT framework errors
 */
export abstract class SmrtError extends Error {
  public readonly code: string;
  public readonly category: 'database' | 'ai' | 'filesystem' | 'validation' | 'network' | 'configuration' | 'runtime';
  public readonly details?: Record<string, any>;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    category: SmrtError['category'],
    details?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.details = details;
    this.cause = cause;

    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts error to a serializable object for logging/debugging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      details: this.details,
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } : undefined
    };
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'database', details, cause);
  }

  static connectionFailed(dbUrl: string, cause?: Error): DatabaseError {
    return new DatabaseError(
      `Failed to connect to database: ${dbUrl}`,
      'DB_CONNECTION_FAILED',
      { dbUrl },
      cause
    );
  }

  static queryFailed(query: string, cause?: Error): DatabaseError {
    return new DatabaseError(
      `Database query failed: ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`,
      'DB_QUERY_FAILED',
      { query },
      cause
    );
  }

  static schemaError(tableName: string, operation: string, cause?: Error): DatabaseError {
    return new DatabaseError(
      `Schema operation failed for table '${tableName}': ${operation}`,
      'DB_SCHEMA_ERROR',
      { tableName, operation },
      cause
    );
  }

  static constraintViolation(constraint: string, value: any, cause?: Error): DatabaseError {
    return new DatabaseError(
      `Database constraint violation: ${constraint}`,
      'DB_CONSTRAINT_VIOLATION',
      { constraint, value },
      cause
    );
  }
}

/**
 * AI integration errors
 */
export class AIError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'ai', details, cause);
  }

  static providerError(provider: string, operation: string, cause?: Error): AIError {
    return new AIError(
      `AI provider '${provider}' failed during ${operation}`,
      'AI_PROVIDER_ERROR',
      { provider, operation },
      cause
    );
  }

  static rateLimitExceeded(provider: string, retryAfter?: number): AIError {
    return new AIError(
      `AI provider '${provider}' rate limit exceeded`,
      'AI_RATE_LIMIT',
      { provider, retryAfter }
    );
  }

  static invalidResponse(provider: string, response: any): AIError {
    return new AIError(
      `AI provider '${provider}' returned invalid response`,
      'AI_INVALID_RESPONSE',
      { provider, response }
    );
  }

  static authenticationFailed(provider: string): AIError {
    return new AIError(
      `AI provider '${provider}' authentication failed`,
      'AI_AUTH_FAILED',
      { provider }
    );
  }
}

/**
 * Filesystem operation errors
 */
export class FilesystemError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'filesystem', details, cause);
  }

  static fileNotFound(path: string): FilesystemError {
    return new FilesystemError(
      `File not found: ${path}`,
      'FS_FILE_NOT_FOUND',
      { path }
    );
  }

  static permissionDenied(path: string, operation: string): FilesystemError {
    return new FilesystemError(
      `Permission denied for ${operation} on: ${path}`,
      'FS_PERMISSION_DENIED',
      { path, operation }
    );
  }

  static diskSpaceExceeded(path: string, requiredBytes: number): FilesystemError {
    return new FilesystemError(
      `Insufficient disk space for operation on: ${path}`,
      'FS_DISK_SPACE_EXCEEDED',
      { path, requiredBytes }
    );
  }
}

/**
 * Data validation errors
 */
export class ValidationError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'validation', details, cause);
  }

  static requiredField(fieldName: string, objectType: string): ValidationError {
    return new ValidationError(
      `Required field '${fieldName}' is missing for ${objectType}`,
      'VALIDATION_REQUIRED_FIELD',
      { fieldName, objectType }
    );
  }

  static invalidValue(fieldName: string, value: any, expectedType: string): ValidationError {
    return new ValidationError(
      `Invalid value for field '${fieldName}': expected ${expectedType}, got ${typeof value}`,
      'VALIDATION_INVALID_VALUE',
      { fieldName, value, expectedType }
    );
  }

  static uniqueConstraint(fieldName: string, value: any): ValidationError {
    return new ValidationError(
      `Unique constraint violation for field '${fieldName}' with value: ${value}`,
      'VALIDATION_UNIQUE_CONSTRAINT',
      { fieldName, value }
    );
  }

  static rangeError(fieldName: string, value: number, min?: number, max?: number): ValidationError {
    const range = min !== undefined && max !== undefined
      ? `between ${min} and ${max}`
      : min !== undefined
        ? `>= ${min}`
        : `<= ${max}`;

    return new ValidationError(
      `Value for field '${fieldName}' must be ${range}, got: ${value}`,
      'VALIDATION_RANGE_ERROR',
      { fieldName, value, min, max }
    );
  }
}

/**
 * Network and external service errors
 */
export class NetworkError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'network', details, cause);
  }

  static requestFailed(url: string, status?: number, cause?: Error): NetworkError {
    return new NetworkError(
      `Network request failed: ${url}${status ? ` (Status: ${status})` : ''}`,
      'NETWORK_REQUEST_FAILED',
      { url, status },
      cause
    );
  }

  static timeout(url: string, timeoutMs: number): NetworkError {
    return new NetworkError(
      `Network request timed out after ${timeoutMs}ms: ${url}`,
      'NETWORK_TIMEOUT',
      { url, timeoutMs }
    );
  }

  static serviceUnavailable(service: string): NetworkError {
    return new NetworkError(
      `External service unavailable: ${service}`,
      'NETWORK_SERVICE_UNAVAILABLE',
      { service }
    );
  }
}

/**
 * Configuration and setup errors
 */
export class ConfigurationError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'configuration', details, cause);
  }

  static missingConfiguration(configKey: string, context?: string): ConfigurationError {
    return new ConfigurationError(
      `Missing required configuration: ${configKey}${context ? ` in ${context}` : ''}`,
      'CONFIG_MISSING',
      { configKey, context }
    );
  }

  static invalidConfiguration(configKey: string, value: any, expected: string): ConfigurationError {
    return new ConfigurationError(
      `Invalid configuration for ${configKey}: expected ${expected}, got ${typeof value}`,
      'CONFIG_INVALID',
      { configKey, value, expected }
    );
  }

  static initializationFailed(component: string, cause?: Error): ConfigurationError {
    return new ConfigurationError(
      `Failed to initialize component: ${component}`,
      'CONFIG_INIT_FAILED',
      { component },
      cause
    );
  }
}

/**
 * Runtime execution errors
 */
export class RuntimeError extends SmrtError {
  constructor(message: string, code: string, details?: Record<string, any>, cause?: Error) {
    super(message, code, 'runtime', details, cause);
  }

  static operationFailed(operation: string, context?: string, cause?: Error): RuntimeError {
    return new RuntimeError(
      `Operation failed: ${operation}${context ? ` in ${context}` : ''}`,
      'RUNTIME_OPERATION_FAILED',
      { operation, context },
      cause
    );
  }

  static invalidState(state: string, expected: string): RuntimeError {
    return new RuntimeError(
      `Invalid state: expected '${expected}', got '${state}'`,
      'RUNTIME_INVALID_STATE',
      { state, expected }
    );
  }

  static resourceExhausted(resource: string, limit: number): RuntimeError {
    return new RuntimeError(
      `Resource exhausted: ${resource} exceeded limit of ${limit}`,
      'RUNTIME_RESOURCE_EXHAUSTED',
      { resource, limit }
    );
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Wraps a function with error handling and automatic retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000,
    backoffMultiplier: number = 2
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          throw lastError;
        }

        // Skip retry for certain error types
        if (error instanceof ValidationError || error instanceof ConfigurationError) {
          throw error;
        }

        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(backoffMultiplier, attempt)));
      }
    }

    throw lastError!;
  }

  /**
   * Checks if an error is retryable
   */
  static isRetryable(error: Error): boolean {
    if (error instanceof SmrtError) {
      return error.category === 'network' || error.category === 'ai';
    }

    // Check for common retryable error patterns
    const retryablePatterns = [
      /ECONNRESET/,
      /ETIMEDOUT/,
      /ENOTFOUND/,
      /rate.?limit/i,
      /timeout/i,
      /503/,
      /502/,
      /500/
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Sanitizes an error for safe logging (removes sensitive information)
   */
  static sanitizeError(error: Error): Record<string, any> {
    const sanitized: Record<string, any> = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };

    if (error instanceof SmrtError) {
      sanitized.code = error.code;
      sanitized.category = error.category;

      // Sanitize details to remove potential sensitive information
      if (error.details) {
        sanitized.details = { ...error.details };

        // Remove common sensitive fields
        const sensitiveFields = ['password', 'token', 'key', 'secret', 'apiKey'];
        for (const field of sensitiveFields) {
          if (sanitized.details[field]) {
            sanitized.details[field] = '[REDACTED]';
          }
        }
      }
    }

    return sanitized;
  }
}