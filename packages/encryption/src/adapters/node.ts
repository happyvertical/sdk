import * as crypto from 'node:crypto';
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
  NodeCryptoOptions,
  SignOptions,
  VerifyOptions,
} from '../shared/types.js';

/**
 * Node.js crypto adapter
 *
 * Uses Node.js built-in crypto module for standard encryption algorithms
 * (AES, RSA, ECDH, ECDSA, etc.).
 *
 * @example
 * ```typescript
 * const crypto = new NodeCryptoEncryption({
 *   type: 'node',
 *   algorithm: 'aes-256-gcm',
 *   key: encryptionKey
 * });
 *
 * const encrypted = await crypto.encryptText('Secret message');
 * const decrypted = await crypto.decryptText(encrypted);
 * ```
 */
export class NodeCryptoEncryption extends BaseEncryption {
  private options: NodeCryptoOptions;
  private key?: Buffer;
  private publicKey?: crypto.KeyObject;
  private privateKey?: crypto.KeyObject;

  constructor(options: NodeCryptoOptions) {
    super('node', options.debug);
    this.options = options;
    this.initializeKeys();
  }

  /**
   * Initialize keys from options
   */
  private initializeKeys(): void {
    // Derive key from password if specified
    if (this.options.keyDerivation) {
      this.key = this.deriveKey(this.options.keyDerivation);
    } else if (this.options.key) {
      this.key = this.parseBuffer(this.options.key);
    }

    // Initialize asymmetric keys
    if (this.options.publicKey) {
      this.publicKey = this.importPublicKeyObject(this.options.publicKey);
    }

    if (this.options.privateKey) {
      this.privateKey = this.importPrivateKeyObject(
        this.options.privateKey,
        this.options.passphrase,
      );
    }
  }

  /**
   * Derive key from password using PBKDF2
   */
  private deriveKey(
    derivation: NonNullable<NodeCryptoOptions['keyDerivation']>,
  ): Buffer {
    const salt = derivation.salt
      ? this.parseBuffer(derivation.salt)
      : crypto.randomBytes(16);
    const iterations = derivation.iterations || 100000;
    const keyLength = derivation.keyLength || this.getKeyLength();
    const digest = derivation.digest || 'sha256';

    return crypto.pbkdf2Sync(
      derivation.password,
      salt,
      iterations,
      keyLength,
      digest,
    );
  }

  /**
   * Get key length for current algorithm
   */
  private getKeyLength(): number {
    const algo = this.options.algorithm.toLowerCase();
    if (algo.includes('256')) return 32;
    if (algo.includes('192')) return 24;
    if (algo.includes('128')) return 16;
    return 32; // Default to 256 bits
  }

  /**
   * Parse buffer from string or Buffer
   */
  private parseBuffer(data: string | Buffer): Buffer {
    if (Buffer.isBuffer(data)) return data;

    const encoding = this.options.encoding || 'hex';
    if (encoding === 'hex') return Buffer.from(data, 'hex');
    if (encoding === 'base64') return Buffer.from(data, 'base64');
    if (encoding === 'utf8') return Buffer.from(data, 'utf8');

    return Buffer.from(data, 'hex');
  }

  /**
   * Import public key from PEM/DER
   */
  private importPublicKeyObject(key: string | Buffer): crypto.KeyObject {
    try {
      return crypto.createPublicKey(key);
    } catch (error) {
      throw new InvalidKeyError(
        `Failed to import public key: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Import private key from PEM/DER
   */
  private importPrivateKeyObject(
    key: string | Buffer,
    passphrase?: string,
  ): crypto.KeyObject {
    try {
      if (passphrase) {
        return crypto.createPrivateKey({ key, passphrase });
      }
      return crypto.createPrivateKey(key);
    } catch (error) {
      throw new InvalidKeyError(
        `Failed to import private key: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Check if algorithm is symmetric (AES)
   */
  private isSymmetric(): boolean {
    const algo = this.options.algorithm.toLowerCase();
    return algo.startsWith('aes-') || algo.includes('cipher');
  }

  /**
   * Check if algorithm is RSA
   */
  private isRSA(): boolean {
    const algo = this.options.algorithm.toLowerCase();
    return algo.startsWith('rsa');
  }

  async encryptText(text: string, options?: EncryptOptions): Promise<string> {
    try {
      this.log('Encrypting text', { length: text.length });

      if (this.isSymmetric()) {
        return this.encryptSymmetric(Buffer.from(text, 'utf8'));
      }

      if (this.isRSA()) {
        return this.encryptAsymmetric(Buffer.from(text, 'utf8'));
      }

      throw new EncryptError(
        `Unsupported encryption algorithm: ${this.options.algorithm}`,
        this.adapterType,
      );
    } catch (error) {
      if (error instanceof EncryptError) throw error;
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

      if (this.isSymmetric()) {
        const decrypted = this.decryptSymmetric(encrypted);
        return decrypted.toString('utf8');
      }

      if (this.isRSA()) {
        const decrypted = this.decryptAsymmetric(encrypted);
        return decrypted.toString('utf8');
      }

      throw new DecryptError(
        `Unsupported decryption algorithm: ${this.options.algorithm}`,
        this.adapterType,
      );
    } catch (error) {
      if (error instanceof DecryptError) throw error;
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

      if (this.isSymmetric()) {
        const encrypted = this.encryptSymmetric(buffer);
        return Buffer.from(encrypted, 'base64');
      }

      if (this.isRSA()) {
        const encrypted = this.encryptAsymmetric(buffer);
        return Buffer.from(encrypted, 'base64');
      }

      throw new EncryptError(
        `Unsupported encryption algorithm: ${this.options.algorithm}`,
        this.adapterType,
      );
    } catch (error) {
      if (error instanceof EncryptError) throw error;
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

      const base64 = buffer.toString('base64');

      if (this.isSymmetric()) {
        return this.decryptSymmetric(base64);
      }

      if (this.isRSA()) {
        return this.decryptAsymmetric(base64);
      }

      throw new DecryptError(
        `Unsupported decryption algorithm: ${this.options.algorithm}`,
        this.adapterType,
      );
    } catch (error) {
      if (error instanceof DecryptError) throw error;
      throw new DecryptError(
        `Failed to decrypt buffer: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Symmetric encryption (AES)
   */
  private encryptSymmetric(data: Buffer): string {
    if (!this.key) {
      throw new KeyError(
        'Encryption key required for symmetric encryption',
        this.adapterType,
      );
    }

    const algorithm = this.options.algorithm;
    const isGCM = algorithm.toLowerCase().includes('gcm');

    // Generate IV
    const ivLength = isGCM ? 12 : 16; // GCM uses 12 bytes, CBC uses 16
    const iv = this.options.iv
      ? this.parseBuffer(this.options.iv)
      : crypto.randomBytes(ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(algorithm, this.key, iv);

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    // For GCM, get auth tag
    let authTag: Buffer | undefined;
    if (isGCM) {
      authTag = (cipher as crypto.CipherGCM).getAuthTag();
    }

    // Combine: iv + (authTag if GCM) + encrypted
    let result: Buffer;
    if (authTag) {
      result = Buffer.concat([iv, authTag, encrypted]);
    } else {
      result = Buffer.concat([iv, encrypted]);
    }

    return result.toString('base64');
  }

  /**
   * Symmetric decryption (AES)
   */
  private decryptSymmetric(encrypted: string): Buffer {
    if (!this.key) {
      throw new KeyError(
        'Decryption key required for symmetric decryption',
        this.adapterType,
      );
    }

    const algorithm = this.options.algorithm;
    const isGCM = algorithm.toLowerCase().includes('gcm');

    const encryptedBuffer = Buffer.from(encrypted, 'base64');

    // Extract IV
    const ivLength = isGCM ? 12 : 16;
    const iv = encryptedBuffer.subarray(0, ivLength);

    // Extract auth tag if GCM
    let authTag: Buffer | undefined;
    let ciphertext: Buffer;
    if (isGCM) {
      authTag = encryptedBuffer.subarray(ivLength, ivLength + 16);
      ciphertext = encryptedBuffer.subarray(ivLength + 16);
    } else {
      ciphertext = encryptedBuffer.subarray(ivLength);
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(algorithm, this.key, iv);

    // Set auth tag for GCM
    if (authTag) {
      (decipher as crypto.DecipherGCM).setAuthTag(authTag);
    }

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted;
  }

  /**
   * Asymmetric encryption (RSA)
   */
  private encryptAsymmetric(data: Buffer): string {
    if (!this.publicKey) {
      throw new KeyError(
        'Public key required for asymmetric encryption',
        this.adapterType,
      );
    }

    const encrypted = crypto.publicEncrypt(
      {
        key: this.publicKey,
        padding: this.getRSAPadding(),
      },
      data,
    );

    return encrypted.toString('base64');
  }

  /**
   * Asymmetric decryption (RSA)
   */
  private decryptAsymmetric(encrypted: string): Buffer {
    if (!this.privateKey) {
      throw new KeyError(
        'Private key required for asymmetric decryption',
        this.adapterType,
      );
    }

    const encryptedBuffer = Buffer.from(encrypted, 'base64');

    const decrypted = crypto.privateDecrypt(
      {
        key: this.privateKey,
        padding: this.getRSAPadding(),
      },
      encryptedBuffer,
    );

    return decrypted;
  }

  /**
   * Get RSA padding mode
   */
  private getRSAPadding(): number {
    const algo = this.options.algorithm.toLowerCase();
    if (algo.includes('oaep')) {
      return crypto.constants.RSA_PKCS1_OAEP_PADDING;
    }
    if (algo.includes('pss')) {
      return crypto.constants.RSA_PKCS1_PSS_PADDING;
    }
    return crypto.constants.RSA_PKCS1_PADDING;
  }

  async generateKeyPair(options?: KeyPairOptions): Promise<KeyPair> {
    try {
      this.log('Generating key pair', options);

      const keyType = options?.type || 'rsa';

      if (keyType === 'rsa') {
        const modulusLength = options?.keySize || 2048;
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            ...(options?.passphrase && {
              cipher: 'aes-256-cbc',
              passphrase: options.passphrase,
            }),
          },
        });

        this.log('RSA key pair generated');

        return { publicKey, privateKey };
      }

      if (keyType === 'ecc' || keyType === 'ecdh') {
        const curve = options?.curve || 'prime256v1';
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
          namedCurve: curve,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            ...(options?.passphrase && {
              cipher: 'aes-256-cbc',
              passphrase: options.passphrase,
            }),
          },
        });

        this.log('EC key pair generated');

        return { publicKey, privateKey };
      }

      if (keyType === 'ecdsa') {
        const curve = options?.curve || 'prime256v1';
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
          namedCurve: curve,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
            ...(options?.passphrase && {
              cipher: 'aes-256-cbc',
              passphrase: options.passphrase,
            }),
          },
        });

        this.log('ECDSA key pair generated');

        return { publicKey, privateKey };
      }

      throw new KeyError(
        `Unsupported key type for Node crypto: ${keyType}`,
        this.adapterType,
      );
    } catch (error) {
      throw new KeyError(
        `Failed to generate key pair: ${(error as Error).message}`,
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
      this.log('Importing key');

      const keyType = options?.type || 'public';

      if (keyType === 'public') {
        const keyObj = crypto.createPublicKey(key);
        const exported = keyObj.export({
          type: 'spki',
          format: 'pem',
        });

        return {
          type: 'public',
          format: 'pem',
          data: exported.toString(),
          algorithm: 'node',
        };
      }

      if (keyType === 'private') {
        const keyObj = options?.passphrase
          ? crypto.createPrivateKey({ key, passphrase: options.passphrase })
          : crypto.createPrivateKey(key);

        const exported = keyObj.export({
          type: 'pkcs8',
          format: 'pem',
        });

        return {
          type: 'private',
          format: 'pem',
          data: exported.toString(),
          algorithm: 'node',
        };
      }

      throw new InvalidKeyError(
        `Unsupported key type: ${keyType}`,
        this.adapterType,
      );
    } catch (error) {
      throw new InvalidKeyError(
        `Failed to import key: ${(error as Error).message}`,
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
      this.log('Exporting key');

      const format = options?.format || key.format || 'pem';

      if (format === 'pem' || format === 'armored') {
        return key.data as string;
      }

      if (format === 'binary' || format === 'der') {
        if (typeof key.data === 'string') {
          return Buffer.from(key.data);
        }
        return key.data as Buffer;
      }

      return key.data as string;
    } catch (error) {
      throw new KeyError(
        `Failed to export key: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Sign data
   */
  async sign(
    data: string | Buffer,
    options?: SignOptions,
  ): Promise<string | Buffer> {
    try {
      this.log('Signing data');

      const privateKey = options?.privateKey
        ? this.importPrivateKeyObject(
            options.privateKey as string | Buffer,
            options.passphrase,
          )
        : this.privateKey;

      if (!privateKey) {
        throw new KeyError(
          'No private key available for signing',
          this.adapterType,
        );
      }

      const message =
        typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

      const signature = crypto.sign(null, message, privateKey);

      this.log('Data signed successfully');

      if (typeof data === 'string') {
        return signature.toString('base64');
      }

      return signature;
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
        return false;
      }

      const publicKey = this.importPublicKeyObject(
        options.publicKey as string | Buffer,
      );

      const message =
        typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const sig =
        typeof signature === 'string'
          ? Buffer.from(signature, 'base64')
          : signature;

      const valid = crypto.verify(null, message, publicKey, sig);

      this.log(valid ? 'Signature verified' : 'Signature verification failed');

      return valid;
    } catch (error) {
      this.log('Signature verification failed', error);
      return false;
    }
  }

  async getCapabilities(): Promise<EncryptionCapabilities> {
    const algorithm = this.options.algorithm.toLowerCase();

    // Determine if algorithm is symmetric or asymmetric
    const symmetricAlgorithms = [
      'aes-256-gcm',
      'aes-256-cbc',
      'aes-128-gcm',
      'aes-128-cbc',
    ];
    const asymmetricAlgorithms = [
      'rsa',
      'rsa-oaep',
      'rsa-pss',
      'ecdh',
      'ecdsa',
    ];

    const isSymmetric = symmetricAlgorithms.includes(algorithm);
    const isAsymmetric = asymmetricAlgorithms.some((algo) =>
      algorithm.includes(algo),
    );

    return {
      textEncryption: true,
      fileEncryption: true,
      bufferEncryption: true,
      streamEncryption: true,
      emailEncryption: false,
      signing: true,
      verification: true,
      keyGeneration: true,
      keyManagement: true,
      multipleRecipients: false,
      symmetricEncryption: isSymmetric,
      asymmetricEncryption: isAsymmetric,
    };
  }
}
