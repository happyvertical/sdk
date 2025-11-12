/**
 * Base error class for all encryption errors
 */
export class EncryptionError extends Error {
  public readonly code: string;
  public readonly adapter?: string;
  public readonly cause?: unknown;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    adapter?: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
    this.adapter = adapter;
    this.cause = cause;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      adapter: this.adapter,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause,
    };
  }
}

/**
 * Key-related errors
 */
export class KeyError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'KEY_ERROR', adapter, cause);
    this.name = 'KeyError';
  }
}

/**
 * Invalid key format or content
 */
export class InvalidKeyError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'INVALID_KEY', adapter, cause);
    this.name = 'InvalidKeyError';
  }
}

/**
 * Key not found error
 */
export class KeyNotFoundError extends EncryptionError {
  public readonly keyId?: string;

  constructor(message: string, keyId?: string, adapter?: string) {
    super(message, 'KEY_NOT_FOUND', adapter);
    this.name = 'KeyNotFoundError';
    this.keyId = keyId;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      keyId: this.keyId,
    };
  }
}

/**
 * Passphrase-related errors
 */
export class PassphraseError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'PASSPHRASE_ERROR', adapter, cause);
    this.name = 'PassphraseError';
  }
}

/**
 * Encryption operation errors
 */
export class EncryptError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'ENCRYPT_ERROR', adapter, cause);
    this.name = 'EncryptError';
  }
}

/**
 * Decryption operation errors
 */
export class DecryptError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'DECRYPT_ERROR', adapter, cause);
    this.name = 'DecryptError';
  }
}

/**
 * Signature operation errors
 */
export class SignatureError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'SIGNATURE_ERROR', adapter, cause);
    this.name = 'SignatureError';
  }
}

/**
 * Verification operation errors
 */
export class VerificationError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'VERIFICATION_ERROR', adapter, cause);
    this.name = 'VerificationError';
  }
}

/**
 * Format-related errors
 */
export class FormatError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'FORMAT_ERROR', adapter, cause);
    this.name = 'FormatError';
  }
}

/**
 * Algorithm-related errors
 */
export class AlgorithmError extends EncryptionError {
  public readonly algorithm?: string;

  constructor(message: string, algorithm?: string, adapter?: string) {
    super(message, 'ALGORITHM_ERROR', adapter);
    this.name = 'AlgorithmError';
    this.algorithm = algorithm;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      algorithm: this.algorithm,
    };
  }
}
