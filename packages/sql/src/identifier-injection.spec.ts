import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

function postgresTestOptions(overrides: Record<string, unknown> = {}) {
  return {
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    ...overrides,
  };
}

async function checkPostgreSQLConnection(): Promise<boolean> {
  try {
    const probe = await getDatabase(
      postgresTestOptions({ dbid: randomUUID() }),
    );
    await probe.execute`SELECT 1`;
    await probe.client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Issue #1114 — `validateTableName()` was applied to `delete` and `count` but
 * not to `get`, `list`, `insert`, `update`, `upsert` or `getOrInsert`, which
 * interpolated the table name straight into SQL. Column names taken from
 * `Object.keys(data)` were interpolated with no validation anywhere.
 *
 * The verified exploit was
 *
 *   db.list("t1 WHERE 1=1 UNION SELECT id, secret FROM t1 --", {})
 *
 * which executed the injected clause and returned the other table's rows.
 * Because the protection existed and was applied inconsistently, this read as
 * an oversight rather than a deliberate trust boundary.
 */
describe('identifier validation', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hv-sql-injection-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // Each entry is a table name a caller might have taken from outside the
  // process. None is a legal identifier, and none may reach the engine.
  const HOSTILE_TABLES = [
    't1 WHERE 1=1 UNION SELECT id, secret FROM t1 --',
    'ident WHERE 1=1 --',
    't1; DROP TABLE t1',
    't1"',
    "t1'",
    'schema.t1',
    '',
  ];

  const HOSTILE_COLUMNS = [
    'v) VALUES (1); DROP TABLE t1; --',
    'v = 1, secret',
    'v"',
    '1',
    '',
  ];

  const adapters = [
    {
      name: 'sqlite',
      options: () => ({ type: 'sqlite' as const, url: ':memory:' }),
    },
    {
      name: 'sqlite (native)',
      options: () => ({
        type: 'sqlite' as const,
        url: `file:${join(dir, `native-${randomUUID()}.db`)}`,
        capabilities: { vector: true },
      }),
    },
    {
      name: 'duckdb',
      options: () => ({ type: 'duckdb' as const, url: ':memory:' }),
    },
    {
      name: 'json',
      // A real directory, not ':memory:'. This adapter's default
      // `writeStrategy: 'immediate'` exports every insert to
      // `<url>/<table>.json`, so ':memory:' would create a directory named
      // ':memory:' in the package root.
      options: () => ({
        type: 'json' as const,
        url: dir,
        dbid: randomUUID(),
      }),
    },
  ];

  /**
   * Every CRUD method that interpolates a table name. `delete` and `count`
   * were already covered and are included so the suite fails if either loses
   * the check it has.
   */
  const tableNameCalls: Array<
    [string, (db: DatabaseInterface, table: string) => Promise<unknown>]
  > = [
    ['get', (db, t) => db.get(t, { id: 1 })],
    ['list', (db, t) => db.list(t, {})],
    ['insert', (db, t) => db.insert(t, { id: 1, v: 'x' })],
    ['update', (db, t) => db.update(t, { id: 1 }, { v: 'x' })],
    ['upsert', (db, t) => db.upsert(t, ['id'], { id: 1, v: 'x' })],
    ['getOrInsert', (db, t) => db.getOrInsert(t, { id: 1 }, { id: 1, v: 'x' })],
    ['delete', (db, t) => db.delete(t, { id: 1 })],
    ['count', (db, t) => db.count(t)],
  ];

  const columnNameCalls: Array<
    [
      string,
      (db: DatabaseInterface, table: string, col: string) => Promise<unknown>,
    ]
  > = [
    ['insert', (db, t, c) => db.insert(t, { id: 1, [c]: 'x' })],
    ['update', (db, t, c) => db.update(t, { id: 1 }, { [c]: 'x' })],
    ['upsert', (db, t, c) => db.upsert(t, ['id'], { id: 1, [c]: 'x' })],
  ];

  for (const adapter of adapters) {
    describe(adapter.name, () => {
      it.each(tableNameCalls)(
        '%s rejects a hostile table name',
        async (_name, call) => {
          const db = await getDatabase(adapter.options());
          const t = `inject_${randomUUID().replace(/-/g, '')}`;
          await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

          for (const hostile of HOSTILE_TABLES) {
            await expect(
              call(db, hostile),
              `${_name} accepted ${JSON.stringify(hostile)}`,
            ).rejects.toThrow(/[Ii]nvalid table name/);
          }
        },
        30000,
      );

      it.each(columnNameCalls)(
        '%s rejects a hostile column name',
        async (_name, call) => {
          const db = await getDatabase(adapter.options());
          const t = `inject_col_${randomUUID().replace(/-/g, '')}`;
          await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

          for (const hostile of HOSTILE_COLUMNS) {
            await expect(
              call(db, t, hostile),
              `${_name} accepted ${JSON.stringify(hostile)}`,
            ).rejects.toThrow(/[Ii]nvalid column name/);
          }
        },
        30000,
      );

      it('does not execute the injected clause from the issue', async () => {
        const db = await getDatabase(adapter.options());
        const t = `inject_union_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER, secret TEXT)`);
        await db.query(`INSERT INTO ${t} VALUES (1, 'topsecret')`);

        await expect(
          db.list(`${t} WHERE 1=1 UNION SELECT id, secret FROM ${t} --`, {}),
        ).rejects.toThrow(/[Ii]nvalid table name/);
      }, 30000);

      it('still accepts ordinary identifiers', async () => {
        const db = await getDatabase(adapter.options());
        const t = `inject_ok_${randomUUID().replace(/-/g, '')}`;
        await db.query(
          `CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT, mixed_Case TEXT, _leading TEXT)`,
        );

        await db.insert(t, { id: 1, v: 'a', mixed_Case: 'b', _leading: 'c' });
        await db.update(t, { id: 1 }, { v: 'a2' });
        const row = await db.get(t, { id: 1 });

        expect(row?.v).toBe('a2');
        expect(row?.mixed_Case).toBe('b');
        expect(row?._leading).toBe('c');
        // `count(table)` with no where is asserted with a condition here: the
        // no-where branch of the LibSQL adapter's count() passes the table name
        // as a bound parameter and has never worked, which is a separate defect
        // from this one and is tracked on its own.
        expect(await db.count(t, { id: 1 })).toBe(1);
      }, 30000);
    });
  }

  describe('postgres', () => {
    let postgresAvailable = false;
    let db: Awaited<ReturnType<typeof getDatabase>>;
    let table: string;

    beforeAll(async () => {
      postgresAvailable = await checkPostgreSQLConnection();
      if (!postgresAvailable) {
        console.log('PostgreSQL not available, skipping test');
        return;
      }
      db = await getDatabase(
        postgresTestOptions({ dbid: randomUUID(), max: 4 }),
      );
      table = `inject_${randomUUID().replace(/-/g, '')}`;
      await db.query(
        `CREATE TABLE ${table} (id int primary key, v text, secret text)`,
      );
      await db.query(`INSERT INTO ${table} VALUES (1, 'v', 'topsecret')`);
    });

    afterAll(async () => {
      if (!postgresAvailable || !db) return;
      await db.query(`DROP TABLE IF EXISTS ${table}`);
      await db.client.end();
    });

    it.each(tableNameCalls)(
      '%s rejects a hostile table name',
      async (_name, call) => {
        if (!postgresAvailable) return;

        for (const hostile of HOSTILE_TABLES) {
          await expect(
            call(db, hostile),
            `${_name} accepted ${JSON.stringify(hostile)}`,
          ).rejects.toThrow(/[Ii]nvalid table name/);
        }
      },
      30000,
    );

    it.each(columnNameCalls)(
      '%s rejects a hostile column name',
      async (_name, call) => {
        if (!postgresAvailable) return;

        for (const hostile of HOSTILE_COLUMNS) {
          await expect(
            call(db, table, hostile),
            `${_name} accepted ${JSON.stringify(hostile)}`,
          ).rejects.toThrow(/[Ii]nvalid column name/);
        }
      },
      30000,
    );

    it('rejects the injected clause inside a transaction too', async () => {
      if (!postgresAvailable) return;

      // The transaction-scoped interface is built from the same factory, so it
      // cannot have a different answer — this pins that.
      const tx = db.transaction;
      if (!tx) throw new Error('adapter does not expose transaction()');

      await expect(
        tx.call(db, async (scoped) => {
          await scoped.list(
            `${table} WHERE 1=1 UNION SELECT id, v, secret FROM ${table} --`,
            {},
          );
        }),
      ).rejects.toThrow(/[Ii]nvalid table name/);
    }, 30000);
  });
});
