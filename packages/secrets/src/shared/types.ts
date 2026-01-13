import type { DatabaseInterface } from '@happyvertical/sql';

/**
 * Secret store adapter type discriminator
 */
export type SecretAdapterType =
  | 'database'
  | 'aws-kms'
  | 'vault'
  | 'azure-keyvault';

/**
 * Encrypted secret envelope format
 * Stored as JSON in database or external secret stores
 */
export interface EncryptedEnvelope {
  /** Version of envelope format for future migrations */
  version: 1;
  /** Algorithm used: always 'aes-256-gcm' */
  algorithm: 'aes-256-gcm';
  /** Base64-encoded wrapped TDEK (encrypted by AMK) - format: wrappedKey:iv:authTag */
  wrappedKey: string;
  /** Key ID of the AMK used to wrap the TDEK */
  amkKeyId: string;
  /** Base64-encoded IV for data encryption */
  iv: string;
  /** Base64-encoded authentication tag */
  authTag: string;
  /** Base64-encoded encrypted secret data */
  ciphertext: string;
  /** Creation timestamp */
  createdAt: string;
  /** Optional metadata for audit trail */
  metadata?: Record<string, string>;
}

/**
 * Decrypted secret with metadata
 */
export interface DecryptedSecret {
  /** The plaintext secret value */
  value: string;
  /** Key ID that was used */
  keyId: string;
  /** When the secret was encrypted */
  createdAt: Date;
  /** Optional metadata */
  metadata?: Record<string, string>;
}

/**
 * Data Encryption Key (TDEK) for a tenant
 */
export interface TenantDataEncryptionKey {
  /** Unique key identifier */
  keyId: string;
  /** Tenant this key belongs to */
  tenantId: string;
  /** Base64-encoded wrapped key (format: wrappedKey:iv:authTag, encrypted by AMK) */
  wrappedKey: string;
  /** AMK key ID used to wrap this key */
  amkKeyId: string;
  /** Key status */
  status: 'active' | 'rotating' | 'retired' | 'compromised';
  /** Key version for rotation tracking */
  version: number;
  /** Creation timestamp */
  createdAt: Date;
  /** Rotation timestamp (when next rotation should occur) */
  rotateAfter?: Date;
  /** Retirement timestamp (when key was retired) */
  retiredAt?: Date;
}

/**
 * Application Master Key reference
 * The actual key material is in environment or KMS
 */
export interface ApplicationMasterKey {
  /** Unique key identifier */
  keyId: string;
  /** Human-readable description */
  description: string;
  /** Key status */
  status: 'active' | 'retiring' | 'retired';
  /** Provider: 'env' (environment variable) or KMS provider name */
  provider: 'env' | 'aws-kms' | 'vault' | 'azure-keyvault';
  /** Provider-specific key reference (env var name, KMS ARN, etc.) */
  keyReference: string;
  /** Creation timestamp */
  createdAt: Date;
  /** When this key should be retired */
  retireAfter?: Date;
}

/**
 * Options for encryption
 */
export interface EncryptOptions {
  /** Additional metadata to store with the secret */
  metadata?: Record<string, string>;
  /** Use a specific TDEK version (default: active) */
  keyVersion?: number;
}

/**
 * Secret store interface - implemented by all adapters
 */
export interface SecretStore {
  /**
   * Encrypt a secret value for a tenant
   */
  encrypt(
    tenantId: string,
    secretName: string,
    plaintext: string,
    options?: EncryptOptions,
  ): Promise<EncryptedEnvelope>;

  /**
   * Decrypt an encrypted envelope for a tenant
   */
  decrypt(
    tenantId: string,
    envelope: EncryptedEnvelope,
  ): Promise<DecryptedSecret>;

  /**
   * Get the active tenant data encryption key
   */
  getTenantKey(tenantId: string): Promise<TenantDataEncryptionKey | null>;

  /**
   * Create a new tenant data encryption key
   */
  createTenantKey(tenantId: string): Promise<TenantDataEncryptionKey>;

  /**
   * Rotate the tenant's encryption key
   */
  rotateTenantKey(tenantId: string): Promise<TenantDataEncryptionKey>;

  /**
   * Retire a tenant key
   */
  retireTenantKey(tenantId: string, keyId: string): Promise<void>;

  /**
   * Get the active Application Master Key info
   */
  getActiveAMK(): Promise<ApplicationMasterKey>;

  /**
   * Re-wrap a tenant key with a new AMK (for AMK rotation)
   */
  rewrapTenantKey(
    tenantId: string,
    newAmkKeyId: string,
  ): Promise<TenantDataEncryptionKey>;

  /**
   * List all key versions for a tenant
   */
  listKeyVersions(tenantId: string): Promise<TenantDataEncryptionKey[]>;
}

/**
 * Store event types
 */
export type SecretStoreEventType =
  | 'key.created'
  | 'key.rotated'
  | 'key.retired'
  | 'secret.encrypted'
  | 'secret.decrypted';

/**
 * Store event payload
 */
export interface SecretStoreEvent {
  type: SecretStoreEventType;
  tenantId: string;
  keyId?: string;
  secretName?: string;
  timestamp: Date;
}

/**
 * Event listener function
 */
export type SecretStoreEventListener = (
  event: SecretStoreEvent,
) => void | Promise<void>;

/**
 * Unsubscribe function
 */
export type Unsubscribe = () => void;

// ─────────────────────────────────────────────────────────────────────────────
// Adapter-specific options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AMK configuration for environment-based keys
 */
export interface AMKConfig {
  /** Provider for AMK */
  provider: 'env';
  /** Environment variable name containing the key (hex-encoded 32 bytes) */
  keyEnvVar: string;
  /** Key ID for tracking */
  keyId: string;
}

/**
 * Database secret store options
 */
export interface DatabaseSecretStoreOptions {
  type: 'database';
  /** Database connection */
  db: DatabaseInterface;
  /** Table name for tenant keys (default: 'tenant_encryption_keys') */
  keysTable?: string;
  /** AMK configuration */
  amk: AMKConfig;
}

/**
 * AWS KMS secret store options (Phase 2)
 */
export interface AWSKMSSecretStoreOptions {
  type: 'aws-kms';
  /** AWS region */
  region: string;
  /** KMS key ARN for AMK */
  masterKeyArn: string;
  /** Optional AWS credentials */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
  /** Database for TDEK storage */
  db: DatabaseInterface;
  /** Table name for tenant keys */
  keysTable?: string;
}

/**
 * HashiCorp Vault secret store options (Phase 2)
 */
export interface VaultSecretStoreOptions {
  type: 'vault';
  /** Vault server address */
  address: string;
  /** Vault token */
  token: string;
  /** Transit engine mount path (default: 'transit') */
  transitMount?: string;
  /** KV engine mount path for TDEKs (default: 'secret') */
  kvMount?: string;
  /** Namespace (Enterprise only) */
  namespace?: string;
}

/**
 * Azure Key Vault secret store options (Phase 2)
 */
export interface AzureKeyVaultSecretStoreOptions {
  type: 'azure-keyvault';
  /** Key Vault URL */
  vaultUrl: string;
  /** Key name for AMK */
  masterKeyName: string;
  /** Authentication method */
  auth: 'managed-identity' | 'service-principal' | 'cli';
  /** Service principal credentials (if auth is 'service-principal') */
  credentials?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
  };
  /** Database for TDEK storage */
  db: DatabaseInterface;
  /** Table name for tenant keys */
  keysTable?: string;
}

/**
 * Union type for all secret store options
 */
export type GetSecretStoreOptions =
  | DatabaseSecretStoreOptions
  | AWSKMSSecretStoreOptions
  | VaultSecretStoreOptions
  | AzureKeyVaultSecretStoreOptions;
