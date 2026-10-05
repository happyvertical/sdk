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

/** Why a WAV buffer was rejected by `parseWavPcm16`, or an encode input refused. */
export type WavFormatErrorReason =
  | 'not_riff'
  | 'truncated'
  | 'malformed_chunk'
  | 'missing_fmt'
  | 'duplicate_fmt'
  | 'data_before_fmt'
  | 'missing_data'
  | 'empty_data'
  | 'unsupported_format'
  | 'unsupported_bits'
  | 'inconsistent_header'
  | 'misaligned_data'
  | 'rate_mismatch'
  | 'channel_mismatch'
  | 'invalid_argument';

/**
 * Thrown by the PCM/WAV utilities (`@happyvertical/speech/pcm`) for input that
 * is not exactly the 16-bit PCM WAV that was asked for, and for invalid
 * arguments (sample rate, sizes). `reason` is stable and machine-readable.
 */
export class WavFormatError extends SpeechError {
  readonly reason: WavFormatErrorReason;

  constructor(reason: WavFormatErrorReason, message: string) {
    super(message, 'SPEECH_INVALID_WAV');
    this.name = 'WavFormatError';
    this.reason = reason;
  }
}

/** Why a browser PCM capture could not start or produce audio. */
export type PcmCaptureErrorReason =
  | 'unsupported'
  | 'setup_failed'
  | 'cancelled';

/** Thrown by `createPcmCapture` (`@happyvertical/speech/browser`). */
export class PcmCaptureError extends SpeechError {
  readonly reason: PcmCaptureErrorReason;

  constructor(reason: PcmCaptureErrorReason, message: string, cause?: unknown) {
    super(message, 'SPEECH_PCM_CAPTURE');
    this.name = 'PcmCaptureError';
    this.reason = reason;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
