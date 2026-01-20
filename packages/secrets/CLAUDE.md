# @happyvertical/secrets

## Purpose and Responsibilities

The secrets package provides envelope encryption for per-tenant secret management with pluggable backends. It enables secure storage of sensitive data like API keys and credentials.

## Key Features

- **Envelope Encryption**: AES-256-GCM for data, separate key encryption
- **Per-Tenant Keys**: Each tenant has isolated encryption keys
- **Pluggable Backends**: Database adapter with more planned (KMS, HashiCorp Vault)
- **Key Rotation**: Support for rotating encryption keys

## Architecture Overview

```
Secret Storage
    ↓
Envelope Encryption
├── Data Encryption Key (DEK) - encrypts data
└── Key Encryption Key (KEK) - encrypts DEK
    ↓
Backend Storage (Database, KMS, etc.)
```

## Key APIs

### Creating a Secrets Manager

```typescript
import { getSecretsManager } from '@happyvertical/secrets';
import { getDatabase } from '@happyvertical/sql';

const db = await getDatabase({ type: 'sqlite', url: ':memory:' });

const secrets = await getSecretsManager({
  type: 'database',
  db,
  masterKey: process.env.MASTER_KEY // 32 bytes, base64 encoded
});
```

### Storing Secrets

```typescript
// Store a secret for a tenant
await secrets.set({
  tenantId: 'tenant-123',
  key: 'stripe-api-key',
  value: 'sk_live_xxx'
});

// Store with metadata
await secrets.set({
  tenantId: 'tenant-123',
  key: 'database-password',
  value: 'supersecret',
  metadata: {
    rotatedAt: new Date().toISOString(),
    version: 2
  }
});
```

### Retrieving Secrets

```typescript
// Get a secret
const apiKey = await secrets.get({
  tenantId: 'tenant-123',
  key: 'stripe-api-key'
});

if (apiKey) {
  console.log(apiKey.value);     // Decrypted value
  console.log(apiKey.metadata);  // Associated metadata
}

// List secrets for tenant (values not returned)
const keys = await secrets.list({
  tenantId: 'tenant-123'
});
```

### Deleting Secrets

```typescript
// Delete a specific secret
await secrets.delete({
  tenantId: 'tenant-123',
  key: 'old-api-key'
});

// Delete all secrets for a tenant
await secrets.deleteAll({
  tenantId: 'tenant-123'
});
```

### Key Rotation

```typescript
// Rotate the master key
await secrets.rotateKey({
  newMasterKey: process.env.NEW_MASTER_KEY
});
```

## Dependencies

- **Internal**:
  - `@happyvertical/sql` - Database adapter storage
  - `@happyvertical/utils` - Utilities

## Development Guidelines

- Master key must be 32 bytes (256 bits)
- Store master key in secure environment variable or KMS
- Never log decrypted values
- Use separate tenants for isolation
- Implement key rotation policy

## Expert Agent Expertise

When working with secrets:

1. **Master Key**: Generate with `crypto.randomBytes(32).toString('base64')`
2. **Tenant Isolation**: Each tenant has separate DEKs
3. **Envelope Encryption**: DEK encrypted by KEK for rotation
4. **Database Storage**: Encrypted data stored as base64
5. **Key Rotation**: Re-encrypts all DEKs with new KEK

## Security Considerations

- Master key compromise requires key rotation
- Database adapter stores encrypted values only
- AES-256-GCM provides authenticated encryption
- IV (nonce) is unique per encryption operation
- Consider HSM or KMS for production master keys

## Related Packages

- **@happyvertical/sql**: Database storage backend
- **@happyvertical/encryption**: Lower-level encryption utilities
- **@happyvertical/utils**: Error handling
