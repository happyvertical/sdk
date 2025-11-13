/**
 * Email encryption integration
 *
 * This module provides types and utilities for integrating email encryption
 * with the @happyvertical/messages package.
 *
 * ## Usage
 *
 * The @happyvertical/encryption package (when available) will provide
 * the actual encryption implementations. This module defines the interface.
 *
 * ### Checking for Encryption Support
 *
 * ```typescript
 * import { hasEncryption } from '@happyvertical/messages/encryption';
 *
 * if (hasEncryption()) {
 *   // Encryption package is installed
 *   const { getEncryption } = await import('@happyvertical/encryption');
 *   // Use encryption...
 * } else {
 *   console.warn('Encryption not available. Install @happyvertical/encryption');
 * }
 * ```
 *
 * ### Encrypting and Sending Email
 *
 * ```typescript
 * import { getMailbox } from '@happyvertical/messages';
 * import { getEncryption } from '@happyvertical/encryption';
 *
 * // Setup mailbox
 * const mailbox = await getMailbox({
 *   type: 'smtp',
 *   host: 'smtp.example.com',
 *   port: 587,
 *   auth: { user: 'user@example.com', pass: 'password' }
 * });
 *
 * // Setup encryption
 * const encryption = await getEncryption({
 *   type: 'pgp',
 *   publicKey: recipientPublicKeyArmored,
 *   privateKey: myPrivateKeyArmored,
 *   passphrase: 'my-key-passphrase'
 * });
 *
 * // Create message
 * const message = {
 *   from: { address: 'user@example.com' },
 *   to: [{ address: 'recipient@example.com' }],
 *   subject: 'Confidential Information',
 *   text: 'This is a secret message',
 * };
 *
 * // Encrypt and send
 * const encrypted = await encryption.encryptEmail(message, {
 *   publicKey: recipientPublicKey,
 *   sign: true,
 *   armor: true
 * });
 *
 * await mailbox.send(encrypted);
 * ```
 *
 * ### Receiving and Decrypting Email
 *
 * ```typescript
 * import { getMailbox } from '@happyvertical/messages';
 * import { getEncryption } from '@happyvertical/encryption';
 *
 * // Setup IMAP
 * const imap = await getMailbox({
 *   type: 'imap',
 *   host: 'imap.example.com',
 *   port: 993,
 *   secure: true,
 *   auth: { user: 'user@example.com', pass: 'password' }
 * });
 *
 * // Setup encryption
 * const encryption = await getEncryption({
 *   type: 'pgp',
 *   privateKey: myPrivateKeyArmored,
 *   passphrase: 'my-key-passphrase'
 * });
 *
 * await imap.connect();
 *
 * // Fetch encrypted messages
 * const messages = await imap.fetch({ limit: 10 });
 *
 * // Decrypt each message
 * for (const msg of messages) {
 *   try {
 *     const decrypted = await encryption.decryptEmail(msg, {
 *       privateKey: myPrivateKey,
 *       passphrase: 'my-key-passphrase',
 *       verify: true
 *     });
 *
 *     console.log('From:', decrypted.from.address);
 *     console.log('Subject:', decrypted.subject);
 *     console.log('Body:', decrypted.text);
 *     console.log('Signed:', decrypted.signed);
 *     console.log('Verified:', decrypted.verified);
 *   } catch (error) {
 *     console.error('Failed to decrypt:', error);
 *   }
 * }
 *
 * await imap.disconnect();
 * ```
 *
 * ### S/MIME Support
 *
 * When S/MIME support is added to @happyvertical/encryption:
 *
 * ```typescript
 * import { getEncryption } from '@happyvertical/encryption';
 *
 * const encryption = await getEncryption({
 *   type: 'smime',
 *   certificate: myCertificatePEM,
 *   privateKey: myPrivateKeyPEM,
 *   passphrase: 'key-passphrase'
 * });
 *
 * // Encrypt with S/MIME
 * const encrypted = await encryption.encryptEmail(message, {
 *   certificate: recipientCertificate
 * });
 * ```
 *
 * ## Requirements for @happyvertical/encryption
 *
 * The encryption package should provide:
 *
 * 1. **PGP/GPG Adapter** (via OpenPGP.js):
 *    - Key generation, import, export
 *    - Encryption/decryption
 *    - Signing/verification
 *    - Keyring management
 *
 * 2. **S/MIME Adapter** (future):
 *    - Certificate-based encryption
 *    - X.509 certificate management
 *    - CRL and OCSP validation
 *
 * 3. **Key Management**:
 *    - Secure key storage
 *    - Key rotation
 *    - Passphrase protection
 *    - Hardware security module (HSM) support
 *
 * @packageDocumentation
 */

export type {
  DecryptEmailOptions,
  DecryptedEmail,
  EmailEncryption,
  EncryptEmailOptions,
  SignEmailOptions,
  VerificationResult,
  VerifyEmailOptions,
} from './types';

export { hasEncryption } from './types';
