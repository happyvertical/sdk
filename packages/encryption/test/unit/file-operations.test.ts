import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { getEncryption } from '../../src/index.js';
import type { Encryption, KeyPair } from '../../src/shared/types.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('File Operations', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = path.join(tmpdir(), `encryption-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('PGP File Operations', () => {
    let encryption: Encryption;
    let keypair: KeyPair;

    beforeEach(async () => {
      const pgp = await getEncryption({ type: 'pgp' });
      keypair = await pgp.generateKeyPair({
        name: 'Test User',
        email: 'test@example.com',
        passphrase: 'test-passphrase',
        type: 'rsa',
        keySize: 2048
      });

      encryption = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'test-passphrase'
      });
    });

    it('should encrypt and decrypt text file', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const encryptedPath = path.join(tempDir, 'encrypted.pgp');
      const decryptedPath = path.join(tempDir, 'decrypted.txt');

      const content = 'This is a secret message in a file';
      await fs.writeFile(inputPath, content, 'utf8');

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Verify encrypted file exists and is different
      const encryptedContent = await fs.readFile(encryptedPath, 'utf8');
      expect(encryptedContent).not.toBe(content);
      expect(encryptedContent.length).toBeGreaterThan(0);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
      expect(decryptedContent).toBe(content);
    });

    it('should encrypt and decrypt binary file', async () => {
      const inputPath = path.join(tempDir, 'input.bin');
      const encryptedPath = path.join(tempDir, 'encrypted.pgp');
      const decryptedPath = path.join(tempDir, 'decrypted.bin');

      const content = crypto.randomBytes(1024); // 1KB random binary data
      await fs.writeFile(inputPath, content);

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath);
      expect(Buffer.compare(decryptedContent, content)).toBe(0);
    });

    it('should encrypt and decrypt large file', async () => {
      const inputPath = path.join(tempDir, 'large.txt');
      const encryptedPath = path.join(tempDir, 'large.pgp');
      const decryptedPath = path.join(tempDir, 'large-decrypted.txt');

      const content = 'A'.repeat(100000); // 100KB
      await fs.writeFile(inputPath, content, 'utf8');

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
      expect(decryptedContent).toBe(content);
    });

    it('should handle empty file', async () => {
      const inputPath = path.join(tempDir, 'empty.txt');
      const encryptedPath = path.join(tempDir, 'empty.pgp');
      const decryptedPath = path.join(tempDir, 'empty-decrypted.txt');

      await fs.writeFile(inputPath, '', 'utf8');

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content is empty
      const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
      expect(decryptedContent).toBe('');
    });

    it('should throw error for non-existent input file', async () => {
      const inputPath = path.join(tempDir, 'non-existent.txt');
      const outputPath = path.join(tempDir, 'output.pgp');

      await expect(encryption.encryptFile(inputPath, outputPath)).rejects.toThrow();
    });

    it('should encrypt with armor option', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const encryptedPath = path.join(tempDir, 'encrypted.asc');
      const decryptedPath = path.join(tempDir, 'decrypted.txt');

      const content = 'ASCII armored message';
      await fs.writeFile(inputPath, content, 'utf8');

      // Encrypt with armor
      await encryption.encryptFile(inputPath, encryptedPath, { armor: true });

      // Verify armored format (should be ASCII)
      const encryptedContent = await fs.readFile(encryptedPath, 'utf8');
      expect(encryptedContent).toContain('-----BEGIN PGP MESSAGE-----');
      expect(encryptedContent).toContain('-----END PGP MESSAGE-----');

      // Decrypt
      await encryption.decryptFile(encryptedPath, decryptedPath);
      const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
      expect(decryptedContent).toBe(content);
    });
  });

  describe('NaCl File Operations', () => {
    let encryption: Encryption;
    let secretKey: Buffer;

    beforeEach(async () => {
      secretKey = crypto.randomBytes(32); // 32-byte secret key for NaCl
      encryption = await getEncryption({
        type: 'nacl',
        secretKey
      });
    });

    it('should encrypt and decrypt text file', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const encryptedPath = path.join(tempDir, 'encrypted.nacl');
      const decryptedPath = path.join(tempDir, 'decrypted.txt');

      const content = 'NaCl encrypted message';
      await fs.writeFile(inputPath, content, 'utf8');

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Verify encrypted file exists
      const encryptedContent = await fs.readFile(encryptedPath);
      expect(encryptedContent.length).toBeGreaterThan(0);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
      expect(decryptedContent).toBe(content);
    });

    it('should encrypt and decrypt binary file', async () => {
      const inputPath = path.join(tempDir, 'input.bin');
      const encryptedPath = path.join(tempDir, 'encrypted.nacl');
      const decryptedPath = path.join(tempDir, 'decrypted.bin');

      const content = crypto.randomBytes(2048); // 2KB
      await fs.writeFile(inputPath, content);

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath);
      expect(Buffer.compare(decryptedContent, content)).toBe(0);
    });

    it('should encrypt and decrypt large file', async () => {
      const inputPath = path.join(tempDir, 'large.bin');
      const encryptedPath = path.join(tempDir, 'large.nacl');
      const decryptedPath = path.join(tempDir, 'large-decrypted.bin');

      const content = crypto.randomBytes(50000); // 50KB
      await fs.writeFile(inputPath, content);

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content matches original
      const decryptedContent = await fs.readFile(decryptedPath);
      expect(Buffer.compare(decryptedContent, content)).toBe(0);
    });

    it('should fail to decrypt with wrong key', async () => {
      const inputPath = path.join(tempDir, 'input.txt');
      const encryptedPath = path.join(tempDir, 'encrypted.nacl');
      const decryptedPath = path.join(tempDir, 'decrypted.txt');

      const content = 'Secret message';
      await fs.writeFile(inputPath, content, 'utf8');

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Create new encryption with different key
      const wrongKey = crypto.randomBytes(32);
      const wrongEncryption = await getEncryption({
        type: 'nacl',
        secretKey: wrongKey
      });

      // Should fail to decrypt
      await expect(
        wrongEncryption.decryptFile(encryptedPath, decryptedPath)
      ).rejects.toThrow();
    });

    it('should handle empty file', async () => {
      const inputPath = path.join(tempDir, 'empty.txt');
      const encryptedPath = path.join(tempDir, 'empty.nacl');
      const decryptedPath = path.join(tempDir, 'empty-decrypted.txt');

      await fs.writeFile(inputPath, '', 'utf8');

      // Encrypt file
      await encryption.encryptFile(inputPath, encryptedPath);

      // Decrypt file
      await encryption.decryptFile(encryptedPath, decryptedPath);

      // Verify decrypted content is empty
      const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
      expect(decryptedContent).toBe('');
    });
  });

  describe('Node Crypto File Operations', () => {
    describe('AES Symmetric', () => {
      let encryption: Encryption;
      let key: Buffer;

      beforeEach(async () => {
        key = crypto.randomBytes(32); // 256 bits for AES-256
        encryption = await getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          key
        });
      });

      it('should encrypt and decrypt text file', async () => {
        const inputPath = path.join(tempDir, 'input.txt');
        const encryptedPath = path.join(tempDir, 'encrypted.enc');
        const decryptedPath = path.join(tempDir, 'decrypted.txt');

        const content = 'AES encrypted message';
        await fs.writeFile(inputPath, content, 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file
        await encryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content matches original
        const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
        expect(decryptedContent).toBe(content);
      });

      it('should encrypt and decrypt binary file', async () => {
        const inputPath = path.join(tempDir, 'input.bin');
        const encryptedPath = path.join(tempDir, 'encrypted.enc');
        const decryptedPath = path.join(tempDir, 'decrypted.bin');

        const content = crypto.randomBytes(1024);
        await fs.writeFile(inputPath, content);

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file
        await encryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content matches original
        const decryptedContent = await fs.readFile(decryptedPath);
        expect(Buffer.compare(decryptedContent, content)).toBe(0);
      });

      it('should encrypt and decrypt large file', async () => {
        const inputPath = path.join(tempDir, 'large.bin');
        const encryptedPath = path.join(tempDir, 'large.enc');
        const decryptedPath = path.join(tempDir, 'large-decrypted.bin');

        const content = crypto.randomBytes(100000); // 100KB
        await fs.writeFile(inputPath, content);

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file
        await encryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content matches original
        const decryptedContent = await fs.readFile(decryptedPath);
        expect(Buffer.compare(decryptedContent, content)).toBe(0);
      });

      it('should fail to decrypt with wrong key', async () => {
        const inputPath = path.join(tempDir, 'input.txt');
        const encryptedPath = path.join(tempDir, 'encrypted.enc');
        const decryptedPath = path.join(tempDir, 'decrypted.txt');

        const content = 'Secret message';
        await fs.writeFile(inputPath, content, 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Create new encryption with different key
        const wrongKey = crypto.randomBytes(32);
        const wrongEncryption = await getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          key: wrongKey
        });

        // Should fail to decrypt
        await expect(
          wrongEncryption.decryptFile(encryptedPath, decryptedPath)
        ).rejects.toThrow();
      });

      it('should handle empty file', async () => {
        const inputPath = path.join(tempDir, 'empty.txt');
        const encryptedPath = path.join(tempDir, 'empty.enc');
        const decryptedPath = path.join(tempDir, 'empty-decrypted.txt');

        await fs.writeFile(inputPath, '', 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file
        await encryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content is empty
        const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
        expect(decryptedContent).toBe('');
      });
    });

    describe('RSA Asymmetric', () => {
      let encryption: Encryption;
      let keypair: KeyPair;

      beforeEach(async () => {
        const rsa = await getEncryption({
          type: 'node',
          algorithm: 'rsa-oaep'
        });

        keypair = await rsa.generateKeyPair({
          type: 'rsa',
          keySize: 2048
        });

        encryption = await getEncryption({
          type: 'node',
          algorithm: 'rsa-oaep',
          publicKey: keypair.publicKey as string,
          privateKey: keypair.privateKey as string
        });
      });

      it('should encrypt and decrypt small text file', async () => {
        const inputPath = path.join(tempDir, 'input.txt');
        const encryptedPath = path.join(tempDir, 'encrypted.enc');
        const decryptedPath = path.join(tempDir, 'decrypted.txt');

        // RSA can only encrypt small amounts of data
        const content = 'Small message for RSA';
        await fs.writeFile(inputPath, content, 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file
        await encryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content matches original
        const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
        expect(decryptedContent).toBe(content);
      });

      it('should handle empty file', async () => {
        const inputPath = path.join(tempDir, 'empty.txt');
        const encryptedPath = path.join(tempDir, 'empty.enc');
        const decryptedPath = path.join(tempDir, 'empty-decrypted.txt');

        await fs.writeFile(inputPath, '', 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file
        await encryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content is empty
        const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
        expect(decryptedContent).toBe('');
      });
    });

    describe('Key Derivation', () => {
      let encryption: Encryption;

      beforeEach(async () => {
        encryption = await getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          keyDerivation: {
            password: 'test-password',
            salt: 'test-salt',
            iterations: 100000
          }
        });
      });

      it('should encrypt and decrypt with derived key', async () => {
        const inputPath = path.join(tempDir, 'input.txt');
        const encryptedPath = path.join(tempDir, 'encrypted.enc');
        const decryptedPath = path.join(tempDir, 'decrypted.txt');

        const content = 'Message encrypted with derived key';
        await fs.writeFile(inputPath, content, 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Decrypt file with same derived key
        const decryptEncryption = await getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          keyDerivation: {
            password: 'test-password',
            salt: 'test-salt',
            iterations: 100000
          }
        });

        await decryptEncryption.decryptFile(encryptedPath, decryptedPath);

        // Verify decrypted content matches original
        const decryptedContent = await fs.readFile(decryptedPath, 'utf8');
        expect(decryptedContent).toBe(content);
      });

      it('should fail with wrong password', async () => {
        const inputPath = path.join(tempDir, 'input.txt');
        const encryptedPath = path.join(tempDir, 'encrypted.enc');
        const decryptedPath = path.join(tempDir, 'decrypted.txt');

        const content = 'Secret message';
        await fs.writeFile(inputPath, content, 'utf8');

        // Encrypt file
        await encryption.encryptFile(inputPath, encryptedPath);

        // Try to decrypt with wrong password
        const wrongEncryption = await getEncryption({
          type: 'node',
          algorithm: 'aes-256-gcm',
          keyDerivation: {
            password: 'wrong-password',
            salt: 'test-salt',
            iterations: 100000
          }
        });

        // Should fail to decrypt
        await expect(
          wrongEncryption.decryptFile(encryptedPath, decryptedPath)
        ).rejects.toThrow();
      });
    });
  });

  describe('Cross-adapter compatibility', () => {
    it('should not decrypt PGP file with NaCl', async () => {
      // Create PGP encrypted file
      const pgp = await getEncryption({ type: 'pgp' });
      const keypair = await pgp.generateKeyPair({
        name: 'Test',
        email: 'test@example.com',
        passphrase: 'pass',
        type: 'rsa',
        keySize: 2048
      });

      const pgpEncryption = await getEncryption({
        type: 'pgp',
        publicKey: keypair.publicKey as string,
        privateKey: keypair.privateKey as string,
        passphrase: 'pass'
      });

      const inputPath = path.join(tempDir, 'input.txt');
      const encryptedPath = path.join(tempDir, 'pgp.enc');
      const decryptedPath = path.join(tempDir, 'decrypted.txt');

      await fs.writeFile(inputPath, 'Test message', 'utf8');
      await pgpEncryption.encryptFile(inputPath, encryptedPath);

      // Try to decrypt with NaCl
      const naclEncryption = await getEncryption({
        type: 'nacl',
        secretKey: crypto.randomBytes(32)
      });

      await expect(
        naclEncryption.decryptFile(encryptedPath, decryptedPath)
      ).rejects.toThrow();
    });

    it('should not decrypt NaCl file with Node crypto', async () => {
      // Create NaCl encrypted file
      const naclEncryption = await getEncryption({
        type: 'nacl',
        secretKey: crypto.randomBytes(32)
      });

      const inputPath = path.join(tempDir, 'input.txt');
      const encryptedPath = path.join(tempDir, 'nacl.enc');
      const decryptedPath = path.join(tempDir, 'decrypted.txt');

      await fs.writeFile(inputPath, 'Test message', 'utf8');
      await naclEncryption.encryptFile(inputPath, encryptedPath);

      // Try to decrypt with Node crypto
      const nodeEncryption = await getEncryption({
        type: 'node',
        algorithm: 'aes-256-gcm',
        key: crypto.randomBytes(32)
      });

      await expect(
        nodeEncryption.decryptFile(encryptedPath, decryptedPath)
      ).rejects.toThrow();
    });
  });
});
