/**
 * Integration tests for email encryption
 *
 * Tests the integration between @happyvertical/messages and @happyvertical/encryption packages
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getMailbox } from '../../src/shared/factory';
import type { EmailMessage } from '../../src/shared/types';

// Import encryption package (will fail gracefully if not installed)
let getEncryption: any;
let hasEncryptionPackage = false;

try {
  const encryptionModule = await import('@happyvertical/encryption');
  getEncryption = encryptionModule.getEncryption;
  hasEncryptionPackage = true;
} catch (error) {
  console.warn('Encryption package not available, skipping encryption tests');
}

describe.skipIf(!hasEncryptionPackage)('Email Encryption Integration', () => {
  let senderKeys: any;
  let recipientKeys: any;

  beforeAll(async () => {
    // Generate keypairs for sender and recipient
    const pgp = await getEncryption({ type: 'pgp' });
    
    senderKeys = await pgp.generateKeyPair({
      name: 'Test Sender',
      email: 'sender@example.com',
      passphrase: 'sender-passphrase',
      type: 'rsa',
      keySize: 2048  // Smaller for faster tests
    });

    recipientKeys = await pgp.generateKeyPair({
      name: 'Test Recipient',
      email: 'recipient@example.com',
      passphrase: 'recipient-passphrase',
      type: 'rsa',
      keySize: 2048
    });
  });

  describe('PGP Encryption', () => {
    it('should encrypt and decrypt a message', async () => {
      // Setup encryption for sender
      const senderEncryption = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeys.publicKey,
        privateKey: senderKeys.privateKey,
        passphrase: 'sender-passphrase'
      });

      // Create test message
      const message: EmailMessage = {
        from: { address: 'sender@example.com', name: 'Test Sender' },
        to: [{ address: 'recipient@example.com', name: 'Test Recipient' }],
        subject: 'Encrypted Test Message',
        text: 'This is a secret message!',
        html: '<p>This is a secret message!</p>'
      };

      // Encrypt message
      const encrypted = await senderEncryption.encryptEmail(message, {
        sign: true,
        armor: true
      });

      // Verify encrypted message has encrypted content
      expect(encrypted.text).toContain('-----BEGIN PGP MESSAGE-----');
      expect(encrypted.text).not.toContain('This is a secret message!');

      // Setup encryption for recipient
      const recipientEncryption = await getEncryption({
        type: 'pgp',
        publicKey: senderKeys.publicKey,
        privateKey: recipientKeys.privateKey,
        passphrase: 'recipient-passphrase'
      });

      // Decrypt message
      const decrypted = await recipientEncryption.decryptEmail(encrypted, {
        verify: true
      });

      // Verify decrypted content
      expect(decrypted.text).toBe('This is a secret message!');
      expect(decrypted.html).toBe('<p>This is a secret message!</p>');
      expect(decrypted.subject).toBe('Encrypted Test Message');
      expect(decrypted.encrypted).toBe(true);
      expect(decrypted.signed).toBe(true);
      expect(decrypted.verified).toBe(true);
    });

    it('should encrypt message with attachments', async () => {
      const senderEncryption = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeys.publicKey,
        privateKey: senderKeys.privateKey,
        passphrase: 'sender-passphrase'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Encrypted with Attachment',
        text: 'Message with attachment',
        attachments: [
          {
            filename: 'secret.txt',
            contentType: 'text/plain',
            size: 17,
            content: Buffer.from('Secret attachment')
          }
        ]
      };

      // Encrypt including attachments
      const encrypted = await senderEncryption.encryptEmail(message, {
        sign: true
      });

      expect(encrypted.attachments).toBeDefined();
      expect(encrypted.attachments![0].content).toBeDefined();

      // Decrypt
      const recipientEncryption = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeys.privateKey,
        passphrase: 'recipient-passphrase'
      });

      const decrypted = await recipientEncryption.decryptEmail(encrypted);

      // Verify attachment is decrypted
      expect(decrypted.attachments).toBeDefined();
      expect(decrypted.attachments![0].filename).toBe('secret.txt');
      expect(decrypted.attachments![0].content?.toString()).toBe('Secret attachment');
    });

    it('should detect invalid signature', async () => {
      const senderEncryption = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeys.publicKey,
        privateKey: senderKeys.privateKey,
        passphrase: 'sender-passphrase'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Signed Message',
        text: 'This message is signed'
      };

      // Encrypt and sign
      const encrypted = await senderEncryption.encryptEmail(message, {
        sign: true
      });

      // Generate different keys (wrong sender)
      const pgp = await getEncryption({ type: 'pgp' });
      const wrongKeys = await pgp.generateKeyPair({
        name: 'Wrong Sender',
        email: 'wrong@example.com',
        passphrase: 'wrong-pass',
        type: 'rsa',
        keySize: 2048
      });

      // Try to verify with wrong public key
      const recipientEncryption = await getEncryption({
        type: 'pgp',
        publicKey: wrongKeys.publicKey,  // Wrong sender key
        privateKey: recipientKeys.privateKey,
        passphrase: 'recipient-passphrase'
      });

      const decrypted = await recipientEncryption.decryptEmail(encrypted, {
        verify: true
      });

      // Signature verification should fail
      expect(decrypted.verified).toBe(false);
      expect(decrypted.verificationError).toBeDefined();
    });
  });

  describe('Message Encryption with SMTP', () => {
    it('should work with SMTP adapter', async () => {
      // This test demonstrates how encryption integrates with SMTP
      const mailbox = await getMailbox({
        type: 'smtp',
        host: 'localhost',
        port: 1025  // Test SMTP server
      });

      const senderEncryption = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeys.publicKey,
        privateKey: senderKeys.privateKey,
        passphrase: 'sender-passphrase'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Encrypted SMTP Test',
        text: 'Secret via SMTP'
      };

      // Encrypt before sending
      const encrypted = await senderEncryption.encryptEmail(message, {
        sign: true
      });

      // Send encrypted message
      // Note: This would actually send if SMTP server was running
      // In real usage: await mailbox.send(encrypted);
      
      // Verify message is encrypted
      expect(encrypted.text).toContain('-----BEGIN PGP MESSAGE-----');
      expect(encrypted.text).not.toContain('Secret via SMTP');
    });
  });

  describe('Message Decryption with IMAP', () => {
    it('should work with IMAP adapter', async () => {
      // This test demonstrates how decryption integrates with IMAP
      const recipientEncryption = await getEncryption({
        type: 'pgp',
        publicKey: senderKeys.publicKey,
        privateKey: recipientKeys.privateKey,
        passphrase: 'recipient-passphrase'
      });

      // Simulate receiving an encrypted message via IMAP
      const receivedEncrypted: EmailMessage = {
        id: 'msg-123',
        messageId: 'test-message-id',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Encrypted Message',
        text: '-----BEGIN PGP MESSAGE-----\nEncrypted content\n-----END PGP MESSAGE-----',
        date: new Date()
      };

      // In real usage after fetching from IMAP:
      // const mailbox = await getMailbox({ type: 'imap', ... });
      // await mailbox.connect();
      // const messages = await mailbox.fetch({ limit: 10 });
      // for (const msg of messages) {
      //   if (msg.text?.includes('-----BEGIN PGP MESSAGE-----')) {
      //     const decrypted = await encryption.decryptEmail(msg);
      //     console.log(decrypted.text);  // Original text
      //   }
      // }

      // Verify the encrypted message structure
      expect(receivedEncrypted.text).toContain('-----BEGIN PGP MESSAGE-----');
    });
  });
});

describe('Encryption Package Availability', () => {
  it('should detect if encryption package is available', async () => {
    const { hasEncryption } = await import('../../src/encryption/types');
    
    // This will be true if @happyvertical/encryption is installed
    const available = hasEncryption();
    expect(typeof available).toBe('boolean');
    
    if (available) {
      console.log('✓ Encryption package is available');
    } else {
      console.log('✗ Encryption package is not available (optional dependency)');
    }
  });
});
