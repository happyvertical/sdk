import { describe, expect, it, beforeEach } from 'vitest';
import { getEncryption } from '../../src/index.js';
import type { Encryption, KeyPair } from '../../src/shared/types.js';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import {
  DecryptError,
  EncryptError,
  InvalidKeyError,
  KeyError,
  SignatureError
} from '../../src/shared/errors.js';

describe('NaCl Adapter', () => {
  let nacl: Encryption;

  beforeEach(async () => {
    nacl = await getEncryption({ type: 'nacl' });
  });

  describe('Key Generation', () => {
    it('should generate box keypair for encryption', async () => {
      const keypair = await nacl.generateKeyPair({ type: 'box' });

      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect((keypair.publicKey as Uint8Array).length).toBe(32);
      expect((keypair.privateKey as Uint8Array).length).toBe(32);
    });

    it('should generate ecdh keypair for encryption', async () => {
      const keypair = await nacl.generateKeyPair({ type: 'ecdh' });

      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect((keypair.publicKey as Uint8Array).length).toBe(32);
      expect((keypair.privateKey as Uint8Array).length).toBe(32);
    });

    it('should generate sign keypair for signatures', async () => {
      const keypair = await nacl.generateKeyPair({ type: 'ecdsa' });

      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect((keypair.publicKey as Uint8Array).length).toBe(32);
      expect((keypair.privateKey as Uint8Array).length).toBe(64);
    });

    it('should default to box keypair when no type specified', async () => {
      const keypair = await nacl.generateKeyPair();

      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect((keypair.publicKey as Uint8Array).length).toBe(32);
    });
  });

  describe('Symmetric Encryption (secretbox)', () => {
    let secretKey: Uint8Array;

    beforeEach(async () => {
      const keypair = await nacl.generateKeyPair();
      secretKey = keypair.privateKey as Uint8Array;
    });

    it('should encrypt and decrypt text with secret key', async () => {
      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey
      });

      const message = 'Secret message';
      const encrypted = await naclWithKey.encryptText(message);
      const decrypted = await naclWithKey.decryptText(encrypted);

      expect(decrypted).toBe(message);
      expect(encrypted).not.toBe(message);
      expect(typeof encrypted).toBe('string');
    });

    it('should encrypt and decrypt buffer with secret key', async () => {
      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey
      });

      const buffer = Buffer.from('Binary data');
      const encrypted = await naclWithKey.encryptBuffer(buffer);
      const decrypted = await naclWithKey.decryptBuffer(encrypted);

      expect(decrypted.toString()).toBe(buffer.toString());
    });

    it('should fail to decrypt with wrong key', async () => {
      const naclWithKey1 = await getEncryption({
        type: 'nacl',
        secretKey
      });

      const wrongKeypair = await nacl.generateKeyPair();
      const naclWithKey2 = await getEncryption({
        type: 'nacl',
        secretKey: wrongKeypair.privateKey
      });

      const encrypted = await naclWithKey1.encryptText('Secret');

      await expect(naclWithKey2.decryptText(encrypted)).rejects.toThrow(
        DecryptError
      );
    });

    it('should throw error when encrypting without secret key', async () => {
      const naclNoKey = await getEncryption({ type: 'nacl' });

      await expect(naclNoKey.encryptText('Secret')).rejects.toThrow(EncryptError);
    });

    it('should handle empty strings', async () => {
      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey
      });

      const encrypted = await naclWithKey.encryptText('');
      const decrypted = await naclWithKey.decryptText(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle long messages', async () => {
      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey
      });

      const longMessage = 'A'.repeat(10000);
      const encrypted = await naclWithKey.encryptText(longMessage);
      const decrypted = await naclWithKey.decryptText(encrypted);

      expect(decrypted).toBe(longMessage);
    });
  });

  describe('Asymmetric Encryption (box)', () => {
    let aliceKeypair: KeyPair;
    let bobKeypair: KeyPair;

    beforeEach(async () => {
      aliceKeypair = await nacl.generateKeyPair({ type: 'box' });
      bobKeypair = await nacl.generateKeyPair({ type: 'box' });
    });

    it('should encrypt and decrypt with recipient public key', async () => {
      // Alice encrypts for Bob
      const aliceNacl = await getEncryption({
        type: 'nacl',
        secretKey: aliceKeypair.privateKey,
        publicKey: aliceKeypair.publicKey
      });

      const message = 'Secret message for Bob';
      const encrypted = await aliceNacl.encryptText(message, {
        recipientPublicKey: bobKeypair.publicKey
      });

      // Bob decrypts
      const bobNacl = await getEncryption({
        type: 'nacl',
        secretKey: bobKeypair.privateKey,
        publicKey: bobKeypair.publicKey
      });

      const decrypted = await bobNacl.decryptText(encrypted);
      expect(decrypted).toBe(message);
    });

    it('should encrypt buffer for recipient', async () => {
      const aliceNacl = await getEncryption({
        type: 'nacl',
        secretKey: aliceKeypair.privateKey,
        publicKey: aliceKeypair.publicKey
      });

      const buffer = Buffer.from('Binary message');
      const encrypted = await aliceNacl.encryptBuffer(buffer, {
        recipientPublicKey: bobKeypair.publicKey
      });

      const bobNacl = await getEncryption({
        type: 'nacl',
        secretKey: bobKeypair.privateKey,
        publicKey: bobKeypair.publicKey
      });

      const decrypted = await bobNacl.decryptBuffer(encrypted);
      expect(decrypted.toString()).toBe(buffer.toString());
    });

    it('should fail with wrong recipient key', async () => {
      const aliceNacl = await getEncryption({
        type: 'nacl',
        secretKey: aliceKeypair.privateKey
      });

      const charlieKeypair = await nacl.generateKeyPair();

      const encrypted = await aliceNacl.encryptText('Secret', {
        recipientPublicKey: bobKeypair.publicKey
      });

      const charlieNacl = await getEncryption({
        type: 'nacl',
        secretKey: charlieKeypair.privateKey
      });

      await expect(charlieNacl.decryptText(encrypted)).rejects.toThrow(
        DecryptError
      );
    });

    it('should include sender public key in encrypted message', async () => {
      const aliceNacl = await getEncryption({
        type: 'nacl',
        secretKey: aliceKeypair.privateKey,
        publicKey: aliceKeypair.publicKey
      });

      const encrypted = await aliceNacl.encryptText('Secret', {
        recipientPublicKey: bobKeypair.publicKey
      });

      // Encrypted message should contain nonce + sender_pubkey + ciphertext
      const encryptedBytes = decodeBase64(encrypted);
      expect(encryptedBytes.length).toBeGreaterThan(24 + 32); // nonce + pubkey + at least some ciphertext
    });
  });

  describe('Key Encoding', () => {
    it('should handle base64 encoded keys', async () => {
      const keypair = await nacl.generateKeyPair();
      const secretKeyBase64 = encodeBase64(keypair.privateKey as Uint8Array);

      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey: secretKeyBase64,
        encoding: 'base64'
      });

      const encrypted = await naclWithKey.encryptText('Secret');
      const decrypted = await naclWithKey.decryptText(encrypted);

      expect(decrypted).toBe('Secret');
    });

    it('should handle hex encoded keys', async () => {
      const keypair = await nacl.generateKeyPair();
      const secretKeyHex = Buffer.from(keypair.privateKey as Uint8Array).toString(
        'hex'
      );

      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey: secretKeyHex,
        encoding: 'hex'
      });

      const encrypted = await naclWithKey.encryptText('Secret');
      const decrypted = await naclWithKey.decryptText(encrypted);

      expect(decrypted).toBe('Secret');
    });

    it('should handle Buffer keys', async () => {
      const keypair = await nacl.generateKeyPair();
      const secretKeyBuffer = Buffer.from(keypair.privateKey as Uint8Array);

      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey: secretKeyBuffer
      });

      const encrypted = await naclWithKey.encryptText('Secret');
      const decrypted = await naclWithKey.decryptText(encrypted);

      expect(decrypted).toBe('Secret');
    });

    it('should throw error for invalid key length', async () => {
      const invalidKey = new Uint8Array(16); // Wrong length (should be 32)

      await expect(
        getEncryption({
          type: 'nacl',
          secretKey: invalidKey
        })
      ).rejects.toThrow(InvalidKeyError);
    });

    it('should throw error for invalid public key length', async () => {
      const keypair = await nacl.generateKeyPair();
      const invalidPublicKey = new Uint8Array(16);

      await expect(
        getEncryption({
          type: 'nacl',
          secretKey: keypair.privateKey,
          publicKey: invalidPublicKey
        })
      ).rejects.toThrow(InvalidKeyError);
    });
  });

  describe('Digital Signatures', () => {
    let signingKeypair: KeyPair;

    beforeEach(async () => {
      signingKeypair = await nacl.generateKeyPair({ type: 'ecdsa' });
    });

    it('should sign and verify text message', async () => {
      const naclInstance = await getEncryption({ type: 'nacl' });

      const message = 'Message to sign';
      const signature = await naclInstance.sign!(message, {
        privateKey: signingKeypair.privateKey
      });

      expect(typeof signature).toBe('string');

      const valid = await naclInstance.verify!(message, signature, {
        publicKey: signingKeypair.publicKey
      });

      expect(valid).toBe(true);
    });

    it('should sign and verify buffer message', async () => {
      const naclInstance = await getEncryption({ type: 'nacl' });

      const message = Buffer.from('Binary message to sign');
      const signature = await naclInstance.sign!(message, {
        privateKey: signingKeypair.privateKey
      });

      expect(Buffer.isBuffer(signature)).toBe(true);

      const valid = await naclInstance.verify!(message, signature, {
        publicKey: signingKeypair.publicKey
      });

      expect(valid).toBe(true);
    });

    it('should detect invalid signature', async () => {
      const naclInstance = await getEncryption({ type: 'nacl' });

      const message = 'Original message';
      const signature = await naclInstance.sign!(message, {
        privateKey: signingKeypair.privateKey
      });

      // Try to verify with tampered message
      const valid = await naclInstance.verify!('Tampered message', signature, {
        publicKey: signingKeypair.publicKey
      });

      expect(valid).toBe(false);
    });

    it('should detect signature from wrong key', async () => {
      const keypair1 = await nacl.generateKeyPair({ type: 'ecdsa' });
      const keypair2 = await nacl.generateKeyPair({ type: 'ecdsa' });

      const naclInstance = await getEncryption({ type: 'nacl' });

      const message = 'Message';
      const signature = await naclInstance.sign!(message, {
        privateKey: keypair1.privateKey
      });

      // Try to verify with wrong public key
      const valid = await naclInstance.verify!(message, signature, {
        publicKey: keypair2.publicKey
      });

      expect(valid).toBe(false);
    });

    it('should sign with provided private key option', async () => {
      const naclNoKey = await getEncryption({ type: 'nacl' });

      const message = 'Message';
      const signature = await naclNoKey.sign!(message, {
        privateKey: signingKeypair.privateKey
      });

      const valid = await naclNoKey.verify!(message, signature, {
        publicKey: signingKeypair.publicKey
      });

      expect(valid).toBe(true);
    });

    it('should throw error when signing without key', async () => {
      const naclNoKey = await getEncryption({ type: 'nacl' });

      await expect(naclNoKey.sign!('Message')).rejects.toThrow(SignatureError);
    });

    it('should return false when verifying without public key', async () => {
      const naclInstance = await getEncryption({ type: 'nacl' });

      const signature = await naclInstance.sign!('Message', {
        privateKey: signingKeypair.privateKey
      });

      const valid = await naclInstance.verify!('Message', signature, {} as any);
      expect(valid).toBe(false);
    });

    it('should throw error with wrong signing key length', async () => {
      const encryptionKeypair = await nacl.generateKeyPair({ type: 'box' });

      const naclInstance = await getEncryption({ type: 'nacl' });

      // Encryption key is 32 bytes, signing key should be 64 bytes
      await expect(
        naclInstance.sign!('Message', {
          privateKey: encryptionKeypair.privateKey
        })
      ).rejects.toThrow(SignatureError);
    });

    it('should return false with wrong verification key length', async () => {
      const naclInstance = await getEncryption({ type: 'nacl' });

      const signature = await naclInstance.sign!('Message', {
        privateKey: signingKeypair.privateKey
      });
      const invalidPublicKey = new Uint8Array(16);

      const valid = await naclInstance.verify!('Message', signature, {
        publicKey: invalidPublicKey
      });
      expect(valid).toBe(false);
    });
  });

  describe('Key Import/Export', () => {
    it('should import public key', async () => {
      const keypair = await nacl.generateKeyPair();
      const publicKeyBase64 = encodeBase64(keypair.publicKey as Uint8Array);

      const key = await nacl.importKey(publicKeyBase64, {
        type: 'public',
        format: 'armored'
      });

      expect(key.type).toBe('public');
      expect(key.format).toBe('armored');
      expect(key.data).toBe(publicKeyBase64);
      expect(key.algorithm).toBe('nacl');
    });

    it('should import private key', async () => {
      const keypair = await nacl.generateKeyPair();
      const privateKeyBase64 = encodeBase64(keypair.privateKey as Uint8Array);

      const key = await nacl.importKey(privateKeyBase64, {
        type: 'private',
        format: 'armored'
      });

      expect(key.type).toBe('private');
      expect(key.data).toBe(privateKeyBase64);
    });

    it('should import key from Buffer', async () => {
      const keypair = await nacl.generateKeyPair();
      const keyBuffer = Buffer.from(keypair.publicKey as Uint8Array);

      const key = await nacl.importKey(keyBuffer, {
        type: 'public'
      });

      expect(key.type).toBe('public');
    });

    it('should throw error for invalid key length on import', async () => {
      const invalidKey = encodeBase64(new Uint8Array(16));

      await expect(
        nacl.importKey(invalidKey, {
          type: 'public'
        })
      ).rejects.toThrow(InvalidKeyError);
    });

    it('should export key as string', async () => {
      const keypair = await nacl.generateKeyPair();
      const publicKeyBase64 = encodeBase64(keypair.publicKey as Uint8Array);

      const key = await nacl.importKey(publicKeyBase64, {
        type: 'public'
      });

      const exported = await nacl.exportKey(key, {
        format: 'armored'
      });

      expect(typeof exported).toBe('string');
      expect(exported).toBe(publicKeyBase64);
    });

    it('should export key as Buffer', async () => {
      const keypair = await nacl.generateKeyPair();
      const publicKeyBase64 = encodeBase64(keypair.publicKey as Uint8Array);

      const key = await nacl.importKey(publicKeyBase64, {
        type: 'public'
      });

      const exported = await nacl.exportKey(key, {
        format: 'binary'
      });

      expect(Buffer.isBuffer(exported)).toBe(true);
    });

    it('should export Uint8Array key', async () => {
      const keypair = await nacl.generateKeyPair();

      const key = {
        type: 'public' as const,
        format: 'binary' as const,
        data: keypair.publicKey as Uint8Array,
        algorithm: 'nacl' as const
      };

      const exported = await nacl.exportKey(key, {
        format: 'armored'
      });

      expect(typeof exported).toBe('string');
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities', async () => {
      const capabilities = await nacl.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.bufferEncryption).toBe(true);
      expect(capabilities.streamEncryption).toBe(false);
      expect(capabilities.emailEncryption).toBe(false);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.verification).toBe(true);
      expect(capabilities.keyGeneration).toBe(true);
      expect(capabilities.keyManagement).toBe(true);
      expect(capabilities.multipleRecipients).toBe(false);
      expect(capabilities.symmetricEncryption).toBe(true);
      expect(capabilities.asymmetricEncryption).toBe(true);
    });
  });

  describe('Adapter Info', () => {
    it('should return correct adapter type', () => {
      expect(nacl.getAdapter()).toBe('nacl');
    });
  });

  describe('Error Handling', () => {
    it('should throw EncryptError on encryption failure', async () => {
      const naclNoKey = await getEncryption({ type: 'nacl' });

      await expect(naclNoKey.encryptText('test')).rejects.toThrow(EncryptError);
    });

    it('should throw DecryptError on decryption failure', async () => {
      const keypair = await nacl.generateKeyPair();
      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey: keypair.privateKey
      });

      await expect(naclWithKey.decryptText('invalid-data')).rejects.toThrow(
        DecryptError
      );
    });

    it('should throw KeyError on key operation failure', async () => {
      const naclNoKey = await getEncryption({ type: 'nacl' });

      await expect(
        naclNoKey.generateKeyPair({ type: 'rsa' as any })
      ).rejects.toThrow(KeyError);
    });

    it('should throw SignatureError on signing failure', async () => {
      const naclNoKey = await getEncryption({ type: 'nacl' });

      await expect(naclNoKey.sign!('message')).rejects.toThrow(
        SignatureError
      );
    });

    it('should handle corrupted ciphertext', async () => {
      const keypair = await nacl.generateKeyPair();
      const naclWithKey = await getEncryption({
        type: 'nacl',
        secretKey: keypair.privateKey
      });

      const encrypted = await naclWithKey.encryptText('Secret');
      const corrupted = encrypted.slice(0, -10) + 'XXXXXXXXXX';

      await expect(naclWithKey.decryptText(corrupted)).rejects.toThrow(
        DecryptError
      );
    });
  });
});
