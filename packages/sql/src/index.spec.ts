import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWhere, getDatabase, syncSchema } from './index';

const _TMP_DIR = path.resolve(`${tmpdir()}/kissd`);

it.skip('should be able to get the adapter for a postgres database', async () => {
  const db = await getDatabase({
    type: 'postgres',
    database: process.env.SQLOO_NAME || 'sqloo',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'sqloo',
    password: process.env.SQLOO_PASS || 'sqloo',
    port: Number(process.env.SQLOO_PORT) || 5432,
  });
  expect(db.client).toBeDefined();
});

it('should be able to get the adapter for a sqlite database', async () => {
  const db = await getDatabase({
    type: 'sqlite',
  });
  expect(db.client).toBeDefined();
});

it('should be able to get the adapter for an in memory sqlite database', async () => {
  const db = await getDatabase({
    type: 'sqlite',
    url: ':memory:',
  });
  expect(db.client).toBeDefined();
});

it('should be able to sync a table schema', async () => {
  const db = await getDatabase({
    type: 'sqlite',
    url: ':memory:',
  });
  // console.log({ db });
  await syncSchema({
    db,
    schema: `
        CREATE TABLE test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `,
  });
});

it('should handle basic usage with different operators', () => {
  const result = buildWhere({
    status: 'active',
    'price >': 100,
    'stock <=': 5,
    'category in': ['A', 'B'],
    'name like': '%shirt%',
  });

  expect(result.sql).toBe(
    'WHERE status = $1 AND price > $2 AND stock <= $3 AND category IN ($4, $5) AND name LIKE $6',
  );
  expect(result.values).toEqual(['active', 100, 5, 'A', 'B', '%shirt%']);
});

it('should handle NULL values correctly', () => {
  const result = buildWhere({
    deleted_at: null,
    'updated_at !=': null,
    status: 'active',
  });

  expect(result.sql).toBe(
    'WHERE deleted_at IS NULL AND updated_at IS NOT NULL AND status = $1',
  );
  expect(result.values).toEqual(['active']);
});

it('should handle price range conditions', () => {
  const result = buildWhere({
    'price >=': 10,
    'price <': 100,
  });

  expect(result.sql).toBe('WHERE price >= $1 AND price < $2');
  expect(result.values).toEqual([10, 100]);
});

it('should handle date filtering with null check (no adapter)', () => {
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-12-31');

  const result = buildWhere({
    'created_at >': startDate,
    'created_at <=': endDate,
    deleted_at: null,
  });

  // Without adapter type, Date objects are ISO strings without CAST
  expect(result.sql).toBe(
    'WHERE created_at > $1 AND created_at <= $2 AND deleted_at IS NULL',
  );
  expect(result.values).toEqual([
    startDate.toISOString(),
    endDate.toISOString(),
  ]);
});

it('should CAST dates to TIMESTAMP for DuckDB adapter', () => {
  const startDate = new Date('2024-01-01');
  const endDate = new Date('2024-12-31');

  const result = buildWhere(
    {
      'created_at >': startDate,
      'created_at <=': endDate,
    },
    1,
    'duckdb',
  );

  expect(result.sql).toBe(
    'WHERE created_at > CAST($1 AS TIMESTAMP) AND created_at <= CAST($2 AS TIMESTAMP)',
  );
  expect(result.values).toEqual([
    startDate.toISOString(),
    endDate.toISOString(),
  ]);
});

it('should NOT CAST dates for SQLite adapter', () => {
  const startDate = new Date('2024-01-01');

  const result = buildWhere({ 'created_at >': startDate }, 1, 'sqlite');

  expect(result.sql).toBe('WHERE created_at > $1');
  expect(result.values).toEqual([startDate.toISOString()]);
});

it('should handle LIKE operators for search', () => {
  const result = buildWhere({
    'title like': '%search%',
    'description like': '%search%',
    status: 'published',
  });

  expect(result.sql).toBe(
    'WHERE title LIKE $1 AND description LIKE $2 AND status = $3',
  );
  expect(result.values).toEqual(['%search%', '%search%', 'published']);
});

it('should handle IN clauses with arrays', () => {
  const result = buildWhere({
    'role in': ['admin', 'editor'],
    active: true,
    'last_login !=': null,
  });

  expect(result.sql).toBe(
    'WHERE role IN ($1, $2) AND active = $3 AND last_login IS NOT NULL',
  );
  expect(result.values).toEqual(['admin', 'editor', true]);
});

// 2D Array WHERE tests (OR/AND compound logic)
describe('buildWhere 2D array support', () => {
  it('should handle 2D array with multiple OR groups', () => {
    const result = buildWhere([
      [{ status: 'active' }, { 'price >': 100 }],
      [{ status: 'pending' }, { priority: 'high' }],
    ]);

    expect(result.sql).toBe(
      'WHERE (status = $1 AND price > $2) OR (status = $3 AND priority = $4)',
    );
    expect(result.values).toEqual(['active', 100, 'pending', 'high']);
  });

  it('should handle single OR group', () => {
    const result = buildWhere([[{ status: 'active' }, { 'price >': 100 }]]);

    expect(result.sql).toBe('WHERE (status = $1 AND price > $2)');
    expect(result.values).toEqual(['active', 100]);
  });

  it('should handle single condition per group', () => {
    const result = buildWhere([
      [{ status: 'active' }],
      [{ status: 'pending' }],
    ]);

    expect(result.sql).toBe('WHERE (status = $1) OR (status = $2)');
    expect(result.values).toEqual(['active', 'pending']);
  });

  it('should handle empty outer array', () => {
    const result = buildWhere([]);

    expect(result.sql).toBe('');
    expect(result.values).toEqual([]);
  });

  it('should skip empty inner arrays', () => {
    const result = buildWhere([[], [{ status: 'active' }], []]);

    expect(result.sql).toBe('WHERE (status = $1)');
    expect(result.values).toEqual(['active']);
  });

  it('should handle IN operator within 2D array', () => {
    const result = buildWhere([
      [{ 'category in': ['A', 'B'] }, { active: true }],
      [{ 'category in': ['C', 'D'] }],
    ]);

    expect(result.sql).toBe(
      'WHERE (category IN ($1, $2) AND active = $3) OR (category IN ($4, $5))',
    );
    expect(result.values).toEqual(['A', 'B', true, 'C', 'D']);
  });

  it('should handle NULL values within 2D array', () => {
    const result = buildWhere([
      [{ deleted_at: null }, { status: 'active' }],
      [{ 'deleted_at !=': null }],
    ]);

    expect(result.sql).toBe(
      'WHERE (deleted_at IS NULL AND status = $1) OR (deleted_at IS NOT NULL)',
    );
    expect(result.values).toEqual(['active']);
  });

  it('should handle LIKE operator within 2D array', () => {
    const result = buildWhere([
      [{ 'name like': '%john%' }],
      [{ 'email like': '%@example.com' }],
    ]);

    expect(result.sql).toBe('WHERE (name LIKE $1) OR (email LIKE $2)');
    expect(result.values).toEqual(['%john%', '%@example.com']);
  });

  it('should handle mixed operators within 2D array', () => {
    const result = buildWhere([
      [{ 'price >=': 100 }, { 'price <': 500 }, { category: 'electronics' }],
      [{ 'price >=': 50 }, { 'rating >': 4 }],
    ]);

    expect(result.sql).toBe(
      'WHERE (price >= $1 AND price < $2 AND category = $3) OR (price >= $4 AND rating > $5)',
    );
    expect(result.values).toEqual([100, 500, 'electronics', 50, 4]);
  });

  it('should handle startIndex parameter with 2D arrays', () => {
    const result = buildWhere(
      [[{ status: 'active' }], [{ status: 'pending' }]],
      5,
    );

    expect(result.sql).toBe('WHERE (status = $5) OR (status = $6)');
    expect(result.values).toEqual(['active', 'pending']);
  });
});

describe('Environment variable configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all SQL-related env vars before each test
    delete process.env.HAVE_SQL_TYPE;
    delete process.env.HAVE_SQL_URL;
    delete process.env.HAVE_SQL_HOST;
    delete process.env.HAVE_SQL_PORT;
    delete process.env.HAVE_SQL_DATABASE;
    delete process.env.HAVE_SQL_USER;
    delete process.env.HAVE_SQL_PASSWORD;
    delete process.env.SQLOO_URL;
    delete process.env.SQLOO_DATABASE;
    delete process.env.SQLOO_HOST;
    delete process.env.SQLOO_USER;
    delete process.env.SQLOO_PASSWORD;
    delete process.env.SQLOO_PORT;
  });

  afterEach(() => {
    // Restore original env after each test
    process.env = { ...originalEnv };
  });

  it('should load HAVE_SQL_TYPE from environment', async () => {
    process.env.HAVE_SQL_TYPE = 'sqlite';
    process.env.HAVE_SQL_URL = ':memory:';

    const db = await getDatabase({});
    expect(db.client).toBeDefined();
  });

  it('should load HAVE_SQL_URL from environment for SQLite', async () => {
    process.env.HAVE_SQL_TYPE = 'sqlite';
    process.env.HAVE_SQL_URL = ':memory:';

    const db = await getDatabase({});
    expect(db.client).toBeDefined();
  });

  it('should auto-detect SQLite from :memory: URL', async () => {
    process.env.HAVE_SQL_URL = ':memory:';

    const db = await getDatabase({});
    expect(db.client).toBeDefined();
  });

  it('should auto-detect SQLite from file: URL', async () => {
    process.env.HAVE_SQL_URL = 'file::memory:';

    const db = await getDatabase({});
    expect(db.client).toBeDefined();
  });

  it('should prioritize user options over HAVE_SQL_* env vars', async () => {
    process.env.HAVE_SQL_TYPE = 'postgres';
    process.env.HAVE_SQL_URL = 'postgres://localhost/test';

    // User explicitly requests SQLite - should override env vars
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
    });

    expect(db.client).toBeDefined();
  });

  it.skip('should support HAVE_SQL_* env vars for PostgreSQL', async () => {
    process.env.HAVE_SQL_TYPE = 'postgres';
    process.env.HAVE_SQL_HOST = 'localhost';
    process.env.HAVE_SQL_PORT = '5432';
    process.env.HAVE_SQL_DATABASE = 'testdb';
    process.env.HAVE_SQL_USER = 'testuser';
    process.env.HAVE_SQL_PASSWORD = 'testpass';

    const db = await getDatabase({});
    expect(db.client).toBeDefined();
  });

  it.skip('should fall back to SQLOO_* env vars for backward compatibility', async () => {
    // Set legacy SQLOO_* vars
    process.env.SQLOO_HOST = 'localhost';
    process.env.SQLOO_PORT = '5432';
    process.env.SQLOO_DATABASE = 'testdb';
    process.env.SQLOO_USER = 'testuser';
    process.env.SQLOO_PASSWORD = 'testpass';

    const db = await getDatabase({ type: 'postgres' });
    expect(db.client).toBeDefined();
  });

  it.skip('should prioritize HAVE_SQL_* over SQLOO_* env vars', async () => {
    // Set both HAVE_SQL_* and SQLOO_* vars
    process.env.HAVE_SQL_HOST = 'new-host';
    process.env.HAVE_SQL_DATABASE = 'new-db';
    process.env.SQLOO_HOST = 'old-host';
    process.env.SQLOO_DATABASE = 'old-db';

    const db = await getDatabase({ type: 'postgres' });
    expect(db.client).toBeDefined();

    // Note: We can't directly test which host was used without inspecting the Pool,
    // but the logic in postgres.ts ensures HAVE_SQL_* takes precedence
  });
});
