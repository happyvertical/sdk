/**
 * Project error handling
 */

export enum ProjectErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_STATUS = 'INVALID_STATUS',
  INVALID_FIELD = 'INVALID_FIELD',
  ITEM_NOT_IN_PROJECT = 'ITEM_NOT_IN_PROJECT',
  RATE_LIMITED = 'RATE_LIMITED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export class ProjectError extends Error {
  constructor(
    message: string,
    public code: ProjectErrorCode,
    public statusCode?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = 'ProjectError';
    Error.captureStackTrace(this, this.constructor);
  }

  static fromHTTPStatus(
    statusCode: number,
    message: string,
    response?: unknown,
  ): ProjectError {
    let code: ProjectErrorCode;

    switch (statusCode) {
      case 404:
        code = ProjectErrorCode.NOT_FOUND;
        break;
      case 401:
        code = ProjectErrorCode.UNAUTHORIZED;
        break;
      case 403:
        code = ProjectErrorCode.UNAUTHORIZED;
        break;
      case 429:
        code = ProjectErrorCode.RATE_LIMITED;
        break;
      case 422:
        code = ProjectErrorCode.VALIDATION_ERROR;
        break;
      default:
        code = ProjectErrorCode.UNKNOWN;
    }

    return new ProjectError(message, code, statusCode, response);
  }

  static networkError(message: string, cause?: Error): ProjectError {
    return new ProjectError(
      message,
      ProjectErrorCode.NETWORK_ERROR,
      undefined,
      cause,
    );
  }

  isRetryable(): boolean {
    return (
      this.code === ProjectErrorCode.RATE_LIMITED ||
      this.code === ProjectErrorCode.NETWORK_ERROR
    );
  }
}
