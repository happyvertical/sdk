# @happyvertical/encryption

> Unified encryption and cryptography operations with adapter-based architecture supporting PGP, NaCl, and Node.js crypto.

[![Tests](https://img.shields.io/badge/tests-209%20passing-brightgreen)](./test)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

## Features

- **🔐 Multiple Encryption Methods**: PGP/OpenPGP, NaCl/libsodium, Node.js crypto
- **📝 Text, Files & Buffers**: Encrypt any data format with a unified API
- **📧 Email Integration**: Specialized PGP/MIME email encryption
- **🔑 Key Management**: Generate, import, export, and manage encryption keys
- **✍️ Digital Signatures**: Sign and verify data with RSA, ECDSA, and EdDSA
- **🎯 Type-Safe**: Full TypeScript support with comprehensive type definitions
- **⚡ High Performance**: Fast NaCl encryption, efficient streaming for large files
- **🧪 Well-Tested**: 209 tests covering all adapters and use cases

## Installation

```bash
npm install @happyvertical/encryption
# or
pnpm add @happyvertical/encryption
# or
yarn add @happyvertical/encryption
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-encryption-context
```

This copies the package's `AGENT.md` documentation and `metadata.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Quick Start

### PGP Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';

// Create PGP encryption instance
const pgp = await getEncryption({ type: 'pgp' });

// Generate keypair
const keypair = await pgp.generateKeyPair({
  name: 'Alice',
  email: 'alice@example.com',
  passphrase: 'secure-passphrase',
  type: 'rsa',
  keySize: 4096
});

// Initialize with keys
const encryption = await getEncryption({
  type: 'pgp',
  publicKey: keypair.publicKey,
  privateKey: keypair.privateKey,
  passphrase: 'secure-passphrase'
});

// Encrypt and decrypt text
const encrypted = await encryption.encryptText('Secret message');
const decrypted = await encryption.decryptText(encrypted);

// Encrypt and decrypt files
await encryption.encryptFile('document.pdf', 'document.pdf.pgp');
await encryption.decryptFile('document.pdf.pgp', 'document.pdf');
```

### NaCl Encryption (Fast & Modern)

```typescript
import { getEncryption } from '@happyvertical/encryption';

// Generate keypair
const nacl = await getEncryption({ type: 'nacl' });
const keypair = await nacl.generateKeyPair();

// Symmetric encryption (secretbox)
const encryption = await getEncryption({
  type: 'nacl',
  secretKey: keypair.secretKey
});

const encrypted = await encryption.encryptText('Secret message');
const decrypted = await encryption.decryptText(encrypted);

// Encrypt files (very fast!)
await encryption.encryptFile('data.json', 'data.json.enc');
await encryption.decryptFile('data.json.enc', 'data.json');
```

### Node.js Crypto (AES & RSA)

```typescript
import { getEncryption } from '@happyvertical/encryption';

// AES-256-GCM encryption
const aes = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: 'user-password',
    salt: 'unique-salt',
    iterations: 100000
  }
});

const encrypted = await aes.encryptText('Secret message');
const decrypted = await aes.decryptText(encrypted);

// RSA encryption
const rsa = await getEncryption({
  type: 'node',
  algorithm: 'rsa-oaep'
});

const keypair = await rsa.generateKeyPair({
  type: 'rsa',
  keySize: 2048
});

const rsaEncryption = await getEncryption({
  type: 'node',
  algorithm: 'rsa-oaep',
  publicKey: keypair.publicKey,
  privateKey: keypair.privateKey
});

const encrypted = await rsaEncryption.encryptText('Small message');
const decrypted = await rsaEncryption.decryptText(encrypted);
```

## Vault snapshot envelopes

```typescript
import { openVaultSnapshot, sealVaultSnapshot } from '@happyvertical/encryption/vault-snapshot';
```

`sealVaultSnapshot(snapshot, { key, keyId, context, compression })` and
`openVaultSnapshot(envelope, { context, resolveKey })` are synchronous Node.js
byte APIs. The key is a raw 32-byte user key dedicated to snapshot envelopes.
The key ID is an opaque 16-byte identifier encoded as 32 lowercase hexadecimal
digits in TypeScript. Supply the expected `{ accountId, deviceId, sequence }`
independently when opening. Scope `resolveKey(keyId)` to that account and return
`undefined` for an unknown ID. A syntactically valid envelope can trigger one
lookup with an untrusted ID. Opening returns bytes only after authentication and
validation succeed.
Both APIs return byte arrays whose backing storage contains exactly the returned
bytes. Serialize either the view or its complete backing ArrayBuffer.

Compression is optional and defaults to `none`. Use `zlib` for snapshots where
revealing the resulting size is acceptable. Envelope length is public in both
modes, and compression can reveal relationships between attacker-controlled and
secret bytes. Account and device IDs and the sequence are encrypted. Callers
that require replay or rollback protection must track which sequences are
acceptable in their trusted state. Every seal generates a fresh random nonce.

### Version 1 wire format

The envelope is a binary byte array with a 47-byte clear header followed by
the combined output of
[NaCl XSalsa20-Poly1305 secretbox](https://doc.libsodium.org/secret-key_cryptography/secretbox)
(`crypto_secretbox_easy` in libsodium). The output begins with its 16-byte
authentication tag and continues with the encrypted message to end of input.

| Header offset | Size | Value |
| --- | --- | --- |
| 0 | 4 | ASCII `HVSE` (`48 56 53 45`) |
| 4 | 1 | Version `01` |
| 5 | 1 | Algorithm `01` (XSalsa20-Poly1305 secretbox) |
| 6 | 1 | Compression `00` for raw bytes or `01` for zlib |
| 7 | 16 | Raw opaque key ID bytes, in the same order as the hex encoding |
| 23 | 24 | Secretbox nonce |

The authenticated message is this exact concatenation:

```text
clear header (47 bytes)
account ID UTF-8 byte length (uint8) || account ID UTF-8 bytes
device ID UTF-8 byte length (uint8) || device ID UTF-8 bytes
sequence (uint64 big-endian)
payload (to end of message)
```

Each ID is 1 to 255 bytes of valid UTF-8, with exact byte matching and no Unicode
normalization. For Kotlin, convert byte lengths to unsigned values and interpret
the eight sequence bytes as a big-endian `ULong` (TypeScript `bigint`).
Compression `01` is one [RFC 1950](https://www.rfc-editor.org/rfc/rfc1950)
zlib stream with DEFLATE, checksum and no preset dictionary. A JVM reader can
use `Inflater(false)` with an output limit and check `finished()` and zero
remaining input. Different compressors may produce different valid payload bytes.

Reject unknown header values, envelope lengths outside 122 to 8,454,774 bytes,
and payload lengths outside the mode limits. A v1 envelope holds at most
8,388,608 decoded bytes (8 MiB). The raw payload has the same cap. The compressed
payload cap is 8,454,144 bytes. These are fixed v1 limits for a single in-memory
envelope. Open secretbox with the clear nonce and the one key identified by the
header. Compare the authenticated header and context prefix against the clear
header and independently supplied expected context, then decode the payload.
For zlib, reject truncated streams, dictionaries, invalid checksums, trailing
bytes and output above the decoded limit.

The [v1 interoperability vectors](./vault-snapshot-v1-vectors.json) were generated
with libsodium via PyNaCl and Python zlib. They include the test key, raw IDs and
sequence, encoded context, snapshot, nonce, encoded payload and full envelope
for both modes. The fixed keys and nonces are for testing.

## Common Use Cases

### Email Encryption (PGP/MIME)

```typescript
import { getEncryption } from '@happyvertical/encryption';

const pgp = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKey,
  privateKey: myPrivateKey,
  passphrase: 'my-passphrase'
});

// Encrypt email message
const encryptedEmail = await pgp.encryptEmail({
  from: { address: 'sender@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Confidential Information',
  text: 'Secret message content',
  attachments: [
    { filename: 'document.pdf', content: pdfBuffer }
  ]
}, {
  sign: true,
  armor: true
});

// Send with your email provider
// await mailbox.send(encryptedEmail);
```

### Database Field Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';

const encryption = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: process.env.DB_ENCRYPTION_PASSWORD,
    salt: 'db-encryption-salt',
    iterations: 100000
  }
});

// Encrypt sensitive fields
async function saveUser(user) {
  const encryptedSSN = await encryption.encryptText(user.ssn);
  const encryptedCreditCard = await encryption.encryptText(user.creditCard);

  await db.insert('users', {
    id: user.id,
    name: user.name,  // Plain text
    ssn: encryptedSSN,
    credit_card: encryptedCreditCard
  });
}

// Decrypt when retrieving
async function getUser(id) {
  const row = await db.selectOne('users', { where: { id } });

  return {
    id: row.id,
    name: row.name,
    ssn: await encryption.decryptText(row.ssn),
    creditCard: await encryption.decryptText(row.credit_card)
  };
}
```

### File Backup Encryption

```typescript
import { getEncryption } from '@happyvertical/encryption';

const encryption = await getEncryption({
  type: 'nacl',
  secretKey: backupSecretKey
});

// Encrypt backup files
await encryption.encryptFile(
  '/data/backup-2024-01.tar.gz',
  '/encrypted-backups/backup-2024-01.tar.gz.enc'
);

// Decrypt when needed
await encryption.decryptFile(
  '/encrypted-backups/backup-2024-01.tar.gz.enc',
  '/restored/backup-2024-01.tar.gz'
);
```

### Digital Signatures

```typescript
import { getEncryption } from '@happyvertical/encryption';

const pgp = await getEncryption({
  type: 'pgp',
  privateKey: myPrivateKey,
  passphrase: 'my-passphrase'
});

// Sign message
const message = 'Important announcement';
const signature = await pgp.sign(message, {
  detached: true,
  armor: true
});

// Verify signature
const valid = await pgp.verify(message, signature, {
  publicKey: signerPublicKey
});

if (valid) {
  console.log('✓ Signature verified - message is authentic');
} else {
  console.log('✗ Invalid signature - message may be tampered');
}
```

## API Overview

### Factory Function

```typescript
function getEncryption(options: GetEncryptionOptions): Promise<Encryption>
```

### Encryption Interface

All adapters implement this unified interface:

```typescript
interface Encryption {
  // Text operations
  encryptText(text: string, options?: EncryptOptions): Promise<string>;
  decryptText(encrypted: string, options?: DecryptOptions): Promise<string>;

  // File operations
  encryptFile(inputPath: string, outputPath: string, options?: EncryptOptions): Promise<void>;
  decryptFile(inputPath: string, outputPath: string, options?: DecryptOptions): Promise<void>;

  // Buffer operations
  encryptBuffer(buffer: Buffer, options?: EncryptOptions): Promise<Buffer>;
  decryptBuffer(buffer: Buffer, options?: DecryptOptions): Promise<Buffer>;

  // Key management
  generateKeyPair(options?: KeyPairOptions): Promise<KeyPair>;
  importKey(key: string | Buffer, options?: ImportKeyOptions): Promise<Key>;
  exportKey(key: Key, options?: ExportKeyOptions): Promise<string | Buffer>;

  // Signing (optional)
  sign?(data: string | Buffer, options?: SignOptions): Promise<string | Buffer>;
  verify?(data: string | Buffer, signature: string | Buffer, options?: VerifyOptions): Promise<boolean>;

  // Email operations (PGP only)
  encryptEmail?(message: EmailMessage, options?: EncryptEmailOptions): Promise<EmailMessage>;
  decryptEmail?(message: EmailMessage, options?: DecryptEmailOptions): Promise<DecryptedEmail>;

  // Adapter info
  getCapabilities(): Promise<EncryptionCapabilities>;
  getAdapter(): AdapterType;
}
```

## Adapter Comparison

| Feature | PGP | NaCl | Node Crypto |
|---------|-----|------|-------------|
| **Text Encryption** | ✅ | ✅ | ✅ |
| **File Encryption** | ✅ | ✅ | ✅ |
| **Email Encryption** | ✅ | ❌ | ❌ |
| **Digital Signatures** | ✅ | ✅ | ✅ |
| **Multiple Recipients** | ✅ | ❌ | ❌ |
| **Symmetric** | ❌ | ✅ | ✅ |
| **Asymmetric** | ✅ | ✅ | ✅ |
| **Speed** | Medium | Fast | Fast |
| **Key Size** | Large | Small | Medium |
| **Best For** | Email, compatibility | Performance, modern apps | Standard algorithms, built-in |

### When to Use Each Adapter

**PGP/OpenPGP** - Best for:
- Email encryption (PGP/MIME standard)
- Multi-recipient scenarios
- Compatibility with existing PGP infrastructure
- Long-term archival

**NaCl/libsodium** - Best for:
- High-performance applications
- Modern cryptography
- File encryption
- API token encryption
- Real-time data encryption

**Node.js Crypto** - Best for:
- Standard algorithms (AES, RSA)
- No external dependencies needed
- Password-based encryption (PBKDF2)
- Enterprise requirements (FIPS compliance)

## Security Considerations

### Key Storage

**❌ DO NOT:**
- Store private keys in plain text
- Commit keys to version control
- Log keys or passphrases
- Transmit keys over insecure channels

**✅ DO:**
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
   - ✅ Prefer: AES-256-GCM, RSA-OAEP, ECDH, NaCl
   - ❌ Avoid: DES, 3DES, MD5, SHA1

3. **Key Derivation**:
   - PBKDF2: Minimum 100,000 iterations
   - Use unique salts per encryption
   - Consider Argon2 for new applications

4. **Encrypted Data Integrity**:
   - Use authenticated encryption (GCM, Poly1305)
   - Always verify signatures before trusting data
   - Implement replay protection

## Testing

Run the test suite:

```bash
npm test
```

Run tests for a specific adapter:

```bash
npm test -- test/unit/pgp.test.ts
npm test -- test/unit/nacl.test.ts
npm test -- test/unit/node.test.ts
```

Run file operations tests:

```bash
npm test -- test/unit/file-operations.test.ts
```

## Performance Benchmarks

Approximate performance for 100KB data:

| Adapter | Encryption | Decryption | Key Generation |
|---------|------------|------------|----------------|
| **PGP (RSA 4096)** | ~200ms | ~100ms | ~3000ms |
| **NaCl (secretbox)** | ~2ms | ~2ms | ~1ms |
| **AES-256-GCM** | ~5ms | ~5ms | N/A |
| **RSA-OAEP 2048** | ~50ms | ~100ms | ~500ms |

*Benchmarks run on M1 MacBook Pro. Your results may vary.*

## Documentation

- **[AGENT.md](./AGENT.md)** - Comprehensive developer guide with detailed API reference, architecture, and implementation phases
- **[API Types](./src/shared/types.ts)** - TypeScript type definitions
- **[Error Handling](./src/shared/errors.ts)** - Custom error classes

## Examples

See the [test directory](./test) for comprehensive examples:

- **[PGP Tests](./test/unit/pgp.test.ts)** - Text, file, signature examples
- **[PGP Email Tests](./test/unit/pgp-email.test.ts)** - Email encryption examples
- **[NaCl Tests](./test/unit/nacl.test.ts)** - Symmetric and asymmetric examples
- **[Node Crypto Tests](./test/unit/node.test.ts)** - AES, RSA, ECDSA examples
- **[File Operations Tests](./test/unit/file-operations.test.ts)** - File encryption for all adapters

## Related Packages

- **[@happyvertical/email](../email/)** - Email operations with encryption support
- **[@happyvertical/files](../files/)** - File operations
- **[@happyvertical/sql](../sql/)** - Database operations (can encrypt fields)

## Contributing

Contributions are welcome! Please see the root [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

### Development

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Build package
npm run build

# Lint and format
npm run lint
npm run format
```

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/happyvertical/sdk/issues)
- **Documentation**: [AGENT.md](./AGENT.md)
- **Examples**: [test/unit/](./test/unit/)

---

**Built with ❤️ by HappyVertical**
