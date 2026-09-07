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

This copies the package's `AGENT.md` documentation and `metadata.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

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
const envelope = await store.encrypt('tenant-123', 'api-key', 'synthetic-secret');

// Decrypt the secret
const { value } = await store.decrypt('tenant-123', envelope);
// Use value without logging or retaining plaintext.
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

## Credential custody orchestration

`CredentialCustody` coordinates a provider-neutral issuer, verifier, optional
secret sink, and receipt ledger. It supports two explicit modes:

- `ephemeral` keeps opaque `SecretMaterial` in memory for a bounded lifetime,
  automatically revokes it at expiry, and never stores it in a sink.
- `durable` requires a `CredentialSecretSink`, then completes
  issue → store → retrieve → verify before returning a lease. Any failure
  removes the stored value when present and revokes the issued credential.

```typescript
import {
  CredentialCustody,
  type CredentialReceiptAttestor,
  type CredentialIssuer,
  type CredentialCustodyFinalizer,
  type CredentialSecretSink,
  type CredentialVerifier,
  type CustodyLedger,
} from '@happyvertical/secrets';

const custody = new CredentialCustody({
  issuer: myIssuer satisfies CredentialIssuer,
  verifier: myVerifier satisfies CredentialVerifier,
  sink: mySink satisfies CredentialSecretSink,
  ledger: myLedger satisfies CustodyLedger,
  attestor: myAttestor satisfies CredentialReceiptAttestor,
  finalizer: myFinalizer satisfies CredentialCustodyFinalizer,
});

const lease = await custody.issue({
  mode: 'durable',
  subject: 'deployment-agent',
  attribution: {
    actor: 'automation',
    runtime: 'scheduler',
    session: 'job-123',
  },
  metadata: { purpose: 'repository-maintenance' },
});

await lease.withEnvironment('SERVICE_CREDENTIAL', async () => {
  // The variable exists only for this callback and is restored afterward.
  await runAuthenticatedOperation();
});

const child = await lease.withChildProcess({
  trust: 'cooperative-process-group',
  command: 'service-cli',
  args: ['verify'],
  environmentVariable: 'SERVICE_CREDENTIAL',
  timeoutMs: 30_000,
});
```

The returned `CustodyReceipt` contains identifiers, attribution, verification
state, sink reference, rotation lineage, and an Ed25519 attestation only.
Plaintext is represented by
`SecretMaterial`, whose string, JSON, and inspection forms are always redacted.
Adapters can access it only inside `SecretMaterial.use(...)` and should avoid
copying or retaining the supplied string. Both `SecretMaterial.use(...)` and
`withEnvironment(...)` return `Promise<void>` so callback code cannot return
plaintext through the custody API. Environment callbacks are serialized and
always restore the prior value. Because JavaScript callbacks cannot be forcibly
cancelled, expiring credentials fail closed for `withEnvironment(...)`; use
`withChildProcess(...)` for bounded execution.

Attestation binds every receipt field—including the stable sink tuple
`sinkName`, `reference`, `version`, and `storedAt`—to an internal SHA-256
commitment of the credential. The commitment is signed but is not included in
the receipt. `CredentialCustodyOptions.attestor` is required, so unsigned
issuance fails closed. `Ed25519CustodyReceiptAttestor` accepts a Node `KeyObject`
private key; remote signers can implement `CredentialReceiptAttestor` without
exposing their key.

Consumers verify a presented credential without issuer or sink access by
constructing its `SecretMaterial` and calling
`verifyCustodyReceiptAttestation(receipt, material, publicKey)`. Resolve
`receipt.attestation.keyId` only through trusted configuration, never from
receipt-supplied key material. Import a trusted PEM/SPKI public key with Node's
`createPublicKey(...)`; verification requires the resulting public `KeyObject`.
Always destroy the temporary `SecretMaterial` after verification.

The required `CredentialCustodyFinalizer` is a staged, idempotent transaction.
The signed receipt is first recorded as `finalization-pending`; `prepare` then
receives it with bounded `SecretMaterial`. The receipt binds the finalizer name
and SDK-generated `finalizationId`. `commit` activates the prepared record, and
the ledger atomically marks it issued while recording any predecessor cleanup.
Only then does rotation retire the predecessor. Cleanup failure keeps the new
credential active and is retried by `recoverPendingRollbacks()`. The finalizer's
`status` resolves crash ambiguity; `abort` and issuer/sink cleanup run
independently. Implement `prepare`, `commit`, `abort`, and `status` idempotently
by `finalizationId`. Fresh pending transactions are protected from concurrent
takeover for `finalizationTakeoverMs` (30 seconds by default); a one-shot
recovery call schedules takeover automatically at that deadline.

Prefer `withChildProcess(...)` for trusted command-line consumers. It requires
the explicit `trust: 'cooperative-process-group'` acknowledgement, injects the
credential into the child environment without mutating the parent, disables
shell interpretation, bounds runtime and captured output, owns a detached
process group so descendants are terminated, confirms that group is gone
before returning, and exact/token-redacts stdout and stderr. The trusted
command and every credential-bearing descendant must remain in that group;
daemonizing, calling `setsid`, or spawning a detached child violates this
boundary because portable POSIX process groups cannot contain a process that
creates a new session. Use only audited executables that honor this contract.
Process-group custody fails closed on Windows, where the required POSIX group
semantics are unavailable. If group cleanup cannot be verified, the lease is
immediately invalidated and finalizer/issuer/sink cleanup runs through the same
persisted, restart-safe rollback path used by failed issuance.

Use `rotate(receiptId, request)` to issue and verify a replacement before
retiring its predecessor. `reconcile()` compares active durable receipts with
the sink inventory; `recoverOrphans(report)` removes unowned sink records while
retaining attributable history in the ledger. Missing records can be replaced
through `rotate`, preserving `replacesReceiptId` and `rotationRootReceiptId`.
The ledger's `recordIssuance` operation atomically persists the receipt with a
`finalization-pending` event and rejects duplicate or branching replacements.
`commitIssuance` idempotently appends the `issued` event and, for rotation, the
`retirement-pending` event in the same transaction. Issuer revocation
and exact-version sink removal must be idempotent so failed cleanup can retry.
`appendEvent` is idempotent by `eventId`: exact replay succeeds, while binding
the same identifier to different content fails closed.
Transient finalizer-status or ledger-commit errors retain
`finalization-pending` state and retry ambiguity resolution; only an explicit
non-committed finalizer status triggers rollback. Sink identity comparison uses
the full attested `sinkName`, `reference`, `version`, and `storedAt` tuple.
Sinks must also implement idempotent `removeByCredentialId(...)` for ambiguous
store failures, and every inventory entry must identify its credential.
Orphan recovery re-runs reconciliation and applies a configurable age grace
before deleting an unchanged sink version. Failed pre-receipt rollback records a
non-secret pending event, retries automatically, and can be resumed after a
restart with `recoverPendingRollbacks()`.

`redactCredentialText` and `redactCredentialValues` remove common bearer-token
shapes and known plaintext values from strings, structured outputs, errors, and
metadata. `CustodyError` serializes only its safe code, stage, redacted message,
and redacted details; underlying provider causes are intentionally not retained.

## License

MIT
