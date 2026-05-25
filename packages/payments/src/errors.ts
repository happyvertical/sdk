export type PaymentErrorCode =
  | 'PAYMENT_CONFIGURATION_ERROR'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'PAYMENT_UNSUPPORTED'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'PAYMENT_TIMEOUT'
  | 'PAYMENT_INVALID_INPUT';

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: PaymentErrorCode = 'PAYMENT_PROVIDER_ERROR',
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'PaymentError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export class PaymentConfigurationError extends PaymentError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'PAYMENT_CONFIGURATION_ERROR', options);
    this.name = 'PaymentConfigurationError';
  }
}

export class PaymentProviderError extends PaymentError {
  constructor(
    message: string,
    options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, 'PAYMENT_PROVIDER_ERROR', options);
    this.name = 'PaymentProviderError';
  }
}

export class PaymentUnsupportedError extends PaymentError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'PAYMENT_UNSUPPORTED', options);
    this.name = 'PaymentUnsupportedError';
  }
}

export class PaymentVerificationError extends PaymentError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'PAYMENT_VERIFICATION_FAILED', options);
    this.name = 'PaymentVerificationError';
  }
}
