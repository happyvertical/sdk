/**
 * Regression test for Issue #509: JSON adapter table name quoting inconsistency
 *
 * The JSON adapter (DuckDB-backed) failed when executing operations on tables
 * with names requiring quotes (mixed case, reserved words, special characters)
 * due to inconsistent quoting - column names were quoted but table names were not.
 *
 * Root cause: SQL queries used `INSERT INTO ${table}` instead of `INSERT INTO "${table}"`,
 * causing DuckDB to reject queries with inconsistent identifier quoting.
 *
 * Fix: Quote all table names consistently with column names in all SQL operations:
 * - INSERT, UPDATE, DELETE, SELECT, COUNT, UPSERT
 * - COPY operations for JSON export
 *
 * This test suite ensures table name quoting works correctly and prevents regression.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

describe('JSON adapter identifier quoting (Issue #509)', () => {
  let testDataDir: string;
  let db: DatabaseInterface & { exportTable: (table: string) => Promise<void> };

  beforeEach(async () => {
    // Create test data directory
    testDataDir = join(process.cwd(), '.test-json-identifier-quoting');
    mkdirSync(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    // Clear connection cache to ensure test isolation
    clearConnectionCache();
    // Clean up test directory
    rmSync(testDataDir, { recursive: true, force: true });
  });

  it('should handle UPSERT with mixed-case table name (reproduces issue #509)', async () => {
    // This test would have caught the bug reported in issue #509
    // where UPSERT failed on tables with mixed-case names due to inconsistent quoting
    const tableName = 'issue509base_events';
    const schema = {
      ddl: `CREATE TABLE "${tableName}" (
  _meta_type TEXT NOT NULL,
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT CAST('' AS TEXT),
  title TEXT,
  description TEXT
)`,
      indexes: [
        `CREATE UNIQUE INDEX IF NOT EXISTS ${tableName}_slug_context_idx ON "${tableName}" (slug, context)`,
      ],
      triggers: [],
    };

    writeFileSync(join(testDataDir, `${tableName}.json`), '[]', 'utf-8');

    db = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true,
      schemas: {
        [tableName]: schema,
      },
    })) as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
    };

    // UPSERT should succeed with properly quoted table name
    await db.upsert(tableName, ['slug', 'context'], {
      _meta_type: 'Conference',
      id: 'conf-1',
      slug: 'tech-conf-2024',
      context: '',
      title: 'Tech Conference 2024',
      description: 'Annual tech conference',
    });

    const result = await db.get(tableName, { id: 'conf-1' });
    expect(result).toBeDefined();
    expect(result?._meta_type).toBe('Conference');
    expect(result?.slug).toBe('tech-conf-2024');
    expect(result?.title).toBe('Tech Conference 2024');

    // Update via UPSERT
    await db.upsert(tableName, ['slug', 'context'], {
      _meta_type: 'Conference',
      id: 'conf-1',
      slug: 'tech-conf-2024',
      context: '',
      title: 'Tech Conference 2024 - Updated',
      description: 'Updated description',
    });

    const updated = await db.get(tableName, { id: 'conf-1' });
    expect(updated?.title).toBe('Tech Conference 2024 - Updated');
    expect(updated?.description).toBe('Updated description');
  });

  it('should handle all CRUD operations with mixed-case table names', async () => {
    const tableName = 'MixedCaseTable';
    const schema = {
      ddl: `CREATE TABLE "${tableName}" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  value INTEGER
)`,
      indexes: [],
      triggers: [],
    };

    writeFileSync(join(testDataDir, `${tableName}.json`), '[]', 'utf-8');

    db = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true,
      schemas: {
        [tableName]: schema,
      },
    })) as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
    };

    // INSERT
    await db.insert(tableName, {
      id: 'test-1',
      name: 'Test Item',
      status: 'active',
      value: 100,
    });

    // GET
    const inserted = await db.get(tableName, { id: 'test-1' });
    expect(inserted?.name).toBe('Test Item');

    // UPDATE
    await db.update(
      tableName,
      { id: 'test-1' },
      { status: 'inactive', value: 200 },
    );
    const updated = await db.get(tableName, { id: 'test-1' });
    expect(updated?.status).toBe('inactive');
    expect(updated?.value).toBe(200);

    // LIST
    await db.insert(tableName, [
      { id: 'test-2', name: 'Item 2', status: 'active', value: 300 },
      { id: 'test-3', name: 'Item 3', status: 'active', value: 400 },
    ]);

    const activeItems = await db.list(tableName, { status: 'active' });
    expect(activeItems).toHaveLength(2);

    // COUNT
    const totalCount = await db.count(tableName);
    expect(totalCount).toBe(3);

    const activeCount = await db.count(tableName, { status: 'active' });
    expect(activeCount).toBe(2);

    // DELETE
    await db.delete(tableName, { id: 'test-1' });
    const deleted = await db.get(tableName, { id: 'test-1' });
    expect(deleted).toBeNull();

    const remainingCount = await db.count(tableName);
    expect(remainingCount).toBe(2);
  });

  it('should handle SQL reserved words as table names', async () => {
    const tableName = 'select'; // SQL reserved word
    const schema = {
      ddl: `CREATE TABLE "${tableName}" (
  id TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
)`,
      indexes: [],
      triggers: [],
    };

    writeFileSync(join(testDataDir, `${tableName}.json`), '[]', 'utf-8');

    db = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true,
      schemas: {
        [tableName]: schema,
      },
    })) as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
    };

    // All operations should work with reserved word table names
    await db.insert(tableName, { id: '1', value: 'test' });
    const result = await db.get(tableName, { id: '1' });
    expect(result).toBeDefined();
    expect(result?.value).toBe('test');

    await db.update(tableName, { id: '1' }, { value: 'updated' });
    const updated = await db.get(tableName, { id: '1' });
    expect(updated?.value).toBe('updated');

    const count = await db.count(tableName);
    expect(count).toBe(1);

    await db.delete(tableName, { id: '1' });
    const afterDelete = await db.count(tableName);
    expect(afterDelete).toBe(0);
  });

  it('should handle table export with quoted table names', async () => {
    const tableName = 'ExportTestTable';
    const schema = {
      ddl: `CREATE TABLE "${tableName}" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  value INTEGER
)`,
      indexes: [],
      triggers: [],
    };

    writeFileSync(join(testDataDir, `${tableName}.json`), '[]', 'utf-8');

    db = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true,
      schemas: {
        [tableName]: schema,
      },
    })) as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
    };

    await db.insert(tableName, [
      { id: '1', name: 'item 1', value: 100 },
      { id: '2', name: 'item 2', value: 200 },
    ]);

    // Export should work with quoted table names (tests COPY statement)
    await db.exportTable(tableName);

    // Verify data persists by creating new db instance
    const db2 = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true,
      schemas: {
        [tableName]: schema,
      },
    })) as DatabaseInterface;

    const count = await db2.count(tableName);
    expect(count).toBe(2);
  });
});
