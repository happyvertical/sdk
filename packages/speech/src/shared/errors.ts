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

/**
 * A request the adapter refused before calling the provider: missing or
 * invalid setup, and (through its subclasses) audio that is too large or
 * cannot be decoded. Retrying the same request will not help.
 */
export class SpeechConfigurationError extends SpeechError {
  constructor(
    message: string,
    adapter?: string,
    code = 'SPEECH_CONFIGURATION_ERROR',
  ) {
    super(message, code, adapter);
    this.name = 'SpeechConfigurationError';
  }
}

/**
 * The audio exceeds the adapter's `maxBytes` (code `SPEECH_AUDIO_TOO_LARGE`).
 * Extends {@link SpeechConfigurationError}, so existing `instanceof` checks
 * still match. A provider's own HTTP 413 stays a {@link SpeechProviderError}
 * with `status: 413`.
 */
export class SpeechAudioTooLargeError extends SpeechConfigurationError {
  /** The limit that was exceeded, in bytes. */
  readonly maxBytes: number;

  constructor(message: string, maxBytes: number, adapter?: string) {
    super(message, adapter, 'SPEECH_AUDIO_TOO_LARGE');
    this.name = 'SpeechAudioTooLargeError';
    this.maxBytes = maxBytes;
  }
}

/**
 * The audio is empty, malformed, or in a format this adapter cannot decode
 * (code `SPEECH_INVALID_AUDIO`). Extends {@link SpeechConfigurationError}, so
 * existing `instanceof` checks still match. `WavFormatError` from
 * `@happyvertical/speech/pcm` is separate and keeps its own `reason`.
 */
export class SpeechInvalidAudioError extends SpeechConfigurationError {
  constructor(message: string, adapter?: string) {
    super(message, adapter, 'SPEECH_INVALID_AUDIO');
    this.name = 'SpeechInvalidAudioError';
  }
}

export class InvalidSpeechAdapterError extends SpeechError {
  constructor(type: string, kind: string) {
    super(`Invalid ${kind} speech adapter type: ${type}`, 'INVALID_ADAPTER');
    this.name = 'InvalidSpeechAdapterError';
  }
}

/**
 * The provider failed the request: an HTTP error status, an unusable
 * response, or (subclass {@link SpeechProviderUnavailableError}) no response
 * at all.
 */
export class SpeechProviderError extends SpeechError {
  readonly status?: number;
  readonly responseBody?: string;
  /** Parsed `Retry-After` delay in milliseconds, when the provider sent one. */
  readonly retryAfterMs?: number;
  /**
   * Whether the same request may succeed if sent again later: a 429 or 5xx
   * status, or an unreachable provider. The adapters' own automatic retry
   * covers 429/5xx only.
   */
  readonly retryable: boolean;

  constructor(
    adapter: string,
    message: string,
    options: {
      status?: number;
      responseBody?: string;
      retryAfterMs?: number;
      cause?: unknown;
    } = {},
    code = 'SPEECH_PROVIDER_ERROR',
  ) {
    super(message, code, adapter);
    this.name = 'SpeechProviderError';
    this.status = options.status;
    this.responseBody = options.responseBody;
    this.retryAfterMs = options.retryAfterMs;
    this.retryable =
      options.status === 429 ||
      (options.status !== undefined && options.status >= 500);
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * The provider could not be reached: the request failed before any HTTP
 * response (DNS, refused or reset connection, TLS). Code
 * `SPEECH_PROVIDER_UNAVAILABLE`, `retryable: true`, no `status`; the
 * underlying error is `cause`. Extends {@link SpeechProviderError}. A caller
 * abort or the adapter's `timeoutMs` still surfaces as the abort error.
 */
export class SpeechProviderUnavailableError extends SpeechProviderError {
  override readonly retryable = true;

  constructor(adapter: string, message: string, cause?: unknown) {
    super(adapter, message, { cause }, 'SPEECH_PROVIDER_UNAVAILABLE');
    this.name = 'SpeechProviderUnavailableError';
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
