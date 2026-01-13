import { type DatabaseInterface, syncSchema } from '@happyvertical/sql';
import { createId } from '@happyvertical/utils';
import { EnvelopeEncryption } from '../shared/envelope.js';
import {
  AMKUnavailableError,
  DecryptionError,
  EncryptionError,
  KeyRotationError,
  StoreNotInitializedError,
  TenantKeyMissingError,
} from '../shared/errors.js';
import type {
  ApplicationMasterKey,
  DatabaseSecretStoreOptions,
  DecryptedSecret,
  EncryptedEnvelope,
  EncryptOptions,
  SecretStore,
  SecretStoreEvent,
  SecretStoreEventListener,
  TenantDataEncryptionKey,
  Unsubscribe,
} from '../shared/types.js';

/**
 * Default rotation period in milliseconds (90 days)
 */
const DEFAULT_ROTATION_PERIOD_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Database-backed secret store
 *
 * Uses envelope encryption with AES-256-GCM:
 * - Application Master Key (AMK) from environment variable
 * - Per-tenant Data Encryption Keys (TDEKs) wrapped by AMK
 * - Secrets encrypted by unwrapped TDEKs
 *
 * @example
 * ```typescript
 * const store = new DatabaseSecretStore({
 *   type: 'database',
 *   db,
 *   amk: {
 *     provider: 'env',
 *     keyEnvVar: 'SECRET_MASTER_KEY',
 *     keyId: 'amk-v1'
 *   }
 * });
 *
 * await store.initialize();
 *
 * // Encrypt a secret for a tenant
 * const envelope = await store.encrypt('tenant-123', 'api-key', 'sk_live_xxx');
 *
 * // Decrypt
 * const { value } = await store.decrypt('tenant-123', envelope);
 * ```
 */
export class DatabaseSecretStore implements SecretStore {
  private db: DatabaseInterface;
  private keysTable: string;
  private amkConfig: DatabaseSecretStoreOptions['amk'];
  private cachedAmk: Buffer | null = null;
  private initialized = false;
  private listeners: SecretStoreEventListener[] = [];

  constructor(options: DatabaseSecretStoreOptions) {
    this.db = options.db;

    // Validate table name to prevent SQL injection via identifier interpolation
    const tableName = options.keysTable ?? 'tenant_encryption_keys';
    if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
      throw new Error(
        `Invalid keysTable name "${tableName}". Table name must contain only alphanumeric characters and underscores.`,
      );
    }
    this.keysTable = tableName;

    this.amkConfig = options.amk;
  }

  /**
   * Initialize the store (create schema if needed)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create the tenant keys table
    const schema = `
      CREATE TABLE IF NOT EXISTS "${this.keysTable}" (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        wrapped_key TEXT NOT NULL,
        amk_key_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        version INTEGER NOT NULL DEFAULT 1,
        rotate_after TEXT,
        retired_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "idx_${this.keysTable}_tenant_status"
        ON "${this.keysTable}" (tenant_id, status);

      CREATE INDEX IF NOT EXISTS "idx_${this.keysTable}_rotate_after"
        ON "${this.keysTable}" (rotate_after)
        WHERE status = 'active';
    `;

    await syncSchema({ db: this.db, schema });

    this.initialized = true;
  }

  /**
   * Get the Application Master Key from environment
   */
  private getAMK(): Buffer {
    if (this.cachedAmk) {
      return this.cachedAmk;
    }

    const keyHex = process.env[this.amkConfig.keyEnvVar];
    if (!keyHex) {
      throw new AMKUnavailableError(
        `Application Master Key not found in environment variable: ${this.amkConfig.keyEnvVar}`,
      );
    }

    try {
      const key = EnvelopeEncryption.parseHexKey(keyHex);
      this.cachedAmk = key;
      return key;
    } catch (error) {
      throw new AMKUnavailableError(
        `Invalid AMK in ${this.amkConfig.keyEnvVar}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Ensure the store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new StoreNotInitializedError('database');
    }
  }

  /**
   * Emit an event to all listeners
   */
  private async emitEvent(event: SecretStoreEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  /**
   * Subscribe to store events
   */
  subscribe(listener: SecretStoreEventListener): Unsubscribe {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  async encrypt(
    tenantId: string,
    secretName: string,
    plaintext: string,
    options?: EncryptOptions,
  ): Promise<EncryptedEnvelope> {
    this.ensureInitialized();

    // Input validation
    if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new EncryptionError(
        'Invalid tenantId provided for encryption',
        'database',
      );
    }
    if (typeof secretName !== 'string' || secretName.trim().length === 0) {
      throw new EncryptionError(
        'Invalid secretName provided for encryption',
        'database',
      );
    }

    let dataKey: Buffer | null = null;
    try {
      // Get or create tenant's data encryption key
      let tenantKey = await this.getTenantKey(tenantId);
      if (!tenantKey) {
        tenantKey = await this.createTenantKey(tenantId);
      }

      // Get AMK and unwrap the TDEK
      const amk = this.getAMK();
      const {
        wrappedKey,
        iv: keyIv,
        authTag: keyAuthTag,
      } = EnvelopeEncryption.parseWrappedKey(tenantKey.wrappedKey);
      dataKey = EnvelopeEncryption.unwrapKey(
        wrappedKey,
        keyIv,
        keyAuthTag,
        amk,
      );

      // Create the envelope using the unwrapped TDEK
      const envelope = EnvelopeEncryption.createEnvelope(
        plaintext,
        dataKey,
        { wrappedKey, iv: keyIv, authTag: keyAuthTag },
        tenantKey.amkKeyId,
        options?.metadata,
      );

      // Emit event
      await this.emitEvent({
        type: 'secret.encrypted',
        tenantId,
        keyId: tenantKey.keyId,
        secretName,
        timestamp: new Date(),
      });

      return envelope;
    } catch (error) {
      if (
        error instanceof AMKUnavailableError ||
        error instanceof TenantKeyMissingError
      ) {
        throw error;
      }
      throw new EncryptionError(
        `Failed to encrypt secret '${secretName}' for tenant ${tenantId}: ${(error as Error).message}`,
        'database',
        error instanceof Error ? error : undefined,
      );
    } finally {
      // Zero out the data key buffer to prevent key material from remaining in memory
      if (dataKey && Buffer.isBuffer(dataKey)) {
        dataKey.fill(0);
      }
    }
  }

  async decrypt(
    tenantId: string,
    envelope: EncryptedEnvelope,
  ): Promise<DecryptedSecret> {
    this.ensureInitialized();

    // Input validation
    if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      throw new DecryptionError(
        'Invalid tenantId provided for decryption',
        'database',
      );
    }

    // Get all key versions for this tenant (including retired keys for decryption)
    const tenantKeys = await this.listKeyVersions(tenantId);
    if (tenantKeys.length === 0) {
      throw new TenantKeyMissingError(tenantId);
    }

    // Verify that the envelope's wrapped key belongs to this tenant
    // Extract the wrapped key portion from the envelope (format: wrappedKey:iv:authTag)
    const envelopeWrappedKeyParts = envelope.wrappedKey.split(':');
    const envelopeWrappedKey = envelopeWrappedKeyParts[0];

    const matchingKey = tenantKeys.find((key) => {
      const keyParts = key.wrappedKey.split(':');
      return keyParts[0] === envelopeWrappedKey;
    });

    if (!matchingKey) {
      throw new DecryptionError(
        `Envelope was not encrypted with a key belonging to tenant ${tenantId}`,
        'database',
      );
    }

    try {
      // Get AMK and decrypt the envelope
      const amk = this.getAMK();
      const plaintext = EnvelopeEncryption.decryptEnvelope(envelope, amk);

      // Emit event
      await this.emitEvent({
        type: 'secret.decrypted',
        tenantId,
        keyId: matchingKey.keyId,
        timestamp: new Date(),
      });

      return {
        value: plaintext,
        keyId: matchingKey.keyId,
        createdAt: new Date(envelope.createdAt),
        metadata: envelope.metadata,
      };
    } catch (error) {
      if (error instanceof AMKUnavailableError) {
        throw error;
      }
      throw new DecryptionError(
        `Failed to decrypt secret for tenant ${tenantId}: ${(error as Error).message}`,
        'database',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getTenantKey(
    tenantId: string,
  ): Promise<TenantDataEncryptionKey | null> {
    this.ensureInitialized();

    const row = await this.db.get(this.keysTable, {
      tenant_id: tenantId,
      status: 'active',
    });

    if (!row) return null;

    return this.parseKeyRow(row as Record<string, unknown>);
  }

  async createTenantKey(tenantId: string): Promise<TenantDataEncryptionKey> {
    this.ensureInitialized();

    // Generate and wrap a new data key
    const amk = this.getAMK();
    const dataKey = EnvelopeEncryption.generateDataKey();
    const wrapped = EnvelopeEncryption.wrapKey(dataKey, amk);

    const keyId = createId();
    const wrappedKeyStr = `${wrapped.wrappedKey}:${wrapped.iv}:${wrapped.authTag}`;
    const now = new Date();
    const rotateAfter = new Date(now.getTime() + DEFAULT_ROTATION_PERIOD_MS);

    await this.db.insert(this.keysTable, {
      id: keyId,
      tenant_id: tenantId,
      wrapped_key: wrappedKeyStr,
      amk_key_id: this.amkConfig.keyId,
      status: 'active',
      version: 1,
      rotate_after: rotateAfter.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    // Emit event
    await this.emitEvent({
      type: 'key.created',
      tenantId,
      keyId,
      timestamp: now,
    });

    return {
      keyId,
      tenantId,
      wrappedKey: wrappedKeyStr,
      amkKeyId: this.amkConfig.keyId,
      status: 'active',
      version: 1,
      createdAt: now,
      rotateAfter,
    };
  }

  async rotateTenantKey(tenantId: string): Promise<TenantDataEncryptionKey> {
    this.ensureInitialized();

    const currentKey = await this.getTenantKey(tenantId);
    if (!currentKey) {
      throw new TenantKeyMissingError(tenantId);
    }

    const now = new Date();

    try {
      // Mark current key as rotating
      await this.db.update(
        this.keysTable,
        { id: currentKey.keyId },
        { status: 'rotating', updated_at: now.toISOString() },
      );

      // Create new key with incremented version
      const amk = this.getAMK();
      const dataKey = EnvelopeEncryption.generateDataKey();
      const wrapped = EnvelopeEncryption.wrapKey(dataKey, amk);

      const newKeyId = createId();
      const wrappedKeyStr = `${wrapped.wrappedKey}:${wrapped.iv}:${wrapped.authTag}`;
      const rotateAfter = new Date(now.getTime() + DEFAULT_ROTATION_PERIOD_MS);

      await this.db.insert(this.keysTable, {
        id: newKeyId,
        tenant_id: tenantId,
        wrapped_key: wrappedKeyStr,
        amk_key_id: this.amkConfig.keyId,
        status: 'active',
        version: currentKey.version + 1,
        rotate_after: rotateAfter.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });

      // Mark old key as retired
      await this.db.update(
        this.keysTable,
        { id: currentKey.keyId },
        {
          status: 'retired',
          retired_at: now.toISOString(),
          updated_at: now.toISOString(),
        },
      );

      // Emit event
      await this.emitEvent({
        type: 'key.rotated',
        tenantId,
        keyId: newKeyId,
        timestamp: now,
      });

      return {
        keyId: newKeyId,
        tenantId,
        wrappedKey: wrappedKeyStr,
        amkKeyId: this.amkConfig.keyId,
        status: 'active',
        version: currentKey.version + 1,
        createdAt: now,
        rotateAfter,
      };
    } catch (error) {
      throw new KeyRotationError(
        `Failed to rotate key for tenant ${tenantId}: ${(error as Error).message}`,
        'database',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async retireTenantKey(tenantId: string, keyId: string): Promise<void> {
    this.ensureInitialized();

    const now = new Date();

    await this.db.update(
      this.keysTable,
      { id: keyId, tenant_id: tenantId },
      {
        status: 'retired',
        retired_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    );

    // Emit event
    await this.emitEvent({
      type: 'key.retired',
      tenantId,
      keyId,
      timestamp: now,
    });
  }

  async getActiveAMK(): Promise<ApplicationMasterKey> {
    // Validate that the AMK is accessible
    this.getAMK();

    return {
      keyId: this.amkConfig.keyId,
      description: `AMK from env var ${this.amkConfig.keyEnvVar}`,
      status: 'active',
      provider: 'env',
      keyReference: this.amkConfig.keyEnvVar,
      createdAt: new Date(),
    };
  }

  async rewrapTenantKey(
    _tenantId: string,
    _newAmkKeyId: string,
  ): Promise<TenantDataEncryptionKey> {
    // For env-based AMK, this would require:
    // 1. Having both old and new AMK available
    // 2. Unwrapping with old AMK
    // 3. Rewrapping with new AMK
    // This is complex and risky for env-based keys
    throw new Error(
      'AMK rotation not supported for env-based keys. ' +
        'Use AWS KMS, Vault, or Azure Key Vault for AMK rotation support.',
    );
  }

  async listKeyVersions(tenantId: string): Promise<TenantDataEncryptionKey[]> {
    this.ensureInitialized();

    const { rows } = await this.db.query(
      `SELECT * FROM "${this.keysTable}" WHERE tenant_id = ? ORDER BY version DESC`,
      [tenantId],
    );

    return rows.map((row) => this.parseKeyRow(row as Record<string, unknown>));
  }

  /**
   * Parse a database row into a TenantDataEncryptionKey
   */
  private parseKeyRow(row: Record<string, unknown>): TenantDataEncryptionKey {
    return {
      keyId: row.id as string,
      tenantId: row.tenant_id as string,
      wrappedKey: row.wrapped_key as string,
      amkKeyId: row.amk_key_id as string,
      status: row.status as TenantDataEncryptionKey['status'],
      version: row.version as number,
      createdAt: new Date(row.created_at as string),
      rotateAfter: row.rotate_after
        ? new Date(row.rotate_after as string)
        : undefined,
      retiredAt: row.retired_at
        ? new Date(row.retired_at as string)
        : undefined,
    };
  }
}

export default DatabaseSecretStore;
