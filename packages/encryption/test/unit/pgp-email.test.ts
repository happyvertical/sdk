import { describe, expect, it, beforeEach } from 'vitest';
import { getEncryption } from '../../src/index.js';
import type {
  Encryption,
  KeyPair,
  EmailMessage,
  DecryptedEmail,
  VerificationResult
} from '../../src/shared/types.js';

describe('PGP Email Operations', () => {
  let pgp: Encryption;
  let senderKeypair: KeyPair;
  let recipientKeypair: KeyPair;

  beforeEach(async () => {
    pgp = await getEncryption({ type: 'pgp' });

    // Generate sender keypair
    senderKeypair = await pgp.generateKeyPair({
      name: 'Sender User',
      email: 'sender@example.com',
      passphrase: 'sender-pass',
      type: 'rsa',
      keySize: 2048
    });

    // Generate recipient keypair
    recipientKeypair = await pgp.generateKeyPair({
      name: 'Recipient User',
      email: 'recipient@example.com',
      passphrase: 'recipient-pass',
      type: 'rsa',
      keySize: 2048
    });
  });

  describe('Email Encryption/Decryption', () => {
    it('should encrypt and decrypt email message', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeypair.publicKey as string,
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com', name: 'Sender User' },
        to: [{ address: 'recipient@example.com', name: 'Recipient User' }],
        subject: 'Confidential Message',
        text: 'This is a secret message',
        html: '<p>This is a <strong>secret</strong> message</p>'
      };

      // Encrypt the email
      const encrypted = await senderPgp.encryptEmail!(message);

      expect(encrypted.text).toBeDefined();
      expect(encrypted.text).not.toBe(message.text);
      expect(encrypted.text).toContain('-----BEGIN PGP MESSAGE-----');
      expect(encrypted.html).toBeUndefined();
      expect(encrypted.contentType).toContain('multipart/encrypted');

      // Decrypt the email
      const recipientPgp = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });

      const decrypted = await recipientPgp.decryptEmail!(encrypted);

      expect(decrypted.encrypted).toBe(true);
      expect(decrypted.text).toContain('This is a secret message');
      expect(decrypted.html).toContain('<p>This is a <strong>secret</strong> message</p>');
      expect(decrypted.subject).toBe('Confidential Message');
    });

    it('should encrypt and decrypt email with subject encryption', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeypair.publicKey as string,
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Secret Subject',
        text: 'Secret content'
      };

      // Encrypt with subject encryption
      const encrypted = await senderPgp.encryptEmail!(message, {
        encryptSubject: true
      });

      // Decrypt
      const recipientPgp = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });

      const decrypted = await recipientPgp.decryptEmail!(encrypted);

      expect(decrypted.subject).toBe('Secret Subject');
      expect(decrypted.text).toContain('Secret content');
    });

    it('should encrypt, sign, decrypt and verify email', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeypair.publicKey as string,
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Signed Message',
        text: 'This message is signed'
      };

      // Encrypt and sign
      const encrypted = await senderPgp.encryptEmail!(message, {
        sign: true
      });

      // Decrypt and verify
      const recipientPgp = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });

      const decrypted = await recipientPgp.decryptEmail!(encrypted, {
        verify: true,
        publicKey: senderKeypair.publicKey as string
      });

      expect(decrypted.encrypted).toBe(true);
      expect(decrypted.signed).toBe(true);
      expect(decrypted.verified).toBe(true);
      expect(decrypted.signerKeyId).toBeDefined();
      expect(decrypted.signerFingerprint).toBeDefined();
      expect(decrypted.text).toContain('This message is signed');
    });

    it('should handle email without text content', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeypair.publicKey as string
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Empty Message',
        text: ''
      };

      const encrypted = await senderPgp.encryptEmail!(message);

      const recipientPgp = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });

      const decrypted = await recipientPgp.decryptEmail!(encrypted);

      expect(decrypted.subject).toBe('Empty Message');
      expect(decrypted.encrypted).toBe(true);
    });

    it('should handle email with attachments metadata', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeypair.publicKey as string
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Message with Attachments',
        text: 'See attached files',
        attachments: [
          {
            filename: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024,
            content: Buffer.from('fake pdf content')
          },
          {
            filename: 'image.png',
            contentType: 'image/png',
            size: 2048
          }
        ]
      };

      const encrypted = await senderPgp.encryptEmail!(message);

      // Check that attachment metadata is preserved in original message
      expect(message.attachments?.length).toBe(2);

      const recipientPgp = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });

      const decrypted = await recipientPgp.decryptEmail!(encrypted);

      expect(decrypted.text).toContain('See attached files');
    });
  });

  describe('Email Signing/Verification', () => {
    it('should sign email message', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Signed Email',
        text: 'This email is signed'
      };

      const signed = await senderPgp.signEmail!(message);

      expect(signed.text).toBeDefined();
      expect(signed.text).toContain('-----BEGIN PGP SIGNED MESSAGE-----');
      expect(signed.contentType).toContain('text/plain');
    });

    it('should verify signed email', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Signed Email',
        text: 'This email is signed'
      };

      const signed = await senderPgp.signEmail!(message);

      // Verify the signature
      const recipientPgp = await getEncryption({ type: 'pgp' });

      const result: VerificationResult = await recipientPgp.verifyEmail!(signed, {
        publicKey: senderKeypair.publicKey as string
      });

      expect(result.valid).toBe(true);
      expect(result.keyId).toBeDefined();
      expect(result.keyFingerprint).toBeDefined();
      expect(result.algorithm).toBe('pgp');
    });

    it('should detect tampered signed email', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Signed Email',
        text: 'This email is signed'
      };

      const signed = await senderPgp.signEmail!(message);

      // Tamper with the message
      const tamperedSigned: EmailMessage = {
        ...signed,
        text: signed.text?.replace('This email is signed', 'This email is tampered')
      };

      // Verify should fail
      const recipientPgp = await getEncryption({ type: 'pgp' });

      const result: VerificationResult = await recipientPgp.verifyEmail!(
        tamperedSigned,
        {
          publicKey: senderKeypair.publicKey as string
        }
      );

      expect(result.valid).toBe(false);
    });

    it('should sign email with custom key', async () => {
      const customKeypair = await pgp.generateKeyPair({
        name: 'Custom Signer',
        email: 'custom@example.com',
        passphrase: 'custom-pass',
        type: 'rsa',
        keySize: 2048
      });

      const senderPgp = await getEncryption({ type: 'pgp' });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Custom Signed',
        text: 'Signed with custom key'
      };

      const signed = await senderPgp.signEmail!(message, {
        privateKey: customKeypair.privateKey as string,
        passphrase: 'custom-pass'
      });

      expect(signed.text).toContain('-----BEGIN PGP SIGNED MESSAGE-----');

      // Verify with custom public key
      const result = await senderPgp.verifyEmail!(signed, {
        publicKey: customKeypair.publicKey as string
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('Multiple Recipients', () => {
    it('should encrypt email for multiple recipients', async () => {
      const recipient2Keypair = await pgp.generateKeyPair({
        name: 'Recipient 2',
        email: 'recipient2@example.com',
        passphrase: 'pass2',
        type: 'rsa',
        keySize: 2048
      });

      const recipient3Keypair = await pgp.generateKeyPair({
        name: 'Recipient 3',
        email: 'recipient3@example.com',
        passphrase: 'pass3',
        type: 'rsa',
        keySize: 2048
      });

      const senderPgp = await getEncryption({
        type: 'pgp',
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [
          { address: 'recipient@example.com' },
          { address: 'recipient2@example.com' },
          { address: 'recipient3@example.com' }
        ],
        subject: 'Group Message',
        text: 'Message for everyone'
      };

      const encrypted = await senderPgp.encryptEmail!(message, {
        publicKeys: [
          recipientKeypair.publicKey as string,
          recipient2Keypair.publicKey as string,
          recipient3Keypair.publicKey as string
        ]
      });

      // All recipients should be able to decrypt
      const pgp1 = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });
      const decrypted1 = await pgp1.decryptEmail!(encrypted);
      expect(decrypted1.text).toContain('Message for everyone');

      const pgp2 = await getEncryption({
        type: 'pgp',
        privateKey: recipient2Keypair.privateKey as string,
        passphrase: 'pass2'
      });
      const decrypted2 = await pgp2.decryptEmail!(encrypted);
      expect(decrypted2.text).toContain('Message for everyone');

      const pgp3 = await getEncryption({
        type: 'pgp',
        privateKey: recipient3Keypair.privateKey as string,
        passphrase: 'pass3'
      });
      const decrypted3 = await pgp3.decryptEmail!(encrypted);
      expect(decrypted3.text).toContain('Message for everyone');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when encrypting without public key', async () => {
      const senderPgp = await getEncryption({ type: 'pgp' });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test'
      };

      await expect(senderPgp.encryptEmail!(message)).rejects.toThrow();
    });

    it('should throw error when decrypting without private key', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        publicKey: recipientKeypair.publicKey as string
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test'
      };

      const encrypted = await senderPgp.encryptEmail!(message);

      const recipientPgp = await getEncryption({ type: 'pgp' });

      await expect(recipientPgp.decryptEmail!(encrypted)).rejects.toThrow();
    });

    it('should throw error when signing without private key', async () => {
      const senderPgp = await getEncryption({ type: 'pgp' });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test'
      };

      await expect(senderPgp.signEmail!(message)).rejects.toThrow();
    });

    it('should return error when verifying without public key', async () => {
      const senderPgp = await getEncryption({
        type: 'pgp',
        privateKey: senderKeypair.privateKey as string,
        passphrase: 'sender-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test'
      };

      const signed = await senderPgp.signEmail!(message);

      const recipientPgp = await getEncryption({ type: 'pgp' });

      const result = await recipientPgp.verifyEmail!(signed, {} as any);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Public key required');
    });

    it('should throw error when decrypting email without text', async () => {
      const recipientPgp = await getEncryption({
        type: 'pgp',
        privateKey: recipientKeypair.privateKey as string,
        passphrase: 'recipient-pass'
      });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Empty',
        text: undefined
      };

      await expect(recipientPgp.decryptEmail!(message)).rejects.toThrow();
    });

    it('should return error when verifying email without text', async () => {
      const recipientPgp = await getEncryption({ type: 'pgp' });

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Empty',
        text: undefined
      };

      const result = await recipientPgp.verifyEmail!(message, {
        publicKey: senderKeypair.publicKey as string
      });

      expect(result.valid).toBe(false);
      expect(result.message).toContain('no text content');
    });
  });
});
