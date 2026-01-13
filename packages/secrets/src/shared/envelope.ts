import * as crypto from 'node:crypto';
import type { EncryptedEnvelope } from './types.js';

/**
 * Core envelope encryption primitives using AES-256-GCM
 *
 * This class provides the cryptographic operations for envelope encryption:
 * - Generate data encryption keys (DEKs)
 * - Wrap/unwrap DEKs with a master key
 * - Encrypt/decrypt data with DEKs
 *
 * @example
 * ```typescript
 * // Generate a new data key
 * const dataKey = EnvelopeEncryption.generateDataKey();
 *
 * // Wrap the data key with an AMK
 * const wrapped = EnvelopeEncryption.wrapKey(dataKey, amk);
 *
 * // Encrypt data with the data key
 * const encrypted = EnvelopeEncryption.encryptData('secret', dataKey);
 *
 * // Later: unwrap and decrypt
 * const unwrappedKey = EnvelopeEncryption.unwrapKey(wrapped.wrappedKey, wrapped.iv, wrapped.authTag, amk);
 * const plaintext = EnvelopeEncryption.decryptData(encrypted.ciphertext, encrypted.iv, encrypted.authTag, unwrappedKey);
 * ```
 */
export class EnvelopeEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm' as const;
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 12; // 96 bits for GCM (recommended)
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits

  /**
   * Generate a new random data encryption key
   *
   * @returns A 32-byte (256-bit) random key
   */
  static generateDataKey(): Buffer {
    return crypto.randomBytes(EnvelopeEncryption.KEY_LENGTH);
  }

  /**
   * Generate a random IV for encryption
   *
   * @returns A 12-byte (96-bit) random IV
   */
  static generateIV(): Buffer {
    return crypto.randomBytes(EnvelopeEncryption.IV_LENGTH);
  }

  /**
   * Wrap (encrypt) a data encryption key with a master key
   *
   * @param dataKey - The data key to wrap (32 bytes)
   * @param masterKey - The master key to wrap with (32 bytes)
   * @returns Object containing wrapped key, IV, and auth tag (all base64-encoded)
   */
  static wrapKey(
    dataKey: Buffer,
    masterKey: Buffer,
  ): { wrappedKey: string; iv: string; authTag: string } {
    EnvelopeEncryption.validateKeyLength(dataKey);
    EnvelopeEncryption.validateKeyLength(masterKey);
    const iv = EnvelopeEncryption.generateIV();
    const cipher = crypto.createCipheriv(
      EnvelopeEncryption.ALGORITHM,
      masterKey,
      iv,
    );

    const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      wrappedKey: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Unwrap (decrypt) a data encryption key with a master key
   *
   * @param wrappedKey - Base64-encoded wrapped key
   * @param iv - Base64-encoded IV
   * @param authTag - Base64-encoded authentication tag
   * @param masterKey - The master key to unwrap with (32 bytes)
   * @returns The unwrapped data key (32 bytes)
   * @throws Error if decryption fails (invalid key, tampered data, etc.)
   */
  static unwrapKey(
    wrappedKey: string,
    iv: string,
    authTag: string,
    masterKey: Buffer,
  ): Buffer {
    EnvelopeEncryption.validateKeyLength(masterKey);
    const decipher = crypto.createDecipheriv(
      EnvelopeEncryption.ALGORITHM,
      masterKey,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(wrappedKey, 'base64')),
      decipher.final(),
    ]);
  }

  /**
   * Encrypt data with a data encryption key
   *
   * @param plaintext - The plaintext string to encrypt
   * @param dataKey - The data encryption key (32 bytes)
   * @returns Object containing ciphertext, IV, and auth tag (all base64-encoded)
   */
  static encryptData(
    plaintext: string,
    dataKey: Buffer,
  ): { ciphertext: string; iv: string; authTag: string } {
    EnvelopeEncryption.validateKeyLength(dataKey);
    const iv = EnvelopeEncryption.generateIV();
    const cipher = crypto.createCipheriv(
      EnvelopeEncryption.ALGORITHM,
      dataKey,
      iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * Decrypt data with a data encryption key
   *
   * @param ciphertext - Base64-encoded ciphertext
   * @param iv - Base64-encoded IV
   * @param authTag - Base64-encoded authentication tag
   * @param dataKey - The data encryption key (32 bytes)
   * @returns The decrypted plaintext string
   * @throws Error if decryption fails (invalid key, tampered data, etc.)
   */
  static decryptData(
    ciphertext: string,
    iv: string,
    authTag: string,
    dataKey: Buffer,
  ): string {
    EnvelopeEncryption.validateKeyLength(dataKey);
    const decipher = crypto.createDecipheriv(
      EnvelopeEncryption.ALGORITHM,
      dataKey,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Create a full encrypted envelope
   *
   * This combines key wrapping and data encryption into a single envelope
   * that can be stored and later decrypted.
   *
   * @param plaintext - The plaintext string to encrypt
   * @param dataKey - The data encryption key (32 bytes)
   * @param wrappedKeyInfo - The wrapped key info (from wrapKey)
   * @param amkKeyId - The ID of the AMK used to wrap the key
   * @param metadata - Optional metadata to include in the envelope
   * @returns A complete encrypted envelope
   */
  static createEnvelope(
    plaintext: string,
    dataKey: Buffer,
    wrappedKeyInfo: { wrappedKey: string; iv: string; authTag: string },
    amkKeyId: string,
    metadata?: Record<string, string>,
  ): EncryptedEnvelope {
    const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey);

    // Combine wrapped key info into a single string: wrappedKey:iv:authTag
    const combinedWrappedKey = `${wrappedKeyInfo.wrappedKey}:${wrappedKeyInfo.iv}:${wrappedKeyInfo.authTag}`;

    return {
      version: 1,
      algorithm: 'aes-256-gcm',
      wrappedKey: combinedWrappedKey,
      amkKeyId,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
      createdAt: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Parse a combined wrapped key string
   *
   * @param combinedWrappedKey - The combined wrapped key string (wrappedKey:iv:authTag)
   * @returns Object with wrappedKey, iv, and authTag
   */
  static parseWrappedKey(combinedWrappedKey: string): {
    wrappedKey: string;
    iv: string;
    authTag: string;
  } {
    const parts = combinedWrappedKey.split(':');
    if (parts.length !== 3) {
      throw new Error(
        'Invalid wrapped key format: expected wrappedKey:iv:authTag',
      );
    }
    const [wrappedKey, iv, authTag] = parts;
    // Validate that all parts are non-empty
    if (!wrappedKey || !iv || !authTag) {
      throw new Error(
        'Invalid wrapped key format: wrappedKey, iv, and authTag must all be non-empty',
      );
    }
    return { wrappedKey, iv, authTag };
  }

  /**
   * Decrypt a full envelope
   *
   * @param envelope - The encrypted envelope
   * @param masterKey - The master key to unwrap the data key
   * @returns The decrypted plaintext string
   */
  static decryptEnvelope(
    envelope: EncryptedEnvelope,
    masterKey: Buffer,
  ): string {
    // Parse the wrapped key
    const {
      wrappedKey,
      iv: keyIv,
      authTag: keyAuthTag,
    } = EnvelopeEncryption.parseWrappedKey(envelope.wrappedKey);

    // Unwrap the data key
    const dataKey = EnvelopeEncryption.unwrapKey(
      wrappedKey,
      keyIv,
      keyAuthTag,
      masterKey,
    );

    // Decrypt the data
    return EnvelopeEncryption.decryptData(
      envelope.ciphertext,
      envelope.iv,
      envelope.authTag,
      dataKey,
    );
  }

  /**
   * Validate that a key is the correct length
   *
   * @param key - The key to validate
   * @param expectedLength - Expected length in bytes (default: 32)
   * @throws Error if key length is invalid
   */
  static validateKeyLength(
    key: Buffer,
    expectedLength: number = EnvelopeEncryption.KEY_LENGTH,
  ): void {
    if (key.length !== expectedLength) {
      throw new Error(
        `Invalid key length: expected ${expectedLength} bytes, got ${key.length} bytes`,
      );
    }
  }

  /**
   * Parse a hex-encoded key from string
   *
   * @param hexKey - Hex-encoded key string (64 chars for 32 bytes)
   * @returns The key as a Buffer
   * @throws Error if the hex string is invalid
   */
  static parseHexKey(hexKey: string): Buffer {
    if (!/^[0-9a-fA-F]+$/.test(hexKey)) {
      throw new Error('Invalid hex key: contains non-hex characters');
    }

    const key = Buffer.from(hexKey, 'hex');
    EnvelopeEncryption.validateKeyLength(key);

    return key;
  }
}
