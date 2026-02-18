/**
 * Error classes for @happyvertical/directory package
 */

// ============================================================================
// Base Error
// ============================================================================

export class DirectoryError extends Error {
  code: string;
  provider?: string;
  cause?: unknown;

  constructor(
    message: string,
    code: string,
    provider?: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'DirectoryError';
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

export class ConnectionError extends DirectoryError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'CONNECTION_ERROR', provider, cause);
    this.name = 'ConnectionError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends DirectoryError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', provider, cause);
    this.name = 'AuthenticationError';
  }
}

// ============================================================================
// Not Found Errors
// ============================================================================

export class NotFoundError extends DirectoryError {
  resourceType: string;
  resourceId: string;

  constructor(
    resourceType: string,
    resourceId: string,
    provider?: string,
    cause?: unknown,
  ) {
    super(
      `${resourceType} not found: ${resourceId}`,
      'NOT_FOUND',
      provider,
      cause,
    );
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

// ============================================================================
// Conflict Errors
// ============================================================================

export class ConflictError extends DirectoryError {
  resourceType: string;
  resourceId: string;

  constructor(
    resourceType: string,
    resourceId: string,
    provider?: string,
    cause?: unknown,
  ) {
    super(
      `${resourceType} already exists: ${resourceId}`,
      'CONFLICT',
      provider,
      cause,
    );
    this.name = 'ConflictError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends DirectoryError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', provider, cause);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Rate Limit Errors
// ============================================================================

export class RateLimitError extends DirectoryError {
  retryAfter?: number;

  constructor(provider?: string, retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`,
      'RATE_LIMIT',
      provider,
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
