import { describe, expect, it, beforeEach } from 'vitest';
import { getEncryption } from '../../src/index.js';
import type { Encryption, KeyPair } from '../../src/shared/types.js';
import {
  DecryptError,
  EncryptError,
  InvalidKeyError,
  KeyError,
  PassphraseError,
  SignatureError
} from '../../src/shared/errors.js';

describe('PGP Adapter', () => {
  describe('Key Generation', () => {
    it('should generate RSA key pair with default options', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      const keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 2048 // Smaller for faster tests
      });

      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.fingerprint).toBeDefined();
      expect(keypair.keyId).toBeDefined();

      // Verify keys are armored strings
      expect(typeof keypair.publicKey).toBe('string');
      expect(typeof keypair.privateKey).toBe('string');
      expect((keypair.publicKey as string).startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----')).toBe(true);
      expect((keypair.privateKey as string).startsWith('-----BEGIN PGP PRIVATE KEY BLOCK-----')).toBe(true);
    });

    it('should generate RSA key pair with 4096 bits', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      const keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 4096
      });

      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.fingerprint).toBeDefined();
      expect(keypair.keyId).toBeDefined();
    });

    it('should generate ECC key pair with curve25519', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      const keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'ecc',
        curve: 'curve25519'
      });

      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.fingerprint).toBeDefined();
      expect(keypair.keyId).toBeDefined();
    });

    it('should generate ECC key pair with P-256', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      const keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'ecc',
        curve: 'p256'
      });

      expect(keypair.publicKey).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
    });

    it('should throw error for unsupported key type', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      await expect(
        pgp.generateKeyPair({
          name: 'Test User',
          email: 'test@example.com',
          type: 'dsa' as any
        })
      ).rejects.toThrow(KeyError);
    });
  });

  describe('Text Encryption/Decryption', () => {
    let pgp: Encryption;
    let keypair: KeyPair;

    beforeEach(async () => {
      pgp = await getEncryption({ type: 'pgp' });
      keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should encrypt and decrypt text with armored output', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const plaintext = 'Secret message';
      const encrypted = await pgpWithKeys.encryptText(plaintext, { armor: true });
      const decrypted = await pgpWithKeys.decryptText(encrypted);

      expect(encrypted).toBeDefined();
      expect(encrypted.startsWith('-----BEGIN PGP MESSAGE-----')).toBe(true);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt text with binary output', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const plaintext = 'Secret message';
      const encrypted = await pgpWithKeys.encryptText(plaintext, { armor: false });
      const decrypted = await pgpWithKeys.decryptText(encrypted);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt text with separate keys', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      const plaintext = 'Secret message';
      const encrypted = await pgp.encryptText(plaintext, {
        publicKeys: [keypair.publicKey as string]
      });

      const pgpWithPrivateKey = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const decrypted = await pgpWithPrivateKey.decryptText(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when decrypting with wrong key', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const encrypted = await pgpWithKeys.encryptText('Secret message');

      // Generate different keypair
      const wrongKeypair = await pgp.generateKeyPair({
        name: 'Wrong User',
        email: 'wrong@example.com',
        passphrase: 'wrong-passphrase',
        type: 'rsa',
        keySize: 2048
      });

      const pgpWithWrongKey = await getEncryption({
        type: 'pgp',
        privateKey: wrongKeypair.privateKey as string,
        passphrase: 'wrong-passphrase'
      });

      await expect(pgpWithWrongKey.decryptText(encrypted)).rejects.toThrow(DecryptError);
    });

    it('should throw error when encrypting without public key', async () => {
      const pgpWithoutKey = await getEncryption({ type: 'pgp' });

      await expect(pgpWithoutKey.encryptText('Secret')).rejects.toThrow(EncryptError);
    });

    it('should throw error when decrypting without private key', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string
      });

      const encrypted = await pgpWithKeys.encryptText('Secret', {
        publicKeys: [keypair.publicKey as string]
      });

      await expect(pgpWithKeys.decryptText(encrypted)).rejects.toThrow(DecryptError);
    });
  });

  describe('Buffer Encryption/Decryption', () => {
    let pgp: Encryption;
    let keypair: KeyPair;

    beforeEach(async () => {
      pgp = await getEncryption({ type: 'pgp' });
      keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should encrypt and decrypt buffer with binary output', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const data = Buffer.from('Binary data content');
      const encrypted = await pgpWithKeys.encryptBuffer(data, { armor: false });
      const decrypted = await pgpWithKeys.decryptBuffer(encrypted);

      expect(Buffer.isBuffer(encrypted)).toBe(true);
      expect(Buffer.isBuffer(decrypted)).toBe(true);
      expect(decrypted.toString()).toBe('Binary data content');
    });

    it('should encrypt and decrypt buffer with armored output', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const data = Buffer.from('Binary data content');
      const encrypted = await pgpWithKeys.encryptBuffer(data, { armor: true });
      const decrypted = await pgpWithKeys.decryptBuffer(encrypted);

      expect(Buffer.isBuffer(encrypted)).toBe(true);
      expect(encrypted.toString().startsWith('-----BEGIN PGP MESSAGE-----')).toBe(true);
      expect(decrypted.toString()).toBe('Binary data content');
    });
  });

  describe('Signing and Verification', () => {
    let pgp: Encryption;
    let keypair: KeyPair;

    beforeEach(async () => {
      pgp = await getEncryption({ type: 'pgp' });
      keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should sign and verify text message', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        publicKey: keypair.publicKey as string,
        passphrase: 'test-passphrase'
      });

      const message = 'Message to sign';
      const signed = await pgpWithKeys.sign!(message, {
        detached: false,
        armor: true
      });

      expect(signed).toBeDefined();
      expect(typeof signed).toBe('string');

      const valid = await pgpWithKeys.verify!(message, signed as string, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(true);
    });

    it('should sign and verify buffer', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        publicKey: keypair.publicKey as string,
        passphrase: 'test-passphrase'
      });

      const data = Buffer.from('Data to sign');
      const signed = await pgpWithKeys.sign!(data, {
        detached: false,
        armor: false
      });

      expect(signed).toBeDefined();
      expect(Buffer.isBuffer(signed)).toBe(true);

      const valid = await pgpWithKeys.verify!(data, signed as Buffer, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(true);
    });

    it('should create detached signature', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        publicKey: keypair.publicKey as string,
        passphrase: 'test-passphrase'
      });

      const message = 'Message to sign';
      const signature = await pgpWithKeys.sign!(message, {
        detached: true,
        armor: true
      });

      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect((signature as string).includes('-----BEGIN PGP SIGNATURE-----')).toBe(true);

      const valid = await pgpWithKeys.verify!(message, signature as string, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        publicKey: keypair.publicKey as string,
        passphrase: 'test-passphrase'
      });

      const message = 'Message to sign';
      const signature = await pgpWithKeys.sign!(message, {
        detached: true,
        armor: true
      });

      const tamperedMessage = 'Tampered message';
      const valid = await pgpWithKeys.verify!(tamperedMessage, signature as string, {
        publicKey: keypair.publicKey as string
      });

      expect(valid).toBe(false);
    });

    it('should encrypt and sign text', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const plaintext = 'Secret signed message';
      const encrypted = await pgpWithKeys.encryptText(plaintext, {
        sign: true,
        privateKey: keypair.privateKey as string
      });

      const decrypted = await pgpWithKeys.decryptText(encrypted, {
        verify: true,
        publicKey: keypair.publicKey as string
      });

      expect(decrypted).toBe(plaintext);
    });

    it('should throw error when signing without private key', async () => {
      const pgpWithoutKey = await getEncryption({ type: 'pgp' });

      await expect(pgpWithoutKey.sign!('Message')).rejects.toThrow(SignatureError);
    });

    it('should throw error when verifying without public key', async () => {
      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });

      const signature = await pgpWithKeys.sign!('Message', { detached: true });

      const pgpWithoutKey = await getEncryption({ type: 'pgp' });

      await expect(
        pgpWithoutKey.verify!('Message', signature as string, {})
      ).rejects.toThrow(KeyError);
    });
  });

  describe('Multiple Recipients', () => {
    let pgp: Encryption;
    let recipient1: KeyPair;
    let recipient2: KeyPair;
    let recipient3: KeyPair;

    beforeEach(async () => {
      pgp = await getEncryption({ type: 'pgp' });

      recipient1 = await pgp.generateKeyPair({
        name: 'Recipient 1',
        email: 'recipient1@example.com',
        passphrase: 'pass1',
        type: 'rsa',
        keySize: 2048
      });

      recipient2 = await pgp.generateKeyPair({
        name: 'Recipient 2',
        email: 'recipient2@example.com',
        passphrase: 'pass2',
        type: 'rsa',
        keySize: 2048
      });

      recipient3 = await pgp.generateKeyPair({
        name: 'Recipient 3',
        email: 'recipient3@example.com',
        passphrase: 'pass3',
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should encrypt for multiple recipients', async () => {
      const plaintext = 'Secret for all';

      const encrypted = await pgp.encryptText(plaintext, {
        publicKeys: [
          recipient1.publicKey as string,
          recipient2.publicKey as string,
          recipient3.publicKey as string
        ]
      });

      // All recipients should be able to decrypt
      const pgp1 = await getEncryption({
        type: 'pgp',
        privateKey: recipient1.privateKey as string,
        passphrase: 'pass1'
      });
      const decrypted1 = await pgp1.decryptText(encrypted);
      expect(decrypted1).toBe(plaintext);

      const pgp2 = await getEncryption({
        type: 'pgp',
        privateKey: recipient2.privateKey as string,
        passphrase: 'pass2'
      });
      const decrypted2 = await pgp2.decryptText(encrypted);
      expect(decrypted2).toBe(plaintext);

      const pgp3 = await getEncryption({
        type: 'pgp',
        privateKey: recipient3.privateKey as string,
        passphrase: 'pass3'
      });
      const decrypted3 = await pgp3.decryptText(encrypted);
      expect(decrypted3).toBe(plaintext);
    });
  });

  describe('Key Import/Export', () => {
    let pgp: Encryption;
    let keypair: KeyPair;

    beforeEach(async () => {
      pgp = await getEncryption({ type: 'pgp' });
      keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 2048
      });
    });

    it('should import public key', async () => {
      const imported = await pgp.importKey(keypair.publicKey as string, {
        type: 'public'
      });

      expect(imported.type).toBe('public');
      expect(imported.format).toBe('armored');
      expect(imported.fingerprint).toBe(keypair.fingerprint);
      expect(imported.keyId).toBe(keypair.keyId);
      expect(imported.algorithm).toBeDefined();
      expect(imported.created).toBeInstanceOf(Date);
      expect(imported.userIds).toBeDefined();
      expect(imported.userIds!.length).toBeGreaterThan(0);
    });

    it('should import private key', async () => {
      const imported = await pgp.importKey(keypair.privateKey as string, {
        type: 'private',
        passphrase: 'test-passphrase'
      });

      expect(imported.type).toBe('private');
      expect(imported.format).toBe('armored');
      expect(imported.fingerprint).toBe(keypair.fingerprint);
      expect(imported.keyId).toBe(keypair.keyId);
    });

    it('should throw error when importing private key with wrong passphrase', async () => {
      await expect(
        pgp.importKey(keypair.privateKey as string, {
          type: 'private',
          passphrase: 'wrong-passphrase'
        })
      ).rejects.toThrow(PassphraseError);
    });

    it('should export public key', async () => {
      const imported = await pgp.importKey(keypair.publicKey as string, {
        type: 'public'
      });

      const exported = await pgp.exportKey(imported, { format: 'armored' });

      expect(typeof exported).toBe('string');
      expect((exported as string).startsWith('-----BEGIN PGP PUBLIC KEY BLOCK-----')).toBe(true);
    });

    it('should export key as buffer', async () => {
      const imported = await pgp.importKey(keypair.publicKey as string, {
        type: 'public'
      });

      const exported = await pgp.exportKey(imported, { format: 'binary' });

      expect(Buffer.isBuffer(exported)).toBe(true);
    });
  });

  describe('Capabilities', () => {
    it('should return correct capabilities', async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      const capabilities = await pgp.getCapabilities();

      expect(capabilities.textEncryption).toBe(true);
      expect(capabilities.fileEncryption).toBe(true);
      expect(capabilities.bufferEncryption).toBe(true);
      expect(capabilities.streamEncryption).toBe(true);
      expect(capabilities.emailEncryption).toBe(true);
      expect(capabilities.signing).toBe(true);
      expect(capabilities.verification).toBe(true);
      expect(capabilities.keyGeneration).toBe(true);
      expect(capabilities.keyManagement).toBe(true);
      expect(capabilities.multipleRecipients).toBe(true);
      expect(capabilities.symmetricEncryption).toBe(false);
      expect(capabilities.asymmetricEncryption).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw InvalidKeyError for malformed key', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      await expect(
        pgp.importKey('not-a-valid-key', { type: 'public' })
      ).rejects.toThrow(InvalidKeyError);
    });

    it('should throw EncryptError for invalid encryption', async () => {
      const pgp = await getEncryption({ type: 'pgp' });

      // Try to encrypt without a public key
      await expect(pgp.encryptText('Secret')).rejects.toThrow(EncryptError);
    });

    it('should throw DecryptError for invalid ciphertext', async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      const keypair = await pgp.generateKeyPair({
        name: 'Test',
        email: 'test@example.com',
        passphrase: 'pass',
        type: 'rsa',
        keySize: 2048
      });

      const pgpWithKeys = await getEncryption({
        type: 'pgp',
        privateKey: keypair.privateKey as string,
        passphrase: 'pass'
      });

      await expect(
        pgpWithKeys.decryptText('not-valid-encrypted-data')
      ).rejects.toThrow(DecryptError);
    });
  });

  describe('Adapter Type', () => {
    it('should return correct adapter type', async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      expect(pgp.getAdapter()).toBe('pgp');
    });
  });
});
