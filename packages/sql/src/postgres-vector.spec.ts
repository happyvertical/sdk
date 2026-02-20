import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

async function checkPgvectorAvailable(): Promise<boolean> {
  try {
    const testDb = await getDatabase({
      type: 'postgres',
      database: process.env.SQLOO_DATABASE || 'testdb',
      host: process.env.SQLOO_HOST || 'localhost',
      user: process.env.SQLOO_USER || 'postgres',
      password: process.env.SQLOO_PASSWORD || 'postgres',
      port: Number(process.env.SQLOO_PORT) || 5432,
    });

    // Check both postgres connectivity and pgvector availability
    await testDb.execute`CREATE EXTENSION IF NOT EXISTS vector`;
    await testDb.client.end();
    return true;
  } catch (_error) {
    return false;
  }
}

describe('postgres vector capabilities (pgvector)', () => {
  let db: DatabaseInterface;
  let postgresAvailable = false;
  const testTable = `vector_test_${Date.now()}`;

  beforeEach(async () => {
    postgresAvailable = await checkPgvectorAvailable();
    if (!postgresAvailable) {
      console.log(
        'PostgreSQL with pgvector not available, skipping vector tests',
      );
      return;
    }

    db = await getDatabase({
      type: 'postgres',
      database: process.env.SQLOO_DATABASE || 'testdb',
      host: process.env.SQLOO_HOST || 'localhost',
      user: process.env.SQLOO_USER || 'postgres',
      password: process.env.SQLOO_PASSWORD || 'postgres',
      port: Number(process.env.SQLOO_PORT) || 5432,
    });

    // Create a test table with an id and text column
    await db.client.query(`DROP TABLE IF EXISTS "${testTable}"`);
    await db.client.query(`
      CREATE TABLE "${testTable}" (
        id TEXT PRIMARY KEY,
        content TEXT,
        category TEXT
      )
    `);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;

    await db.client.query(`DROP TABLE IF EXISTS "${testTable}"`);
    await db.client.end();
  });

  it('should have vector capabilities on postgres adapter', () => {
    if (!postgresAvailable) return;

    expect(db.vector).toBeDefined();
    expect(typeof db.vector?.search).toBe('function');
    expect(typeof db.vector?.ensureColumn).toBe('function');
    expect(typeof db.vector?.ensureIndex).toBe('function');
    expect(typeof db.vector?.upsertVector).toBe('function');
  });

  describe('ensureColumn', () => {
    it('should create a vector column on the table', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);

      // Verify column exists
      const result = await db.many`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = ${testTable} AND column_name = 'embedding'
      `;
      expect(result).toHaveLength(1);
      expect(result[0].data_type).toBe('USER-DEFINED');
    });

    it('should be idempotent', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);
      await db.vector!.ensureColumn(testTable, 'embedding', 3);

      const result = await db.many`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ${testTable} AND column_name = 'embedding'
      `;
      expect(result).toHaveLength(1);
    });
  });

  describe('ensureIndex', () => {
    it('should create an HNSW index', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);
      await db.vector!.ensureIndex(testTable, 'embedding', {
        dimensions: 3,
        metric: 'cosine',
        type: 'hnsw',
      });

      const indexes = await db.many`
        SELECT indexname FROM pg_indexes
        WHERE tablename = ${testTable}
        AND indexname LIKE '%hnsw%'
      `;
      expect(indexes).toHaveLength(1);
    });

    it('should be idempotent', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);
      await db.vector!.ensureIndex(testTable, 'embedding', {
        dimensions: 3,
      });
      await db.vector!.ensureIndex(testTable, 'embedding', {
        dimensions: 3,
      });

      const indexes = await db.many`
        SELECT indexname FROM pg_indexes
        WHERE tablename = ${testTable}
        AND indexname LIKE '%hnsw%'
      `;
      expect(indexes).toHaveLength(1);
    });

    it('should create an IVFFlat index', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);

      // Insert some data first (IVFFlat benefits from existing data)
      await db.insert(testTable, { id: 'x', content: 'test' });
      await db.vector!.upsertVector(
        testTable,
        { id: 'x' },
        'embedding',
        [0.1, 0.2, 0.3],
      );

      await db.vector!.ensureIndex(testTable, 'embedding', {
        metric: 'cosine',
        type: 'ivfflat',
      });

      const indexes = await db.many`
        SELECT indexname FROM pg_indexes
        WHERE tablename = ${testTable}
        AND indexname LIKE '%ivfflat%'
      `;
      expect(indexes).toHaveLength(1);
    });
  });

  describe('upsertVector', () => {
    it('should store a vector in a row', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);

      // Insert a row first
      await db.insert(testTable, { id: 'row-1', content: 'hello' });

      // Store vector
      await db.vector!.upsertVector(
        testTable,
        { id: 'row-1' },
        'embedding',
        [0.1, 0.2, 0.3],
      );

      // Verify vector was stored
      const result = await db.single`
        SELECT id, embedding::text FROM "${testTable}" WHERE id = 'row-1'
      `;
      expect(result).toBeTruthy();
      expect(result?.embedding).toContain('0.1');
      expect(result?.embedding).toContain('0.2');
      expect(result?.embedding).toContain('0.3');
    });

    it('should update an existing vector', async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);
      await db.insert(testTable, { id: 'row-1', content: 'hello' });

      await db.vector!.upsertVector(
        testTable,
        { id: 'row-1' },
        'embedding',
        [0.1, 0.2, 0.3],
      );
      await db.vector!.upsertVector(
        testTable,
        { id: 'row-1' },
        'embedding',
        [0.4, 0.5, 0.6],
      );

      const result = await db.single`
        SELECT embedding::text FROM "${testTable}" WHERE id = 'row-1'
      `;
      expect(result?.embedding).toContain('0.4');
      expect(result?.embedding).toContain('0.5');
      expect(result?.embedding).toContain('0.6');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      if (!postgresAvailable) return;

      await db.vector!.ensureColumn(testTable, 'embedding', 3);

      // Insert test data with vectors
      await db.insert(testTable, [
        { id: 'a', content: 'apple', category: 'fruit' },
        { id: 'b', content: 'banana', category: 'fruit' },
        { id: 'c', content: 'carrot', category: 'vegetable' },
      ]);

      // Vectors designed so 'a' is most similar to query [1,0,0]
      await db.vector!.upsertVector(
        testTable,
        { id: 'a' },
        'embedding',
        [0.9, 0.1, 0.0],
      );
      await db.vector!.upsertVector(
        testTable,
        { id: 'b' },
        'embedding',
        [0.1, 0.9, 0.0],
      );
      await db.vector!.upsertVector(
        testTable,
        { id: 'c' },
        'embedding',
        [0.0, 0.1, 0.9],
      );
    });

    it('should return results ranked by similarity', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        { limit: 3 },
      );

      expect(results).toHaveLength(3);
      // 'a' should be most similar (smallest distance)
      expect(results[0].id).toBe('a');
      expect(results[0].distance).toBeLessThan(results[1].distance);
    });

    it('should respect limit option', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        { limit: 1 },
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a');
    });

    it('should return distance values', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        { limit: 3, metric: 'cosine' },
      );

      // Cosine distance: 0 = identical, up to 2 = opposite
      for (const result of results) {
        expect(typeof result.distance).toBe('number');
        expect(result.distance).toBeGreaterThanOrEqual(0);
        expect(result.distance).toBeLessThanOrEqual(2);
      }
    });

    it('should support additional WHERE clause', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        {
          limit: 10,
          where: `category = $2`,
          params: ['fruit'],
        },
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.category === 'fruit')).toBe(true);
    });

    it('should return empty array when no vectors match', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        {
          limit: 10,
          where: `category = $2`,
          params: ['nonexistent'],
        },
      );

      expect(results).toHaveLength(0);
    });

    it('should support L2 distance metric', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        { limit: 3, metric: 'l2' },
      );

      expect(results).toHaveLength(3);
      // 'a' should still be closest
      expect(results[0].id).toBe('a');
    });

    it('should support inner product distance metric', async () => {
      if (!postgresAvailable) return;

      const results = await db.vector!.search(
        testTable,
        'embedding',
        [1, 0, 0],
        { limit: 3, metric: 'ip' },
      );

      expect(results).toHaveLength(3);
      // 'a' should still be closest (highest inner product = lowest negative IP distance)
      expect(results[0].id).toBe('a');
    });
  });
});
