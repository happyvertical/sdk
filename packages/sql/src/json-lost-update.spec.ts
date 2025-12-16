/**
 * Regression test for Issues #533/#534: JSON adapter lost update bug
 *
 * PROBLEM:
 * When multiple connections are created to the same JSON database directory
 * with explicit schemas but without dbid, the caching logic was bypassed.
 * This caused a read-modify-write race condition where:
 *
 * 1. Connection A creates and saves record 1 → JSON has [1]
 * 2. Connection B is created (gets separate DuckDB in-memory engine)
 * 3. Connection B loads from JSON (has record 1)
 * 4. Connection A saves record 2 → JSON has [1, 2]
 * 5. Connection B saves record 3 → exports its state [1, 3] → Record 2 is LOST!
 *
 * The root cause was that each connection had its own in-memory DuckDB state,
 * and when exporting to JSON, it would overwrite the entire file with its state,
 * not knowing about records added by other connections.
 *
 * SOLUTION:
 * Always generate a cache key from the URL, ensuring all connections to the
 * same JSON directory share the same in-memory DuckDB instance.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

describe('JSON adapter lost update bug (Issues #533/#534)', () => {
  let testDataDir: string;

  beforeEach(async () => {
    // Use unique directory per test run
    testDataDir = join(process.cwd(), `.test-lost-update-${Date.now()}`);
    await mkdir(testDataDir, { recursive: true });
    clearConnectionCache();
  });

  afterEach(async () => {
    clearConnectionCache();
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should share connection for same URL (preventing lost updates)', async () => {
    // Initialize empty JSON file
    await writeFile(join(testDataDir, 'documents.json'), '[]', 'utf-8');

    const schema = {
      documents: {
        ddl: `CREATE TABLE documents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT
        )`,
        indexes: [],
      },
    };

    // Create first connection
    const db1 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: schema,
    });

    // Save record 1 via connection 1
    await db1.upsert('documents', ['id'], {
      id: 'doc-1',
      title: 'Document 1',
      content: 'Content 1',
    });

    // Create second connection - should get SAME cached connection
    const db2 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: schema,
    });

    // Verify both connections are the same instance
    expect(db1).toBe(db2);

    // Save record 2 via connection 1
    await db1.upsert('documents', ['id'], {
      id: 'doc-2',
      title: 'Document 2',
      content: 'Content 2',
    });

    // Save record 3 via connection 2
    await db2.upsert('documents', ['id'], {
      id: 'doc-3',
      title: 'Document 3',
      content: 'Content 3',
    });

    // Read the JSON file directly to verify all records persisted
    const jsonContent = await readFile(
      join(testDataDir, 'documents.json'),
      'utf-8',
    );
    const records = JSON.parse(jsonContent);

    // All 3 records should be present (no lost updates)
    expect(records).toHaveLength(3);
    expect(records.map((r: any) => r.id).sort()).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
    ]);
  });

  it('should preserve all records across multiple saves', async () => {
    await writeFile(join(testDataDir, 'items.json'), '[]', 'utf-8');

    const schema = {
      items: {
        ddl: `CREATE TABLE items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        )`,
        indexes: [],
      },
    };

    const db = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: schema,
    });

    // Save multiple records
    for (let i = 1; i <= 10; i++) {
      await db.upsert('items', ['id'], {
        id: `item-${i}`,
        name: `Item ${i}`,
      });
    }

    // Verify all records persisted
    const jsonContent = await readFile(
      join(testDataDir, 'items.json'),
      'utf-8',
    );
    const records = JSON.parse(jsonContent);

    expect(records).toHaveLength(10);
  });

  it('should allow fresh connection after clearConnectionCache', async () => {
    await writeFile(join(testDataDir, 'test.json'), '[]', 'utf-8');

    const schema = {
      test: {
        ddl: `CREATE TABLE test (
          id TEXT PRIMARY KEY,
          value TEXT
        )`,
        indexes: [],
      },
    };

    // Create first connection
    const db1 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: schema,
    });

    await db1.upsert('test', ['id'], { id: '1', value: 'first' });

    // Clear cache
    clearConnectionCache();

    // Create new connection - should be fresh
    const db2 = await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      schemas: schema,
    });

    // Should NOT be the same instance
    expect(db1).not.toBe(db2);

    // But should see the data (loaded from JSON)
    const record = await db2.single`SELECT * FROM test WHERE id = '1'`;
    expect(record?.value).toBe('first');
  });
});
