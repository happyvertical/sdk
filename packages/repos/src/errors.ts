/**
 * Repository error handling
 */

export enum RepositoryErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code: RepositoryErrorCode,
    public statusCode?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = 'RepositoryError';
    Error.captureStackTrace(this, this.constructor);
  }

  static fromHTTPStatus(
    statusCode: number,
    message: string,
    response?: unknown,
  ): RepositoryError {
    let code: RepositoryErrorCode;

    switch (statusCode) {
      case 404:
        code = RepositoryErrorCode.NOT_FOUND;
        break;
      case 401:
        code = RepositoryErrorCode.UNAUTHORIZED;
        break;
      case 403:
        code = RepositoryErrorCode.FORBIDDEN;
        break;
      case 429:
        code = RepositoryErrorCode.RATE_LIMITED;
        break;
      case 422:
        code = RepositoryErrorCode.VALIDATION_ERROR;
        break;
      default:
        code = RepositoryErrorCode.UNKNOWN;
    }

    return new RepositoryError(message, code, statusCode, response);
  }

  static networkError(message: string, cause?: Error): RepositoryError {
    return new RepositoryError(
      message,
      RepositoryErrorCode.NETWORK_ERROR,
      undefined,
      cause,
    );
  }

  isRetryable(): boolean {
    return (
      this.code === RepositoryErrorCode.RATE_LIMITED ||
      this.code === RepositoryErrorCode.NETWORK_ERROR
    );
  }
}
