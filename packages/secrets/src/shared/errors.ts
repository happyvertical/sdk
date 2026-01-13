/**
 * Base error class for secret operations
 */
export class SecretError extends Error {
  readonly code: string;
  readonly adapterType?: string;
  readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    options?: { adapterType?: string; cause?: Error },
  ) {
    super(message);
    this.name = 'SecretError';
    this.code = code;
    this.adapterType = options?.adapterType;
    this.cause = options?.cause;
  }
}

/**
 * Error thrown when a key is not found
 */
export class KeyNotFoundError extends SecretError {
  constructor(keyId: string, adapterType?: string) {
    super(`Key not found: ${keyId}`, 'KEY_NOT_FOUND', { adapterType });
    this.name = 'KeyNotFoundError';
  }
}

/**
 * Error thrown when decryption fails
 */
export class DecryptionError extends SecretError {
  constructor(message: string, adapterType?: string, cause?: Error) {
    super(message, 'DECRYPTION_FAILED', { adapterType, cause });
    this.name = 'DecryptionError';
  }
}

/**
 * Error thrown when encryption fails
 */
export class EncryptionError extends SecretError {
  constructor(message: string, adapterType?: string, cause?: Error) {
    super(message, 'ENCRYPTION_FAILED', { adapterType, cause });
    this.name = 'EncryptionError';
  }
}

/**
 * Error thrown when key rotation fails
 */
export class KeyRotationError extends SecretError {
  constructor(message: string, adapterType?: string, cause?: Error) {
    super(message, 'KEY_ROTATION_FAILED', { adapterType, cause });
    this.name = 'KeyRotationError';
  }
}

/**
 * Error thrown when a tenant's encryption key is missing
 */
export class TenantKeyMissingError extends SecretError {
  constructor(tenantId: string) {
    super(
      `No active encryption key for tenant: ${tenantId}`,
      'TENANT_KEY_MISSING',
    );
    this.name = 'TenantKeyMissingError';
  }
}

/**
 * Error thrown when the Application Master Key is unavailable
 */
export class AMKUnavailableError extends SecretError {
  constructor(message: string) {
    super(message, 'AMK_UNAVAILABLE');
    this.name = 'AMKUnavailableError';
  }
}

/**
 * Error thrown when the store is not initialized
 */
export class StoreNotInitializedError extends SecretError {
  constructor(adapterType?: string) {
    super('Secret store not initialized', 'STORE_NOT_INITIALIZED', {
      adapterType,
    });
    this.name = 'StoreNotInitializedError';
  }
}

/**
 * Error thrown when an invalid key format is encountered
 */
export class InvalidKeyFormatError extends SecretError {
  constructor(message: string, adapterType?: string) {
    super(message, 'INVALID_KEY_FORMAT', { adapterType });
    this.name = 'InvalidKeyFormatError';
  }
}
