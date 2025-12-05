/**
 * GraphQL error handling
 */

import type { GraphQLErrorDetail } from './types.js';

/**
 * Error codes for GraphQL operations
 */
export enum GraphQLErrorCode {
  /** Authentication failed */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Invalid query or mutation */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * GraphQL error class
 */
export class GraphQLError extends Error {
  readonly code: GraphQLErrorCode;
  readonly details?: GraphQLErrorDetail[];
  readonly originalError?: unknown;

  constructor(
    message: string,
    code: GraphQLErrorCode,
    details?: GraphQLErrorDetail[],
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'GraphQLError';
    this.code = code;
    this.details = details;
    this.originalError = originalError;
  }

  /**
   * Create error from HTTP status code
   */
  static fromHTTPStatus(
    status: number,
    message: string,
    originalError?: unknown,
  ): GraphQLError {
    let code: GraphQLErrorCode;

    switch (status) {
      case 401:
        code = GraphQLErrorCode.UNAUTHORIZED;
        break;
      case 403:
        code = GraphQLErrorCode.RATE_LIMITED;
        break;
      case 404:
        code = GraphQLErrorCode.NOT_FOUND;
        break;
      case 422:
        code = GraphQLErrorCode.VALIDATION_ERROR;
        break;
      default:
        code = GraphQLErrorCode.UNKNOWN;
    }

    return new GraphQLError(message, code, undefined, originalError);
  }

  /**
   * Create error from GraphQL response errors
   */
  static fromGraphQLErrors(errors: GraphQLErrorDetail[]): GraphQLError {
    const message = errors.map((e) => e.message).join('; ');
    return new GraphQLError(
      `GraphQL errors: ${message}`,
      GraphQLErrorCode.VALIDATION_ERROR,
      errors,
    );
  }

  /**
   * Create network error
   */
  static networkError(message: string, originalError?: unknown): GraphQLError {
    return new GraphQLError(
      message,
      GraphQLErrorCode.NETWORK_ERROR,
      undefined,
      originalError,
    );
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return (
      this.code === GraphQLErrorCode.RATE_LIMITED ||
      this.code === GraphQLErrorCode.NETWORK_ERROR
    );
  }
}
