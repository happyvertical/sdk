import { describe, expect, it } from 'vitest';
import { EnvelopeEncryption } from '../shared/envelope.js';

describe('EnvelopeEncryption', () => {
  describe('generateDataKey', () => {
    it('generates a 32-byte key', () => {
      const key = EnvelopeEncryption.generateDataKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('generates unique keys each time', () => {
      const key1 = EnvelopeEncryption.generateDataKey();
      const key2 = EnvelopeEncryption.generateDataKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('generateIV', () => {
    it('generates a 12-byte IV', () => {
      const iv = EnvelopeEncryption.generateIV();
      expect(iv).toBeInstanceOf(Buffer);
      expect(iv.length).toBe(12);
    });
  });

  describe('wrapKey / unwrapKey', () => {
    it('wraps and unwraps a key successfully', () => {
      const masterKey = EnvelopeEncryption.generateDataKey();
      const dataKey = EnvelopeEncryption.generateDataKey();

      const wrapped = EnvelopeEncryption.wrapKey(dataKey, masterKey);

      expect(wrapped.wrappedKey).toBeTruthy();
      expect(wrapped.iv).toBeTruthy();
      expect(wrapped.authTag).toBeTruthy();

      const unwrapped = EnvelopeEncryption.unwrapKey(
        wrapped.wrappedKey,
        wrapped.iv,
        wrapped.authTag,
        masterKey,
      );

      expect(unwrapped.equals(dataKey)).toBe(true);
    });

    it('fails to unwrap with wrong master key', () => {
      const masterKey1 = EnvelopeEncryption.generateDataKey();
      const masterKey2 = EnvelopeEncryption.generateDataKey();
      const dataKey = EnvelopeEncryption.generateDataKey();

      const wrapped = EnvelopeEncryption.wrapKey(dataKey, masterKey1);

      expect(() =>
        EnvelopeEncryption.unwrapKey(
          wrapped.wrappedKey,
          wrapped.iv,
          wrapped.authTag,
          masterKey2,
        ),
      ).toThrow();
    });

    it('fails to unwrap with tampered auth tag', () => {
      const masterKey = EnvelopeEncryption.generateDataKey();
      const dataKey = EnvelopeEncryption.generateDataKey();

      const wrapped = EnvelopeEncryption.wrapKey(dataKey, masterKey);

      // Tamper with auth tag
      const tamperedAuthTag = Buffer.from(wrapped.authTag, 'base64');
      tamperedAuthTag[0] ^= 0xff;

      expect(() =>
        EnvelopeEncryption.unwrapKey(
          wrapped.wrappedKey,
          wrapped.iv,
          tamperedAuthTag.toString('base64'),
          masterKey,
        ),
      ).toThrow();
    });
  });

  describe('encryptData / decryptData', () => {
    it('encrypts and decrypts text successfully', () => {
      const dataKey = EnvelopeEncryption.generateDataKey();
      const plaintext = 'This is a secret message!';

      const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();

      const decrypted = EnvelopeEncryption.decryptData(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        dataKey,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('handles empty string', () => {
      const dataKey = EnvelopeEncryption.generateDataKey();
      const plaintext = '';

      const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey);
      const decrypted = EnvelopeEncryption.decryptData(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        dataKey,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('handles unicode characters', () => {
      const dataKey = EnvelopeEncryption.generateDataKey();
      const plaintext = 'Hello 世界! 🔐 émojis and spëcial çhars';

      const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey);
      const decrypted = EnvelopeEncryption.decryptData(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        dataKey,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('handles large data', () => {
      const dataKey = EnvelopeEncryption.generateDataKey();
      const plaintext = 'x'.repeat(100000);

      const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey);
      const decrypted = EnvelopeEncryption.decryptData(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        dataKey,
      );

      expect(decrypted).toBe(plaintext);
    });

    it('fails to decrypt with wrong key', () => {
      const dataKey1 = EnvelopeEncryption.generateDataKey();
      const dataKey2 = EnvelopeEncryption.generateDataKey();
      const plaintext = 'Secret data';

      const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey1);

      expect(() =>
        EnvelopeEncryption.decryptData(
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          dataKey2,
        ),
      ).toThrow();
    });

    it('fails to decrypt with tampered ciphertext', () => {
      const dataKey = EnvelopeEncryption.generateDataKey();
      const plaintext = 'Secret data';

      const encrypted = EnvelopeEncryption.encryptData(plaintext, dataKey);

      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
      tamperedCiphertext[0] ^= 0xff;

      expect(() =>
        EnvelopeEncryption.decryptData(
          tamperedCiphertext.toString('base64'),
          encrypted.iv,
          encrypted.authTag,
          dataKey,
        ),
      ).toThrow();
    });
  });

  describe('createEnvelope / decryptEnvelope', () => {
    it('creates and decrypts a full envelope', () => {
      const masterKey = EnvelopeEncryption.generateDataKey();
      const dataKey = EnvelopeEncryption.generateDataKey();
      const plaintext = 'My secret API key';
      const amkKeyId = 'amk-v1';

      // Wrap the data key
      const wrappedKeyInfo = EnvelopeEncryption.wrapKey(dataKey, masterKey);

      // Create envelope
      const envelope = EnvelopeEncryption.createEnvelope(
        plaintext,
        dataKey,
        wrappedKeyInfo,
        amkKeyId,
        { purpose: 'api-key' },
      );

      expect(envelope.version).toBe(1);
      expect(envelope.algorithm).toBe('aes-256-gcm');
      expect(envelope.amkKeyId).toBe(amkKeyId);
      expect(envelope.metadata).toEqual({ purpose: 'api-key' });

      // Decrypt envelope
      const decrypted = EnvelopeEncryption.decryptEnvelope(envelope, masterKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('parseWrappedKey', () => {
    it('parses a valid wrapped key string', () => {
      const combined = 'base64Key:base64Iv:base64Tag';
      const parsed = EnvelopeEncryption.parseWrappedKey(combined);

      expect(parsed.wrappedKey).toBe('base64Key');
      expect(parsed.iv).toBe('base64Iv');
      expect(parsed.authTag).toBe('base64Tag');
    });

    it('throws for invalid format', () => {
      expect(() => EnvelopeEncryption.parseWrappedKey('invalid')).toThrow(
        'Invalid wrapped key format',
      );
      expect(() => EnvelopeEncryption.parseWrappedKey('a:b')).toThrow(
        'Invalid wrapped key format',
      );
    });
  });

  describe('validateKeyLength', () => {
    it('accepts valid key length', () => {
      const key = Buffer.alloc(32);
      expect(() => EnvelopeEncryption.validateKeyLength(key)).not.toThrow();
    });

    it('throws for invalid key length', () => {
      const shortKey = Buffer.alloc(16);
      expect(() => EnvelopeEncryption.validateKeyLength(shortKey)).toThrow(
        'Invalid key length',
      );
    });

    it('accepts custom expected length', () => {
      const key = Buffer.alloc(16);
      expect(() => EnvelopeEncryption.validateKeyLength(key, 16)).not.toThrow();
    });
  });

  describe('parseHexKey', () => {
    it('parses a valid hex key', () => {
      const hexKey = 'a'.repeat(64); // 64 hex chars = 32 bytes
      const key = EnvelopeEncryption.parseHexKey(hexKey);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('throws for invalid hex characters', () => {
      const invalidHex = 'g'.repeat(64);
      expect(() => EnvelopeEncryption.parseHexKey(invalidHex)).toThrow(
        'Invalid hex key',
      );
    });

    it('throws for wrong length', () => {
      const shortHex = 'a'.repeat(32); // 16 bytes
      expect(() => EnvelopeEncryption.parseHexKey(shortHex)).toThrow(
        'Invalid key length',
      );
    });
  });
});
