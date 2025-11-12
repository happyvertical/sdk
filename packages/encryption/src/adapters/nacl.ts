import nacl from 'tweetnacl';
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from 'tweetnacl-util';
import { BaseEncryption } from '../shared/base.js';
import {
  DecryptError,
  EncryptError,
  InvalidKeyError,
  KeyError,
  SignatureError,
} from '../shared/errors.js';
import type {
  DecryptOptions,
  EncryptionCapabilities,
  EncryptOptions,
  ExportKeyOptions,
  ImportKeyOptions,
  Key,
  KeyPair,
  KeyPairOptions,
  NaClOptions,
  SignOptions,
  VerifyOptions,
} from '../shared/types.js';

/**
 * NaCl/TweetNaCl encryption adapter
 *
 * Provides fast, modern cryptography using the NaCl library.
 * Supports both symmetric (secretbox) and asymmetric (box) encryption.
 *
 * @example
 * ```typescript
 * // Symmetric encryption
 * const nacl = new NaClEncryption({
 *   type: 'nacl',
 *   secretKey: secretKey
 * });
 *
 * const encrypted = await nacl.encryptText('Secret message');
 * const decrypted = await nacl.decryptText(encrypted);
 *
 * // Asymmetric encryption
 * const nacl = new NaClEncryption({
 *   type: 'nacl',
 *   publicKey: theirPublicKey,
 *   secretKey: mySecretKey
 * });
 *
 * const encrypted = await nacl.encryptText('Secret message', {
 *   recipientPublicKey: theirPublicKey
 * });
 * const decrypted = await nacl.decryptText(encrypted);
 * ```
 */
export class NaClEncryption extends BaseEncryption {
  private options: NaClOptions;
  private secretKey?: Uint8Array;
  private publicKey?: Uint8Array;

  constructor(options: NaClOptions) {
    super('nacl', options.debug);
    this.options = options;
    this.initializeKeys();
  }

  /**
   * Initialize keys from options
   */
  private initializeKeys(): void {
    const encoding = this.options.encoding || 'base64';

    // Initialize secret key for symmetric encryption
    if (this.options.secretKey) {
      this.secretKey = this.parseKey(this.options.secretKey, encoding);
      if (this.secretKey.length !== nacl.secretbox.keyLength) {
        throw new InvalidKeyError(
          `NaCl secret key must be ${nacl.secretbox.keyLength} bytes`,
          this.adapterType,
        );
      }
    }

    // Initialize public key for asymmetric encryption
    if (this.options.publicKey) {
      this.publicKey = this.parseKey(this.options.publicKey, encoding);
      if (this.publicKey.length !== nacl.box.publicKeyLength) {
        throw new InvalidKeyError(
          `NaCl public key must be ${nacl.box.publicKeyLength} bytes`,
          this.adapterType,
        );
      }
    }
  }

  /**
   * Parse key from various formats
   */
  private parseKey(
    key: Uint8Array | Buffer | string,
    encoding: 'base64' | 'hex' | 'utf8',
  ): Uint8Array {
    if (key instanceof Uint8Array) {
      return key;
    }

    if (Buffer.isBuffer(key)) {
      return new Uint8Array(key);
    }

    if (typeof key === 'string') {
      if (encoding === 'base64') {
        return decodeBase64(key);
      }
      if (encoding === 'hex') {
        return new Uint8Array(Buffer.from(key, 'hex'));
      }
      if (encoding === 'utf8') {
        return decodeUTF8(key);
      }
    }

    throw new InvalidKeyError('Invalid key format for NaCl', this.adapterType);
  }

  /**
   * Format key for output
   */
  private formatKey(
    key: Uint8Array,
    encoding: 'base64' | 'hex' | 'utf8' = 'base64',
  ): string {
    if (encoding === 'base64') {
      return encodeBase64(key);
    }
    if (encoding === 'hex') {
      return Buffer.from(key).toString('hex');
    }
    if (encoding === 'utf8') {
      return encodeUTF8(key);
    }
    return encodeBase64(key);
  }

  async encryptText(text: string, options?: EncryptOptions): Promise<string> {
    try {
      this.log('Encrypting text', { length: text.length });

      const message = decodeUTF8(text);

      // Check if asymmetric or symmetric encryption
      if (options?.recipientPublicKey) {
        // Asymmetric encryption (box)
        return this.encryptAsymmetric(message, options);
      }

      // Symmetric encryption (secretbox)
      return this.encryptSymmetric(message);
    } catch (error) {
      throw new EncryptError(
        `Failed to encrypt text: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async decryptText(
    encrypted: string,
    options?: DecryptOptions,
  ): Promise<string> {
    try {
      this.log('Decrypting text', { length: encrypted.length });

      // Decode the encrypted message
      const encryptedData = decodeBase64(encrypted);

      // Extract nonce and ciphertext
      const nonceLength = nacl.secretbox.nonceLength;
      const nonce = encryptedData.slice(0, nonceLength);
      const ciphertext = encryptedData.slice(nonceLength);

      let decrypted: Uint8Array | null;

      // Try asymmetric decryption first if we have keys
      if (this.publicKey && this.secretKey) {
        // Check if there's a public key in the message (for box)
        if (ciphertext.length > nacl.box.publicKeyLength) {
          const senderPublicKey = ciphertext.slice(0, nacl.box.publicKeyLength);
          const actualCiphertext = ciphertext.slice(nacl.box.publicKeyLength);

          decrypted = nacl.box.open(
            actualCiphertext,
            nonce,
            senderPublicKey,
            this.secretKey,
          );

          if (decrypted) {
            this.log('Text decrypted successfully (asymmetric)');
            return encodeUTF8(decrypted);
          }
        }
      }

      // Try symmetric decryption
      if (this.secretKey) {
        decrypted = nacl.secretbox.open(ciphertext, nonce, this.secretKey);

        if (decrypted) {
          this.log('Text decrypted successfully (symmetric)');
          return encodeUTF8(decrypted);
        }
      }

      throw new DecryptError(
        'Decryption failed: invalid key or corrupted ciphertext',
        this.adapterType,
      );
    } catch (error) {
      if (error instanceof DecryptError) {
        throw error;
      }
      throw new DecryptError(
        `Failed to decrypt text: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async encryptBuffer(
    buffer: Buffer,
    options?: EncryptOptions,
  ): Promise<Buffer> {
    try {
      this.log('Encrypting buffer', { size: buffer.length });

      const message = new Uint8Array(buffer);

      // Check if asymmetric or symmetric encryption
      if (options?.recipientPublicKey) {
        // Asymmetric encryption (box)
        const encrypted = this.encryptAsymmetric(message, options);
        return Buffer.from(decodeBase64(encrypted));
      }

      // Symmetric encryption (secretbox)
      const encrypted = this.encryptSymmetric(message);
      return Buffer.from(decodeBase64(encrypted));
    } catch (error) {
      throw new EncryptError(
        `Failed to encrypt buffer: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async decryptBuffer(
    buffer: Buffer,
    options?: DecryptOptions,
  ): Promise<Buffer> {
    try {
      this.log('Decrypting buffer', { size: buffer.length });

      // Decode the base64 buffer
      const decoded = decodeBase64(buffer.toString('base64'));

      // Extract nonce and ciphertext
      const nonce = decoded.slice(0, nacl.secretbox.nonceLength);
      const ciphertext = decoded.slice(nacl.secretbox.nonceLength);

      let decrypted: Uint8Array | null = null;

      // Try asymmetric decryption first if we have keys
      if (this.publicKey && this.secretKey) {
        // Check if there's a public key in the message (for box)
        if (ciphertext.length > nacl.box.publicKeyLength) {
          const senderPublicKey = ciphertext.slice(0, nacl.box.publicKeyLength);
          const actualCiphertext = ciphertext.slice(nacl.box.publicKeyLength);

          decrypted = nacl.box.open(
            actualCiphertext,
            nonce,
            senderPublicKey,
            this.secretKey,
          );

          if (decrypted) {
            this.log('Buffer decrypted successfully (asymmetric)');
            return Buffer.from(decrypted);
          }
        }
      }

      // Try symmetric decryption
      if (this.secretKey) {
        decrypted = nacl.secretbox.open(ciphertext, nonce, this.secretKey);

        if (decrypted) {
          this.log('Buffer decrypted successfully (symmetric)');
          return Buffer.from(decrypted);
        }
      }

      throw new DecryptError(
        'Decryption failed: invalid key or corrupted ciphertext',
        this.adapterType,
      );
    } catch (error) {
      if (error instanceof DecryptError) {
        throw error;
      }
      throw new DecryptError(
        `Failed to decrypt buffer: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Symmetric encryption using secretbox
   */
  private encryptSymmetric(message: Uint8Array): string {
    if (!this.secretKey) {
      throw new KeyError(
        'Secret key required for symmetric encryption',
        this.adapterType,
      );
    }

    // Generate random nonce
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);

    // Encrypt the message
    const ciphertext = nacl.secretbox(message, nonce, this.secretKey);

    // Combine nonce and ciphertext
    const encrypted = new Uint8Array(nonce.length + ciphertext.length);
    encrypted.set(nonce);
    encrypted.set(ciphertext, nonce.length);

    return encodeBase64(encrypted);
  }

  /**
   * Asymmetric encryption using box
   */
  private encryptAsymmetric(
    message: Uint8Array,
    options: EncryptOptions,
  ): string {
    if (!this.secretKey) {
      throw new KeyError(
        'Secret key required for asymmetric encryption',
        this.adapterType,
      );
    }

    // Get recipient public key
    const recipientPublicKey = this.parseKey(
      options.recipientPublicKey as string | Uint8Array | Buffer,
      this.options.encoding || 'base64',
    );

    if (recipientPublicKey.length !== nacl.box.publicKeyLength) {
      throw new InvalidKeyError(
        `Recipient public key must be ${nacl.box.publicKeyLength} bytes`,
        this.adapterType,
      );
    }

    // Generate random nonce
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    // Encrypt the message
    const ciphertext = nacl.box(
      message,
      nonce,
      recipientPublicKey,
      this.secretKey,
    );

    // Include sender's public key in the message
    const senderPublicKey =
      this.publicKey ||
      nacl.box.keyPair.fromSecretKey(this.secretKey).publicKey;

    // Combine nonce, sender public key, and ciphertext
    const encrypted = new Uint8Array(
      nonce.length + senderPublicKey.length + ciphertext.length,
    );
    encrypted.set(nonce);
    encrypted.set(senderPublicKey, nonce.length);
    encrypted.set(ciphertext, nonce.length + senderPublicKey.length);

    return encodeBase64(encrypted);
  }

  async generateKeyPair(options?: KeyPairOptions): Promise<KeyPair> {
    try {
      this.log('Generating NaCl key pair', options);

      const keyType = options?.type || 'box';

      if (keyType === 'box' || keyType === 'ecdh') {
        // Generate encryption keypair
        const keypair = nacl.box.keyPair();

        this.log('Encryption key pair generated');

        return {
          publicKey: keypair.publicKey,
          privateKey: keypair.secretKey,
        };
      }

      if (keyType === 'ecdsa') {
        // Generate signing keypair
        const keypair = nacl.sign.keyPair();

        this.log('Signing key pair generated');

        return {
          publicKey: keypair.publicKey,
          privateKey: keypair.secretKey,
        };
      }

      throw new KeyError(
        `Unsupported key type for NaCl: ${keyType}. Use 'box' for encryption or 'sign' for signatures.`,
        this.adapterType,
      );
    } catch (error) {
      throw new KeyError(
        `Failed to generate NaCl key pair: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async importKey(
    key: string | Buffer,
    options?: ImportKeyOptions,
  ): Promise<Key> {
    try {
      this.log('Importing NaCl key');

      const encoding = this.options.encoding || 'base64';
      const keyData = typeof key === 'string' ? key : key.toString(encoding);
      const keyBytes = this.parseKey(keyData, encoding);

      const keyType = options?.type || 'public';
      const format = (options?.format || 'armored') as
        | 'armored'
        | 'binary'
        | 'pem'
        | 'der';

      // Validate key length
      const expectedLength =
        keyType === 'public'
          ? nacl.box.publicKeyLength
          : nacl.box.secretKeyLength;

      if (keyBytes.length !== expectedLength) {
        throw new InvalidKeyError(
          `NaCl ${keyType} key must be ${expectedLength} bytes`,
          this.adapterType,
        );
      }

      this.log('Key imported successfully');

      return {
        type: keyType as 'public' | 'private',
        format,
        data: keyData,
        algorithm: 'nacl',
      };
    } catch (error) {
      throw new InvalidKeyError(
        `Failed to import NaCl key: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async exportKey(
    key: Key,
    options?: ExportKeyOptions,
  ): Promise<string | Buffer> {
    try {
      this.log('Exporting NaCl key');

      const format = options?.format || key.format || 'armored';
      // Use NaCl encoding from options or default
      const encoding = this.options.encoding || 'base64';

      if (typeof key.data === 'string') {
        if (format === 'binary') {
          return Buffer.from(key.data, encoding);
        }
        return key.data;
      }

      if (Buffer.isBuffer(key.data)) {
        if (format === 'armored') {
          return key.data.toString(encoding);
        }
        return key.data;
      }

      if (key.data instanceof Uint8Array) {
        if (format === 'binary') {
          return Buffer.from(key.data);
        }
        return this.formatKey(key.data, encoding);
      }

      throw new InvalidKeyError(
        'Invalid key data format for export',
        this.adapterType,
      );
    } catch (error) {
      throw new KeyError(
        `Failed to export NaCl key: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Sign data with signing key
   */
  async sign(
    data: string | Buffer,
    options?: SignOptions,
  ): Promise<string | Buffer> {
    try {
      this.log('Signing data');

      // Get signing key
      let signingKey: Uint8Array;

      if (options?.privateKey) {
        signingKey = this.parseKey(
          options.privateKey,
          this.options.encoding || 'base64',
        );
      } else if (this.secretKey) {
        signingKey = this.secretKey;
      } else {
        throw new KeyError('No signing key available', this.adapterType);
      }

      // Validate key length for signing
      if (signingKey.length !== nacl.sign.secretKeyLength) {
        throw new InvalidKeyError(
          `NaCl signing key must be ${nacl.sign.secretKeyLength} bytes`,
          this.adapterType,
        );
      }

      // Prepare message
      const message =
        typeof data === 'string' ? decodeUTF8(data) : new Uint8Array(data);

      // Sign the message
      const signed = nacl.sign(message, signingKey);

      this.log('Data signed successfully');

      if (typeof data === 'string') {
        return encodeBase64(signed);
      }

      return Buffer.from(signed);
    } catch (error) {
      throw new SignatureError(
        `Failed to sign data: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Verify signature
   */
  async verify(
    data: string | Buffer,
    signature: string | Buffer,
    options?: VerifyOptions,
  ): Promise<boolean> {
    try {
      this.log('Verifying signature');

      if (!options?.publicKey) {
        throw new KeyError(
          'Public key required for signature verification',
          this.adapterType,
        );
      }

      // Get verification key
      const verificationKey = this.parseKey(
        options.publicKey,
        this.options.encoding || 'base64',
      );

      // Validate key length
      if (verificationKey.length !== nacl.sign.publicKeyLength) {
        throw new InvalidKeyError(
          `NaCl verification key must be ${nacl.sign.publicKeyLength} bytes`,
          this.adapterType,
        );
      }

      // Parse signed message
      const signedMessage =
        typeof signature === 'string'
          ? decodeBase64(signature)
          : new Uint8Array(signature);

      // Verify and open the signed message (extracts original message)
      const verified = nacl.sign.open(signedMessage, verificationKey);

      if (!verified) {
        this.log('Signature verification failed');
        return false;
      }

      // Compare extracted message with provided data
      const originalMessage =
        typeof data === 'string' ? decodeUTF8(data) : new Uint8Array(data);

      // Check if messages match
      if (verified.length !== originalMessage.length) {
        this.log('Signature verification failed: message mismatch');
        return false;
      }

      for (let i = 0; i < verified.length; i++) {
        if (verified[i] !== originalMessage[i]) {
          this.log('Signature verification failed: message mismatch');
          return false;
        }
      }

      this.log('Signature verified successfully');
      return true;
    } catch (error) {
      this.log('Signature verification failed', error);
      return false;
    }
  }

  async getCapabilities(): Promise<EncryptionCapabilities> {
    return {
      textEncryption: true,
      fileEncryption: true,
      bufferEncryption: true,
      streamEncryption: false,
      emailEncryption: false,
      signing: true,
      verification: true,
      keyGeneration: true,
      keyManagement: true,
      multipleRecipients: false,
      symmetricEncryption: true,
      asymmetricEncryption: true,
    };
  }
}
