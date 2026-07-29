import type { ForgeProvider, ForgeRateLimit } from './types.js';

export type ForgeErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORITY_MISMATCH'
  | 'CONFIGURATION_ERROR'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'SIGNATURE_INVALID'
  | 'TRANSPORT_ERROR';

export class ForgeError extends Error {
  readonly provider?: ForgeProvider;
  readonly code: ForgeErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly rateLimit?: ForgeRateLimit;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: ForgeErrorCode,
    options: {
      cause?: unknown;
      provider?: ForgeProvider;
      status?: number;
      requestId?: string;
      rateLimit?: ForgeRateLimit;
      details?: unknown;
      retryable?: boolean;
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = 'ForgeError';
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.requestId = options.requestId;
    this.rateLimit = options.rateLimit;
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }
}

export class ForgeSignatureError extends ForgeError {
  constructor(message = 'Forge webhook signature is invalid') {
    super(message, 'SIGNATURE_INVALID');
    this.name = 'ForgeSignatureError';
  }
}
