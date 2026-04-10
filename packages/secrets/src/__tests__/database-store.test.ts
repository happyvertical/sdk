import { type DatabaseInterface, getDatabase } from '@happyvertical/sql';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSecretStore } from '../adapters/database.js';
import { EnvelopeEncryption } from '../shared/envelope.js';
import {
  AMKUnavailableError,
  StoreNotInitializedError,
  TenantKeyMissingError,
} from '../shared/errors.js';

// Generate a test AMK (32 bytes = 64 hex chars)
const TEST_AMK_HEX = EnvelopeEncryption.generateDataKey().toString('hex');

describe('DatabaseSecretStore', () => {
  let db: DatabaseInterface;
  let store: DatabaseSecretStore;
  const testTenantId = 'tenant-test-123';

  beforeEach(async () => {
    // Set up test AMK in environment
    process.env.TEST_SECRET_KEY = TEST_AMK_HEX;

    // Create in-memory database
    db = await getDatabase({ type: 'sqlite', url: ':memory:' });

    // Create store
    store = new DatabaseSecretStore({
      type: 'database',
      db,
      amk: {
        provider: 'env',
        keyEnvVar: 'TEST_SECRET_KEY',
        keyId: 'test-amk-v1',
      },
    });
  });

  afterEach(() => {
    delete process.env.TEST_SECRET_KEY;
  });

  describe('initialize', () => {
    it('creates the tenant keys table', async () => {
      await store.initialize();

      const exists = await db.tableExists('tenant_encryption_keys');
      expect(exists).toBe(true);
    });

    it('is idempotent', async () => {
      await store.initialize();
      await store.initialize();

      const exists = await db.tableExists('tenant_encryption_keys');
      expect(exists).toBe(true);
    });
  });

  describe('encrypt / decrypt', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('encrypts and decrypts a secret', async () => {
      const secretValue = 'sk_live_xxx123';

      const envelope = await store.encrypt(
        testTenantId,
        'api-key',
        secretValue,
      );

      expect(envelope.version).toBe(1);
      expect(envelope.algorithm).toBe('aes-256-gcm');
      expect(envelope.ciphertext).toBeTruthy();

      const decrypted = await store.decrypt(testTenantId, envelope);

      expect(decrypted.value).toBe(secretValue);
      expect(decrypted.keyId).toBeTruthy();
    });

    it('creates a tenant key automatically on first encrypt', async () => {
      // Initially no key
      let key = await store.getTenantKey(testTenantId);
      expect(key).toBeNull();

      // Encrypt creates the key
      await store.encrypt(testTenantId, 'secret', 'value');

      key = await store.getTenantKey(testTenantId);
      expect(key).not.toBeNull();
      expect(key!.status).toBe('active');
      expect(key!.version).toBe(1);
    });

    it('reuses existing tenant key', async () => {
      await store.encrypt(testTenantId, 'secret1', 'value1');
      const key1 = await store.getTenantKey(testTenantId);

      await store.encrypt(testTenantId, 'secret2', 'value2');
      const key2 = await store.getTenantKey(testTenantId);

      expect(key1!.keyId).toBe(key2!.keyId);
    });

    it('encrypts with metadata', async () => {
      const envelope = await store.encrypt(testTenantId, 'api-key', 'secret', {
        metadata: { service: 'stripe', environment: 'production' },
      });

      expect(envelope.metadata).toEqual({
        service: 'stripe',
        environment: 'production',
      });

      const decrypted = await store.decrypt(testTenantId, envelope);
      expect(decrypted.metadata).toEqual({
        service: 'stripe',
        environment: 'production',
      });
    });

    it('isolates tenants', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';

      const envelope1 = await store.encrypt(tenant1, 'key', 'secret1');
      const envelope2 = await store.encrypt(tenant2, 'key', 'secret2');

      // Each tenant gets their own key
      const key1 = await store.getTenantKey(tenant1);
      const key2 = await store.getTenantKey(tenant2);
      expect(key1!.keyId).not.toBe(key2!.keyId);

      // Decryption works for correct tenant
      const decrypted1 = await store.decrypt(tenant1, envelope1);
      const decrypted2 = await store.decrypt(tenant2, envelope2);
      expect(decrypted1.value).toBe('secret1');
      expect(decrypted2.value).toBe('secret2');

      // Cross-tenant decryption fails
      await expect(store.decrypt(tenant1, envelope2)).rejects.toThrow();
    });

    it('throws AMKUnavailableError when AMK not in environment', async () => {
      delete process.env.TEST_SECRET_KEY;

      // Clear the cached AMK
      const freshStore = new DatabaseSecretStore({
        type: 'database',
        db,
        amk: {
          provider: 'env',
          keyEnvVar: 'TEST_SECRET_KEY',
          keyId: 'test-amk-v1',
        },
      });
      await freshStore.initialize();

      await expect(
        freshStore.encrypt(testTenantId, 'key', 'value'),
      ).rejects.toThrow(AMKUnavailableError);
    });
  });

  describe('getTenantKey', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('returns null for non-existent tenant', async () => {
      const key = await store.getTenantKey('non-existent');
      expect(key).toBeNull();
    });

    it('only returns active keys', async () => {
      await store.createTenantKey(testTenantId);
      await store.rotateTenantKey(testTenantId);

      const activeKey = await store.getTenantKey(testTenantId);
      expect(activeKey!.status).toBe('active');
      expect(activeKey!.version).toBe(2);
    });
  });

  describe('createTenantKey', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('creates a new tenant key', async () => {
      const key = await store.createTenantKey(testTenantId);

      expect(key.tenantId).toBe(testTenantId);
      expect(key.status).toBe('active');
      expect(key.version).toBe(1);
      expect(key.wrappedKey).toBeTruthy();
      expect(key.amkKeyId).toBe('test-amk-v1');
      expect(key.rotateAfter).toBeDefined();
    });
  });

  describe('rotateTenantKey', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('rotates a tenant key', async () => {
      await store.createTenantKey(testTenantId);
      const newKey = await store.rotateTenantKey(testTenantId);

      expect(newKey.version).toBe(2);
      expect(newKey.status).toBe('active');

      // Old key should be retired
      const versions = await store.listKeyVersions(testTenantId);
      const oldKey = versions.find((k) => k.version === 1);
      expect(oldKey!.status).toBe('retired');
    });

    it('throws for non-existent tenant', async () => {
      await expect(store.rotateTenantKey('non-existent')).rejects.toThrow(
        TenantKeyMissingError,
      );
    });

    it('allows decryption after rotation', async () => {
      // Encrypt with old key
      const envelope = await store.encrypt(testTenantId, 'key', 'secret');

      // Rotate
      await store.rotateTenantKey(testTenantId);

      // Verify the old envelope can still be decrypted
      // (the old key version is retained for decryption)
      const decrypted = await store.decrypt(testTenantId, envelope);
      expect(decrypted.value).toBe('secret');
    });
  });

  describe('listKeyVersions', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('lists all key versions for a tenant', async () => {
      await store.createTenantKey(testTenantId);
      await store.rotateTenantKey(testTenantId);
      await store.rotateTenantKey(testTenantId);

      const versions = await store.listKeyVersions(testTenantId);

      expect(versions.length).toBe(3);
      expect(versions[0].version).toBe(3); // DESC order
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(1);
    });

    it('returns empty array for non-existent tenant', async () => {
      const versions = await store.listKeyVersions('non-existent');
      expect(versions).toEqual([]);
    });

    it('passes the tenant id directly to the raw query adapter', async () => {
      const querySpy = vi.spyOn(db, 'query');

      await store.listKeyVersions(testTenantId);

      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = ? ORDER BY version DESC'),
        testTenantId,
      );
    });
  });

  describe('retireTenantKey', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('retires a specific key', async () => {
      const key = await store.createTenantKey(testTenantId);
      await store.retireTenantKey(testTenantId, key.keyId);

      const versions = await store.listKeyVersions(testTenantId);
      expect(versions[0].status).toBe('retired');
      expect(versions[0].retiredAt).toBeDefined();
    });
  });

  describe('getActiveAMK', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('returns AMK info', async () => {
      const amk = await store.getActiveAMK();

      expect(amk.keyId).toBe('test-amk-v1');
      expect(amk.provider).toBe('env');
      expect(amk.keyReference).toBe('TEST_SECRET_KEY');
      expect(amk.status).toBe('active');
    });
  });

  describe('rewrapTenantKey', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('throws for env-based AMK', async () => {
      await store.createTenantKey(testTenantId);

      await expect(
        store.rewrapTenantKey(testTenantId, 'new-amk'),
      ).rejects.toThrow('AMK rotation not supported for env-based keys');
    });
  });

  describe('event subscription', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('emits events for key operations', async () => {
      const events: any[] = [];
      store.subscribe((event) => events.push(event));

      await store.createTenantKey(testTenantId);
      await store.rotateTenantKey(testTenantId);

      expect(events.length).toBe(2);
      expect(events[0].type).toBe('key.created');
      expect(events[1].type).toBe('key.rotated');
    });

    it('emits events for encrypt/decrypt', async () => {
      const events: any[] = [];
      store.subscribe((event) => events.push(event));

      const envelope = await store.encrypt(testTenantId, 'key', 'value');
      await store.decrypt(testTenantId, envelope);

      expect(events.some((e) => e.type === 'key.created')).toBe(true);
      expect(events.some((e) => e.type === 'secret.encrypted')).toBe(true);
      expect(events.some((e) => e.type === 'secret.decrypted')).toBe(true);
    });

    it('unsubscribe works', async () => {
      const events: any[] = [];
      const unsubscribe = store.subscribe((event) => events.push(event));

      await store.createTenantKey(testTenantId);
      expect(events.length).toBe(1);

      unsubscribe();

      await store.rotateTenantKey(testTenantId);
      expect(events.length).toBe(1); // No new events
    });
  });

  describe('error handling', () => {
    it('throws StoreNotInitializedError before initialization', async () => {
      await expect(store.getTenantKey(testTenantId)).rejects.toThrow(
        StoreNotInitializedError,
      );
    });

    it('throws for invalid AMK format', async () => {
      process.env.TEST_SECRET_KEY = 'not-valid-hex';

      const badStore = new DatabaseSecretStore({
        type: 'database',
        db,
        amk: {
          provider: 'env',
          keyEnvVar: 'TEST_SECRET_KEY',
          keyId: 'test-amk-v1',
        },
      });
      await badStore.initialize();

      await expect(
        badStore.encrypt(testTenantId, 'key', 'value'),
      ).rejects.toThrow(AMKUnavailableError);
    });
  });
});
