# Security Best Practices

This document outlines security considerations and best practices when using the `@happyvertical/encryption` package.

## Table of Contents

- [Key Management](#key-management)
- [Algorithm Selection](#algorithm-selection)
- [Password-Based Encryption](#password-based-encryption)
- [Data Integrity](#data-integrity)
- [Common Pitfalls](#common-pitfalls)
- [Production Deployment](#production-deployment)
- [Security Checklist](#security-checklist)

## Key Management

### Private Key Storage

**❌ NEVER DO THIS:**

```typescript
// DO NOT hardcode keys in source code
const encryption = await getEncryption({
  type: 'pgp',
  privateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\n...',  // ❌ WRONG!
  passphrase: 'mypassword'  // ❌ WRONG!
});

// DO NOT commit keys to version control
// DO NOT store keys in plain text files
// DO NOT log keys or passphrases
```

**✅ DO THIS:**

```typescript
// Use environment variables
const encryption = await getEncryption({
  type: 'pgp',
  privateKey: process.env.PGP_PRIVATE_KEY,
  passphrase: process.env.PGP_PASSPHRASE
});

// Or load from secure key management service
import { getSecret } from './secrets';

const encryption = await getEncryption({
  type: 'pgp',
  privateKey: await getSecret('pgp-private-key'),
  passphrase: await getSecret('pgp-passphrase')
});
```

### Key Generation

**Use Strong Key Sizes:**

```typescript
// RSA: 4096 bits (recommended)
const keypair = await pgp.generateKeyPair({
  name: 'Alice',
  email: 'alice@example.com',
  passphrase: 'strong-passphrase',
  type: 'rsa',
  keySize: 4096  // ✅ 4096 bits
});

// Minimum: 2048 bits
// Avoid: 1024 bits (deprecated)
```

**Use Modern ECC Curves:**

```typescript
// Prefer curve25519 for modern applications
const keypair = await pgp.generateKeyPair({
  name: 'Bob',
  email: 'bob@example.com',
  passphrase: 'strong-passphrase',
  type: 'ecc',
  curve: 'curve25519'  // ✅ Modern, secure, fast
});

// Or P-384 for enterprise requirements
curve: 'p384'
```

### Passphrase Requirements

**Strong Passphrases:**

```typescript
// ❌ Weak passphrases
'password'
'123456'
'qwerty'
'myname'

// ✅ Strong passphrases
'correct-horse-battery-staple-89!'
'Tr0ub4dor&3-dolphin-lamp-2024'
// Or use a password manager to generate
```

**Passphrase Validation:**

```typescript
function validatePassphrase(passphrase: string): boolean {
  // Minimum 16 characters
  if (passphrase.length < 16) return false;

  // Contains uppercase, lowercase, numbers, and symbols
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasLower = /[a-z]/.test(passphrase);
  const hasNumber = /[0-9]/.test(passphrase);
  const hasSymbol = /[^A-Za-z0-9]/.test(passphrase);

  return hasUpper && hasLower && hasNumber && hasSymbol;
}

const passphrase = generateStrongPassphrase();
if (!validatePassphrase(passphrase)) {
  throw new Error('Passphrase does not meet security requirements');
}
```

## Algorithm Selection

### Recommended Algorithms

**Symmetric Encryption:**

```typescript
// ✅ RECOMMENDED
'aes-256-gcm'    // AES-256 with Galois/Counter Mode (authenticated)
'nacl'           // NaCl secretbox (modern, fast)

// ⚠️ USE WITH CAUTION
'aes-256-cbc'    // AES-256 with CBC mode (no authentication)
'aes-128-gcm'    // AES-128 (acceptable but prefer 256-bit)

// ❌ AVOID
'des'            // Deprecated, weak
'3des'           // Deprecated, slow
'rc4'            // Broken, insecure
```

**Asymmetric Encryption:**

```typescript
// ✅ RECOMMENDED
'rsa-oaep'       // RSA with OAEP padding
'nacl'           // NaCl box (modern, fast)
'curve25519'     // ECC with curve25519

// ⚠️ USE WITH CAUTION
'rsa-pkcs1'      // Older padding, prefer OAEP

// ❌ AVOID
'rsa' (1024-bit) // Too small, deprecated
```

**Hash Functions:**

```typescript
// ✅ RECOMMENDED
'sha256'         // SHA-256
'sha384'         // SHA-384
'sha512'         // SHA-512
'blake2b'        // BLAKE2b (fast, modern)

// ❌ AVOID
'md5'            // Broken, collisions
'sha1'           // Deprecated, collisions
```

### Example: Choosing the Right Algorithm

```typescript
// For email encryption (compatibility required)
const pgp = await getEncryption({
  type: 'pgp',  // ✅ PGP for email standard
  // ...
});

// For high-performance file encryption
const nacl = await getEncryption({
  type: 'nacl',  // ✅ NaCl for speed
  secretKey: key
});

// For password-based encryption
const aes = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',  // ✅ AES-GCM with authentication
  keyDerivation: {
    password: userPassword,
    salt: uniqueSalt,
    iterations: 100000,
    digest: 'sha256'
  }
});
```

## Password-Based Encryption

### Key Derivation Functions

**PBKDF2 Configuration:**

```typescript
// ❌ INSECURE
const weak = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: 'user-password',
    iterations: 1000  // ❌ Too few iterations
  }
});

// ✅ SECURE
const strong = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',
  keyDerivation: {
    password: 'user-password',
    salt: crypto.randomBytes(16),  // ✅ Unique salt
    iterations: 100000,             // ✅ Minimum 100k iterations
    keyLength: 32,                  // ✅ 256 bits
    digest: 'sha256'                // ✅ Strong hash
  }
});
```

**Salt Requirements:**

```typescript
import * as crypto from 'node:crypto';

// ✅ Generate unique salt per encryption
const salt = crypto.randomBytes(16);  // 128 bits minimum

// ❌ DO NOT reuse the same salt
const salt = 'fixed-salt';  // ❌ WRONG!

// ❌ DO NOT use predictable salts
const salt = userId;  // ❌ WRONG!
```

**Iteration Count:**

```typescript
// Minimum iterations (2024 recommendations)
const iterations = {
  minimum: 100000,     // OWASP minimum
  recommended: 310000, // OWASP recommended (2023)
  paranoid: 1000000    // High security
};

// Consider using Argon2 for new applications
// (not built into Node.js, requires external library)
```

## Data Integrity

### Authenticated Encryption

**Always Use Authenticated Encryption:**

```typescript
// ✅ AUTHENTICATED ENCRYPTION
const aes = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-gcm',  // ✅ GCM provides authentication
  key: encryptionKey
});

// NaCl provides built-in authentication
const nacl = await getEncryption({
  type: 'nacl',  // ✅ NaCl secretbox is authenticated
  secretKey: key
});

// ⚠️ UNAUTHENTICATED ENCRYPTION (add HMAC)
const cbc = await getEncryption({
  type: 'node',
  algorithm: 'aes-256-cbc',  // ⚠️ No authentication
  key: encryptionKey
});
// If using CBC, add HMAC separately for integrity
```

### Signature Verification

**Always Verify Signatures:**

```typescript
// ✅ PROPER VERIFICATION
const decrypted = await pgp.decryptEmail(message, {
  verify: true,  // ✅ Verify signature
  publicKey: senderPublicKey
});

if (!decrypted.verified) {
  throw new Error('Signature verification failed - message may be tampered');
}

// Process verified message
console.log(decrypted.text);

// ❌ DANGEROUS - No verification
const decrypted = await pgp.decryptEmail(message);  // ❌ No verification!
console.log(decrypted.text);  // Potentially tampered data
```

### Additional Authenticated Data (AAD)

```typescript
// Use AAD for context binding
const metadata = JSON.stringify({
  userId: '12345',
  timestamp: Date.now(),
  purpose: 'backup'
});

const encrypted = await aes.encryptText('sensitive data', {
  aad: Buffer.from(metadata, 'utf8')  // ✅ Bind context to ciphertext
});

// AAD must match during decryption
const decrypted = await aes.decryptText(encrypted, {
  aad: Buffer.from(metadata, 'utf8')
});
```

## Common Pitfalls

### 1. Nonce/IV Reuse

**❌ NEVER REUSE NONCE/IV:**

```typescript
// ❌ WRONG - Same IV for multiple encryptions
const fixedIV = Buffer.from('0'.repeat(24), 'hex');

const encrypted1 = await encryption.encryptText('message1', { iv: fixedIV });
const encrypted2 = await encryption.encryptText('message2', { iv: fixedIV });
// ❌ This breaks security!
```

**✅ CORRECT - Generate new IV each time:**

```typescript
// ✅ Let the library generate random IVs
const encrypted1 = await encryption.encryptText('message1');  // Random IV
const encrypted2 = await encryption.encryptText('message2');  // Random IV
```

### 2. Weak Random Number Generation

**❌ WRONG:**

```typescript
// ❌ DO NOT use Math.random() for cryptography
const key = Array(32).fill(0).map(() => Math.floor(Math.random() * 256));

// ❌ DO NOT use predictable seeds
const key = crypto.randomBytes(32, { seed: 12345 });
```

**✅ CORRECT:**

```typescript
// ✅ Use cryptographically secure RNG
import * as crypto from 'node:crypto';

const key = crypto.randomBytes(32);  // ✅ CSPRNG
const nonce = crypto.randomBytes(12);
```

### 3. Timing Attacks

**❌ VULNERABLE:**

```typescript
// ❌ Simple string comparison vulnerable to timing attacks
function compareTokens(provided: string, expected: string): boolean {
  return provided === expected;  // ❌ Timing leak!
}
```

**✅ SECURE:**

```typescript
// ✅ Constant-time comparison
import * as crypto from 'node:crypto';

function compareTokens(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  // Constant-time comparison
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}
```

### 4. Information Leakage

**❌ INFORMATION LEAKAGE:**

```typescript
// ❌ Revealing too much in error messages
try {
  await encryption.decryptText(ciphertext);
} catch (error) {
  console.error('Decryption failed: Wrong passphrase');  // ❌ Reveals info
}
```

**✅ GENERIC ERROR:**

```typescript
// ✅ Generic error message
try {
  await encryption.decryptText(ciphertext);
} catch (error) {
  console.error('Decryption failed');  // ✅ Generic
  logger.debug(error);  // Log details privately
}
```

## Production Deployment

### Environment Configuration

```bash
# .env (NEVER commit this file)
ENCRYPTION_TYPE=nacl
ENCRYPTION_SECRET_KEY=<base64-encoded-key>
ENCRYPTION_DEBUG=false

# Key rotation
ENCRYPTION_KEY_VERSION=2
ENCRYPTION_KEY_V1=<old-key>
ENCRYPTION_KEY_V2=<new-key>
```

### Key Rotation Strategy

```typescript
// Support multiple key versions
const keys = {
  v1: process.env.ENCRYPTION_KEY_V1,
  v2: process.env.ENCRYPTION_KEY_V2
};

const currentVersion = 'v2';

// Encrypt with current version
async function encrypt(data: string): Promise<string> {
  const encryption = await getEncryption({
    type: 'nacl',
    secretKey: Buffer.from(keys[currentVersion], 'base64')
  });

  const encrypted = await encryption.encryptText(data);
  return `${currentVersion}:${encrypted}`;
}

// Decrypt with appropriate version
async function decrypt(data: string): Promise<string> {
  const [version, encrypted] = data.split(':');

  const encryption = await getEncryption({
    type: 'nacl',
    secretKey: Buffer.from(keys[version], 'base64')
  });

  return await encryption.decryptText(encrypted);
}
```

### Monitoring and Alerts

```typescript
import { EncryptionError } from '@happyvertical/encryption';

// Monitor encryption failures
let encryptionFailures = 0;
const FAILURE_THRESHOLD = 10;

try {
  await encryption.decryptText(ciphertext);
} catch (error) {
  encryptionFailures++;

  if (encryptionFailures > FAILURE_THRESHOLD) {
    // Alert security team
    await alertSecurityTeam('High encryption failure rate detected');
  }

  // Log for security audit
  securityLogger.warn('Encryption operation failed', {
    error: error.message,
    adapter: error.adapter,
    timestamp: new Date().toISOString()
  });
}
```

## Security Checklist

### Development

- [ ] Never hardcode keys or passphrases in source code
- [ ] Use environment variables for secrets
- [ ] Use strong key sizes (RSA ≥ 2048, AES ≥ 256)
- [ ] Use authenticated encryption (GCM, NaCl)
- [ ] Generate unique IVs/nonces for each encryption
- [ ] Use cryptographically secure random number generator
- [ ] Validate user input before encryption/decryption
- [ ] Use constant-time comparison for secrets
- [ ] Implement proper error handling (don't leak info)
- [ ] Add comprehensive tests for security-critical code

### Key Management

- [ ] Store keys in secure key management service (AWS KMS, Vault, etc.)
- [ ] Use strong passphrases (≥ 16 characters, mixed case, symbols)
- [ ] Implement key rotation policy
- [ ] Encrypt private keys at rest
- [ ] Use separate keys for different purposes
- [ ] Regularly audit key usage
- [ ] Have key recovery procedures documented
- [ ] Secure key deletion when no longer needed

### Production

- [ ] Use HSM for production keys
- [ ] Enable encryption for data at rest
- [ ] Enable TLS for data in transit
- [ ] Implement rate limiting for encryption operations
- [ ] Monitor for suspicious patterns
- [ ] Set up alerts for encryption failures
- [ ] Regular security audits
- [ ] Incident response plan documented
- [ ] Compliance requirements met (GDPR, HIPAA, etc.)
- [ ] Regular dependency updates

### Password-Based Encryption

- [ ] Use PBKDF2 with ≥ 100,000 iterations
- [ ] Generate unique salt per encryption
- [ ] Store salt alongside ciphertext
- [ ] Validate password strength
- [ ] Consider using Argon2 for new applications
- [ ] Implement account lockout after failed attempts

## Reporting Security Issues

If you discover a security vulnerability in this package, please report it to:

**Email**: security@happyvertical.com

Please **DO NOT** file a public issue for security vulnerabilities.

## References

- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [NIST Cryptographic Standards](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)
- [OpenPGP Best Practices](https://riseup.net/en/security/message-security/openpgp/best-practices)
- [NaCl: Networking and Cryptography library](https://nacl.cr.yp.to/)

---

**Last Updated**: 2024-01-12
