import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWhere, getDatabase, raw, syncSchema } from './index';

const _TMP_DIR = path.resolve(`${tmpdir()}/kissd`);
const deletedAt = 'deleted_at';
const tenantId = 'tenant_id';

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
    "WHERE status = $1 AND price > $2 AND stock <= $3 AND category IN ($4, $5) AND name LIKE $6 ESCAPE '\\'",
  );
  expect(result.values).toEqual(['active', 100, 5, 'A', 'B', '%shirt%']);
});

it('should handle NULL values correctly', () => {
  const result = buildWhere({
    [deletedAt]: null,
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
    [deletedAt]: null,
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
    "WHERE title LIKE $1 ESCAPE '\\' AND description LIKE $2 ESCAPE '\\' AND status = $3",
  );
  expect(result.values).toEqual(['%search%', '%search%', 'published']);
});

it('should emit literal case-sensitive CONTAINS per adapter', () => {
  expect(buildWhere({ 'title contains': '100%_\\off' }, 1, 'sqlite')).toEqual({
    sql: 'WHERE instr(title, $1) > 0',
    values: ['100%_\\off'],
  });

  for (const adapter of ['postgres', 'duckdb', 'json'] as const) {
    expect(buildWhere({ 'title contains': 'Needle' }, 3, adapter)).toEqual({
      sql: 'WHERE strpos(title, $3) > 0',
      values: ['Needle'],
    });
  }
});

it('should require a dialect and string value for CONTAINS', () => {
  expect(() => buildWhere({ 'title contains': 'needle' })).toThrow(
    'CONTAINS requires an adapter type',
  );
  expect(() => buildWhere({ 'title contains': null }, 1, 'postgres')).toThrow(
    'CONTAINS requires a string value',
  );
  expect(() => buildWhere({ 'title contains': 42 }, 1, 'sqlite')).toThrow(
    'CONTAINS requires a string value',
  );
});

it('should handle IN clauses with arrays', () => {
  const result = buildWhere({
    'role in': ['admin', 'editor'],
    'status not in': ['archived', 'deleted'],
    active: true,
    'last_login !=': null,
  });

  expect(result.sql).toBe(
    'WHERE role IN ($1, $2) AND status NOT IN ($3, $4) AND active = $5 AND last_login IS NOT NULL',
  );
  expect(result.values).toEqual([
    'admin',
    'editor',
    'archived',
    'deleted',
    true,
  ]);
});

it('should handle expression fields wrapped in raw()', () => {
  const result = buildWhere({
    [raw('COUNT(DISTINCT user_id) >=')]: 2,
    [raw('SUM(total_amount) >')]: 100,
    [raw('LOWER(status) =')]: 'paid',
  });

  expect(result.sql).toBe(
    'WHERE COUNT(DISTINCT user_id) >= $1 AND SUM(total_amount) > $2 AND LOWER(status) = $3',
  );
  expect(result.values).toEqual([2, 100, 'paid']);
});

it('should reject unsafe implicit equality keys', () => {
  expect(() =>
    buildWhere({ 'tenant_id = tenant_id OR status': 'paid' }),
  ).toThrow('Invalid SQL identifier');
});

describe('raw() expression keys', () => {
  it('rejects expression keys that carry an operator suffix', () => {
    // A trailing operator used to suppress identifier validation for the whole
    // key, so everything before it reached the query as SQL text. Each of these
    // was accepted before the raw() marker existed.
    expect(() => buildWhere({ "name = '' OR 1=1 --  =": 'x' })).toThrow(
      'Invalid SQL identifier',
    );
    expect(() => buildWhere({ 'COUNT(DISTINCT unminted_a) >=': 2 })).toThrow(
      'Invalid SQL identifier',
    );
    expect(() =>
      buildWhere([[{ 'tenant_id = tenant_id OR status >': 'paid' }]]),
    ).toThrow('Invalid SQL identifier');
  });

  it('still accepts plain identifiers with and without operator suffixes', () => {
    const result = buildWhere({
      status: 'paid',
      'price >': 100,
      'orders.total <=': 5,
    });

    expect(result.sql).toBe(
      'WHERE status = $1 AND price > $2 AND orders.total <= $3',
    );
    expect(result.values).toEqual(['paid', 100, 5]);
  });

  it('points the caller at raw() when validation fails', () => {
    expect(() => buildWhere({ 'LOWER(unminted_b) =': 'paid' })).toThrow(
      /raw\(\)/,
    );
  });

  it('marks per key, so minting one expression does not change a plain key', () => {
    // The marker lives on the returned key, not in a global registry, so wrapping
    // an expression never retroactively makes the bare string raw elsewhere.
    const expression = 'LOWER(unminted_c) =';
    raw(expression);

    expect(() => buildWhere({ [expression]: 'x' })).toThrow(
      'Invalid SQL identifier',
    );
  });

  it('cannot be reached by an unmarked key, whatever its shape', () => {
    // The marker is the only thing that grants raw access; no bare prefix does.
    const forged = ['raw:', 'raw(', 'hv-sql-raw', '__raw__', 'RAW '];

    for (const prefix of forged) {
      expect(() => buildWhere({ [`${prefix}1=1 OR name =`]: 'x' })).toThrow(
        'Invalid SQL identifier',
      );
    }
  });

  it('keeps the emitted SQL and error messages free of the marker', () => {
    // The marker is stripped before the field reaches SQL, and a validation
    // failure echoes only the caller's own key text, never the marker.
    expect(buildWhere({ [raw('LOWER(status) =')]: 'paid' }).sql).toBe(
      'WHERE LOWER(status) = $1',
    );

    let message = '';
    try {
      buildWhere({ 'SUM(total) >=': 1 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SUM(total)');
    expect(message).not.toContain('hv-sql-raw');
  });

  it('is idempotent, so double wrapping cannot nest a marker', () => {
    expect(raw(raw('LOWER(status) ='))).toBe(raw('LOWER(status) ='));
    expect(buildWhere({ [raw(raw('LOWER(status) ='))]: 'paid' }).sql).toBe(
      'WHERE LOWER(status) = $1',
    );
  });

  it('supports raw keys on the NULL, IN, Date and 2D-array paths', () => {
    expect(buildWhere({ [raw('LOWER(status)')]: null }).sql).toBe(
      'WHERE LOWER(status) IS NULL',
    );
    expect(buildWhere({ [raw('LOWER(status) !=')]: null }).sql).toBe(
      'WHERE LOWER(status) IS NOT NULL',
    );

    const inClause = buildWhere({ [raw('LOWER(status) in')]: ['a', 'b'] });
    expect(inClause.sql).toBe('WHERE LOWER(status) IN ($1, $2)');
    expect(inClause.values).toEqual(['a', 'b']);

    const when = new Date('2026-01-01T00:00:00.000Z');
    expect(
      buildWhere({ [raw('date(created_at) >')]: when }, 1, 'duckdb').sql,
    ).toBe('WHERE date(created_at) > CAST($1 AS TIMESTAMP)');
    expect(
      buildWhere({ [raw('date(created_at) >')]: when }, 1, 'postgres').sql,
    ).toBe('WHERE date(created_at) > $1');

    expect(
      buildWhere([[{ [raw('LOWER(status) =')]: 'paid' }, { [tenantId]: 't1' }]])
        .sql,
    ).toBe('WHERE (LOWER(status) = $1 AND tenant_id = $2)');
  });

  it('rejects an empty expression', () => {
    expect(() => raw('   ')).toThrow('non-empty SQL expression');
  });

  it('parameterizes values behind a raw key', () => {
    const result = buildWhere({ [raw('LOWER(name) like')]: '%o%' });

    expect(result.sql).toBe("WHERE LOWER(name) LIKE $1 ESCAPE '\\'");
    expect(result.values).toEqual(['%o%']);
  });
});

it('should reject empty IN clauses', () => {
  expect(() => buildWhere({ 'role in': [] })).toThrow(
    'IN requires at least one value',
  );
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
      [{ [deletedAt]: null }, { status: 'active' }],
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

    expect(result.sql).toBe(
      "WHERE (name LIKE $1 ESCAPE '\\') OR (email LIKE $2 ESCAPE '\\')",
    );
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
