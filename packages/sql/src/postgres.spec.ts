import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';

async function checkPostgreSQLConnection(): Promise<boolean> {
  try {
    const testDb = await getDatabase({
      type: 'postgres',
      database: process.env.SQLOO_DATABASE || 'testdb',
      host: process.env.SQLOO_HOST || 'localhost',
      user: process.env.SQLOO_USER || 'postgres',
      password: process.env.SQLOO_PASSWORD || 'postgres',
      port: Number(process.env.SQLOO_PORT) || 5432,
    });

    // Try a simple query to test the connection
    await testDb.execute`SELECT 1`;
    await testDb.client.end();
    return true;
  } catch (_error) {
    return false;
  }
}

describe('postgres tests', () => {
  let db: Awaited<ReturnType<typeof getDatabase>>;
  let postgresAvailable = false;

  beforeEach(async () => {
    // Check if PostgreSQL is available
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log('PostgreSQL not available, skipping test');
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

    await db.execute`
      create extension if not exists "uuid-ossp";
      drop table if exists contents;
      create table contents (
        id uuid primary key not null default (uuid_generate_v4()),
        title text, 
        body text
      )
    `;
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;

    await db.execute`drop table if exists contents`;
    await db.client.end();
  });

  it('should be able to perform a statement', async () => {
    if (!postgresAvailable) return;

    const result = await db.many`
      select * from contents
    `;
    expect(result).toEqual(expect.arrayContaining([]));
  });

  it('should be able to insert data', async () => {
    if (!postgresAvailable) return;

    const inserted = await db.insert('contents', {
      title: 'hello',
      body: 'world',
    });
    expect(inserted).toBeDefined();
    expect(inserted.affected).toBe(1);
  });

  it('should be able to insert multiple rows at a time', async () => {
    if (!postgresAvailable) return;

    const inserted = await db.insert('contents', [
      {
        title: 'hello',
        body: 'world',
      },
      {
        title: 'hi',
        body: 'universe',
      },
    ]);
    expect(inserted.affected).toBe(2);
  });

  it('should be able to query data with a condition', async () => {
    if (!postgresAvailable) return;

    await db.insert('contents', { title: 'hello', body: 'world' });
    const result = await db.many`
      select * from contents where title = ${'hello'}
    `;
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: 'hello',
        body: 'world',
      }),
    );
  });

  it('should be able to get a single row', async () => {
    if (!postgresAvailable) return;

    await db.insert('contents', { title: 'hello', body: 'world' });
    const result = await db.single`
      select * from contents where title = ${'hello'}
    `;
    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: 'hello',
        body: 'world',
      }),
    );
  });

  it('should be able to update a row', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const inserted = await db.insert('contents', {
      id,
      title: 'hello',
      body: 'world',
    });
    expect(inserted.affected).toBe(1);
    const updated = await db.update(
      'contents',
      { id },
      { title: 'hi', body: 'universe' },
    );
    expect(updated.affected).toBe(1);
    const result = await db.oO`
      select * from contents where id = ${id}
    `;
    expect(result?.id).toEqual(id);
    expect(result?.title).toEqual('hi');
    expect(result?.body).toEqual('universe');
  });

  it('should support transactions with commit', async () => {
    if (!postgresAvailable || !db || !db.transaction) return;

    const id = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert('contents', {
        id,
        title: 'Transaction Test',
        body: 'This should be committed',
      });

      // Verify within transaction
      const result = await tx.get('contents', { id });
      expect(result).toBeTruthy();
      expect(result?.title).toBe('Transaction Test');
    });

    // Verify after transaction commits
    const result = await db.get('contents', { id });
    expect(result).toBeTruthy();
    expect(result?.title).toBe('Transaction Test');
  });

  it('should support transactions with rollback on error', async () => {
    if (!postgresAvailable || !db || !db.transaction) return;

    const id = randomUUID();

    try {
      await db.transaction(async (tx) => {
        await tx.insert('contents', {
          id,
          title: 'Rollback Test',
          body: 'This should be rolled back',
        });

        // Verify within transaction
        const result = await tx.get('contents', { id });
        expect(result).toBeTruthy();

        // Force an error
        throw new Error('Intentional rollback');
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toBe('Intentional rollback');
    }

    // Verify record was rolled back
    const result = await db.get('contents', { id });
    expect(result).toBeNull();
  });

  it('should preserve PostgreSQL JSONB existence operators in raw queries', async () => {
    if (!postgresAvailable) return;

    const hasKey = await db.query(
      `SELECT ('{"db":true}'::jsonb ? 'db') AS has_key`,
    );
    const hasAny = await db.query(
      `SELECT ('{"db":true,"cache":false}'::jsonb ?| ARRAY['db', 'missing']) AS has_any`,
    );
    const hasAll = await db.query(
      `SELECT ('{"db":true,"cache":false}'::jsonb ?& ARRAY['db', 'cache']) AS has_all`,
    );

    expect(hasKey.rows[0].has_key).toBe(true);
    expect(hasAny.rows[0].has_any).toBe(true);
    expect(hasAll.rows[0].has_all).toBe(true);
  });

  it('should support PostgreSQL-native placeholders in raw queries', async () => {
    if (!postgresAvailable) return;

    const restArgs = await db.query(
      'SELECT $1::text AS name, $2::int AS count',
      'native',
      2,
    );
    const valuesArray = await db.query(
      'SELECT $1::text AS name, $2::int AS count',
      ['array', 3],
    );
    const singleArrayParam = await db.query('SELECT $1::text[] AS items', [
      'first',
      'second',
    ]);
    const singleItemArrayParam = await db.query('SELECT $1::text[] AS items', [
      'only',
    ]);

    expect(restArgs.rows[0]).toEqual({ name: 'native', count: 2 });
    expect(valuesArray.rows[0]).toEqual({ name: 'array', count: 3 });
    expect(singleArrayParam.rows[0].items).toEqual(['first', 'second']);
    expect(singleItemArrayParam.rows[0].items).toEqual(['only']);
  });

  it('should use the same raw query behavior in transaction handles', async () => {
    if (!postgresAvailable || !db.transaction || !db.beginTransaction) return;

    await db.transaction(async (tx) => {
      const result = await tx.query(
        `SELECT ('{"tx":true}'::jsonb ? 'tx') AS "hasTx", $1::text AS value`,
        ['callback'],
      );

      expect(result.rows[0]).toEqual({ hasTx: true, value: 'callback' });
    });

    const tx = await db.beginTransaction();
    try {
      const result = await tx.query(
        `SELECT ('{"tx":true,"manual":true}'::jsonb ?& ARRAY['tx', 'manual']) AS "hasAll", $1::text AS value`,
        ['manual'],
      );

      expect(result.rows[0]).toEqual({ hasAll: true, value: 'manual' });
    } finally {
      if (tx.isActive()) {
        await tx.rollback();
      }
    }
  });
});

describe('postgres JSON serialization', () => {
  let db: Awaited<ReturnType<typeof getDatabase>>;
  let postgresAvailable = false;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log(
        'PostgreSQL not available, skipping JSON serialization tests',
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

    await db.execute`
      drop table if exists json_test;
      create table json_test (
        id uuid primary key not null,
        tags json,
        metadata json,
        config json,
        created_at timestamptz
      )
    `;
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;

    await db.execute`drop table if exists json_test`;
    await db.client.end();
  });

  it('should serialize arrays as JSON in insert', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const tags = ['javascript', 'typescript', 'postgres'];

    await db.insert('json_test', {
      id,
      tags,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result).toBeTruthy();
    expect(result?.tags).toEqual(tags);
  });

  it('should serialize objects as JSON in insert', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const metadata = {
      author: 'Test User',
      version: 1,
      published: true,
    };

    await db.insert('json_test', {
      id,
      metadata,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result).toBeTruthy();
    expect(result?.metadata).toEqual(metadata);
  });

  it('should serialize nested objects as JSON in insert', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const config = {
      database: {
        host: 'localhost',
        port: 5432,
        credentials: {
          username: 'admin',
          roles: ['read', 'write'],
        },
      },
      cache: {
        enabled: true,
        ttl: 3600,
      },
    };

    await db.insert('json_test', {
      id,
      config,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result).toBeTruthy();
    expect(result?.config).toEqual(config);
  });

  it('should serialize Date objects as ISO strings in insert', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const createdAt = new Date('2026-01-20T12:00:00Z');

    await db.insert('json_test', {
      id,
      created_at: createdAt,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result).toBeTruthy();
    // Postgres returns timestamptz as Date object
    expect(result?.created_at).toBeInstanceOf(Date);
    expect(result?.created_at.toISOString()).toBe(createdAt.toISOString());
  });

  it('should serialize arrays as JSON in update', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    await db.insert('json_test', { id, tags: [] });

    const newTags = ['updated', 'tags', 'array'];
    await db.update('json_test', { id }, { tags: newTags });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result?.tags).toEqual(newTags);
  });

  it('should serialize objects as JSON in update', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    await db.insert('json_test', { id, metadata: {} });

    const newMetadata = {
      updated: true,
      timestamp: '2026-01-20T12:00:00Z',
      count: 42,
    };
    await db.update('json_test', { id }, { metadata: newMetadata });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result?.metadata).toEqual(newMetadata);
  });

  it('should serialize arrays as JSON in upsert', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const tags = ['upsert', 'test', 'array'];

    await db.upsert('json_test', ['id'], {
      id,
      tags,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result?.tags).toEqual(tags);

    // Update via upsert
    const updatedTags = ['updated', 'upsert', 'tags'];
    await db.upsert('json_test', ['id'], {
      id,
      tags: updatedTags,
    });

    const updated = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(updated?.tags).toEqual(updatedTags);
  });

  it('should serialize objects as JSON in upsert', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();
    const config = {
      feature1: true,
      feature2: false,
      settings: { theme: 'dark' },
    };

    await db.upsert('json_test', ['id'], {
      id,
      config,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result?.config).toEqual(config);

    // Update via upsert
    const updatedConfig = {
      feature1: false,
      feature2: true,
      settings: { theme: 'light', fontSize: 14 },
    };
    await db.upsert('json_test', ['id'], {
      id,
      config: updatedConfig,
    });

    const updated = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(updated?.config).toEqual(updatedConfig);
  });

  it('should handle empty arrays and objects', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();

    await db.insert('json_test', {
      id,
      tags: [],
      metadata: {},
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result?.tags).toEqual([]);
    expect(result?.metadata).toEqual({});
  });

  it('should handle null values correctly', async () => {
    if (!postgresAvailable) return;

    const id = randomUUID();

    await db.insert('json_test', {
      id,
      tags: null,
      metadata: null,
    });

    const result = await db.single`
      select * from json_test where id = ${id}
    `;

    expect(result?.tags).toBeNull();
    expect(result?.metadata).toBeNull();
  });

  it('should serialize multiple JSON columns in batch insert', async () => {
    if (!postgresAvailable) return;

    const records = [
      {
        id: randomUUID(),
        tags: ['tag1', 'tag2'],
        metadata: { index: 0 },
        config: { enabled: true },
      },
      {
        id: randomUUID(),
        tags: ['tag3', 'tag4'],
        metadata: { index: 1 },
        config: { enabled: false },
      },
    ];

    await db.insert('json_test', records);

    const results = await db.many`
      select * from json_test order by (metadata->>'index')::int
    `;

    expect(results).toHaveLength(2);
    expect(results[0].tags).toEqual(['tag1', 'tag2']);
    expect(results[0].metadata).toEqual({ index: 0 });
    expect(results[0].config).toEqual({ enabled: true });
    expect(results[1].tags).toEqual(['tag3', 'tag4']);
    expect(results[1].metadata).toEqual({ index: 1 });
    expect(results[1].config).toEqual({ enabled: false });
  });
});

describe('postgres syncSchema with CREATE INDEX (Issue #867)', () => {
  let db: Awaited<ReturnType<typeof getDatabase>>;
  let postgresAvailable = false;
  const testTableName = `index_test_${Date.now()}`;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log('PostgreSQL not available, skipping CREATE INDEX tests');
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

    // Clean up any existing test tables/indexes
    await db.client.query(`DROP TABLE IF EXISTS "${testTableName}" CASCADE`);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;

    await db.client.query(`DROP TABLE IF EXISTS "${testTableName}" CASCADE`);
    await db.client.end();
  });

  it('should execute CREATE INDEX statements in syncSchema', async () => {
    if (!postgresAvailable) return;

    // Schema with both CREATE TABLE and CREATE INDEX
    const schema = `
      CREATE TABLE IF NOT EXISTS "${testTableName}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "slug" TEXT NOT NULL,
        "context" TEXT DEFAULT '',
        "name" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "${testTableName}_slug_context_idx" ON "${testTableName}" ("slug", "context");
    `;

    await db.syncSchema(schema);

    // Verify table exists
    const tableResult = await db.many`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${testTableName}
    `;
    expect(tableResult).toHaveLength(1);

    // Verify index exists
    const indexResult = await db.many`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${`${testTableName}_slug_context_idx`}
    `;
    expect(indexResult).toHaveLength(1);
  });

  it('should create unique index that allows ON CONFLICT upsert', async () => {
    if (!postgresAvailable) return;

    // Schema with unique index for upsert support
    const schema = `
      CREATE TABLE IF NOT EXISTS "${testTableName}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "slug" TEXT NOT NULL,
        "context" TEXT DEFAULT '',
        "name" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "${testTableName}_slug_context_idx" ON "${testTableName}" ("slug", "context");
    `;

    await db.syncSchema(schema);

    // Insert initial record
    await db.insert(testTableName, {
      id: 'item-1',
      slug: 'test-item',
      context: '',
      name: 'Original Name',
    });

    // Verify insert worked
    const inserted = await db.get(testTableName, { id: 'item-1' });
    expect(inserted?.name).toBe('Original Name');

    // Now perform upsert using ON CONFLICT - this requires the unique index
    await db.client.query(`
      INSERT INTO "${testTableName}" (id, slug, context, name)
      VALUES ('item-2', 'test-item', '', 'Updated Name')
      ON CONFLICT (slug, context) DO UPDATE SET name = EXCLUDED.name
    `);

    // Verify upsert updated the existing record
    const updated = await db.get(testTableName, {
      slug: 'test-item',
      context: '',
    });
    expect(updated?.name).toBe('Updated Name');

    // Verify only 1 record exists (upsert updated, didn't insert)
    const allItems = await db.list(testTableName, {});
    expect(allItems).toHaveLength(1);
  });

  it('should handle multiple CREATE INDEX statements', async () => {
    if (!postgresAvailable) return;

    const schema = `
      CREATE TABLE IF NOT EXISTS "${testTableName}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "slug" TEXT NOT NULL,
        "context" TEXT DEFAULT '',
        "sku" TEXT NOT NULL,
        "name" TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "${testTableName}_slug_context_idx" ON "${testTableName}" ("slug", "context");
      CREATE UNIQUE INDEX IF NOT EXISTS "${testTableName}_sku_idx" ON "${testTableName}" ("sku");
    `;

    await db.syncSchema(schema);

    // Verify both indexes exist
    const indexes = await db.many`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${testTableName}
      AND indexname NOT LIKE '%_pkey'
      ORDER BY indexname
    `;
    expect(indexes).toHaveLength(2);
    expect(indexes.map((i) => i.indexname)).toContain(
      `${testTableName}_slug_context_idx`,
    );
    expect(indexes.map((i) => i.indexname)).toContain(
      `${testTableName}_sku_idx`,
    );
  });

  it('should not fail if index already exists', async () => {
    if (!postgresAvailable) return;

    const schema = `
      CREATE TABLE IF NOT EXISTS "${testTableName}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "slug" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "${testTableName}_slug_idx" ON "${testTableName}" ("slug");
    `;

    // Run syncSchema twice - should not throw on second run
    await db.syncSchema(schema);
    await db.syncSchema(schema); // Should not throw

    // Verify index still exists
    const indexes = await db.many`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${`${testTableName}_slug_idx`}
    `;
    expect(indexes).toHaveLength(1);
  });

  it('should handle non-unique indexes', async () => {
    if (!postgresAvailable) return;

    const schema = `
      CREATE TABLE IF NOT EXISTS "${testTableName}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "category" TEXT NOT NULL,
        "name" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "${testTableName}_category_idx" ON "${testTableName}" ("category");
    `;

    await db.syncSchema(schema);

    // Verify non-unique index exists
    const indexes = await db.many`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${`${testTableName}_category_idx`}
    `;
    expect(indexes).toHaveLength(1);
    // Non-unique index should NOT contain 'UNIQUE' in definition
    expect(indexes[0].indexdef).not.toContain('UNIQUE');
  });
});

describe('postgres syncSchema with quoted identifiers (Issue #860)', () => {
  let db: Awaited<ReturnType<typeof getDatabase>>;
  let postgresAvailable = false;
  const testTableName = `sync_schema_test_${Date.now()}`;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log('PostgreSQL not available, skipping syncSchema tests');
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

    // Clean up any existing test table using raw query (identifier quoting not available)
    await db.client.query(`DROP TABLE IF EXISTS "${testTableName}"`);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;

    await db.client.query(`DROP TABLE IF EXISTS "${testTableName}"`);
    await db.client.end();
  });

  it('should create table with quoted identifiers in DDL', async () => {
    if (!postgresAvailable) return;

    // DDL with quoted table name - this is the format SMRT generates
    const schema = `CREATE TABLE IF NOT EXISTS "${testTableName}" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "name" TEXT DEFAULT ''
    );`;

    await db.syncSchema(schema);

    // Verify table exists and is functional
    const result = await db.many`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${testTableName}
    `;
    expect(result).toHaveLength(1);

    // Insert and query to verify table is usable
    await db.insert(testTableName, { id: 'test-1', name: 'Test Item' });
    const item = await db.get(testTableName, { id: 'test-1' });
    expect(item?.name).toBe('Test Item');
  });

  it('should create table with unquoted identifiers in DDL', async () => {
    if (!postgresAvailable) return;

    // DDL without quotes (also valid SQL)
    const schema = `CREATE TABLE IF NOT EXISTS ${testTableName} (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT DEFAULT ''
    );`;

    await db.syncSchema(schema);

    // Verify table exists
    const result = await db.many`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${testTableName}
    `;
    expect(result).toHaveLength(1);
  });

  it('should add columns to existing table with quoted identifiers', async () => {
    if (!postgresAvailable) return;

    // First create the table with initial columns
    await db.client.query(`
      CREATE TABLE "${testTableName}" (
        id TEXT PRIMARY KEY NOT NULL
      )
    `);

    // Now sync schema with additional column using quoted identifiers
    const schema = `CREATE TABLE IF NOT EXISTS "${testTableName}" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "description" TEXT DEFAULT ''
    );`;

    await db.syncSchema(schema);

    // Verify column was added
    const columns = await db.many`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${testTableName}
      ORDER BY ordinal_position
    `;
    const columnNames = columns.map((c) => c.column_name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('description');
  });

  it('should handle multiple CREATE TABLE statements with quoted identifiers', async () => {
    if (!postgresAvailable) return;

    const tableName2 = `${testTableName}_2`;

    // Multiple tables in one schema string
    const schema = `
      CREATE TABLE IF NOT EXISTS "${testTableName}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "name" TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS "${tableName2}" (
        "id" TEXT PRIMARY KEY NOT NULL,
        "value" INTEGER DEFAULT 0
      );
    `;

    await db.syncSchema(schema);

    // Verify both tables exist
    const result = await db.many`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (${testTableName}, ${tableName2})
      ORDER BY table_name
    `;
    expect(result).toHaveLength(2);

    // Clean up second table
    await db.client.query(`DROP TABLE IF EXISTS "${tableName2}"`);
  });
});
