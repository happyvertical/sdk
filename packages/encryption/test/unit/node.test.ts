import { describe, expect, it, beforeEach } from 'vitest';
import { getEncryption } from '../../src/index.js';
import type { Encryption, KeyPair } from '../../src/shared/types.js';
import * as crypto from 'node:crypto';
import {
  DecryptError,
  EncryptError,
  KeyError,
  SignatureError
} from '../../src/shared/errors.js';

describe('Node Crypto Adapter', () => {
  describe('AES-256-GCM Encryption', () => {
    let encryption: Encryption;
    let key: Buffer;

    beforeEach(async () => {
      key = crypto.randomBytes(32); // 256 bits
      encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key
      });
    });

    it('should encrypt and decrypt text', async () => {
      const message = 'Secret message';
      const encrypted = await encryption.encryptText(message);
      const decrypted = await encryption.decryptText(encrypted);

      expect(decrypted).toBe(message);
      expect(encrypted).not.toBe(message);
    });

    it('should encrypt and decrypt buffer', async () => {
      const buffer = Buffer.from('Binary data');
      const encrypted = await encryption.encryptBuffer(buffer);
      const decrypted = await encryption.decryptBuffer(encrypted);

      expect(decrypted.toString()).toBe(buffer.toString());
    });

    it('should handle empty strings', async () => {
      const encrypted = await encryption.encryptText('');
      const decrypted = await encryption.decryptText(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle long messages', async () => {
      const longMessage = 'A'.repeat(10000);
      const encrypted = await encryption.encryptText(longMessage);
      const decrypted = await encryption.decryptText(encrypted);

      expect(decrypted).toBe(longMessage);
    });

    it('should fail to decrypt with wrong key', async () => {
      const encrypted = await encryption.encryptText('Secret');

      const wrongKeyEncryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      await expect(wrongKeyEncryption.decryptText(encrypted)).rejects.toThrow(
        DecryptError
      );
    });

    it('should throw error when encrypting without key', async () => {
      const noKeyEncryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm'
      });

      await expect(noKeyEncryption.encryptText('Secret')).rejects.toThrow(
        EncryptError
      );
    });

    it('should handle corrupted ciphertext', async () => {
      const encrypted = await encryption.encryptText('Secret');
      const corrupted = encrypted.slice(0, -10) + 'XXXXXXXXXX';

      await expect(encryption.decryptText(corrupted)).rejects.toThrow(
        DecryptError
      );
    });
  });

  describe('AES-256-CBC Encryption', () => {
    let encryption: Encryption;
    let key: Buffer;

    beforeEach(async () => {
      key = crypto.randomBytes(32);
      encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-cbc',
        key
      });
    });

    it('should encrypt and decrypt text', async () => {
      const message = 'Secret message';
      const encrypted = await encryption.encryptText(message);
      const decrypted = await encryption.decryptText(encrypted);

      expect(decrypted).toBe(message);
    });

    it('should encrypt and decrypt buffer', async () => {
      const buffer = Buffer.from('Binary data');
      const encrypted = await encryption.encryptBuffer(buffer);
      const decrypted = await encryption.decryptBuffer(encrypted);

      expect(decrypted.toString()).toBe(buffer.toString());
    });

    it('should fail with wrong key', async () => {
      const encrypted = await encryption.encryptText('Secret');

      const wrongKeyEncryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-cbc',
        key: crypto.randomBytes(32)
      });

      await expect(wrongKeyEncryption.decryptText(encrypted)).rejects.toThrow(
        DecryptError
      );
    });
  });

  describe('Key Derivation (PBKDF2)', () => {
    it('should derive key from password', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          password: 'my-password',
          salt: 'my-salt',
          iterations: 100000
        }
      });

      const message = 'Secret message';
      const encrypted = await encryption.encryptText(message);
      const decrypted = await encryption.decryptText(encrypted);

      expect(decrypted).toBe(message);
    });

    it('should use consistent derived key', async () => {
      const options = {
        type: 'node' as const,
        algorithm: 'aes-256-gcm' as const,
        keyDerivation: {
          password: 'my-password',
          salt: 'my-salt',
          iterations: 100000
        }
      };

      const encryption1 = await getEncryption(options);
      const encryption2 = await getEncryption(options);

      const message = 'Secret message';
      const encrypted = await encryption1.encryptText(message);
      const decrypted = await encryption2.decryptText(encrypted);

      expect(decrypted).toBe(message);
    });

    it('should support custom key length', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-128-gcm',
        keyDerivation: {
          password: 'my-password',
          keyLength: 16 // 128 bits
        }
      });

      const message = 'Secret';
      const encrypted = await encryption.encryptText(message);
      const decrypted = await encryption.decryptText(encrypted);

      expect(decrypted).toBe(message);
    });
  });

  describe('RSA Encryption', () => {
    let keypair: KeyPair;
    let encryption: Encryption;

    beforeEach(async () => {
      encryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      keypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should encrypt and decrypt text with RSA', async () => {
      const rsaEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string
      });

      const message = 'Secret message';
      const encrypted = await rsaEncryption.encryptText(message);
      const decrypted = await rsaEncryption.decryptText(encrypted);

      expect(decrypted).toBe(message);
    });

    it('should encrypt and decrypt buffer with RSA', async () => {
      const rsaEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string
      });

      const buffer = Buffer.from('Binary message');
      const encrypted = await rsaEncryption.encryptBuffer(buffer);
      const decrypted = await rsaEncryption.decryptBuffer(encrypted);

      expect(decrypted.toString()).toBe(buffer.toString());
    });

    it('should fail to decrypt with wrong private key', async () => {
      const rsaEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string
      });

      const encrypted = await rsaEncryption.encryptText('Secret');

      // Generate different keypair
      const wrongKeypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });

      const wrongKeyEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        privateKey: wrongKeypair.privateKey as string
      });

      await expect(wrongKeyEncryption.decryptText(encrypted)).rejects.toThrow(
        DecryptError
      );
    });

    it('should throw error when encrypting without public key', async () => {
      const noKeyEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      await expect(noKeyEncryption.encryptText('Secret')).rejects.toThrow(
        EncryptError
      );
    });

    it('should throw error when decrypting without private key', async () => {
      const rsaEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        publicKey: keypair.publicKey as string
      });

      const encrypted = await rsaEncryption.encryptText('Secret');

      const noPrivateKeyEncryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      await expect(
        noPrivateKeyEncryption.decryptText(encrypted)
      ).rejects.toThrow(DecryptError);
    });
  });

  describe('Key Generation', () => {
    let encryption: Encryption;

    beforeEach(async () => {
      encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm'
      });
    });

    it('should generate RSA keypair', async () => {
      const keypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });

      expect(typeof keypair.publicKey).toBe('string');
      expect(typeof keypair.privateKey).toBe('string');
      expect(keypair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keypair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    });

    it('should generate RSA keypair with passphrase', async () => {
      const keypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048,
        passphrase: 'secret-passphrase'
      });

      expect(keypair.privateKey).toContain('-----BEGIN ENCRYPTED PRIVATE KEY-----');
    });

    it('should generate EC keypair', async () => {
      const keypair = await encryption.generateKeyPair({
        type: 'ecc',
        curve: 'prime256v1'
      });

      expect(typeof keypair.publicKey).toBe('string');
      expect(typeof keypair.privateKey).toBe('string');
    });

    it('should generate ECDSA keypair', async () => {
      const keypair = await encryption.generateKeyPair({
        type: 'ecdsa',
        curve: 'prime256v1'
      });

      expect(typeof keypair.publicKey).toBe('string');
      expect(typeof keypair.privateKey).toBe('string');
    });

    it('should default to RSA with 2048 bits', async () => {
      const keypair = await encryption.generateKeyPair();

      expect(typeof keypair.publicKey).toBe('string');
      expect(keypair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    });

    it('should throw error for unsupported key type', async () => {
      await expect(
        encryption.generateKeyPair({ type: 'invalid' as any })
      ).rejects.toThrow(KeyError);
    });
  });

  describe('Key Import/Export', () => {
    let keypair: KeyPair;
    let encryption: Encryption;

    beforeEach(async () => {
      encryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      keypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should import and export public key', async () => {
      const imported = await encryption.importKey(keypair.publicKey as string, {
        type: 'public'
      });

      expect(imported.type).toBe('public');
      expect(imported.format).toBe('pem');
      expect(imported.algorithm).toBe('node');

      const exported = await encryption.exportKey(imported);

      expect(typeof exported).toBe('string');
      expect(exported).toContain('-----BEGIN PUBLIC KEY-----');
    });

    it('should import and export private key', async () => {
      const imported = await encryption.importKey(keypair.privateKey as string, {
        type: 'private'
      });

      expect(imported.type).toBe('private');
      expect(imported.format).toBe('pem');

      const exported = await encryption.exportKey(imported);

      expect(typeof exported).toBe('string');
    });

    it('should import private key with passphrase', async () => {
      const protectedKeypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048,
        passphrase: 'secret'
      });

      const imported = await encryption.importKey(
        protectedKeypair.privateKey as string,
        {
          type: 'private',
          passphrase: 'secret'
        }
      );

      expect(imported.type).toBe('private');
    });

    it('should export key as buffer', async () => {
      const imported = await encryption.importKey(keypair.publicKey as string, {
        type: 'public'
      });

      const exported = await encryption.exportKey(imported, {
        format: 'binary'
      });

      expect(Buffer.isBuffer(exported)).toBe(true);
    });
  });

  describe('Digital Signatures', () => {
    let keypair: KeyPair;
    let encryption: Encryption;

    beforeEach(async () => {
      encryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      keypair = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should sign and verify text message', async () => {
      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        privateKey: keypair.privateKey as string
      });

      const message = 'Message to sign';
      const signature = await nodeCrypto.sign!(message);

      expect(typeof signature).toBe('string');

      const valid = await nodeCrypto.verify!(message, signature, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(true);
    });

    it('should sign and verify buffer message', async () => {
      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        privateKey: keypair.privateKey as string
      });

      const message = Buffer.from('Binary message to sign');
      const signature = await nodeCrypto.sign!(message);

      expect(Buffer.isBuffer(signature)).toBe(true);

      const valid = await nodeCrypto.verify!(message, signature, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(true);
    });

    it('should detect tampered message', async () => {
      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        privateKey: keypair.privateKey as string
      });

      const message = 'Original message';
      const signature = await nodeCrypto.sign!(message);

      const valid = await nodeCrypto.verify!('Tampered message', signature, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(false);
    });

    it('should detect signature from wrong key', async () => {
      const keypair1 = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });
      const keypair2 = await encryption.generateKeyPair({
        type: 'rsa',
        keySize: 2048
      });

      const nodeCrypto1 = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        privateKey: keypair1.privateKey as string
      });

      const message = 'Message';
      const signature = await nodeCrypto1.sign!(message);

      const valid = await nodeCrypto1.verify!(message, signature, {
        publicKey: keypair2.publicKey as string
      });

      expect(valid).toBe(false);
    });

    it('should sign with provided private key option', async () => {
      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      const message = 'Message';
      const signature = await nodeCrypto.sign!(message, {
        privateKey: keypair.privateKey as string
      });

      const valid = await nodeCrypto.verify!(message, signature, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(true);
    });

    it('should throw error when signing without key', async () => {
      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      await expect(nodeCrypto.sign!('Message')).rejects.toThrow(SignatureError);
    });

    it('should return false when verifying without public key', async () => {
      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep',
        privateKey: keypair.privateKey as string
      });

      const signature = await nodeCrypto.sign!('Message');

      const valid = await nodeCrypto.verify!('Message', signature, {} as any);

      expect(valid).toBe(false);
    });

    it('should work with ECDSA keys', async () => {
      const ecKeypair = await encryption.generateKeyPair({
        type: 'ecdsa',
        curve: 'prime256v1'
      });

      const nodeCrypto = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep', // Algorithm doesn't matter for signing
        privateKey: ecKeypair.privateKey as string
      });

      const message = 'Message';
      const signature = await nodeCrypto.sign!(message);

      const valid = await nodeCrypto.verify!(message, signature, {
        publicKey: ecKeypair.publicKey as string
      });

      expect(valid).toBe(true);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities for AES', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      const capabilities = await encryption.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.bufferEncryption).toBe(true);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.verification).toBe(true);
      expect(capabilities.keyGeneration).toBe(true);
      expect(capabilities.symmetricEncryption).toBe(true);
      expect(capabilities.asymmetricEncryption).toBe(false);
    });

    it('should report correct capabilities for RSA', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'rsa-oaep'
      });

      const capabilities = await encryption.getCapabilities();

      expect(capabilities.symmetricEncryption).toBe(false);
      expect(capabilities.asymmetricEncryption).toBe(true);
    });
  });

  describe('Adapter Info', () => {
    it('should return correct adapter type', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      expect(encryption.getAdapter()).toBe('node');
    });
  });

  describe('Error Handling', () => {
    it('should throw EncryptError on encryption failure', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm'
      });

      await expect(encryption.encryptText('test')).rejects.toThrow(EncryptError);
    });

    it('should throw DecryptError on decryption failure', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      await expect(encryption.decryptText('invalid-data')).rejects.toThrow(
        DecryptError
      );
    });

    it('should throw KeyError on key operation failure', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      await expect(
        encryption.generateKeyPair({ type: 'invalid' as any })
      ).rejects.toThrow(KeyError);
    });

    it('should throw SignatureError on signing failure', async () => {
      const encryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      await expect(encryption.sign!('message')).rejects.toThrow(SignatureError);
    });
  });
});
