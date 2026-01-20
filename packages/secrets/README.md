# @happyvertical/secrets

Envelope encryption SDK for per-tenant secret management with pluggable backends.

## Installation

```bash
npm install @happyvertical/secrets
# or
pnpm add @happyvertical/secrets
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-secrets-context
```

This copies the package's `CLAUDE.md` documentation and `.claude-meta.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Overview

This package provides envelope encryption primitives for secure, per-tenant secret management. It uses a two-tier key hierarchy:

```
Application Master Key (AMK) - from environment variable
    └── wraps → Tenant Data Encryption Keys (TDEKs) - per tenant, stored in DB
                    └── encrypts → Secret values (AES-256-GCM)
```

## Quick Start

```typescript
import { getSecretStore } from '@happyvertical/secrets';
import { getDatabase } from '@happyvertical/sql';

// Set up database and AMK
const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
process.env.MY_SECRET_KEY = crypto.randomBytes(32).toString('hex');

// Create secret store
const store = await getSecretStore({
  type: 'database',
  db,
  amk: {
    provider: 'env',
    keyEnvVar: 'MY_SECRET_KEY',
    keyId: 'amk-v1',
  },
});

// Create tenant key
await store.createTenantKey('tenant-123');

// Encrypt a secret
const envelope = await store.encrypt('tenant-123', 'api-key', 'sk_live_xxx');

// Decrypt the secret
const { value } = await store.decrypt('tenant-123', envelope);
console.log(value); // 'sk_live_xxx'
```

## Core Concepts

### Envelope Encryption

Envelope encryption separates data encryption from key management:

1. **Application Master Key (AMK)**: A 32-byte key stored securely (env var, KMS, etc.)
2. **Tenant Data Encryption Keys (TDEKs)**: Per-tenant keys wrapped by the AMK
3. **Secret Values**: Encrypted with tenant's TDEK using AES-256-GCM

This architecture enables:
- Per-tenant key isolation
- Key rotation without re-encrypting all secrets
- Secure key storage (only wrapped keys in database)

### SecretStore Interface

```typescript
interface SecretStore {
  // Encrypt a secret for a tenant
  encrypt(tenantId: string, secretName: string, plaintext: string): Promise<EncryptedEnvelope>;

  // Decrypt a secret
  decrypt(tenantId: string, envelope: EncryptedEnvelope): Promise<DecryptedSecret>;

  // Tenant key management
  getTenantKey(tenantId: string): Promise<TenantDataEncryptionKey | null>;
  createTenantKey(tenantId: string): Promise<TenantDataEncryptionKey>;
  rotateTenantKey(tenantId: string): Promise<TenantDataEncryptionKey>;

  // Event subscription
  subscribe(listener: SecretStoreEventListener): Unsubscribe;
}
```

## API Reference

### getSecretStore(options)

Factory function to create a secret store instance.

```typescript
const store = await getSecretStore({
  type: 'database',
  db: databaseInstance,
  keysTable: 'tenant_encryption_keys', // optional, default
  amk: {
    provider: 'env',
    keyEnvVar: 'SMRT_SECRET_MASTER_KEY',
    keyId: 'production-amk-v1',
  },
});
```

### EnvelopeEncryption

Low-level encryption primitives:

```typescript
import { EnvelopeEncryption } from '@happyvertical/secrets';

// Generate a data key
const dataKey = EnvelopeEncryption.generateDataKey();

// Wrap the key with AMK
const wrapped = EnvelopeEncryption.wrapKey(dataKey, amk);

// Encrypt data
const encrypted = EnvelopeEncryption.encryptData('secret', dataKey);

// Decrypt data
const plaintext = EnvelopeEncryption.decryptData(
  encrypted.ciphertext,
  encrypted.iv,
  encrypted.authTag,
  dataKey,
);
```

## Key Rotation

Rotate tenant keys without service interruption:

```typescript
// Old keys are retained for decryption
const newKey = await store.rotateTenantKey('tenant-123');

// Old envelopes still decrypt (using retained key version)
const decrypted = await store.decrypt('tenant-123', oldEnvelope);

// New envelopes use the new key
const newEnvelope = await store.encrypt('tenant-123', 'new-secret', 'value');
```

## Events

Subscribe to encryption/decryption events:

```typescript
const unsubscribe = store.subscribe((event) => {
  console.log(`${event.type} for tenant ${event.tenantId}`);
});

// Later: unsubscribe
unsubscribe();
```

Event types:
- `secret.encrypted` - Secret was encrypted
- `secret.decrypted` - Secret was decrypted
- `key.created` - Tenant key was created
- `key.rotated` - Tenant key was rotated

## Security Considerations

1. **AMK Protection**: Store the Application Master Key securely
   - Use environment variables for simple deployments
   - Use AWS KMS, HashiCorp Vault, or Azure Key Vault for production

2. **Key Isolation**: Each tenant has a unique TDEK
   - Compromise of one tenant's data doesn't expose others
   - Keys can be rotated independently

3. **AES-256-GCM**: Authenticated encryption
   - Provides confidentiality and integrity
   - 12-byte IV, 16-byte auth tag

4. **Memory Safety**: Key buffers are zeroed after use
   - Reduces exposure window for sensitive key material

## Error Handling

```typescript
import {
  AMKUnavailableError,
  TenantKeyMissingError,
  EncryptionError,
  DecryptionError,
} from '@happyvertical/secrets';

try {
  await store.encrypt('tenant-123', 'secret', 'value');
} catch (error) {
  if (error instanceof AMKUnavailableError) {
    // AMK not configured or inaccessible
  } else if (error instanceof TenantKeyMissingError) {
    // Tenant doesn't have a key - create one first
  } else if (error instanceof EncryptionError) {
    // Encryption failed
  }
}
```

## License

MIT
