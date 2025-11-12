import { readFile, writeFile } from 'node:fs/promises';
import type { Transform } from 'node:stream';
import {
  DecryptError,
  EncryptError,
  InvalidKeyError,
  KeyError,
} from './errors.js';
import type {
  AdapterType,
  DecryptEmailOptions,
  DecryptedEmail,
  DecryptOptions,
  EmailMessage,
  EncryptEmailOptions,
  Encryption,
  EncryptionCapabilities,
  EncryptOptions,
  ExportKeyOptions,
  ImportKeyOptions,
  Key,
  KeyPair,
  KeyPairOptions,
  SignEmailOptions,
  SignOptions,
  VerificationResult,
  VerifyEmailOptions,
  VerifyOptions,
} from './types.js';

/**
 * Base adapter class that provides common functionality for all encryption adapters
 */
export abstract class BaseEncryption implements Encryption {
  protected readonly adapterType: AdapterType;
  protected readonly debug: boolean;

  constructor(adapterType: AdapterType, debug = false) {
    this.adapterType = adapterType;
    this.debug = debug;
  }

  /**
   * Get the adapter type
   */
  getAdapter(): AdapterType {
    return this.adapterType;
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  protected log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      console.log(`[${this.adapterType}] ${message}`, ...args);
    }
  }

  /**
   * Validate that a key is provided
   */
  protected validateKey(
    key: string | Buffer | Uint8Array | undefined,
    keyType: 'public' | 'private',
  ): void {
    if (!key) {
      throw new KeyError(
        `${keyType} key is required but was not provided`,
        this.adapterType,
      );
    }

    if (typeof key === 'string' && key.trim().length === 0) {
      throw new InvalidKeyError(
        `${keyType} key cannot be empty`,
        this.adapterType,
      );
    }

    if (Buffer.isBuffer(key) && key.length === 0) {
      throw new InvalidKeyError(
        `${keyType} key cannot be empty`,
        this.adapterType,
      );
    }

    if (key instanceof Uint8Array && key.length === 0) {
      throw new InvalidKeyError(
        `${keyType} key cannot be empty`,
        this.adapterType,
      );
    }
  }

  /**
   * Validate encryption options
   */
  protected validateEncryptOptions(options?: EncryptOptions): void {
    // Base validation - adapters can override
    if (!options) return;

    // Validate encoding if provided
    if (
      options.encoding &&
      !['base64', 'hex', 'utf8'].includes(options.encoding)
    ) {
      throw new Error(
        `Invalid encoding: ${options.encoding}. Must be 'base64', 'hex', or 'utf8'`,
      );
    }
  }

  /**
   * Validate decryption options
   */
  protected validateDecryptOptions(options?: DecryptOptions): void {
    // Base validation - adapters can override
    if (!options) return;

    // Validate encoding if provided
    if (
      options.encoding &&
      !['base64', 'hex', 'utf8'].includes(options.encoding)
    ) {
      throw new Error(
        `Invalid encoding: ${options.encoding}. Must be 'base64', 'hex', or 'utf8'`,
      );
    }
  }

  /**
   * Convert Buffer to string based on encoding
   */
  protected bufferToString(
    buffer: Buffer,
    encoding: 'base64' | 'hex' | 'utf8' = 'base64',
  ): string {
    return buffer.toString(encoding);
  }

  /**
   * Convert string to Buffer based on encoding
   */
  protected stringToBuffer(
    str: string,
    encoding: 'base64' | 'hex' | 'utf8' = 'base64',
  ): Buffer {
    return Buffer.from(str, encoding);
  }

  /**
   * Wrap errors with adapter context
   */
  protected wrapError(error: unknown, operation: string): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(
      `${operation} failed in ${this.adapterType} adapter: ${String(error)}`,
    );
  }

  // =============================================================================
  // Text operations (must be implemented by adapters)
  // =============================================================================

  abstract encryptText(text: string, options?: EncryptOptions): Promise<string>;

  abstract decryptText(
    encrypted: string,
    options?: DecryptOptions,
  ): Promise<string>;

  // =============================================================================
  // File operations (default implementation using text/buffer methods)
  // =============================================================================

  async encryptFile(
    inputPath: string,
    outputPath: string,
    options?: EncryptOptions,
  ): Promise<void> {
    try {
      this.log(`Encrypting file: ${inputPath} -> ${outputPath}`);

      // Read input file
      const input = await readFile(inputPath);

      // Encrypt buffer
      const encrypted = await this.encryptBuffer(input, options);

      // Write output file
      await writeFile(outputPath, encrypted);

      this.log(`File encrypted successfully: ${outputPath}`);
    } catch (error) {
      throw new EncryptError(
        `Failed to encrypt file: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async decryptFile(
    inputPath: string,
    outputPath: string,
    options?: DecryptOptions,
  ): Promise<void> {
    try {
      this.log(`Decrypting file: ${inputPath} -> ${outputPath}`);

      // Read input file
      const input = await readFile(inputPath);

      // Decrypt buffer
      const decrypted = await this.decryptBuffer(input, options);

      // Write output file
      await writeFile(outputPath, decrypted);

      this.log(`File decrypted successfully: ${outputPath}`);
    } catch (error) {
      throw new DecryptError(
        `Failed to decrypt file: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  // =============================================================================
  // Buffer operations (must be implemented by adapters)
  // =============================================================================

  abstract encryptBuffer(
    buffer: Buffer,
    options?: EncryptOptions,
  ): Promise<Buffer>;

  abstract decryptBuffer(
    buffer: Buffer,
    options?: DecryptOptions,
  ): Promise<Buffer>;

  // =============================================================================
  // Stream operations (optional - not implemented by default)
  // =============================================================================

  encryptStream?(options?: EncryptOptions): Transform;

  decryptStream?(options?: DecryptOptions): Transform;

  // =============================================================================
  // Email operations (optional - mainly PGP)
  // =============================================================================

  encryptEmail?(
    message: EmailMessage,
    options?: EncryptEmailOptions,
  ): Promise<EmailMessage>;

  decryptEmail?(
    message: EmailMessage,
    options?: DecryptEmailOptions,
  ): Promise<DecryptedEmail>;

  signEmail?(
    message: EmailMessage,
    options?: SignEmailOptions,
  ): Promise<EmailMessage>;

  verifyEmail?(
    message: EmailMessage,
    options?: VerifyEmailOptions,
  ): Promise<VerificationResult>;

  // =============================================================================
  // Signing operations (optional - mainly PGP)
  // =============================================================================

  sign?(data: string | Buffer, options?: SignOptions): Promise<string | Buffer>;

  verify?(
    data: string | Buffer,
    signature: string | Buffer,
    options?: VerifyOptions,
  ): Promise<boolean>;

  // =============================================================================
  // Key management (must be implemented by adapters)
  // =============================================================================

  abstract generateKeyPair(options?: KeyPairOptions): Promise<KeyPair>;

  abstract importKey(
    key: string | Buffer,
    options?: ImportKeyOptions,
  ): Promise<Key>;

  abstract exportKey(
    key: Key,
    options?: ExportKeyOptions,
  ): Promise<string | Buffer>;

  // =============================================================================
  // Adapter capabilities (must be implemented by adapters)
  // =============================================================================

  abstract getCapabilities(): Promise<EncryptionCapabilities>;
}
