import { mkdirSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';

/**
 * Test for Issue #328: JSON adapter doesn't persist SMRT system tables
 *
 * This test demonstrates that SMRT system tables (_smrt_contexts, _smrt_migrations,
 * _smrt_registry, _smrt_signals) are created in-memory but not exported to JSON files.
 * When the database connection is reopened, these tables don't exist, causing
 * "Table does not exist" errors.
 */
describe('JSON adapter system tables persistence', () => {
  const testDataDir = './test-system-tables-data';

  beforeEach(() => {
    // Create test data directory
    mkdirSync(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Clear connection cache to ensure test isolation
    await clearConnectionCache();
    // Clean up test data directory
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('should persist SMRT system tables to JSON files', async () => {
    // Step 1: Create database and initialize SMRT system tables
    const db1 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
    });

    // Create SMRT system tables (simulating what SMRT framework does)
    // Note: Using simple TEXT columns without DEFAULT datetime() since DuckDB syntax differs
    await db1.execute`
      CREATE TABLE _smrt_contexts (
        id TEXT PRIMARY KEY,
        object_id TEXT NOT NULL,
        context TEXT NOT NULL,
        created_at TEXT
      )
    `;

    await db1.execute`
      CREATE TABLE _smrt_migrations (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        applied_at TEXT
      )
    `;

    await db1.execute`
      CREATE TABLE _smrt_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        schema TEXT,
        created_at TEXT
      )
    `;

    await db1.execute`
      CREATE TABLE _smrt_signals (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload TEXT,
        emitted_at TEXT
      )
    `;

    // Insert test data into system tables
    await db1.insert('_smrt_contexts', {
      id: 'context-1',
      object_id: 'obj-1',
      context: 'test-context',
    });

    await db1.insert('_smrt_migrations', {
      id: 'migration-1',
      version: '1.0.0',
    });

    await db1.insert('_smrt_registry', {
      id: 'registry-1',
      name: 'TestObject',
      type: 'object',
    });

    await db1.insert('_smrt_signals', {
      id: 'signal-1',
      event_type: 'test.event',
      payload: '{"test": true}',
    });

    // Verify data was inserted
    const contextsCount = await db1.count('_smrt_contexts');
    const migrationsCount = await db1.count('_smrt_migrations');
    const registryCount = await db1.count('_smrt_registry');
    const signalsCount = await db1.count('_smrt_signals');

    expect(contextsCount).toBe(1);
    expect(migrationsCount).toBe(1);
    expect(registryCount).toBe(1);
    expect(signalsCount).toBe(1);

    // Step 2: Close the first database connection
    // In the real implementation, db.close() would be called here
    // For now, we'll just let db1 go out of scope

    // Step 3: Re-open database with same data directory
    const db2 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
    });

    // Step 4: Try to query system tables
    // THIS WILL FAIL until Issue #328 is fixed
    // The system tables were created in-memory but never exported to JSON files

    // Verify system tables still exist after reopening
    const contextsCount2 = await db2.count('_smrt_contexts');
    const migrationsCount2 = await db2.count('_smrt_migrations');
    const registryCount2 = await db2.count('_smrt_registry');
    const signalsCount2 = await db2.count('_smrt_signals');

    expect(contextsCount2).toBe(1);
    expect(migrationsCount2).toBe(1);
    expect(registryCount2).toBe(1);
    expect(signalsCount2).toBe(1);

    // Verify we can query the data
    const context =
      await db2.single`SELECT * FROM _smrt_contexts WHERE id = 'context-1'`;
    expect(context).toMatchObject({
      id: 'context-1',
      object_id: 'obj-1',
      context: 'test-context',
    });

    const migration =
      await db2.single`SELECT * FROM _smrt_migrations WHERE id = 'migration-1'`;
    expect(migration).toMatchObject({
      id: 'migration-1',
      version: '1.0.0',
    });

    const registry =
      await db2.single`SELECT * FROM _smrt_registry WHERE id = 'registry-1'`;
    expect(registry).toMatchObject({
      id: 'registry-1',
      name: 'TestObject',
      type: 'object',
    });

    const signal =
      await db2.single`SELECT * FROM _smrt_signals WHERE id = 'signal-1'`;
    expect(signal).toMatchObject({
      id: 'signal-1',
      event_type: 'test.event',
      payload: '{"test": true}',
    });

    // Check what files were created
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(testDataDir);
    console.log('Files in data directory:', files);
  });

  it('should persist empty system tables (created but no data inserted)', async () => {
    // This tests the scenario where SMRT creates system tables but no data is inserted yet
    // The tables should still exist after reopening the database

    // Step 1: Create database and create empty system tables
    const db1 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
    });

    // Create empty system tables (no insert - just CREATE TABLE)
    await db1.execute`
      CREATE TABLE _smrt_contexts (
        id TEXT PRIMARY KEY,
        object_id TEXT NOT NULL,
        context TEXT NOT NULL
      )
    `;

    // Verify table exists in db1
    const tableExists1 = await db1.tableExists('_smrt_contexts');
    expect(tableExists1).toBe(true);

    // Check what files exist - EMPTY tables may not be exported
    const { readdirSync } = await import('node:fs');
    const files1 = readdirSync(testDataDir);
    console.log('Files after CREATE TABLE (no inserts):', files1);

    // Step 2: Clear cache and reopen database (simulates app restart)
    await clearConnectionCache();
    const db2 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
    });

    // Step 3: Check if table still exists
    // THIS IS THE LIKELY FAILURE POINT - empty tables not persisted
    const tableExists2 = await db2.tableExists('_smrt_contexts');
    expect(tableExists2).toBe(true);

    // Should be able to query the empty table
    const count = await db2.count('_smrt_contexts');
    expect(count).toBe(0);
  });

  it('should persist tables created via syncSchema() (SMRT use case)', async () => {
    // This tests the actual SMRT framework use case
    // SMRT creates system tables via syncSchema(), not execute()

    // Step 1: Create database
    const db1 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
    });

    // Step 2: Create system tables via syncSchema (like SMRT does)
    const SYSTEM_TABLES_SCHEMA = `
      CREATE TABLE _smrt_contexts (
        id TEXT PRIMARY KEY,
        object_id TEXT NOT NULL,
        context TEXT NOT NULL
      );

      CREATE TABLE _smrt_migrations (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL
      );

      CREATE TABLE _smrt_registry (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL
      );

      CREATE TABLE _smrt_signals (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        payload TEXT
      );
    `;

    await db1.syncSchema?.(SYSTEM_TABLES_SCHEMA);

    // Verify tables exist in db1
    const contextsExist1 = await db1.tableExists('_smrt_contexts');
    const migrationsExist1 = await db1.tableExists('_smrt_migrations');
    const registryExist1 = await db1.tableExists('_smrt_registry');
    const signalsExist1 = await db1.tableExists('_smrt_signals');

    expect(contextsExist1).toBe(true);
    expect(migrationsExist1).toBe(true);
    expect(registryExist1).toBe(true);
    expect(signalsExist1).toBe(true);

    // Check what files were created
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(testDataDir);
    console.log('Files after syncSchema():', files);

    // Verify JSON files were created
    expect(files).toContain('_smrt_contexts.json');
    expect(files).toContain('_smrt_migrations.json');
    expect(files).toContain('_smrt_registry.json');
    expect(files).toContain('_smrt_signals.json');

    // Step 3: Clear cache and reopen database (simulates app restart)
    await clearConnectionCache();
    const db2 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
    });

    // Step 4: Verify tables still exist (this was failing before the fix)
    const contextsExist2 = await db2.tableExists('_smrt_contexts');
    const migrationsExist2 = await db2.tableExists('_smrt_migrations');
    const registryExist2 = await db2.tableExists('_smrt_registry');
    const signalsExist2 = await db2.tableExists('_smrt_signals');

    expect(contextsExist2).toBe(true);
    expect(migrationsExist2).toBe(true);
    expect(registryExist2).toBe(true);
    expect(signalsExist2).toBe(true);

    // Verify we can query the empty tables
    const contextsCount = await db2.count('_smrt_contexts');
    const migrationsCount = await db2.count('_smrt_migrations');
    const registryCount = await db2.count('_smrt_registry');
    const signalsCount = await db2.count('_smrt_signals');

    expect(contextsCount).toBe(0);
    expect(migrationsCount).toBe(0);
    expect(registryCount).toBe(0);
    expect(signalsCount).toBe(0);
  });
});
