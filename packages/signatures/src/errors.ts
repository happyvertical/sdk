export type SignatureErrorCode =
  | 'SIGNATURE_CONFIGURATION_ERROR'
  | 'SIGNATURE_INVALID_INPUT'
  | 'SIGNATURE_PROVIDER_ERROR'
  | 'SIGNATURE_VERIFICATION_FAILED'
  | 'SIGNATURE_TENANT_MISMATCH';

export class SignatureError extends Error {
  readonly code: SignatureErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  /** A failed create call may have reached the provider and must be reconciled. */
  readonly requestMayHaveSucceeded: boolean;

  constructor(
    message: string,
    code: SignatureErrorCode,
    options: {
      cause?: unknown;
      retryable?: boolean;
      status?: number;
      retryAfterMs?: number;
      requestMayHaveSucceeded?: boolean;
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'SignatureError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.requestMayHaveSucceeded = options.requestMayHaveSucceeded ?? false;
  }
}

export class SignatureConfigurationError extends SignatureError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'SIGNATURE_CONFIGURATION_ERROR', options);
    this.name = 'SignatureConfigurationError';
  }
}

export class SignatureInputError extends SignatureError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'SIGNATURE_INVALID_INPUT', options);
    this.name = 'SignatureInputError';
  }
}

export class SignatureProviderError extends SignatureError {
  constructor(
    message: string,
    options: {
      cause?: unknown;
      retryable?: boolean;
      status?: number;
      retryAfterMs?: number;
      requestMayHaveSucceeded?: boolean;
    } = {},
  ) {
    super(message, 'SIGNATURE_PROVIDER_ERROR', options);
    this.name = 'SignatureProviderError';
  }
}

export class SignatureVerificationError extends SignatureError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'SIGNATURE_VERIFICATION_FAILED', options);
    this.name = 'SignatureVerificationError';
  }
}

export class SignatureTenantMismatchError extends SignatureError {
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, 'SIGNATURE_TENANT_MISMATCH', options);
    this.name = 'SignatureTenantMismatchError';
  }
}
