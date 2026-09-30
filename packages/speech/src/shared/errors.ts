export class SpeechError extends Error {
  constructor(
    message: string,
    public code: string,
    public adapter?: string,
  ) {
    super(message);
    this.name = 'SpeechError';
  }
}

export class SpeechConfigurationError extends SpeechError {
  constructor(message: string, adapter?: string) {
    super(message, 'SPEECH_CONFIGURATION_ERROR', adapter);
    this.name = 'SpeechConfigurationError';
  }
}

export class InvalidSpeechAdapterError extends SpeechError {
  constructor(type: string, kind: string) {
    super(`Invalid ${kind} speech adapter type: ${type}`, 'INVALID_ADAPTER');
    this.name = 'InvalidSpeechAdapterError';
  }
}

export class SpeechProviderError extends SpeechError {
  readonly status?: number;
  readonly responseBody?: string;
  /** Parsed `Retry-After` delay in milliseconds, when the provider sent one. */
  readonly retryAfterMs?: number;

  constructor(
    adapter: string,
    message: string,
    options: {
      status?: number;
      responseBody?: string;
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(message, 'SPEECH_PROVIDER_ERROR', adapter);
    this.name = 'SpeechProviderError';
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.retryAfterMs = options.retryAfterMs;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
