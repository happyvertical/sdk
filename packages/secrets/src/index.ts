/**
 * @happyvertical/secrets
 *
 * Envelope encryption for per-tenant secret management with pluggable backends.
 *
 * @example
 * ```typescript
 * import { getSecretStore } from '@happyvertical/secrets';
 * import { getDatabase } from '@happyvertical/sql';
 *
 * // Get a database connection
 * const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
 *
 * // Create a secret store
 * const store = await getSecretStore({
 *   type: 'database',
 *   db,
 *   amk: {
 *     provider: 'env',
 *     keyEnvVar: 'SECRET_MASTER_KEY',  // 64 hex chars (32 bytes)
 *     keyId: 'amk-v1'
 *   }
 * });
 *
 * // Encrypt a secret for a tenant
 * const envelope = await store.encrypt('tenant-123', 'api-key', 'synthetic-secret');
 *
 * // Decrypt the secret
 * const { value } = await store.decrypt('tenant-123', envelope);
 * // Use value without logging or retaining plaintext.
 *
 * // Rotate tenant's encryption key
 * await store.rotateTenantKey('tenant-123');
 * ```
 *
 * @packageDocumentation
 */

// Direct adapter exports (for advanced usage)
export { DatabaseSecretStore } from './adapters/database.js';
export type {
  CredentialChildProcessOptions,
  CredentialChildProcessResult,
  CredentialCustodyFinalizer,
  CredentialCustodyOptions,
  CredentialIssuanceMode,
  CredentialIssueRequest,
  CredentialIssuer,
  CredentialLease,
  CredentialReceiptAttestor,
  CredentialSecretSink,
  CredentialVerifier,
  CustodyAttribution,
  CustodyEvent,
  CustodyEventType,
  CustodyIssuanceRequest,
  CustodyLedger,
  CustodyReceipt,
  CustodyReceiptAttestation,
  CustodyReconciliation,
  CustodyStage,
  IssuedCredential,
  SecretSinkInventoryEntry,
  SecretSinkRecord,
} from './shared/custody.js';
export {
  CredentialCustody,
  CustodyError,
  Ed25519CustodyReceiptAttestor,
  InMemoryCustodyLedger,
  redactCredentialText,
  redactCredentialValues,
  runCredentialChildProcess,
  SecretMaterial,
  verifyCustodyReceiptAttestation,
  withEnvironmentSecret,
} from './shared/custody.js';
// Envelope encryption primitives
export { EnvelopeEncryption } from './shared/envelope.js';
// Error classes
export {
  AMKUnavailableError,
  DecryptionError,
  EncryptionError,
  InvalidKeyFormatError,
  KeyNotFoundError,
  KeyRotationError,
  SecretError,
  StoreNotInitializedError,
  TenantKeyMissingError,
} from './shared/errors.js';
// Factory function
export {
  getSecretStore,
  isAWSKMSOptions,
  isAzureKeyVaultOptions,
  isDatabaseOptions,
  isVaultOptions,
} from './shared/factory.js';
// Core types
export type {
  // Adapter options
  AMKConfig,
  ApplicationMasterKey,
  AWSKMSSecretStoreOptions,
  AzureKeyVaultSecretStoreOptions,
  DatabaseSecretStoreOptions,
  DecryptedSecret,
  EncryptedEnvelope,
  EncryptOptions,
  GetSecretStoreOptions,
  SecretAdapterType,
  SecretStore,
  SecretStoreEvent,
  SecretStoreEventListener,
  SecretStoreEventType,
  TenantDataEncryptionKey,
  Unsubscribe,
  VaultSecretStoreOptions,
} from './shared/types.js';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
