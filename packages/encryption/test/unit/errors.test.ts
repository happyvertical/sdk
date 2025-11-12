import { describe, expect, it } from 'vitest';
import {
  AlgorithmError,
  DecryptError,
  EncryptError,
  EncryptionError,
  FormatError,
  InvalidKeyError,
  KeyError,
  KeyNotFoundError,
  PassphraseError,
  SignatureError,
  VerificationError
} from '../../src/index.js';

describe('Error Classes', () => {
  describe('EncryptionError (Base)', () => {
    it('should create error with message and code', () => {
      const error = new EncryptionError(
        'Test error message',
        'TEST_CODE',
        'pgp'
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EncryptionError);
      expect(error.name).toBe('EncryptionError');
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.adapter).toBe('pgp');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new EncryptionError(
        'Wrapped error',
        'TEST_CODE',
        'nacl',
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it('should serialize to JSON', () => {
      const error = new EncryptionError(
        'Test error',
        'TEST_CODE',
        'node',
        new Error('Cause')
      );

      const json = error.toJSON();

      expect(json.name).toBe('EncryptionError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
      expect(json.adapter).toBe('node');
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
      expect(json.cause).toBeDefined();
    });

    it('should capture stack trace', () => {
      const error = new EncryptionError('Test', 'CODE');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Test');
    });
  });

  describe('KeyError', () => {
    it('should create key error', () => {
      const error = new KeyError('Key operation failed', 'pgp');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(KeyError);
      expect(error.name).toBe('KeyError');
      expect(error.code).toBe('KEY_ERROR');
      expect(error.message).toBe('Key operation failed');
      expect(error.adapter).toBe('pgp');
    });

    it('should include cause', () => {
      const cause = new Error('Invalid format');
      const error = new KeyError('Key error', 'pgp', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('InvalidKeyError', () => {
    it('should create invalid key error', () => {
      const error = new InvalidKeyError('Key format is invalid', 'nacl');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(InvalidKeyError);
      expect(error.name).toBe('InvalidKeyError');
      expect(error.code).toBe('INVALID_KEY');
      expect(error.message).toBe('Key format is invalid');
      expect(error.adapter).toBe('nacl');
    });
  });

  describe('KeyNotFoundError', () => {
    it('should create key not found error', () => {
      const error = new KeyNotFoundError(
        'Key not found in keyring',
        'key-123',
        'pgp'
      );

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(KeyNotFoundError);
      expect(error.name).toBe('KeyNotFoundError');
      expect(error.code).toBe('KEY_NOT_FOUND');
      expect(error.message).toBe('Key not found in keyring');
      expect(error.keyId).toBe('key-123');
      expect(error.adapter).toBe('pgp');
    });

    it('should serialize with keyId', () => {
      const error = new KeyNotFoundError('Not found', 'key-456', 'nacl');
      const json = error.toJSON();

      expect(json.keyId).toBe('key-456');
      expect(json.code).toBe('KEY_NOT_FOUND');
    });

    it('should work without keyId', () => {
      const error = new KeyNotFoundError('Not found', undefined, 'node');

      expect(error.keyId).toBeUndefined();
      expect(error.message).toBe('Not found');
    });
  });

  describe('PassphraseError', () => {
    it('should create passphrase error', () => {
      const error = new PassphraseError('Invalid passphrase', 'pgp');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(PassphraseError);
      expect(error.name).toBe('PassphraseError');
      expect(error.code).toBe('PASSPHRASE_ERROR');
      expect(error.message).toBe('Invalid passphrase');
    });
  });

  describe('EncryptError', () => {
    it('should create encryption error', () => {
      const error = new EncryptError('Encryption failed', 'nacl');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(EncryptError);
      expect(error.name).toBe('EncryptError');
      expect(error.code).toBe('ENCRYPT_ERROR');
      expect(error.message).toBe('Encryption failed');
    });

    it('should include cause', () => {
      const cause = new Error('Buffer overflow');
      const error = new EncryptError('Encrypt failed', 'node', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('DecryptError', () => {
    it('should create decryption error', () => {
      const error = new DecryptError('Decryption failed', 'pgp');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(DecryptError);
      expect(error.name).toBe('DecryptError');
      expect(error.code).toBe('DECRYPT_ERROR');
      expect(error.message).toBe('Decryption failed');
    });
  });

  describe('SignatureError', () => {
    it('should create signature error', () => {
      const error = new SignatureError('Signing failed', 'pgp');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(SignatureError);
      expect(error.name).toBe('SignatureError');
      expect(error.code).toBe('SIGNATURE_ERROR');
      expect(error.message).toBe('Signing failed');
    });
  });

  describe('VerificationError', () => {
    it('should create verification error', () => {
      const error = new VerificationError('Verification failed', 'nacl');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(VerificationError);
      expect(error.name).toBe('VerificationError');
      expect(error.code).toBe('VERIFICATION_ERROR');
      expect(error.message).toBe('Verification failed');
    });
  });

  describe('FormatError', () => {
    it('should create format error', () => {
      const error = new FormatError('Invalid data format', 'node');

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(FormatError);
      expect(error.name).toBe('FormatError');
      expect(error.code).toBe('FORMAT_ERROR');
      expect(error.message).toBe('Invalid data format');
    });
  });

  describe('AlgorithmError', () => {
    it('should create algorithm error', () => {
      const error = new AlgorithmError(
        'Unsupported algorithm',
        'aes-128-ecb',
        'node'
      );

      expect(error).toBeInstanceOf(EncryptionError);
      expect(error).toBeInstanceOf(AlgorithmError);
      expect(error.name).toBe('AlgorithmError');
      expect(error.code).toBe('ALGORITHM_ERROR');
      expect(error.message).toBe('Unsupported algorithm');
      expect(error.algorithm).toBe('aes-128-ecb');
      expect(error.adapter).toBe('node');
    });

    it('should serialize with algorithm', () => {
      const error = new AlgorithmError('Error', 'rsa-1024', 'pgp');
      const json = error.toJSON();

      expect(json.algorithm).toBe('rsa-1024');
      expect(json.code).toBe('ALGORITHM_ERROR');
    });

    it('should work without algorithm', () => {
      const error = new AlgorithmError('Error', undefined, 'nacl');

      expect(error.algorithm).toBeUndefined();
      expect(error.message).toBe('Error');
    });
  });

  describe('Error Inheritance', () => {
    it('should maintain instanceof relationships', () => {
      const errors = [
        new KeyError('test'),
        new InvalidKeyError('test'),
        new KeyNotFoundError('test'),
        new PassphraseError('test'),
        new EncryptError('test'),
        new DecryptError('test'),
        new SignatureError('test'),
        new VerificationError('test'),
        new FormatError('test'),
        new AlgorithmError('test')
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(EncryptionError);
      }
    });

    it('should distinguish between error types', () => {
      const keyError = new KeyError('test');
      const decryptError = new DecryptError('test');

      expect(keyError).toBeInstanceOf(KeyError);
      expect(keyError).not.toBeInstanceOf(DecryptError);

      expect(decryptError).toBeInstanceOf(DecryptError);
      expect(decryptError).not.toBeInstanceOf(KeyError);
    });
  });
});
