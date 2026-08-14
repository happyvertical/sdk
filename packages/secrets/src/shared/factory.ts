import type {
  AWSKMSSecretStoreOptions,
  AzureKeyVaultSecretStoreOptions,
  DatabaseSecretStoreOptions,
  GetSecretStoreOptions,
  SecretStore,
  VaultSecretStoreOptions,
} from './types.js';

/**
 * Type guard for database options
 */
export function isDatabaseOptions(
  opts: GetSecretStoreOptions,
): opts is DatabaseSecretStoreOptions {
  return opts.type === 'database';
}

/**
 * Type guard for AWS KMS options
 */
export function isAWSKMSOptions(
  opts: GetSecretStoreOptions,
): opts is AWSKMSSecretStoreOptions {
  return opts.type === 'aws-kms';
}

/**
 * Type guard for Vault options
 */
export function isVaultOptions(
  opts: GetSecretStoreOptions,
): opts is VaultSecretStoreOptions {
  return opts.type === 'vault';
}

/**
 * Type guard for Azure Key Vault options
 */
export function isAzureKeyVaultOptions(
  opts: GetSecretStoreOptions,
): opts is AzureKeyVaultSecretStoreOptions {
  return opts.type === 'azure-keyvault';
}

/**
 * Factory function to create secret store instances
 *
 * Uses lazy imports to avoid loading unnecessary adapters and their dependencies.
 *
 * @example
 * ```typescript
 * // Database-backed store with env-based AMK
 * const store = await getSecretStore({
 *   type: 'database',
 *   db,
 *   amk: {
 *     provider: 'env',
 *     keyEnvVar: 'SECRET_MASTER_KEY',
 *     keyId: 'amk-v1'
 *   }
 * });
 *
 * // Encrypt a secret
 * const envelope = await store.encrypt('tenant-123', 'api-key', 'synthetic-secret');
 *
 * // Decrypt
 * const decrypted = await store.decrypt('tenant-123', envelope);
 * ```
 */
export async function getSecretStore(
  options: GetSecretStoreOptions,
): Promise<SecretStore> {
  if (isDatabaseOptions(options)) {
    const { DatabaseSecretStore } = await import('../adapters/database.js');
    const store = new DatabaseSecretStore(options);
    await store.initialize();
    return store;
  }

  if (isAWSKMSOptions(options)) {
    // Phase 2: AWS KMS adapter
    throw new Error(
      'AWS KMS adapter not yet implemented. Coming in a future release.',
    );
  }

  if (isVaultOptions(options)) {
    // Phase 2: HashiCorp Vault adapter
    throw new Error(
      'HashiCorp Vault adapter not yet implemented. Coming in a future release.',
    );
  }

  if (isAzureKeyVaultOptions(options)) {
    // Phase 2: Azure Key Vault adapter
    throw new Error(
      'Azure Key Vault adapter not yet implemented. Coming in a future release.',
    );
  }

  throw new Error(
    `Unsupported secret store type: ${(options as { type: string }).type}`,
  );
}
