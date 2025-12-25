/**
 * Error classes for the images library
 */

/**
 * Base error class for image processing operations
 */
export class ImageError extends Error {
  constructor(
    message: string,
    public code: string,
    public adapter?: string,
  ) {
    super(message);
    this.name = 'ImageError';
  }
}

/**
 * Error thrown when an image file is not found
 */
export class ImageNotFoundError extends ImageError {
  constructor(path: string, adapter?: string) {
    super(`Image not found: ${path}`, 'IMAGE_NOT_FOUND', adapter);
    this.name = 'ImageNotFoundError';
  }
}

/**
 * Error thrown when image format is not supported
 */
export class UnsupportedFormatError extends ImageError {
  constructor(format: string, adapter?: string) {
    super(`Unsupported image format: ${format}`, 'UNSUPPORTED_FORMAT', adapter);
    this.name = 'UnsupportedFormatError';
  }
}

/**
 * Error thrown when an operation is not supported by the adapter
 */
export class OperationNotSupportedError extends ImageError {
  constructor(operation: string, adapter?: string) {
    super(
      `Operation not supported: ${operation}`,
      'OPERATION_NOT_SUPPORTED',
      adapter,
    );
    this.name = 'OperationNotSupportedError';
  }
}

/**
 * Error thrown when image processing fails
 */
export class ProcessingError extends ImageError {
  constructor(
    message: string,
    adapter?: string,
    public cause?: Error,
  ) {
    super(message, 'PROCESSING_ERROR', adapter);
    this.name = 'ProcessingError';
  }
}

/**
 * Error thrown when adapter type is invalid
 */
export class InvalidAdapterError extends ImageError {
  constructor(type: string) {
    super(`Invalid adapter type: ${type}`, 'INVALID_ADAPTER');
    this.name = 'InvalidAdapterError';
  }
}

/**
 * Error thrown when remote service (e.g., imgproxy) fails
 */
export class RemoteServiceError extends ImageError {
  constructor(
    message: string,
    adapter?: string,
    public statusCode?: number,
  ) {
    super(message, 'REMOTE_SERVICE_ERROR', adapter);
    this.name = 'RemoteServiceError';
  }
}
