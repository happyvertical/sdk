import * as openpgp from 'openpgp';
import { BaseEncryption } from '../shared/base.js';
import {
  DecryptError,
  EncryptError,
  InvalidKeyError,
  KeyError,
  PassphraseError,
  SignatureError,
  VerificationError,
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
  PGPOptions,
  SignOptions,
  VerifyOptions,
} from '../shared/types.js';

/**
 * PGP/OpenPGP encryption adapter
 *
 * Uses OpenPGP.js for encryption, decryption, signing, and key management.
 *
 * @example
 * ```typescript
 * const pgp = new PGPEncryption({
 *   type: 'pgp',
 *   publicKey: recipientPublicKey,
 *   privateKey: myPrivateKey,
 *   passphrase: 'my-passphrase'
 * });
 *
 * const encrypted = await pgp.encryptText('Secret message');
 * const decrypted = await pgp.decryptText(encrypted);
 * ```
 */
export class PGPEncryption extends BaseEncryption {
  private options: PGPOptions;
  private publicKeys?: openpgp.PublicKey[];
  private privateKeys?: openpgp.PrivateKey[];

  constructor(options: PGPOptions) {
    super('pgp', options.debug);
    this.options = options;
  }

  /**
   * Initialize keys from options
   */
  private async initializeKeys(): Promise<void> {
    if (this.publicKeys || this.privateKeys) {
      return; // Already initialized
    }

    try {
      // Load public keys
      if (this.options.publicKey) {
        const key = await openpgp.readKey({
          armoredKey: this.options.publicKey,
        });
        this.publicKeys = [key];
      } else if (this.options.publicKeys) {
        this.publicKeys = await Promise.all(
          this.options.publicKeys.map((k) =>
            openpgp.readKey({ armoredKey: k }),
          ),
        );
      }

      // Load private keys
      if (this.options.privateKey) {
        const key = await openpgp.readPrivateKey({
          armoredKey: this.options.privateKey,
        });

        // Decrypt private key if passphrase provided
        if (this.options.passphrase) {
          const decryptedKey = await openpgp.decryptKey({
            privateKey: key,
            passphrase: this.options.passphrase,
          });
          this.privateKeys = [decryptedKey];
        } else {
          this.privateKeys = [key];
        }
      } else if (this.options.privateKeys) {
        this.privateKeys = await Promise.all(
          this.options.privateKeys.map(async (k) => {
            const key = await openpgp.readPrivateKey({ armoredKey: k });
            if (this.options.passphrase) {
              return openpgp.decryptKey({
                privateKey: key,
                passphrase: this.options.passphrase,
              });
            }
            return key;
          }),
        );
      }
    } catch (error) {
      throw new KeyError(
        `Failed to initialize PGP keys: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Get public keys for encryption
   */
  private async getPublicKeys(
    options?: EncryptOptions,
  ): Promise<openpgp.PublicKey[]> {
    await this.initializeKeys();

    // Options override default keys
    if (options?.publicKeys) {
      return Promise.all(
        options.publicKeys.map((k) => openpgp.readKey({ armoredKey: k })),
      );
    }

    if (!this.publicKeys || this.publicKeys.length === 0) {
      throw new KeyError(
        'No public keys available for encryption',
        this.adapterType,
      );
    }

    return this.publicKeys;
  }

  /**
   * Get private keys for decryption
   */
  private async getPrivateKeys(
    options?: DecryptOptions,
  ): Promise<openpgp.PrivateKey[]> {
    await this.initializeKeys();

    // Options override default keys
    if (options?.privateKey) {
      const key = await openpgp.readPrivateKey({
        armoredKey: options.privateKey as string,
      });

      if (options.passphrase) {
        const decryptedKey = await openpgp.decryptKey({
          privateKey: key,
          passphrase: options.passphrase,
        });
        return [decryptedKey];
      }

      return [key];
    }

    if (!this.privateKeys || this.privateKeys.length === 0) {
      throw new KeyError(
        'No private keys available for decryption',
        this.adapterType,
      );
    }

    return this.privateKeys;
  }

  async encryptText(text: string, options?: EncryptOptions): Promise<string> {
    try {
      this.log('Encrypting text', { length: text.length });
      this.validateEncryptOptions(options);

      const publicKeys = await this.getPublicKeys(options);

      const format =
        options?.armor !== false ? ('armored' as const) : ('binary' as const);

      const encryptConfig: any = {
        message: await openpgp.createMessage({ text }),
        encryptionKeys: publicKeys,
        format,
      };

      // Add signing if requested
      if (options?.sign && options?.privateKey) {
        const signingKey = await openpgp.readPrivateKey({
          armoredKey: options.privateKey as string,
        });

        if (this.options.passphrase) {
          encryptConfig.signingKeys = await openpgp.decryptKey({
            privateKey: signingKey,
            passphrase: this.options.passphrase,
          });
        } else {
          encryptConfig.signingKeys = signingKey;
        }
      } else if (options?.sign && this.privateKeys) {
        encryptConfig.signingKeys = this.privateKeys;
      }

      const encrypted = await openpgp.encrypt(encryptConfig);

      this.log('Text encrypted successfully');

      // Convert binary output to base64 string for text encryption
      if (format === 'binary' && encrypted instanceof Uint8Array) {
        return Buffer.from(encrypted).toString('base64');
      }

      return encrypted as string;
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
      this.validateDecryptOptions(options);

      const privateKeys = await this.getPrivateKeys(options);

      // Try to read as armored message first, fallback to binary
      let message: openpgp.Message<any>;
      try {
        message = await openpgp.readMessage({
          armoredMessage: encrypted,
        });
      } catch {
        // If armored fails, try base64-encoded binary
        try {
          message = await openpgp.readMessage({
            binaryMessage: Buffer.from(encrypted, 'base64'),
          });
        } catch {
          // Last resort: try raw binary
          message = await openpgp.readMessage({
            binaryMessage: Buffer.from(encrypted, 'binary'),
          });
        }
      }

      const decryptConfig: openpgp.DecryptOptions = {
        message,
        decryptionKeys: privateKeys,
        format: 'utf8',
      };

      // Add verification if requested
      if (options?.verify && options?.publicKey) {
        if (typeof options.publicKey === 'string') {
          decryptConfig.verificationKeys = await openpgp.readKey({
            armoredKey: options.publicKey,
          });
        } else {
          throw new InvalidKeyError(
            'PGP verification requires armored public key string',
            this.adapterType,
          );
        }
      }

      const result = await openpgp.decrypt(decryptConfig);

      // Verify signature if requested
      if (options?.verify && result.signatures) {
        try {
          await result.signatures[0].verified;
          this.log('Signature verified successfully');
        } catch (error) {
          throw new VerificationError(
            'Signature verification failed',
            this.adapterType,
            error,
          );
        }
      }

      this.log('Text decrypted successfully');
      return result.data as string;
    } catch (error) {
      if (error instanceof VerificationError) {
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
      this.validateEncryptOptions(options);

      const publicKeys = await this.getPublicKeys(options);

      const format =
        options?.armor === true ? ('armored' as const) : ('binary' as const);

      const encryptConfig: any = {
        message: await openpgp.createMessage({ binary: buffer }),
        encryptionKeys: publicKeys,
        format,
      };

      // Add signing if requested
      if (options?.sign && options?.privateKey) {
        const signingKey = await openpgp.readPrivateKey({
          armoredKey: options.privateKey as string,
        });

        if (this.options.passphrase) {
          encryptConfig.signingKeys = await openpgp.decryptKey({
            privateKey: signingKey,
            passphrase: this.options.passphrase,
          });
        } else {
          encryptConfig.signingKeys = signingKey;
        }
      } else if (options?.sign && this.privateKeys) {
        encryptConfig.signingKeys = this.privateKeys;
      }

      const encrypted = await openpgp.encrypt(encryptConfig);

      this.log('Buffer encrypted successfully');

      if (typeof encrypted === 'string') {
        return Buffer.from(encrypted);
      }

      // Handle Uint8Array, WebStream, or NodeWebStream
      if (encrypted instanceof Uint8Array) {
        return Buffer.from(encrypted);
      }

      // Fallback for stream types (shouldn't happen with current config)
      return Buffer.from(encrypted as any);
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
      this.validateDecryptOptions(options);

      const privateKeys = await this.getPrivateKeys(options);

      // Try to read as armored message first, fallback to binary
      let message: any;
      try {
        message = await openpgp.readMessage({
          armoredMessage: buffer.toString('utf8'),
        });
      } catch {
        message = await openpgp.readMessage({
          binaryMessage: buffer,
        });
      }

      const decryptConfig: openpgp.DecryptOptions = {
        message,
        decryptionKeys: privateKeys,
        format: 'binary',
      };

      // Add verification if requested
      if (options?.verify && options?.publicKey) {
        if (typeof options.publicKey === 'string') {
          decryptConfig.verificationKeys = await openpgp.readKey({
            armoredKey: options.publicKey,
          });
        } else {
          throw new InvalidKeyError(
            'PGP verification requires armored public key string',
            this.adapterType,
          );
        }
      }

      const result = await openpgp.decrypt(decryptConfig);

      // Verify signature if requested
      if (options?.verify && result.signatures) {
        try {
          await result.signatures[0].verified;
          this.log('Signature verified successfully');
        } catch (error) {
          throw new VerificationError(
            'Signature verification failed',
            this.adapterType,
            error,
          );
        }
      }

      this.log('Buffer decrypted successfully');
      return Buffer.from(result.data as Uint8Array);
    } catch (error) {
      if (error instanceof VerificationError) {
        throw error;
      }
      throw new DecryptError(
        `Failed to decrypt buffer: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  async generateKeyPair(options?: KeyPairOptions): Promise<KeyPair> {
    try {
      this.log('Generating PGP key pair', options);

      const keyType = options?.type || 'rsa';
      const keySize = options?.keySize || 4096;

      let generateOptions: Parameters<typeof openpgp.generateKey>[0];

      if (keyType === 'rsa') {
        generateOptions = {
          type: 'rsa',
          rsaBits: keySize,
          userIDs: [
            {
              name: options?.name || '',
              email: options?.email || '',
            },
          ],
          passphrase: options?.passphrase,
          format: 'object',
        };
      } else if (keyType === 'ecc' || keyType === 'ecdh') {
        generateOptions = {
          type: 'ecc',
          curve: (options?.curve as any) || 'curve25519',
          userIDs: [
            {
              name: options?.name || '',
              email: options?.email || '',
            },
          ],
          passphrase: options?.passphrase,
          format: 'object',
        };
      } else {
        throw new KeyError(
          `Unsupported key type for PGP: ${keyType}`,
          this.adapterType,
        );
      }

      const { privateKey: privKeyObj, publicKey: pubKeyObj } =
        await openpgp.generateKey(generateOptions);

      // Armor the keys for return
      const publicKey = pubKeyObj.armor();
      const privateKey = privKeyObj.armor();

      const fingerprint = pubKeyObj.getFingerprint();
      const keyId = pubKeyObj.getKeyID().toHex();

      this.log('Key pair generated successfully', { keyId, fingerprint });

      return {
        publicKey,
        privateKey,
        fingerprint,
        keyId,
      };
    } catch (error) {
      throw new KeyError(
        `Failed to generate PGP key pair: ${(error as Error).message}`,
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
      this.log('Importing PGP key');

      const armoredKey = typeof key === 'string' ? key : key.toString('utf8');

      const keyType = options?.type || 'public';

      if (keyType === 'public') {
        const pubKey = await openpgp.readKey({ armoredKey });

        const expirationTime = await pubKey.getExpirationTime();

        return {
          type: 'public',
          format: 'armored',
          data: armoredKey,
          fingerprint: pubKey.getFingerprint(),
          keyId: pubKey.getKeyID().toHex(),
          algorithm: pubKey.getAlgorithmInfo().algorithm,
          created: pubKey.getCreationTime(),
          expires: expirationTime instanceof Date ? expirationTime : undefined,
          userIds: pubKey.getUserIDs().map((uid: string) => {
            const match = uid.match(/^(.*?)\s*<(.+?)>$/);
            if (match) {
              return { name: match[1], email: match[2] };
            }
            return { email: uid };
          }),
        };
      }

      // Private key
      const privKey = await openpgp.readPrivateKey({ armoredKey });

      // Decrypt if passphrase provided
      let decryptedKey = privKey;
      if (options?.passphrase) {
        try {
          decryptedKey = await openpgp.decryptKey({
            privateKey: privKey,
            passphrase: options.passphrase,
          });
        } catch (error) {
          throw new PassphraseError(
            'Invalid passphrase for private key',
            this.adapterType,
            error,
          );
        }
      }

      this.log('Key imported successfully');

      const expirationTime = await decryptedKey.getExpirationTime();

      return {
        type: 'private',
        format: 'armored',
        data: armoredKey,
        fingerprint: decryptedKey.getFingerprint(),
        keyId: decryptedKey.getKeyID().toHex(),
        algorithm: decryptedKey.getAlgorithmInfo().algorithm,
        created: decryptedKey.getCreationTime(),
        expires: expirationTime instanceof Date ? expirationTime : undefined,
        userIds: decryptedKey.getUserIDs().map((uid: string) => {
          const match = uid.match(/^(.*?)\s*<(.+?)>$/);
          if (match) {
            return { name: match[1], email: match[2] };
          }
          return { email: uid };
        }),
      };
    } catch (error) {
      if (error instanceof PassphraseError) {
        throw error;
      }
      throw new InvalidKeyError(
        `Failed to import PGP key: ${(error as Error).message}`,
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
      this.log('Exporting PGP key');

      // PGP keys are already in armored format
      if (typeof key.data === 'string') {
        if (options?.format === 'binary') {
          return Buffer.from(key.data);
        }
        return key.data;
      }

      if (Buffer.isBuffer(key.data)) {
        if (options?.format === 'armored' || options?.armor) {
          return key.data.toString('utf8');
        }
        return key.data;
      }

      throw new InvalidKeyError(
        'Invalid key data format for export',
        this.adapterType,
      );
    } catch (error) {
      throw new KeyError(
        `Failed to export PGP key: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Sign data with private key
   */
  async sign(
    data: string | Buffer,
    options?: SignOptions,
  ): Promise<string | Buffer> {
    try {
      this.log('Signing data');

      await this.initializeKeys();

      let signingKey: openpgp.PrivateKey;

      if (options?.privateKey) {
        signingKey = await openpgp.readPrivateKey({
          armoredKey: options.privateKey as string,
        });

        if (options.passphrase) {
          signingKey = await openpgp.decryptKey({
            privateKey: signingKey,
            passphrase: options.passphrase,
          });
        }
      } else if (this.privateKeys && this.privateKeys.length > 0) {
        signingKey = this.privateKeys[0];
      } else {
        throw new KeyError(
          'No private key available for signing',
          this.adapterType,
        );
      }

      const message =
        typeof data === 'string'
          ? await openpgp.createMessage({ text: data })
          : await openpgp.createMessage({ binary: data });

      const format =
        options?.armor !== false ? ('armored' as const) : ('binary' as const);

      // Sign with format
      const signed = await openpgp.sign({
        message,
        signingKeys: signingKey,
        detached: options?.detached,
        format,
      } as any);

      this.log('Data signed successfully');

      if (format === 'armored') {
        return signed as string;
      } else {
        // When format is 'binary', convert result to Buffer
        if (signed instanceof Uint8Array) {
          return Buffer.from(signed);
        }
        return Buffer.from(signed as any);
      }
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

      const verificationKey = await openpgp.readKey({
        armoredKey: options.publicKey as string,
      });

      // Check if this is a detached signature
      const signatureStr =
        typeof signature === 'string' ? signature : signature.toString('utf8');
      const isDetached = signatureStr.includes('-----BEGIN PGP SIGNATURE-----');

      if (isDetached) {
        // Detached signature verification
        const message =
          typeof data === 'string'
            ? await openpgp.createMessage({ text: data })
            : await openpgp.createMessage({ binary: data });

        const sig = await openpgp.readSignature({
          armoredSignature: signatureStr,
        });

        const result = await openpgp.verify({
          message: message as any,
          signature: sig,
          verificationKeys: verificationKey,
        } as any);

        await result.signatures[0].verified;
      } else {
        // Inline signature verification (signature embedded in message)
        let message: any;

        if (signatureStr.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
          // Cleartext signature
          message = await openpgp.readCleartextMessage({
            cleartextMessage: signatureStr,
          });
        } else {
          // Binary or armored signed message
          try {
            message = await openpgp.readMessage({
              armoredMessage: signatureStr,
            });
          } catch {
            message = await openpgp.readMessage({
              binaryMessage:
                typeof signature === 'string'
                  ? Buffer.from(signature, 'binary')
                  : signature,
            });
          }
        }

        const result = await openpgp.verify({
          message,
          verificationKeys: verificationKey,
        } as any);

        await result.signatures[0].verified;
      }

      this.log('Signature verified successfully');
      return true;
    } catch (error) {
      if (error instanceof KeyError) {
        throw error;
      }
      this.log('Signature verification failed', error);
      return false;
    }
  }

  /**
   * Encrypt email message in PGP/MIME format
   */
  async encryptEmail(
    message: import('../shared/types.js').EmailMessage,
    options?: import('../shared/types.js').EncryptEmailOptions,
  ): Promise<import('../shared/types.js').EmailMessage> {
    try {
      this.log('Encrypting email message');

      // Serialize email content (subject, text, html, attachments)
      const emailContent = this.serializeEmailContent(message, options);

      // Get public keys for encryption
      const publicKeys = await this.getPublicKeys({
        publicKeys: options?.publicKeys,
      });

      // Get private key for signing if requested
      let signingKey: openpgp.PrivateKey | undefined;
      if (options?.sign) {
        await this.initializeKeys();
        if (options.privateKey) {
          const key = await openpgp.readPrivateKey({
            armoredKey: options.privateKey,
          });
          if (options.passphrase) {
            signingKey = await openpgp.decryptKey({
              privateKey: key,
              passphrase: options.passphrase,
            });
          } else {
            signingKey = key;
          }
        } else if (this.privateKeys && this.privateKeys.length > 0) {
          signingKey = this.privateKeys[0];
        }
      }

      // Encrypt the email content
      const encryptConfig: any = {
        message: await openpgp.createMessage({ text: emailContent }),
        encryptionKeys: publicKeys,
        format:
          options?.armor !== false ? ('armored' as const) : ('binary' as const),
      };

      if (signingKey) {
        encryptConfig.signingKeys = signingKey;
      }

      const encrypted = await openpgp.encrypt(encryptConfig);

      this.log('Email encrypted successfully');

      // Return encrypted message in PGP/MIME format
      return {
        ...message,
        text: encrypted as string,
        html: undefined, // Clear HTML when encrypted
        contentType:
          'multipart/encrypted; protocol="application/pgp-encrypted"',
        headers: {
          ...(message.headers || {}),
          'Content-Type':
            'multipart/encrypted; protocol="application/pgp-encrypted"',
        },
      };
    } catch (error) {
      throw new EncryptError(
        `Failed to encrypt email: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Decrypt PGP/MIME email message
   */
  async decryptEmail(
    message: import('../shared/types.js').EmailMessage,
    options?: import('../shared/types.js').DecryptEmailOptions,
  ): Promise<import('../shared/types.js').DecryptedEmail> {
    try {
      this.log('Decrypting email message');

      if (!message.text) {
        throw new DecryptError(
          'Email message has no text content to decrypt',
          this.adapterType,
        );
      }

      // Get private keys for decryption
      const privateKeys = await this.getPrivateKeys({
        privateKey: options?.privateKey,
        passphrase: options?.passphrase,
      });

      // Read encrypted message
      let encryptedMessage: openpgp.Message<any>;
      try {
        encryptedMessage = await openpgp.readMessage({
          armoredMessage: message.text,
        });
      } catch {
        encryptedMessage = await openpgp.readMessage({
          binaryMessage: Buffer.from(message.text, 'base64'),
        });
      }

      // Decrypt the message
      const decryptConfig: openpgp.DecryptOptions = {
        message: encryptedMessage,
        decryptionKeys: privateKeys,
        format: 'utf8',
      };

      // Add verification if requested
      if (options?.verify) {
        const verificationKey = options.publicKey || this.options.publicKey;
        if (verificationKey) {
          decryptConfig.verificationKeys = await openpgp.readKey({
            armoredKey: verificationKey,
          });
        }
      }

      const result = await openpgp.decrypt(decryptConfig);
      const decryptedContent = result.data as string;

      // Verify signature if requested
      let verified = false;
      let verificationError: string | undefined;
      let signerKeyId: string | undefined;
      let signerFingerprint: string | undefined;

      if (options?.verify) {
        const verificationKey = options.publicKey || this.options.publicKey;

        if (!verificationKey) {
          verificationError = 'Public key required for signature verification';
          this.log('Email signature verification skipped: no public key');
        } else if (!result.signatures || result.signatures.length === 0) {
          verificationError = 'No signature found in message';
          this.log('Email signature verification skipped: no signatures');
        } else {
          try {
            // Verify the signature
            await result.signatures[0].verified;
            verified = true;
            signerKeyId = result.signatures[0].keyID.toHex();
            // Get fingerprint from verification key
            const pubKey = await openpgp.readKey({
              armoredKey: verificationKey,
            });
            signerFingerprint = pubKey.getFingerprint();
            this.log('Email signature verified successfully');
          } catch (error) {
            verificationError =
              error instanceof Error ? error.message : String(error);
            this.log('Email signature verification failed', error);
          }
        }
      }

      // Deserialize email content
      const deserializedMessage = this.deserializeEmailContent(
        decryptedContent,
        message,
      );

      this.log('Email decrypted successfully');

      return {
        ...deserializedMessage,
        encrypted: true,
        signed: result.signatures && result.signatures.length > 0,
        verified: options?.verify ? verified : undefined,
        verificationError,
        signerKeyId,
        signerFingerprint,
        encryptionAlgorithm: 'pgp',
      };
    } catch (error) {
      if (error instanceof DecryptError) {
        throw error;
      }
      throw new DecryptError(
        `Failed to decrypt email: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Sign email message
   */
  async signEmail(
    message: import('../shared/types.js').EmailMessage,
    options?: import('../shared/types.js').SignEmailOptions,
  ): Promise<import('../shared/types.js').EmailMessage> {
    try {
      this.log('Signing email message');

      // Serialize email content
      const emailContent = this.serializeEmailContent(message);

      // Get signing key
      await this.initializeKeys();
      let signingKey: openpgp.PrivateKey;

      if (options?.privateKey) {
        const key = await openpgp.readPrivateKey({
          armoredKey: options.privateKey as string,
        });
        if (options.passphrase) {
          signingKey = await openpgp.decryptKey({
            privateKey: key,
            passphrase: options.passphrase,
          });
        } else {
          signingKey = key;
        }
      } else if (this.privateKeys && this.privateKeys.length > 0) {
        signingKey = this.privateKeys[0];
      } else {
        throw new KeyError(
          'No private key available for signing email',
          this.adapterType,
        );
      }

      // Sign the message (cleartext signature)
      const signedMessageObj = await openpgp.sign({
        message: await openpgp.createCleartextMessage({ text: emailContent }),
        signingKeys: signingKey,
        format: 'object' as const,
      });

      // Convert to armored string
      const signedMessage = signedMessageObj.armor();

      this.log('Email signed successfully');

      return {
        ...message,
        text: signedMessage,
        contentType: 'text/plain; charset=utf-8',
        headers: {
          ...(message.headers || {}),
          'Content-Type': 'text/plain; charset=utf-8',
        },
      };
    } catch (error) {
      throw new SignatureError(
        `Failed to sign email: ${(error as Error).message}`,
        this.adapterType,
        error,
      );
    }
  }

  /**
   * Verify email signature
   */
  async verifyEmail(
    message: import('../shared/types.js').EmailMessage,
    options?: import('../shared/types.js').VerifyEmailOptions,
  ): Promise<import('../shared/types.js').VerificationResult> {
    try {
      this.log('Verifying email signature');

      if (!message.text) {
        return {
          valid: false,
          message: 'Email message has no text content to verify',
        };
      }

      if (!options?.publicKey) {
        return {
          valid: false,
          message: 'Public key required for email signature verification',
        };
      }

      const verificationKey = await openpgp.readKey({
        armoredKey: options.publicKey as string,
      });

      // Read signed message
      const signedMessage = await openpgp.readCleartextMessage({
        cleartextMessage: message.text,
      });

      // Verify the signature
      const result = await openpgp.verify({
        message: signedMessage,
        verificationKeys: verificationKey,
      });

      await result.signatures[0].verified;

      const keyId = result.signatures[0].keyID.toHex();
      const fingerprint = verificationKey.getFingerprint();

      this.log('Email signature verified successfully');

      return {
        valid: true,
        keyId,
        keyFingerprint: fingerprint,
        timestamp: new Date(),
        algorithm: 'pgp',
      };
    } catch (error) {
      this.log('Email signature verification failed', error);
      return {
        valid: false,
        message: (error as Error).message,
      };
    }
  }

  /**
   * Serialize email content for encryption/signing
   */
  private serializeEmailContent(
    message: import('../shared/types.js').EmailMessage,
    options?: import('../shared/types.js').EncryptEmailOptions,
  ): string {
    const parts: string[] = [];

    // Add subject (optionally encrypt it)
    if (options?.encryptSubject) {
      parts.push(`Subject: ${message.subject}`);
    }

    // Add text content
    if (message.text) {
      parts.push(`\n${message.text}`);
    }

    // Add HTML content
    if (message.html) {
      parts.push(`\n--- HTML Content ---\n${message.html}`);
    }

    // Add attachment metadata (not the actual content)
    if (message.attachments && message.attachments.length > 0) {
      parts.push('\n--- Attachments ---');
      for (const attachment of message.attachments) {
        parts.push(
          `- ${attachment.filename || 'unnamed'} (${attachment.contentType}, ${attachment.size} bytes)`,
        );
      }
    }

    return parts.join('\n');
  }

  /**
   * Deserialize email content after decryption
   */
  private deserializeEmailContent(
    content: string,
    originalMessage: import('../shared/types.js').EmailMessage,
  ): import('../shared/types.js').EmailMessage {
    const lines = content.split('\n');
    let subject = originalMessage.subject;
    let text = '';
    let html: string | undefined;

    // Parse decrypted content
    let currentSection = 'text';
    for (const line of lines) {
      if (line.startsWith('Subject: ')) {
        subject = line.substring(9);
      } else if (line === '--- HTML Content ---') {
        currentSection = 'html';
      } else if (line === '--- Attachments ---') {
        break; // Stop at attachments
      } else if (currentSection === 'text' && line.trim()) {
        text += `${line}\n`;
      } else if (currentSection === 'html') {
        if (!html) html = '';
        html += `${line}\n`;
      }
    }

    return {
      ...originalMessage,
      subject,
      text: text.trim(),
      html: html?.trim(),
    };
  }

  async getCapabilities(): Promise<EncryptionCapabilities> {
    return {
      textEncryption: true,
      fileEncryption: true,
      bufferEncryption: true,
      streamEncryption: true,
      emailEncryption: true,
      signing: true,
      verification: true,
      keyGeneration: true,
      keyManagement: true,
      multipleRecipients: true,
      symmetricEncryption: false,
      asymmetricEncryption: true,
    };
  }
}
