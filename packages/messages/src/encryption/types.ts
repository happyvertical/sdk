/**
 * Encryption integration types for @happyvertical/messages
 *
 * These types define the interface that @happyvertical/encryption package
 * should implement for email encryption support.
 */

import type { EmailMessage } from '../shared/types';

/**
 * Encryption adapter interface for email operations
 *
 * The @happyvertical/encryption package should provide adapters
 * that implement this interface for different encryption methods
 * (PGP, S/MIME, etc.)
 */
export interface EmailEncryption {
  /**
   * Encrypt an email message
   *
   * @param message - Email message to encrypt
   * @param options - Encryption options
   * @returns Encrypted email message
   */
  encryptEmail(
    message: EmailMessage,
    options: EncryptEmailOptions,
  ): Promise<EmailMessage>;

  /**
   * Decrypt an email message
   *
   * @param message - Encrypted email message
   * @param options - Decryption options
   * @returns Decrypted email with verification info
   */
  decryptEmail(
    message: EmailMessage,
    options: DecryptEmailOptions,
  ): Promise<DecryptedEmail>;

  /**
   * Sign an email message
   *
   * @param message - Email message to sign
   * @param options - Signing options
   * @returns Signed email message
   */
  signEmail(
    message: EmailMessage,
    options: SignEmailOptions,
  ): Promise<EmailMessage>;

  /**
   * Verify an email signature
   *
   * @param message - Signed email message
   * @param options - Verification options
   * @returns Verification result
   */
  verifyEmail(
    message: EmailMessage,
    options: VerifyEmailOptions,
  ): Promise<VerificationResult>;
}

/**
 * Options for encrypting an email
 */
export interface EncryptEmailOptions {
  /**
   * Recipient public key (PGP/GPG armored format)
   */
  publicKey?: string;

  /**
   * Multiple recipient public keys for encrypting to multiple recipients
   */
  publicKeys?: string[];

  /**
   * Whether to also sign the message with the sender's private key
   */
  sign?: boolean;

  /**
   * Sender's private key for signing (if sign is true)
   */
  privateKey?: string;

  /**
   * Passphrase for the private key (if encrypted)
   */
  passphrase?: string;

  /**
   * Output format (ASCII-armored or binary)
   * @default true
   */
  armor?: boolean;

  /**
   * Whether to compress the message before encrypting
   * @default true
   */
  compression?: boolean;
}

/**
 * Options for decrypting an email
 */
export interface DecryptEmailOptions {
  /**
   * Private key for decryption (PGP/GPG armored format)
   */
  privateKey: string;

  /**
   * Passphrase for the private key
   */
  passphrase?: string;

  /**
   * Whether to verify the signature if present
   * @default true
   */
  verify?: boolean;

  /**
   * Sender's public key for signature verification (if verify is true)
   */
  senderPublicKey?: string;
}

/**
 * Options for signing an email
 */
export interface SignEmailOptions {
  /**
   * Private key for signing (PGP/GPG armored format)
   */
  privateKey: string;

  /**
   * Passphrase for the private key
   */
  passphrase?: string;

  /**
   * Create a detached signature
   * @default false
   */
  detached?: boolean;

  /**
   * Output format (ASCII-armored or binary)
   * @default true
   */
  armor?: boolean;
}

/**
 * Options for verifying an email signature
 */
export interface VerifyEmailOptions {
  /**
   * Public key for verification (PGP/GPG armored format)
   */
  publicKey: string;

  /**
   * Detached signature data (if not embedded in message)
   */
  signature?: string;
}

/**
 * Decrypted email with metadata
 */
export interface DecryptedEmail extends EmailMessage {
  /**
   * Whether the message was encrypted
   */
  encrypted: boolean;

  /**
   * Whether the message was signed
   */
  signed: boolean;

  /**
   * Whether the signature was verified (if signed)
   */
  verified?: boolean;

  /**
   * Key ID of the signer
   */
  signerKeyId?: string;

  /**
   * Fingerprint of the signing key
   */
  signerFingerprint?: string;

  /**
   * When the signature was created
   */
  signatureTimestamp?: Date;

  /**
   * Error message if verification failed
   */
  verificationError?: string;
}

/**
 * Result of signature verification
 */
export interface VerificationResult {
  /**
   * Whether the signature is valid
   */
  valid: boolean;

  /**
   * Key ID that created the signature
   */
  keyId: string;

  /**
   * Fingerprint of the signing key
   */
  keyFingerprint: string;

  /**
   * When the signature was created
   */
  timestamp: Date;

  /**
   * Error or warning message
   */
  message?: string;
}

/**
 * Type guard to check if encryption is available
 *
 * @example
 * ```typescript
 * import { hasEncryption } from '@happyvertical/messages/encryption';
 *
 * if (hasEncryption()) {
 *   const { getEncryption } = await import('@happyvertical/encryption');
 *   const encryption = await getEncryption({ type: 'pgp' });
 *   // Use encryption
 * }
 * ```
 */
export function hasEncryption(): boolean {
  try {
    require.resolve('@happyvertical/encryption');
    return true;
  } catch {
    return false;
  }
}
