import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';

/**
 * Tests for cross-table query support in JSON adapter
 *
 * This tests the fix for smrt#472: JSON adapter cross-table queries fail
 * when referenced tables aren't explicitly initialized via syncSchema().
 *
 * The fix uses eager loading with inferred schemas (eagerLoadTables: true by default)
 * to ensure all tables exist for cross-table queries.
 */
describe('JSON adapter cross-table queries', () => {
  let db: any;
  const testDataDir = './test-json-cross-table';

  beforeEach(() => {
    // Create fresh test data directory
    rmSync(testDataDir, { recursive: true, force: true });
    mkdirSync(testDataDir, { recursive: true });
  });

  afterEach(async () => {
    await clearConnectionCache();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('eager loading (default behavior)', () => {
    it('should support JOIN queries without explicit schemas', async () => {
      // Create two JSON files
      writeFileSync(
        `${testDataDir}/orders.json`,
        JSON.stringify([
          { id: 'order-1', customer_id: 'cust-1', total: 100 },
          { id: 'order-2', customer_id: 'cust-2', total: 200 },
        ]),
      );
      writeFileSync(
        `${testDataDir}/customers.json`,
        JSON.stringify([
          { id: 'cust-1', name: 'Alice' },
          { id: 'cust-2', name: 'Bob' },
        ]),
      );

      // Get database WITHOUT explicit schemas - tables should be eagerly loaded
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
      });

      // Execute JOIN query - should work because both tables exist
      const result = await db.many`
        SELECT o.id as order_id, o.total, c.name as customer_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        ORDER BY o.total
      `;

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        order_id: 'order-1',
        total: 100,
        customer_name: 'Alice',
      });
      expect(result[1]).toMatchObject({
        order_id: 'order-2',
        total: 200,
        customer_name: 'Bob',
      });
    });

    it('should support NOT EXISTS subqueries without explicit schemas', async () => {
      // Create meetings and contents tables (like praeco's interesting() query)
      writeFileSync(
        `${testDataDir}/meetings.json`,
        JSON.stringify([
          { id: 'mtg-1', title: 'Meeting 1', start_date: '2024-01-01' },
          { id: 'mtg-2', title: 'Meeting 2', start_date: '2024-01-02' },
          { id: 'mtg-3', title: 'Meeting 3', start_date: '2024-01-03' },
        ]),
      );
      writeFileSync(
        `${testDataDir}/contents.json`,
        JSON.stringify([
          { id: 'cnt-1', meeting_id: 'mtg-1', type: 'Minutes' },
          { id: 'cnt-2', meeting_id: 'mtg-2', type: 'Highlights' },
          // mtg-3 has no contents
        ]),
      );

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
      });

      // Query for meetings WITHOUT any content (NOT EXISTS pattern)
      const result = await db.many`
        SELECT m.id, m.title
        FROM meetings m
        WHERE NOT EXISTS (
          SELECT 1 FROM contents c
          WHERE c.meeting_id = m.id
        )
      `;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'mtg-3',
        title: 'Meeting 3',
      });
    });

    it('should support LEFT JOIN with NULL checks', async () => {
      writeFileSync(
        `${testDataDir}/products.json`,
        JSON.stringify([
          { id: 'prod-1', name: 'Widget' },
          { id: 'prod-2', name: 'Gadget' },
        ]),
      );
      writeFileSync(
        `${testDataDir}/reviews.json`,
        JSON.stringify([
          { id: 'rev-1', product_id: 'prod-1', rating: 5 },
          // prod-2 has no reviews
        ]),
      );

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
      });

      // Find products without reviews
      const result = await db.many`
        SELECT p.id, p.name
        FROM products p
        LEFT JOIN reviews r ON r.product_id = p.id
        WHERE r.id IS NULL
      `;

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'prod-2',
        name: 'Gadget',
      });
    });
  });

  describe('schema upgrade after eager loading', () => {
    it('should preserve data after syncSchema() upgrades inferred schema', async () => {
      // Create JSON file with data
      writeFileSync(
        `${testDataDir}/items.json`,
        JSON.stringify([
          { id: 'item-1', name: 'Item One', code: 'A001' },
          { id: 'item-2', name: 'Item Two', code: 'A002' },
        ]),
      );

      // First, get database with eager loading (no explicit schema)
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
      });

      // Verify data is queryable
      let result = await db.many`SELECT * FROM items ORDER BY id`;
      expect(result).toHaveLength(2);

      // Now sync schema with UNIQUE constraint
      await db.syncSchema(`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          name TEXT,
          code TEXT UNIQUE
        )
      `);

      // Verify data is still there after schema upgrade
      result = await db.many`SELECT * FROM items ORDER BY id`;
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'item-1', name: 'Item One' });
    });

    it('should enable UPSERT after syncSchema() adds UNIQUE constraints', async () => {
      writeFileSync(
        `${testDataDir}/records.json`,
        JSON.stringify([
          { id: 'rec-1', email: 'alice@test.com', name: 'Alice' },
        ]),
      );

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
      });

      // Sync schema with UNIQUE constraint on email
      await db.syncSchema(`
        CREATE TABLE IF NOT EXISTS records (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          name TEXT
        )
      `);

      // UPSERT should now work (update existing by email)
      await db.upsert('records', ['email'], {
        id: randomUUID(),
        email: 'alice@test.com',
        name: 'Alice Updated',
      });

      const result = await db.many`SELECT * FROM records`;
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice Updated');
    });
  });

  describe('eagerLoadTables: false (backward compatibility)', () => {
    it('should defer table creation when eagerLoadTables is false', async () => {
      writeFileSync(
        `${testDataDir}/deferred.json`,
        JSON.stringify([{ id: 'def-1', value: 'test' }]),
      );

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        eagerLoadTables: false,
      });

      // Table should not exist yet - query should fail
      await expect(db.many`SELECT * FROM deferred`).rejects.toThrow();

      // After syncSchema, table should be created
      await db.syncSchema(`
        CREATE TABLE IF NOT EXISTS deferred (
          id TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Now query should work
      const result = await db.many`SELECT * FROM deferred`;
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'def-1', value: 'test' });
    });

    it('should fail cross-table queries when eagerLoadTables is false', async () => {
      writeFileSync(
        `${testDataDir}/table_a.json`,
        JSON.stringify([{ id: 'a-1', ref_id: 'b-1' }]),
      );
      writeFileSync(
        `${testDataDir}/table_b.json`,
        JSON.stringify([{ id: 'b-1', name: 'B record' }]),
      );

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        eagerLoadTables: false,
      });

      // Cross-table query should fail because tables aren't created yet
      await expect(
        db.many`
          SELECT a.id, b.name
          FROM table_a a
          JOIN table_b b ON a.ref_id = b.id
        `,
      ).rejects.toThrow();
    });
  });

  describe('mixed explicit and inferred schemas', () => {
    it('should handle tables with and without explicit schemas', async () => {
      writeFileSync(
        `${testDataDir}/explicit_table.json`,
        JSON.stringify([{ id: 'exp-1', data: 'explicit' }]),
      );
      writeFileSync(
        `${testDataDir}/inferred_table.json`,
        JSON.stringify([{ id: 'inf-1', data: 'inferred' }]),
      );

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas: {
          explicit_table: {
            tableName: 'explicit_table',
            ddl: `CREATE TABLE explicit_table (
              id TEXT PRIMARY KEY,
              data TEXT
            )`,
          },
          // inferred_table has no explicit schema - should be eagerly loaded
        },
      });

      // Both tables should be queryable
      const explicitResult = await db.many`SELECT * FROM explicit_table`;
      expect(explicitResult).toHaveLength(1);

      const inferredResult = await db.many`SELECT * FROM inferred_table`;
      expect(inferredResult).toHaveLength(1);

      // Cross-table query should work
      const joinResult = await db.many`
        SELECT e.id as explicit_id, i.id as inferred_id
        FROM explicit_table e, inferred_table i
      `;
      expect(joinResult).toHaveLength(1);
    });
  });
});
