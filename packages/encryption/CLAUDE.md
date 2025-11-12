# @happyvertical/encryption

Unified encryption and cryptography operations with adapter-based architecture supporting multiple encryption methods and use cases.

## Overview

`@happyvertical/encryption` provides a consistent interface for encryption operations following the same adapter pattern as other SDK packages. It supports multiple encryption methods (PGP, NaCl, Node crypto) and various use cases (text, files, buffers, streams).

**Key Features:**
- **Multi-method support**: PGP/OpenPGP, NaCl/libsodium, Node.js crypto
- **Type-safe operations**: Full TypeScript support with strict typing
- **Key management**: Generate, import, export, and store encryption keys
- **Multiple use cases**: Text, files, buffers, streams, email
- **Email integration**: Specialized methods for `@happyvertical/email` package
- **Unified interface**: Same patterns as other SDK packages

## Quick Start

### Installation

```bash
pnpm add @happyvertical/encryption
```

### Basic Usage

```typescript
import { getEncryption } from '@happyvertical/encryption';

// PGP encryption
const pgp = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKeyArmored,
  privateKey: myPrivateKeyArmored,
  passphrase: 'my-key-passphrase'
});

// Encrypt text
const encrypted = await pgp.encryptText('Secret message', {
  armor: true
});

// Decrypt text
const decrypted = await pgp.decryptText(encrypted);
console.log(decrypted); // 'Secret message'

// Encrypt file
await pgp.encryptFile('/path/to/file.txt', '/path/to/file.txt.pgp');

// Decrypt file
await pgp.decryptFile('/path/to/file.txt.pgp', '/path/to/file.txt');
```

### NaCl for Modern Cryptography

```typescript
import { getEncryption } from '@happyvertical/encryption';

// NaCl encryption (modern, fast, secure)
const nacl = await getEncryption({
  type: 'nacl',
  secretKey: mySecretKey,  // Or generate new keypair
  publicKey: recipientPublicKey
});

// Symmetric encryption (secretbox)
const encrypted = await nacl.encryptText('Secret message');

// Asymmetric encryption (box)
const encrypted = await nacl.encryptText('Secret message', {
  recipientPublicKey: theirPublicKey
});

// Decrypt
const decrypted = await nacl.decryptText(encrypted);
```

### Node.js Crypto for Standard Algorithms

```typescript
import { getEncryption } from '@happyvertical/encryption';

// Node crypto (AES, RSA, etc.)
const crypto = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  key: encryptionKey
});

// Encrypt with AES
const encrypted = await crypto.encryptText('Secret message');

// Decrypt
const decrypted = await crypto.decryptText(encrypted);

// RSA encryption
const rsa = await getEncryption({
  type: 'node',
  algorithm: 'rsa',
  publicKey: publicKeyPem,
  privateKey: privateKeyPem
});

const encrypted = await rsa.encryptText('Secret message');
const decrypted = await rsa.decryptText(encrypted);
```

### Email-Specific Usage

```typescript
import { getEncryption } from '@happyvertical/encryption';

const pgp = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKey,
  privateKey: myPrivateKey,
  passphrase: 'passphrase'
});

// Encrypt email message
const emailMessage = {
  from: { address: 'sender@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Confidential',
  text: 'Secret content',
  html: '<p>Secret content</p>'
};

const encrypted = await pgp.encryptEmail(emailMessage, {
  sign: true,  // Also sign with private key
  armor: true
});

// Send encrypted message with @happyvertical/email
const mailbox = await getMailbox({ type: 'smtp', /* ... */ });
await mailbox.send(encrypted);

// Receive and decrypt
const received = await mailbox.fetch({ limit: 1 });
const decrypted = await pgp.decryptEmail(received[0], {
  verify: true
});

console.log(decrypted.text);      // Original plain text
console.log(decrypted.verified);  // Signature verification result
```

### Key Generation

```typescript
import { getEncryption } from '@happyvertical/encryption';

// Generate PGP keypair
const pgp = await getEncryption({ type: 'pgp' });
const keypair = await pgp.generateKeyPair({
  name: 'John Doe',
  email: 'john@example.com',
  passphrase: 'strong-passphrase',
  keySize: 4096
});

console.log(keypair.publicKey);   // Armored public key
console.log(keypair.privateKey);  // Armored private key
console.log(keypair.fingerprint); // Key fingerprint

// Generate NaCl keypair
const nacl = await getEncryption({ type: 'nacl' });
const keypair = await nacl.generateKeyPair();
console.log(keypair.publicKey);   // Uint8Array(32)
console.log(keypair.secretKey);   // Uint8Array(32)

// Generate RSA keypair
const rsa = await getEncryption({
  type: 'node',
  algorithm: 'rsa'
});
const keypair = await rsa.generateKeyPair({
  modulusLength: 4096
});
console.log(keypair.publicKey);   // PEM format
console.log(keypair.privateKey);  // PEM format
```

## Core Architecture

### Encryption Interface

All adapters implement the `Encryption` interface:

```typescript
interface Encryption {
  // Text operations
  encryptText(text: string, options?: EncryptOptions): Promise<string>;
  decryptText(encrypted: string, options?: DecryptOptions): Promise<string>;

  // File operations
  encryptFile(
    inputPath: string,
    outputPath: string,
    options?: EncryptOptions
  ): Promise<void>;
  decryptFile(
    inputPath: string,
    outputPath: string,
    options?: DecryptOptions
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
    options?: EncryptEmailOptions
  ): Promise<EmailMessage>;
  decryptEmail?(
    message: EmailMessage,
    options?: DecryptEmailOptions
  ): Promise<DecryptedEmail>;
  signEmail?(
    message: EmailMessage,
    options?: SignEmailOptions
  ): Promise<EmailMessage>;
  verifyEmail?(
    message: EmailMessage,
    options?: VerifyEmailOptions
  ): Promise<VerificationResult>;

  // Signing operations (optional, mainly PGP)
  sign?(data: string | Buffer, options?: SignOptions): Promise<string | Buffer>;
  verify?(
    data: string | Buffer,
    signature: string | Buffer,
    options?: VerifyOptions
  ): Promise<boolean>;

  // Key management
  generateKeyPair(options?: KeyPairOptions): Promise<KeyPair>;
  importKey(key: string | Buffer, options?: ImportKeyOptions): Promise<Key>;
  exportKey(key: Key, options?: ExportKeyOptions): Promise<string | Buffer>;

  // Adapter info
  getCapabilities(): Promise<EncryptionCapabilities>;
  getAdapter(): AdapterType;
}
```

### Factory Pattern

```typescript
// Factory function
async function getEncryption(options: GetEncryptionOptions): Promise<Encryption>;

// Type guard functions
function isPGPOptions(opts: GetEncryptionOptions): opts is PGPOptions;
function isNaClOptions(opts: GetEncryptionOptions): opts is NaClOptions;
function isNodeOptions(opts: GetEncryptionOptions): opts is NodeCryptoOptions;
```

### Base Adapter Class

```typescript
abstract class BaseEncryption implements Encryption {
  protected config: EncryptionConfig;
  protected logger: Logger;

  constructor(options: EncryptionOptions) {
    this.config = this.validateConfig(options);
    this.logger = createLogger('encryption');
  }

  // Shared validation
  protected validateKey(key: Key): void;
  protected validateOptions(options: EncryptOptions | DecryptOptions): void;

  // Error mapping
  protected mapError(error: unknown): EncryptionError;

  // Utility methods
  protected async readFile(path: string): Promise<Buffer>;
  protected async writeFile(path: string, data: Buffer): Promise<void>;

  // Abstract methods adapters must implement
  abstract encryptText(text: string, options?: EncryptOptions): Promise<string>;
  abstract decryptText(encrypted: string, options?: DecryptOptions): Promise<string>;
  abstract encryptBuffer(buffer: Buffer, options?: EncryptOptions): Promise<Buffer>;
  abstract decryptBuffer(buffer: Buffer, options?: DecryptOptions): Promise<Buffer>;
  abstract generateKeyPair(options?: KeyPairOptions): Promise<KeyPair>;
}
```

## Adapters

### PGP/OpenPGP Adapter

**Purpose**: OpenPGP encryption for email and file encryption

**Dependencies**: `openpgp`

**Configuration**:

```typescript
interface PGPOptions {
  type: 'pgp';

  // Keys
  publicKey?: string;       // Armored public key
  privateKey?: string;      // Armored private key
  passphrase?: string;      // Private key passphrase

  // Multiple keys
  publicKeys?: string[];    // Multiple recipient keys
  privateKeys?: string[];   // Multiple private keys

  // Options
  armor?: boolean;          // ASCII-armored output (default: true)
  compression?: boolean;    // Compress before encrypting (default: true)

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Text encryption/decryption
- ✅ File encryption/decryption
- ✅ Buffer encryption/decryption
- ✅ Stream encryption/decryption
- ✅ Email encryption/decryption (PGP/MIME)
- ✅ Digital signatures
- ✅ Key generation (RSA, ECC)
- ✅ Key management (import/export)
- ✅ Multiple recipients

**Example**:

```typescript
const pgp = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKeyArmored,
  privateKey: myPrivateKeyArmored,
  passphrase: 'my-passphrase'
});

// Encrypt for multiple recipients
const encrypted = await pgp.encryptText('Secret message', {
  publicKeys: [recipient1Key, recipient2Key, recipient3Key],
  sign: true,  // Sign with my private key
  armor: true
});

// Decrypt and verify
const decrypted = await pgp.decryptText(encrypted, {
  verify: true,
  publicKey: senderPublicKey  // For signature verification
});

console.log(decrypted);  // 'Secret message'

// Generate new keypair
const keypair = await pgp.generateKeyPair({
  name: 'Alice Smith',
  email: 'alice@example.com',
  passphrase: 'strong-passphrase',
  type: 'rsa',
  keySize: 4096
});

// Or use ECC (faster, smaller keys)
const eccKeypair = await pgp.generateKeyPair({
  name: 'Bob Jones',
  email: 'bob@example.com',
  passphrase: 'strong-passphrase',
  type: 'ecc',
  curve: 'curve25519'
});

// Sign message
const signed = await pgp.sign('Message to sign', {
  detached: false,  // Inline signature
  armor: true
});

// Verify signature
const valid = await pgp.verify(signed, {
  publicKey: signerPublicKey
});

console.log(valid);  // true or false
```

**Email Integration**:

```typescript
const pgp = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKey,
  privateKey: myPrivateKey,
  passphrase: 'passphrase'
});

// Encrypt email (PGP/MIME format)
const encrypted = await pgp.encryptEmail({
  from: { address: 'sender@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Encrypted subject',  // Will be encrypted
  text: 'Secret message',
  html: '<p>Secret message</p>',
  attachments: [
    { filename: 'doc.pdf', content: pdfBuffer }
  ]
}, {
  sign: true,         // Sign with private key
  armor: true,
  encryptSubject: true  // Encrypt subject line (hidden subject)
});

// Result is multipart/encrypted message
console.log(encrypted.text);  // PGP encrypted content
console.log(encrypted.contentType);  // 'multipart/encrypted'

// Decrypt email
const decrypted = await pgp.decryptEmail(encrypted, {
  verify: true,
  publicKey: senderPublicKey
});

console.log(decrypted.subject);   // 'Encrypted subject'
console.log(decrypted.text);      // 'Secret message'
console.log(decrypted.verified);  // true
console.log(decrypted.signerKeyId);  // Signer's key ID
```

### NaCl/libsodium Adapter

**Purpose**: Modern, fast, secure encryption using NaCl/libsodium

**Dependencies**: `tweetnacl`, `tweetnacl-util`

**Configuration**:

```typescript
interface NaClOptions {
  type: 'nacl';

  // Keys for symmetric encryption (secretbox)
  secretKey?: Uint8Array | Buffer | string;  // 32 bytes

  // Keys for asymmetric encryption (box)
  publicKey?: Uint8Array | Buffer | string;  // 32 bytes
  secretKey?: Uint8Array | Buffer | string;  // 32 bytes

  // Encoding
  encoding?: 'base64' | 'hex' | 'utf8';  // For string keys (default: 'base64')

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Text encryption/decryption
- ✅ File encryption/decryption
- ✅ Buffer encryption/decryption
- ✅ Stream encryption/decryption
- ✅ Symmetric encryption (secretbox)
- ✅ Asymmetric encryption (box)
- ✅ Digital signatures (sign/verify)
- ✅ Key generation
- ✅ Fast and secure (modern crypto)
- ❌ Multiple recipients (single recipient per operation)

**Example**:

```typescript
// Symmetric encryption (secretbox)
const nacl = await getEncryption({
  type: 'nacl',
  secretKey: secretKey  // 32-byte secret key
});

const encrypted = await nacl.encryptText('Secret message');
const decrypted = await nacl.decryptText(encrypted);

// Asymmetric encryption (box)
const nacl = await getEncryption({
  type: 'nacl',
  publicKey: recipientPublicKey,   // Their public key
  secretKey: mySecretKey           // My secret key
});

const encrypted = await nacl.encryptText('Secret message', {
  recipientPublicKey: theirPublicKey
});

const decrypted = await nacl.decryptText(encrypted);

// Generate keypair
const keypair = await nacl.generateKeyPair();
console.log(keypair.publicKey);   // Uint8Array(32)
console.log(keypair.secretKey);   // Uint8Array(32)

// Save keys as base64
import { encodeBase64 } from 'tweetnacl-util';
const publicKeyBase64 = encodeBase64(keypair.publicKey);
const secretKeyBase64 = encodeBase64(keypair.secretKey);

// Digital signatures
const signKeypair = await nacl.generateSignKeyPair();
const signature = await nacl.sign('Message to sign', {
  secretKey: signKeypair.secretKey
});

const valid = await nacl.verify('Message to sign', signature, {
  publicKey: signKeypair.publicKey
});

// File encryption
await nacl.encryptFile('/path/to/file.txt', '/path/to/file.enc');
await nacl.decryptFile('/path/to/file.enc', '/path/to/file.txt');
```

**Performance**:

NaCl is significantly faster than PGP/RSA:
- Symmetric encryption: ~1 GB/s
- Asymmetric encryption: ~100 MB/s
- Key generation: milliseconds vs seconds for RSA

**Use Cases**:
- High-performance file encryption
- Real-time data encryption
- API token encryption
- Database field encryption
- Local data storage encryption

### Node.js Crypto Adapter

**Purpose**: Standard encryption algorithms using Node.js crypto module

**Dependencies**: Built-in `node:crypto`

**Configuration**:

```typescript
interface NodeCryptoOptions {
  type: 'node';

  // Algorithm selection
  algorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'aes-128-gcm' |
             'rsa' | 'rsa-oaep' | 'rsa-pss' |
             'ecdh' | 'ecdsa' |
             string;  // Any Node.js supported algorithm

  // Symmetric encryption keys
  key?: Buffer | string;        // Encryption key
  keyDerivation?: {             // Derive key from password
    password: string;
    salt?: Buffer | string;
    iterations?: number;        // PBKDF2 iterations (default: 100000)
    keyLength?: number;         // Key length in bytes
    digest?: string;            // Hash algorithm (default: 'sha256')
  };

  // Asymmetric encryption keys
  publicKey?: string | Buffer;  // PEM or DER format
  privateKey?: string | Buffer; // PEM or DER format
  passphrase?: string;          // Private key passphrase

  // IV/nonce (generated if not provided)
  iv?: Buffer | string;

  // Encoding
  encoding?: 'hex' | 'base64' | 'utf8';

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Text encryption/decryption
- ✅ File encryption/decryption
- ✅ Buffer encryption/decryption
- ✅ Stream encryption/decryption
- ✅ Symmetric encryption (AES)
- ✅ Asymmetric encryption (RSA, ECDH)
- ✅ Digital signatures (RSA, ECDSA)
- ✅ Key derivation (PBKDF2, scrypt)
- ✅ Key generation
- ✅ HMAC for authentication

**Example - AES Encryption**:

```typescript
const crypto = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  key: encryptionKey  // 32 bytes for AES-256
});

// Or derive key from password
const crypto = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: 'user-password',
    salt: 'unique-salt',
    iterations: 100000
  }
});

const encrypted = await crypto.encryptText('Secret message');
const decrypted = await crypto.decryptText(encrypted);

// File encryption with AES
await crypto.encryptFile('/path/to/file.txt', '/path/to/file.enc');
await crypto.decryptFile('/path/to/file.enc', '/path/to/file.txt');
```

**Example - RSA Encryption**:

```typescript
const rsa = await getEncryption({
  type: 'node',
  algorithm: 'rsa-oaep',
  publicKey: publicKeyPem,
  privateKey: privateKeyPem,
  passphrase: 'key-passphrase'
});

const encrypted = await rsa.encryptText('Secret message');
const decrypted = await rsa.decryptText(encrypted);

// Generate RSA keypair
const keypair = await rsa.generateKeyPair({
  modulusLength: 4096,
  publicExponent: 65537,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: 'passphrase'
  }
});

console.log(keypair.publicKey);   // PEM format
console.log(keypair.privateKey);  // PEM format (encrypted)
```

**Example - ECDSA Signatures**:

```typescript
const ecdsa = await getEncryption({
  type: 'node',
  algorithm: 'ecdsa',
  privateKey: privateKeyPem
});

// Sign message
const signature = await ecdsa.sign('Message to sign', {
  algorithm: 'sha256'
});

// Verify signature
const valid = await ecdsa.verify('Message to sign', signature, {
  publicKey: publicKeyPem
});
```

**Example - Stream Encryption**:

```typescript
import { createReadStream, createWriteStream } from 'fs';

const crypto = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  key: encryptionKey
});

// Encrypt large file with streams
const encryptStream = crypto.encryptStream();
createReadStream('/path/to/large-file.bin')
  .pipe(encryptStream)
  .pipe(createWriteStream('/path/to/large-file.enc'));

// Decrypt with streams
const decryptStream = crypto.decryptStream();
createReadStream('/path/to/large-file.enc')
  .pipe(decryptStream)
  .pipe(createWriteStream('/path/to/large-file.bin'));
```

## Type Definitions

### Core Types

```typescript
interface EncryptOptions {
  // Encoding
  armor?: boolean;          // ASCII-armored output (PGP)
  encoding?: 'base64' | 'hex' | 'utf8';

  // Compression
  compression?: boolean;    // Compress before encrypting (PGP)

  // Recipients (PGP multiple recipients)
  publicKeys?: string[];    // Multiple recipient public keys
  recipientPublicKey?: string | Uint8Array | Buffer;  // Single recipient (NaCl)

  // Signing
  sign?: boolean;           // Sign with private key (PGP)
  privateKey?: string | Buffer;  // Signing key

  // Authentication
  aad?: Buffer;             // Additional authenticated data (AES-GCM)

  // Algorithm-specific
  [key: string]: any;
}

interface DecryptOptions {
  // Encoding
  encoding?: 'base64' | 'hex' | 'utf8';

  // Verification
  verify?: boolean;         // Verify signature (PGP)
  publicKey?: string | Uint8Array | Buffer;  // For signature verification

  // Keys
  privateKey?: string | Buffer;
  passphrase?: string;

  // Algorithm-specific
  [key: string]: any;
}

interface EncryptEmailOptions {
  // Signing
  sign?: boolean;           // Sign with private key
  privateKey?: string;      // Override default private key
  passphrase?: string;      // Override default passphrase

  // Encryption
  armor?: boolean;          // ASCII-armored output (default: true)
  compression?: boolean;    // Compress before encrypting
  encryptSubject?: boolean; // Encrypt subject line (hidden subject)

  // Recipients
  publicKeys?: string[];    // Override/additional recipient keys
}

interface DecryptEmailOptions {
  // Verification
  verify?: boolean;         // Verify signature
  publicKey?: string;       // Sender's public key for verification

  // Decryption
  privateKey?: string;      // Override default private key
  passphrase?: string;      // Override default passphrase
}

interface DecryptedEmail extends EmailMessage {
  // Encryption metadata
  encrypted: boolean;       // Was encrypted
  signed: boolean;          // Was signed
  verified?: boolean;       // Signature verification result
  signerKeyId?: string;     // Signer's key ID
  signerFingerprint?: string;  // Signer's key fingerprint
  encryptionAlgorithm?: string;  // Algorithm used
}

interface SignOptions {
  // Key
  privateKey?: string | Buffer;
  passphrase?: string;

  // Options
  detached?: boolean;       // Detached signature (PGP)
  armor?: boolean;          // ASCII-armored output (PGP)
  algorithm?: string;       // Hash algorithm (Node crypto)
}

interface VerifyOptions {
  // Key
  publicKey: string | Uint8Array | Buffer;

  // Options
  detached?: boolean;       // Signature is detached (PGP)
  algorithm?: string;       // Hash algorithm (Node crypto)
}

interface VerificationResult {
  valid: boolean;
  keyId?: string;
  keyFingerprint?: string;
  timestamp?: Date;
  algorithm?: string;
  message?: string;
}
```

### Key Management Types

```typescript
interface KeyPair {
  publicKey: string | Uint8Array | Buffer;
  privateKey: string | Uint8Array | Buffer;
  fingerprint?: string;     // Key fingerprint (PGP)
  keyId?: string;           // Key ID (PGP)
}

interface KeyPairOptions {
  // Common options
  name?: string;            // Key owner name (PGP)
  email?: string;           // Key owner email (PGP)
  passphrase?: string;      // Private key passphrase

  // Algorithm selection
  type?: 'rsa' | 'ecc' | 'ecdsa' | 'ecdh';
  keySize?: number;         // RSA key size (1024, 2048, 4096)
  curve?: string;           // ECC curve ('curve25519', 'p256', 'p384', 'p521')

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
  expirationTime?: number;  // Seconds until expiration
}

interface Key {
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

interface ImportKeyOptions {
  format?: 'armored' | 'binary' | 'pem' | 'der';
  type?: 'public' | 'private';
  passphrase?: string;      // For encrypted private keys
}

interface ExportKeyOptions {
  format?: 'armored' | 'binary' | 'pem' | 'der';
  armor?: boolean;          // ASCII-armored (PGP)
  encrypt?: boolean;        // Encrypt private key
  passphrase?: string;      // For encrypting private keys
}
```

### Adapter Configuration

```typescript
type GetEncryptionOptions =
  | PGPOptions
  | NaClOptions
  | NodeCryptoOptions;

type AdapterType = 'pgp' | 'nacl' | 'node';

interface EncryptionCapabilities {
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
```

### Email Integration Types

```typescript
// From @happyvertical/email
interface EmailMessage {
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
}

interface EmailAddress {
  name?: string;
  address: string;
}

interface Attachment {
  filename?: string;
  contentType: string;
  size: number;
  content?: Buffer;
  contentId?: string;
  contentDisposition?: 'attachment' | 'inline';
  path?: string;
}
```

## Error Handling

### Error Classes

```typescript
// Base error
class EncryptionError extends Error {
  code: string;
  adapter?: string;
  cause?: unknown;

  constructor(message: string, code: string, adapter?: string, cause?: unknown) {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
    this.adapter = adapter;
    this.cause = cause;
  }
}

// Key errors
class KeyError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'KEY_ERROR', adapter, cause);
    this.name = 'KeyError';
  }
}

class InvalidKeyError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'INVALID_KEY', adapter, cause);
    this.name = 'InvalidKeyError';
  }
}

class KeyNotFoundError extends EncryptionError {
  keyId?: string;

  constructor(message: string, keyId?: string, adapter?: string) {
    super(message, 'KEY_NOT_FOUND', adapter);
    this.name = 'KeyNotFoundError';
    this.keyId = keyId;
  }
}

class PassphraseError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'PASSPHRASE_ERROR', adapter, cause);
    this.name = 'PassphraseError';
  }
}

// Encryption/decryption errors
class EncryptError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'ENCRYPT_ERROR', adapter, cause);
    this.name = 'EncryptError';
  }
}

class DecryptError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'DECRYPT_ERROR', adapter, cause);
    this.name = 'DecryptError';
  }
}

// Signature errors
class SignatureError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'SIGNATURE_ERROR', adapter, cause);
    this.name = 'SignatureError';
  }
}

class VerificationError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'VERIFICATION_ERROR', adapter, cause);
    this.name = 'VerificationError';
  }
}

// Format errors
class FormatError extends EncryptionError {
  constructor(message: string, adapter?: string, cause?: unknown) {
    super(message, 'FORMAT_ERROR', adapter, cause);
    this.name = 'FormatError';
  }
}

// Algorithm errors
class AlgorithmError extends EncryptionError {
  algorithm?: string;

  constructor(message: string, algorithm?: string, adapter?: string) {
    super(message, 'ALGORITHM_ERROR', adapter);
    this.name = 'AlgorithmError';
    this.algorithm = algorithm;
  }
}
```

### Error Handling Examples

```typescript
import {
  getEncryption,
  DecryptError,
  InvalidKeyError,
  VerificationError,
  PassphraseError
} from '@happyvertical/encryption';

try {
  const pgp = await getEncryption({
    type: 'pgp',
    privateKey: invalidPrivateKey,
    passphrase: 'wrong-passphrase'
  });
} catch (error) {
  if (error instanceof InvalidKeyError) {
    console.error('Invalid key format:', error.message);
  } else if (error instanceof PassphraseError) {
    console.error('Wrong passphrase:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

// Decrypt with error handling
try {
  const decrypted = await pgp.decryptText(encrypted, {
    verify: true,
    publicKey: senderPublicKey
  });
} catch (error) {
  if (error instanceof DecryptError) {
    console.error('Decryption failed:', error.message);
  } else if (error instanceof VerificationError) {
    console.error('Signature verification failed:', error.message);
  }
}
```

## Environment Variables

The package supports environment variables following the `HAVE_ENCRYPTION_*` pattern:

```bash
# Common settings
HAVE_ENCRYPTION_TYPE=pgp                      # Adapter type
HAVE_ENCRYPTION_DEBUG=true                    # Enable debug logging

# PGP
HAVE_ENCRYPTION_PGP_PUBLIC_KEY=/path/to/public.asc
HAVE_ENCRYPTION_PGP_PRIVATE_KEY=/path/to/private.asc
HAVE_ENCRYPTION_PGP_PASSPHRASE=key-passphrase
HAVE_ENCRYPTION_PGP_ARMOR=true

# NaCl
HAVE_ENCRYPTION_NACL_PUBLIC_KEY=base64-encoded-key
HAVE_ENCRYPTION_NACL_SECRET_KEY=base64-encoded-key
HAVE_ENCRYPTION_NACL_ENCODING=base64

# Node crypto (AES)
HAVE_ENCRYPTION_NODE_ALGORITHM=aes-256-gcm
HAVE_ENCRYPTION_NODE_KEY=hex-encoded-key
HAVE_ENCRYPTION_NODE_ENCODING=hex

# Node crypto (RSA)
HAVE_ENCRYPTION_NODE_ALGORITHM=rsa-oaep
HAVE_ENCRYPTION_NODE_PUBLIC_KEY=/path/to/public.pem
HAVE_ENCRYPTION_NODE_PRIVATE_KEY=/path/to/private.pem
HAVE_ENCRYPTION_NODE_PASSPHRASE=key-passphrase

# Key derivation
HAVE_ENCRYPTION_KEY_PASSWORD=user-password
HAVE_ENCRYPTION_KEY_SALT=unique-salt
HAVE_ENCRYPTION_KEY_ITERATIONS=100000
```

Load from environment:

```typescript
import { getEncryption } from '@happyvertical/encryption';

// Automatically loads from environment variables
const encryption = await getEncryption({
  type: process.env.HAVE_ENCRYPTION_TYPE as any || 'pgp'
  // Other options loaded automatically
});
```

## Use Cases

### 1. Email Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';
import { getMailbox } from '@happyvertical/email';

// Setup encryption
const pgp = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKey,
  privateKey: myPrivateKey,
  passphrase: 'passphrase'
});

// Setup email
const mailbox = await getMailbox({
  type: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'user@example.com', pass: 'password' }
});

// Send encrypted email
const message = {
  from: { address: 'user@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Confidential',
  text: 'Secret information'
};

const encrypted = await pgp.encryptEmail(message, { sign: true });
await mailbox.send(encrypted);
```

### 2. File Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';

// Fast file encryption with NaCl
const nacl = await getEncryption({
  type: 'nacl',
  secretKey: secretKey
});

// Encrypt files
await nacl.encryptFile('/path/to/sensitive-data.json', '/path/to/encrypted.enc');

// Decrypt files
await nacl.decryptFile('/path/to/encrypted.enc', '/path/to/sensitive-data.json');

// Encrypt large files with streaming
import { createReadStream, createWriteStream } from 'fs';
const encryptStream = nacl.encryptStream();
createReadStream('/path/to/large-file.bin')
  .pipe(encryptStream)
  .pipe(createWriteStream('/path/to/large-file.enc'));
```

### 3. Database Field Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';
import { getDatabase } from '@happyvertical/sql';

const encryption = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: process.env.DB_ENCRYPTION_PASSWORD,
    salt: 'unique-salt',
    iterations: 100000
  }
});

const db = await getDatabase({ type: 'sqlite', url: './data.db' });

// Encrypt sensitive fields before storing
async function saveUser(user: User) {
  const encryptedSsn = await encryption.encryptText(user.ssn);
  const encryptedCreditCard = await encryption.encryptText(user.creditCard);

  await db.insert('users', {
    id: user.id,
    name: user.name,  // Plain text
    ssn: encryptedSsn,
    credit_card: encryptedCreditCard
  });
}

// Decrypt when retrieving
async function getUser(id: string): Promise<User> {
  const row = await db.selectOne('users', { where: { id } });

  return {
    id: row.id,
    name: row.name,
    ssn: await encryption.decryptText(row.ssn),
    creditCard: await encryption.decryptText(row.credit_card)
  };
}
```

### 4. API Token Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';

const encryption = await getEncryption({
  type: 'nacl',
  secretKey: serverSecretKey
});

// Encrypt API token for storage
async function storeApiToken(userId: string, token: string) {
  const encrypted = await encryption.encryptText(token);
  await db.insert('api_tokens', {
    user_id: userId,
    token: encrypted,
    created_at: new Date().toISOString()
  });
}

// Decrypt for use
async function getApiToken(userId: string): Promise<string> {
  const row = await db.selectOne('api_tokens', {
    where: { user_id: userId }
  });
  return await encryption.decryptText(row.token);
}
```

### 5. Backup Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const encryption = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: process.env.BACKUP_PASSWORD,
    salt: 'backup-salt',
    iterations: 100000
  }
});

// Encrypt backup
async function encryptBackup(sourcePath: string, destPath: string) {
  await pipeline(
    createReadStream(sourcePath),
    encryption.encryptStream(),
    createWriteStream(destPath)
  );
}

// Decrypt backup
async function decryptBackup(sourcePath: string, destPath: string) {
  await pipeline(
    createReadStream(sourcePath),
    encryption.decryptStream(),
    createWriteStream(destPath)
  );
}
```

### 6. Message Signing

```typescript
import { getEncryption } from '@happyvertical/encryption';

const pgp = await getEncryption({
  type: 'pgp',
  privateKey: myPrivateKey,
  passphrase: 'passphrase'
});

// Sign message (detached signature)
const message = 'Important announcement';
const signature = await pgp.sign(message, {
  detached: true,
  armor: true
});

// Distribute message and signature separately
await publishMessage(message);
await publishSignature(signature);

// Verify signature
const valid = await pgp.verify(message, signature, {
  publicKey: signerPublicKey
});

if (valid) {
  console.log('Signature verified! Message is authentic.');
} else {
  console.log('Invalid signature! Message may be tampered.');
}
```

## Testing

### Unit Tests

Test each adapter independently:

```typescript
// pgp.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getEncryption } from '../src';

describe('PGP Adapter', () => {
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

  it('should encrypt and decrypt text', async () => {
    const pgpWithKeys = await getEncryption({
      type: 'pgp',
      publicKey: keypair.publicKey as string,
      privateKey: keypair.privateKey as string,
      passphrase: 'test-passphrase'
    });

    const encrypted = await pgpWithKeys.encryptText('Secret message');
    const decrypted = await pgpWithKeys.decryptText(encrypted);

    expect(decrypted).toBe('Secret message');
  });

  it('should sign and verify message', async () => {
    const pgpWithKeys = await getEncryption({
      type: 'pgp',
      publicKey: keypair.publicKey as string,
      privateKey: keypair.privateKey as string,
      passphrase: 'test-passphrase'
    });

    const signed = await pgpWithKeys.sign('Message to sign', {
      detached: false
    });

    const valid = await pgpWithKeys.verify(signed, {
      publicKey: keypair.publicKey as string
    });

    expect(valid).toBe(true);
  });

  it('should handle multiple recipients', async () => {
    const recipient1 = await pgp.generateKeyPair({
      name: 'Recipient 1',
      email: 'recipient1@example.com',
      passphrase: 'pass1'
    });
    const recipient2 = await pgp.generateKeyPair({
      name: 'Recipient 2',
      email: 'recipient2@example.com',
      passphrase: 'pass2'
    });

    const encrypted = await pgp.encryptText('Secret', {
      publicKeys: [
        recipient1.publicKey as string,
        recipient2.publicKey as string
      ]
    });

    // Both recipients can decrypt
    const pgp1 = await getEncryption({
      type: 'pgp',
      privateKey: recipient1.privateKey as string,
      passphrase: 'pass1'
    });
    const decrypted1 = await pgp1.decryptText(encrypted);
    expect(decrypted1).toBe('Secret');

    const pgp2 = await getEncryption({
      type: 'pgp',
      privateKey: recipient2.privateKey as string,
      passphrase: 'pass2'
    });
    const decrypted2 = await pgp2.decryptText(encrypted);
    expect(decrypted2).toBe('Secret');
  });
});
```

### Integration Tests

Test email encryption workflow:

```typescript
// email-encryption.test.ts
import { describe, it, expect } from 'vitest';
import { getEncryption } from '@happyvertical/encryption';
import { getMailbox } from '@happyvertical/email';

describe('Email Encryption Integration', () => {
  it('should encrypt, send, receive, and decrypt email', async () => {
    // Generate keypairs
    const pgp = await getEncryption({ type: 'pgp' });
    const senderKeys = await pgp.generateKeyPair({
      name: 'Sender',
      email: 'sender@test.com',
      passphrase: 'sender-pass'
    });
    const recipientKeys = await pgp.generateKeyPair({
      name: 'Recipient',
      email: 'recipient@test.com',
      passphrase: 'recipient-pass'
    });

    // Setup sender encryption
    const senderEncryption = await getEncryption({
      type: 'pgp',
      publicKey: recipientKeys.publicKey as string,
      privateKey: senderKeys.privateKey as string,
      passphrase: 'sender-pass'
    });

    // Encrypt and send
    const message = {
      from: { address: 'sender@test.com' },
      to: [{ address: 'recipient@test.com' }],
      subject: 'Encrypted Test',
      text: 'Secret message'
    };

    const encrypted = await senderEncryption.encryptEmail(message, {
      sign: true
    });

    const mailbox = await getMailbox({
      type: 'smtp',
      host: 'localhost',
      port: 1025
    });
    await mailbox.send(encrypted);

    // Receive (simulate)
    const imap = await getMailbox({
      type: 'imap',
      host: 'localhost',
      port: 1143,
      auth: { user: 'recipient@test.com', pass: 'password' }
    });
    await imap.connect();
    const received = await imap.fetch({ limit: 1 });
    await imap.disconnect();

    // Decrypt
    const recipientEncryption = await getEncryption({
      type: 'pgp',
      privateKey: recipientKeys.privateKey as string,
      passphrase: 'recipient-pass',
      publicKey: senderKeys.publicKey as string
    });

    const decrypted = await recipientEncryption.decryptEmail(received[0], {
      verify: true
    });

    expect(decrypted.subject).toBe('Encrypted Test');
    expect(decrypted.text).toBe('Secret message');
    expect(decrypted.verified).toBe(true);
  });
});
```

### Performance Tests

```typescript
// performance.test.ts
import { describe, it } from 'vitest';
import { getEncryption } from '../src';

describe('Encryption Performance', () => {
  it('should benchmark adapters', async () => {
    const message = 'A'.repeat(1024 * 100); // 100KB

    // PGP
    const pgp = await getEncryption({ type: 'pgp' });
    const pgpKeys = await pgp.generateKeyPair({
      name: 'Test',
      email: 'test@example.com',
      passphrase: 'pass'
    });
    const pgpWithKeys = await getEncryption({
      type: 'pgp',
      publicKey: pgpKeys.publicKey as string,
      privateKey: pgpKeys.privateKey as string,
      passphrase: 'pass'
    });

    console.time('PGP encrypt');
    const pgpEncrypted = await pgpWithKeys.encryptText(message);
    console.timeEnd('PGP encrypt');

    console.time('PGP decrypt');
    await pgpWithKeys.decryptText(pgpEncrypted);
    console.timeEnd('PGP decrypt');

    // NaCl
    const nacl = await getEncryption({ type: 'nacl' });
    const naclKeys = await nacl.generateKeyPair();
    const naclWithKeys = await getEncryption({
      type: 'nacl',
      secretKey: naclKeys.secretKey
    });

    console.time('NaCl encrypt');
    const naclEncrypted = await naclWithKeys.encryptText(message);
    console.timeEnd('NaCl encrypt');

    console.time('NaCl decrypt');
    await naclWithKeys.decryptText(naclEncrypted);
    console.timeEnd('NaCl decrypt');

    // Node crypto (AES)
    const crypto = await getEncryption({
      type: 'node',
      algorithm: 'aes-256-gcm',
      keyDerivation: {
        password: 'password',
        salt: 'salt'
      }
    });

    console.time('AES encrypt');
    const aesEncrypted = await crypto.encryptText(message);
    console.timeEnd('AES encrypt');

    console.time('AES decrypt');
    await crypto.decryptText(aesEncrypted);
    console.timeEnd('AES decrypt');
  });
});
```

## Implementation Phases

### Phase 1: Core Foundation (Week 1-2)
- [ ] Package setup (package.json, tsconfig.json, vite.config.ts)
- [ ] Core types and interfaces (`Encryption`, error classes)
- [ ] Factory pattern (`getEncryption()` with type guards)
- [ ] Base adapter class with shared functionality
- [ ] Environment variable support
- [ ] Basic unit tests

### Phase 2: PGP Adapter (Week 2-3)
- [ ] PGP adapter implementation (OpenPGP.js wrapper)
- [ ] Text encryption/decryption
- [ ] Buffer encryption/decryption
- [ ] Key generation (RSA, ECC)
- [ ] Digital signatures
- [ ] Key management (import/export)
- [ ] Multiple recipients support
- [ ] Unit tests for PGP

### Phase 3: Email Integration (Week 3-4)
- [ ] Email encryption/decryption (PGP/MIME format)
- [ ] Email signing/verification
- [ ] Subject line encryption
- [ ] Attachment handling
- [ ] Integration tests with @happyvertical/email

### Phase 4: NaCl Adapter (Week 4-5)
- [ ] NaCl adapter implementation (TweetNaCl wrapper)
- [ ] Symmetric encryption (secretbox)
- [ ] Asymmetric encryption (box)
- [ ] Digital signatures (sign/verify)
- [ ] Key generation
- [ ] Unit tests for NaCl
- [ ] Performance benchmarks

### Phase 5: Node Crypto Adapter (Week 5-6)
- [ ] Node crypto adapter implementation
- [ ] AES encryption (GCM, CBC modes)
- [ ] RSA encryption
- [ ] ECDH/ECDSA support
- [ ] Key derivation (PBKDF2, scrypt)
- [ ] Unit tests for Node crypto

### Phase 6: File Operations (Week 6-7)
- [ ] File encryption/decryption for all adapters
- [ ] Stream encryption/decryption
- [ ] Large file handling
- [ ] Progress callbacks
- [ ] Integration tests (file operations)

### Phase 7: Documentation & Polish (Week 7-8)
- [ ] Complete CLAUDE.md documentation
- [ ] API reference generation (TypeDoc)
- [ ] Usage examples and tutorials
- [ ] Security best practices guide
- [ ] Performance optimization
- [ ] Code cleanup and refactoring

### Phase 8: Future Enhancements (Post v1.0)
- [ ] S/MIME support (PKI.js)
- [ ] Hardware security module (HSM) integration
- [ ] Keyring/keystore management
- [ ] Key rotation utilities
- [ ] Encrypted database (SQLCipher integration)
- [ ] WebCrypto API adapter (browser support)
- [ ] Age encryption adapter
- [ ] Cloud KMS integrations (AWS, GCP, Azure)

## Dependencies

### Runtime Dependencies

```json
{
  "dependencies": {
    "openpgp": "^5.11.1",
    "tweetnacl": "^1.0.3",
    "tweetnacl-util": "^0.15.1",
    "@happyvertical/utils": "workspace:*",
    "@happyvertical/logger": "workspace:*"
  },
  "peerDependencies": {
    "@happyvertical/email": "*"
  },
  "peerDependenciesMeta": {
    "@happyvertical/email": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "typescript": "^5.3.3",
    "vite": "^5.0.11",
    "vite-plugin-dts": "^3.7.1",
    "vitest": "^1.2.1"
  }
}
```

### Development Dependencies

- No external test servers needed (all crypto operations are local)
- Mock email messages for email integration tests
- Test fixtures for keys and encrypted data

## Package Structure

```
packages/encryption/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── CLAUDE.md                     # This file
├── src/
│   ├── index.ts                  # Main exports
│   ├── shared/
│   │   ├── types.ts             # Core interfaces and types
│   │   ├── factory.ts           # getEncryption() factory
│   │   ├── base.ts              # BaseEncryption abstract class
│   │   ├── errors.ts            # Error classes
│   │   └── utils.ts             # Shared utilities
│   ├── adapters/
│   │   ├── pgp.ts               # PGP/OpenPGP adapter
│   │   ├── nacl.ts              # NaCl/libsodium adapter
│   │   └── node.ts              # Node.js crypto adapter
│   ├── email/
│   │   ├── index.ts             # Email integration
│   │   ├── pgp-mime.ts          # PGP/MIME format
│   │   └── types.ts             # Email-specific types
│   └── keys/
│       ├── management.ts        # Key management utilities
│       ├── storage.ts           # Key storage (future)
│       └── derivation.ts        # Key derivation functions
└── test/
    ├── unit/
    │   ├── pgp.test.ts
    │   ├── nacl.test.ts
    │   └── node.test.ts
    ├── integration/
    │   ├── email-encryption.test.ts
    │   ├── file-encryption.test.ts
    │   └── performance.test.ts
    └── helpers/
        ├── fixtures.ts
        └── test-keys.ts
```

## Security Considerations

### Key Storage

**DO NOT**:
- Store private keys in plain text
- Commit keys to version control
- Log keys or passphrases
- Transmit keys over insecure channels

**DO**:
- Use environment variables for keys
- Encrypt private keys with strong passphrases
- Use hardware security modules (HSMs) for production
- Implement key rotation policies
- Use key derivation for password-based encryption

### Best Practices

1. **Key Length**:
   - RSA: Minimum 2048 bits (4096 recommended)
   - AES: 256 bits
   - ECC: curve25519 or P-384

2. **Algorithms**:
   - Prefer: AES-256-GCM, RSA-OAEP, ECDH, NaCl
   - Avoid: DES, 3DES, MD5, SHA1

3. **Random Number Generation**:
   - Use cryptographically secure RNGs
   - Node.js crypto.randomBytes()
   - TweetNaCl uses secure RNG

4. **Key Derivation**:
   - PBKDF2: Minimum 100,000 iterations
   - Scrypt: Better for password-based encryption
   - Argon2: Best for new applications

5. **Encrypted Data Integrity**:
   - Use authenticated encryption (GCM, Poly1305)
   - Verify signatures before trusting data
   - Implement replay protection

## Related Packages

- **@happyvertical/email** - Email operations with encryption support
- **@happyvertical/files** - File operations (can use encryption for secure storage)
- **@happyvertical/sql** - Database operations (can use encryption for fields)
- **@happyvertical/utils** - Shared utilities
- **@happyvertical/logger** - Logging infrastructure

## Future Enhancements

1. **Additional Adapters**:
   - S/MIME (PKI.js)
   - WebCrypto API (browser support)
   - Age encryption
   - Tink (Google's crypto library)
   - AWS KMS integration
   - Google Cloud KMS integration
   - Azure Key Vault integration

2. **Key Management**:
   - Keyring/keystore implementation
   - Key rotation utilities
   - Key escrow/recovery
   - Hardware security module (HSM) integration
   - PKCS#11 support

3. **Advanced Features**:
   - Forward secrecy
   - Post-quantum cryptography
   - Threshold cryptography
   - Zero-knowledge proofs
   - Homomorphic encryption

4. **Integration**:
   - SQLCipher for encrypted databases
   - Encrypted backup utilities
   - Secure messaging protocols
   - End-to-end encryption frameworks

## Contributing

See root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general guidelines.

### Encryption Package Specific Guidelines

1. **Security Review**:
   - All cryptographic code must be reviewed by security experts
   - Use well-tested libraries (OpenPGP.js, TweetNaCl)
   - Follow OWASP cryptographic guidelines
   - Include security tests

2. **Testing**:
   - Test with known test vectors
   - Cross-compatibility tests (encrypt with one library, decrypt with another)
   - Performance benchmarks
   - Security vulnerability scanning

3. **Documentation**:
   - Document security considerations
   - Provide usage examples with security best practices
   - Include warnings about common pitfalls
   - Reference relevant RFCs and standards

## License

MIT License - see [LICENSE](../../LICENSE)
