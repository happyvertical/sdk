import { describe, expect, it } from 'vitest';
import {
  getEncryption,
  isNaClOptions,
  isNodeCryptoOptions,
  isPGPOptions
} from '../../src/index.js';
import type {
  GetEncryptionOptions,
  NaClOptions,
  NodeCryptoOptions,
  PGPOptions
} from '../../src/index.js';

describe('Factory - Type Guards', () => {
  it('should identify PGP options correctly', () => {
    const pgpOpts: GetEncryptionOptions = {
      type: 'pgp',
      publicKey: 'test-key'
    };

    expect(isPGPOptions(pgpOpts)).toBe(true);
    expect(isNaClOptions(pgpOpts)).toBe(false);
    expect(isNodeCryptoOptions(pgpOpts)).toBe(false);
  });

  it('should identify NaCl options correctly', () => {
    const naclOpts: GetEncryptionOptions = {
      type: 'nacl',
      secretKey: 'test-key'
    };

    expect(isNaClOptions(naclOpts)).toBe(true);
    expect(isPGPOptions(naclOpts)).toBe(false);
    expect(isNodeCryptoOptions(naclOpts)).toBe(false);
  });

  it('should identify Node crypto options correctly', () => {
    const nodeOpts: GetEncryptionOptions = {
      type: 'node',
      algorithm: 'aes-256-gcm',
      key: Buffer.from('test-key')
    };

    expect(isNodeCryptoOptions(nodeOpts)).toBe(true);
    expect(isPGPOptions(nodeOpts)).toBe(false);
    expect(isNaClOptions(nodeOpts)).toBe(false);
  });
});

describe('Factory - getEncryption()', () => {
  describe('Validation', () => {
    it('should throw error for missing type', async () => {
      await expect(getEncryption({} as GetEncryptionOptions)).rejects.toThrow(
        'Encryption adapter type is required'
      );
    });

    it('should throw error for invalid type', async () => {
      await expect(
        getEncryption({ type: 'invalid' } as GetEncryptionOptions)
      ).rejects.toThrow('Invalid encryption adapter type');
    });

    it('should accept valid PGP configuration without keys', async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      expect(pgp.getAdapter()).toBe('pgp');
    });

    it('should accept valid NaCl configuration without keys', async () => {
      const nacl = await getEncryption({ type: 'nacl' });
      expect(nacl.getAdapter()).toBe('nacl');
    });

    it('should throw error for Node crypto without algorithm', async () => {
      await expect(
        getEncryption({ type: 'node' } as NodeCryptoOptions)
      ).rejects.toThrow('Node crypto algorithm is required');
    });
  });

  describe('PGP Options Validation', () => {
    it('should accept PGP with public key', async () => {
      const pgp = await getEncryption({
        type: 'pgp',
        publicKey: 'test-public-key'
      });
      expect(pgp.getAdapter()).toBe('pgp');
    });

    it('should accept PGP with private key', async () => {
      const pgp = await getEncryption({
        type: 'pgp',
        privateKey: 'test-private-key',
        passphrase: 'test-passphrase'
      });
      expect(pgp.getAdapter()).toBe('pgp');
    });

    it('should accept PGP with multiple keys', async () => {
      const pgp = await getEncryption({
        type: 'pgp',
        publicKeys: ['key1', 'key2'],
        privateKeys: ['private1']
      });
      expect(pgp.getAdapter()).toBe('pgp');
    });

    it('should reject invalid armor option', async () => {
      await expect(
        getEncryption({
          type: 'pgp',
          armor: 'yes' as unknown as boolean
        } as PGPOptions)
      ).rejects.toThrow('PGP armor option must be a boolean');
    });

    it('should reject invalid compression option', async () => {
      await expect(
        getEncryption({
          type: 'pgp',
          compression: 'yes' as unknown as boolean
        } as PGPOptions)
      ).rejects.toThrow('PGP compression option must be a boolean');
    });
  });

  describe('NaCl Options Validation', () => {
    it('should accept NaCl with secret key', async () => {
      // Generate a valid 32-byte key
      const validSecretKey = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        validSecretKey[i] = i;
      }

      const nacl = await getEncryption({
        type: 'nacl',
        secretKey: validSecretKey
      });
      expect(nacl.getAdapter()).toBe('nacl');
    });

    it('should accept NaCl with public key', async () => {
      // Generate a valid 32-byte public key
      const validPublicKey = Buffer.alloc(32);
      for (let i = 0; i < 32; i++) {
        validPublicKey[i] = i + 32;
      }

      const nacl = await getEncryption({
        type: 'nacl',
        publicKey: validPublicKey
      });
      expect(nacl.getAdapter()).toBe('nacl');
    });

    it('should reject invalid encoding', async () => {
      await expect(
        getEncryption({
          type: 'nacl',
          encoding: 'invalid' as 'base64'
        } as NaClOptions)
      ).rejects.toThrow('Invalid NaCl encoding');
    });

    it('should reject empty secret key string', async () => {
      await expect(
        getEncryption({
          type: 'nacl',
          secretKey: ''
        })
      ).rejects.toThrow('NaCl secret key cannot be empty string');
    });

    it('should reject empty public key string', async () => {
      await expect(
        getEncryption({
          type: 'nacl',
          publicKey: ''
        })
      ).rejects.toThrow('NaCl public key cannot be empty string');
    });
  });

  describe('Node Crypto Options Validation', () => {
    it('should accept symmetric algorithm with key', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: Buffer.from('32-byte-key-for-aes-256-gcm!!')
      });
      expect(crypto.getAdapter()).toBe('node');
    });

    it('should accept symmetric algorithm with key derivation', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          password: 'my-password',
          salt: 'my-salt',
          iterations: 100000
        }
      });
      expect(crypto.getAdapter()).toBe('node');
    });

    it('should accept asymmetric algorithm without keys', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });
      expect(crypto.getAdapter()).toBe('node');
    });

    it('should reject invalid encoding', async () => {
      await expect(
        getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          key: Buffer.from('key'),
          encoding: 'invalid' as 'hex'
        } as NodeCryptoOptions)
      ).rejects.toThrow('Invalid Node crypto encoding');
    });

    it('should reject key derivation without password', async () => {
      await expect(
        getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          keyDerivation: {
            password: '',
            salt: 'salt'
          }
        })
      ).rejects.toThrow('Key derivation password is required');
    });

    it('should reject low iteration count', async () => {
      await expect(
        getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          keyDerivation: {
            password: 'password',
            iterations: 100
          }
        })
      ).rejects.toThrow('Key derivation iterations must be at least 1000');
    });

    it('should reject small key length', async () => {
      await expect(
        getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          keyDerivation: {
            password: 'password',
            keyLength: 8
          }
        })
      ).rejects.toThrow('Key derivation key length must be at least 16 bytes');
    });

    it('should accept symmetric algorithm without key (for key generation)', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm'
      });
      expect(crypto.getAdapter()).toBe('node');
    });
  });

  describe('Adapter Creation', () => {
    it('should create PGP adapter instance', async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      expect(pgp).toBeDefined();
      expect(pgp.getAdapter()).toBe('pgp');
      expect(typeof pgp.encryptText).toBe('function');
      expect(typeof pgp.decryptText).toBe('function');
    });

    it('should create NaCl adapter instance', async () => {
      const nacl = await getEncryption({ type: 'nacl' });
      expect(nacl).toBeDefined();
      expect(nacl.getAdapter()).toBe('nacl');
      expect(typeof nacl.encryptText).toBe('function');
      expect(typeof nacl.decryptText).toBe('function');
    });

    it('should create Node crypto adapter instance', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: Buffer.from('test-key-32-bytes-long-for-aes!')
      });
      expect(crypto).toBeDefined();
      expect(crypto.getAdapter()).toBe('node');
      expect(typeof crypto.encryptText).toBe('function');
      expect(typeof crypto.decryptText).toBe('function');
    });
  });

  describe('Adapter Capabilities', () => {
    it('should return PGP capabilities', async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      const capabilities = await pgp.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.emailEncryption).toBe(true);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.multipleRecipients).toBe(true);
      expect(capabilities.asymmetricEncryption).toBe(true);
    });

    it('should return NaCl capabilities', async () => {
      const nacl = await getEncryption({ type: 'nacl' });
      const capabilities = await nacl.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.emailEncryption).toBe(false);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.symmetricEncryption).toBe(true);
      expect(capabilities.asymmetricEncryption).toBe(true);
    });

    it('should return Node crypto capabilities for symmetric', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: Buffer.from('test-key')
      });
      const capabilities = await crypto.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.symmetricEncryption).toBe(true);
      expect(capabilities.asymmetricEncryption).toBe(false);
    });

    it('should return Node crypto capabilities for asymmetric', async () => {
      const crypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });
      const capabilities = await crypto.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.symmetricEncryption).toBe(false);
      expect(capabilities.asymmetricEncryption).toBe(true);
    });
  });
});
