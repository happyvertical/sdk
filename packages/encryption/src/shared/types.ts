import type { Transform } from 'node:stream';

/**
 * Adapter types supported by the encryption package
 */
export type AdapterType = 'pgp' | 'nacl' | 'node';

/**
 * Core Encryption interface that all adapters must implement
 */
export interface Encryption {
  // Text operations
  encryptText(text: string, options?: EncryptOptions): Promise<string>;
  decryptText(encrypted: string, options?: DecryptOptions): Promise<string>;

  // File operations
  encryptFile(
    inputPath: string,
    outputPath: string,
    options?: EncryptOptions,
  ): Promise<void>;
  decryptFile(
    inputPath: string,
    outputPath: string,
    options?: DecryptOptions,
  ): Promise<void>;

  // Buffer operations
  encryptBuffer(buffer: Buffer, options?: EncryptOptions): Promise<Buffer>;
  decryptBuffer(buffer: Buffer, options?: DecryptOptions): Promise<Buffer>;

  // Stream operations (optional)
  encryptStream?(options?: EncryptOptions): Transform;
  decryptStream?(options?: DecryptOptions): Transform;

  // Email operations (optional, mainly PGP)
  encryptEmail?(
    message: EmailMessage,
    options?: EncryptEmailOptions,
  ): Promise<EmailMessage>;
  decryptEmail?(
    message: EmailMessage,
    options?: DecryptEmailOptions,
  ): Promise<DecryptedEmail>;
  signEmail?(
    message: EmailMessage,
    options?: SignEmailOptions,
  ): Promise<EmailMessage>;
  verifyEmail?(
    message: EmailMessage,
    options?: VerifyEmailOptions,
  ): Promise<VerificationResult>;

  // Signing operations (optional, mainly PGP)
  sign?(data: string | Buffer, options?: SignOptions): Promise<string | Buffer>;
  verify?(
    data: string | Buffer,
    signature: string | Buffer,
    options?: VerifyOptions,
  ): Promise<boolean>;

  // Key management
  generateKeyPair(options?: KeyPairOptions): Promise<KeyPair>;
  importKey(key: string | Buffer, options?: ImportKeyOptions): Promise<Key>;
  exportKey(key: Key, options?: ExportKeyOptions): Promise<string | Buffer>;

  // Adapter info
  getCapabilities(): Promise<EncryptionCapabilities>;
  getAdapter(): AdapterType;
}

/**
 * Options for encryption operations
 */
export interface EncryptOptions {
  // Encoding
  armor?: boolean; // ASCII-armored output (PGP)
  encoding?: 'base64' | 'hex' | 'utf8';

  // Compression
  compression?: boolean; // Compress before encrypting (PGP)

  // Recipients (PGP multiple recipients)
  publicKeys?: string[]; // Multiple recipient public keys
  recipientPublicKey?: string | Uint8Array | Buffer; // Single recipient (NaCl)

  // Signing
  sign?: boolean; // Sign with private key (PGP)
  privateKey?: string | Buffer; // Signing key

  // Authentication
  aad?: Buffer; // Additional authenticated data (AES-GCM)

  // Algorithm-specific
  [key: string]: unknown;
}

/**
 * Options for decryption operations
 */
export interface DecryptOptions {
  // Encoding
  encoding?: 'base64' | 'hex' | 'utf8';

  // Verification
  verify?: boolean; // Verify signature (PGP)
  publicKey?: string | Uint8Array | Buffer; // For signature verification

  // Keys
  privateKey?: string | Buffer;
  passphrase?: string;

  // Algorithm-specific
  [key: string]: unknown;
}

/**
 * Options for email encryption
 */
export interface EncryptEmailOptions {
  // Signing
  sign?: boolean; // Sign with private key
  privateKey?: string; // Override default private key
  passphrase?: string; // Override default passphrase

  // Encryption
  armor?: boolean; // ASCII-armored output (default: true)
  compression?: boolean; // Compress before encrypting
  encryptSubject?: boolean; // Encrypt subject line (hidden subject)

  // Recipients
  publicKeys?: string[]; // Override/additional recipient keys
}

/**
 * Options for email decryption
 */
export interface DecryptEmailOptions {
  // Verification
  verify?: boolean; // Verify signature
  publicKey?: string; // Sender's public key for verification

  // Decryption
  privateKey?: string; // Override default private key
  passphrase?: string; // Override default passphrase
}

/**
 * Decrypted email with encryption metadata
 */
export interface DecryptedEmail extends EmailMessage {
  // Encryption metadata
  encrypted: boolean; // Was encrypted
  signed: boolean; // Was signed
  verified?: boolean; // Signature verification result
  signerKeyId?: string; // Signer's key ID
  signerFingerprint?: string; // Signer's key fingerprint
  encryptionAlgorithm?: string; // Algorithm used
}

/**
 * Options for signing operations
 */
export interface SignOptions {
  // Key
  privateKey?: string | Buffer;
  passphrase?: string;

  // Options
  detached?: boolean; // Detached signature (PGP)
  armor?: boolean; // ASCII-armored output (PGP)
  algorithm?: string; // Hash algorithm (Node crypto)
}

/**
 * Options for signature verification
 */
export interface VerifyOptions {
  // Key
  publicKey: string | Uint8Array | Buffer;

  // Options
  detached?: boolean; // Signature is detached (PGP)
  algorithm?: string; // Hash algorithm (Node crypto)
}

/**
 * Email signing options
 */
export interface SignEmailOptions extends SignOptions {
  // Email-specific options
}

/**
 * Email verification options
 */
export interface VerifyEmailOptions extends VerifyOptions {
  // Email-specific options
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  keyId?: string;
  keyFingerprint?: string;
  timestamp?: Date;
  algorithm?: string;
  message?: string;
}

/**
 * Key pair
 */
export interface KeyPair {
  publicKey: string | Uint8Array | Buffer;
  privateKey: string | Uint8Array | Buffer;
  fingerprint?: string; // Key fingerprint (PGP)
  keyId?: string; // Key ID (PGP)
}

/**
 * Options for key pair generation
 */
export interface KeyPairOptions {
  // Common options
  name?: string; // Key owner name (PGP)
  email?: string; // Key owner email (PGP)
  passphrase?: string; // Private key passphrase

  // Algorithm selection
  type?: 'rsa' | 'ecc' | 'ecdsa' | 'ecdh';
  keySize?: number; // RSA key size (1024, 2048, 4096)
  curve?: string; // ECC curve ('curve25519', 'p256', 'p384', 'p521')

  // RSA-specific (Node crypto)
  modulusLength?: number;
  publicExponent?: number;
  publicKeyEncoding?: {
    type: 'spki' | 'pkcs1';
    format: 'pem' | 'der';
  };
  privateKeyEncoding?: {
    type: 'pkcs8' | 'pkcs1';
    format: 'pem' | 'der';
    cipher?: string;
    passphrase?: string;
  };

  // Expiration (PGP)
  expirationTime?: number; // Seconds until expiration
}

/**
 * Key object
 */
export interface Key {
  type: 'public' | 'private';
  format: 'armored' | 'binary' | 'pem' | 'der';
  data: string | Buffer | Uint8Array;
  fingerprint?: string;
  keyId?: string;
  algorithm?: string;
  created?: Date;
  expires?: Date;
  userIds?: Array<{ name?: string; email?: string }>;
}

/**
 * Options for key import
 */
export interface ImportKeyOptions {
  format?: 'armored' | 'binary' | 'pem' | 'der';
  type?: 'public' | 'private';
  passphrase?: string; // For encrypted private keys
}

/**
 * Options for key export
 */
export interface ExportKeyOptions {
  format?: 'armored' | 'binary' | 'pem' | 'der';
  armor?: boolean; // ASCII-armored (PGP)
  encrypt?: boolean; // Encrypt private key
  passphrase?: string; // For encrypting private keys
}

/**
 * Encryption capabilities
 */
export interface EncryptionCapabilities {
  textEncryption: boolean;
  fileEncryption: boolean;
  bufferEncryption: boolean;
  streamEncryption: boolean;
  emailEncryption: boolean;
  signing: boolean;
  verification: boolean;
  keyGeneration: boolean;
  keyManagement: boolean;
  multipleRecipients: boolean;
  symmetricEncryption: boolean;
  asymmetricEncryption: boolean;
}

/**
 * Email message structure (from @happyvertical/email)
 */
export interface EmailMessage {
  id?: string;
  messageId?: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  date?: Date;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  folder?: string;
  labels?: string[];
  flags?: string[];
  headers?: Record<string, string | string[]>;
  raw?: string;
  contentType?: string; // For encrypted messages
}

/**
 * Email address
 */
export interface EmailAddress {
  name?: string;
  address: string;
}

/**
 * Email attachment
 */
export interface Attachment {
  filename?: string;
  contentType: string;
  size: number;
  content?: Buffer;
  contentId?: string;
  contentDisposition?: 'attachment' | 'inline';
  path?: string;
}

/**
 * PGP adapter options
 */
export interface PGPOptions {
  type: 'pgp';

  // Keys
  publicKey?: string; // Armored public key
  privateKey?: string; // Armored private key
  passphrase?: string; // Private key passphrase

  // Multiple keys
  publicKeys?: string[]; // Multiple recipient keys
  privateKeys?: string[]; // Multiple private keys

  // Options
  armor?: boolean; // ASCII-armored output (default: true)
  compression?: boolean; // Compress before encrypting (default: true)

  // Logging
  debug?: boolean;
}

/**
 * NaCl adapter options
 */
export interface NaClOptions {
  type: 'nacl';

  // Keys for symmetric encryption (secretbox)
  secretKey?: Uint8Array | Buffer | string; // 32 bytes

  // Keys for asymmetric encryption (box)
  publicKey?: Uint8Array | Buffer | string; // 32 bytes

  // Encoding
  encoding?: 'base64' | 'hex' | 'utf8'; // For string keys (default: 'base64')

  // Logging
  debug?: boolean;
}

/**
 * Node.js crypto adapter options
 */
export interface NodeCryptoOptions {
  type: 'node';

  // Algorithm selection
  algorithm:
    | 'aes-256-gcm'
    | 'aes-256-cbc'
    | 'aes-128-gcm'
    | 'rsa'
    | 'rsa-oaep'
    | 'rsa-pss'
    | 'ecdh'
    | 'ecdsa'
    | string; // Any Node.js supported algorithm

  // Symmetric encryption keys
  key?: Buffer | string; // Encryption key
  keyDerivation?: {
    // Derive key from password
    password: string;
    salt?: Buffer | string;
    iterations?: number; // PBKDF2 iterations (default: 100000)
    keyLength?: number; // Key length in bytes
    digest?: string; // Hash algorithm (default: 'sha256')
  };

  // Asymmetric encryption keys
  publicKey?: string | Buffer; // PEM or DER format
  privateKey?: string | Buffer; // PEM or DER format
  passphrase?: string; // Private key passphrase

  // IV/nonce (generated if not provided)
  iv?: Buffer | string;

  // Encoding
  encoding?: 'hex' | 'base64' | 'utf8';

  // Logging
  debug?: boolean;
}

/**
 * Union type for all adapter options
 */
export type GetEncryptionOptions = PGPOptions | NaClOptions | NodeCryptoOptions;

/**
 * Configuration after validation
 */
export interface EncryptionConfig {
  type: AdapterType;
  debug?: boolean;
  [key: string]: unknown;
}
