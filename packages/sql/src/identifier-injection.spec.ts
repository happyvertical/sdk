import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  /** Somewhere outside the adapter's data directory, to prove nothing escapes. */
  let escapeDir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hv-sql-injection-'));
    escapeDir = await mkdtemp(join(tmpdir(), 'hv-sql-injection-escape-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(escapeDir, { recursive: true, force: true });
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
      quotesUpsertColumns: true,
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
      quotesUpsertColumns: true,
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

      it.each(
        // DuckDB and JSON quote column names in `upsert` to match their schema
        // generator, so that path escapes rather than restricts — covered by
        // its own assertions below. Everywhere else the name is interpolated
        // bare and must be rejected.
        adapter.quotesUpsertColumns
          ? columnNameCalls.filter(([name]) => name !== 'upsert')
          : columnNameCalls,
      )(
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

      if (adapter.quotesUpsertColumns) {
        it('neutralizes a hostile column name in the quoted upsert path', async () => {
          const db = await getDatabase(adapter.options());
          const t = `inject_q_${randomUUID().replace(/-/g, '')}`;
          // This adapter quotes upsert columns, so a name needing quotes is
          // ordinary here — the JSON adapter's columns are whatever keys its
          // JSON had. Escaping keeps those working while still making it
          // impossible to leave the quotes.
          await db.query(
            `CREATE TABLE ${t} (id INTEGER PRIMARY KEY, "Full Name" TEXT)`,
          );

          await db.upsert(t, ['id'], { id: 1, 'Full Name': 'Ada' });
          const stored = await db.query(
            `SELECT "Full Name" AS n FROM ${t} WHERE id = 1`,
          );
          expect(stored.rows[0]?.n).toBe('Ada');

          // A conflict column needing quotes is ordinary here too — it reaches
          // the quoted ON CONFLICT position, not a buildWhere key.
          await db.query(`CREATE UNIQUE INDEX ${t}_fn ON ${t} ("Full Name")`);
          await db.upsert(t, ['Full Name'], { id: 1, 'Full Name': 'Ada' });
          expect(
            (await db.query(`SELECT COUNT(*) AS c FROM ${t}`)).rows[0]?.c,
          ).toBeDefined();

          // A name carrying a quote cannot end the identifier and start SQL.
          // It is escaped, so the statement fails on the unknown column rather
          // than executing anything the caller smuggled in.
          await expect(
            db.upsert(t, ['id'], {
              id: 2,
              'x"); CREATE TABLE pwned_upsert (y INTEGER); --': 'z',
            }),
          ).rejects.toThrow();

          const leaked = await db.query(
            `SELECT table_name FROM information_schema.tables WHERE table_name = 'pwned_upsert'`,
          );
          expect(leaked.rows).toHaveLength(0);
        }, 30000);
      }

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

  // `exportTable` is not a CRUD method, but it is the same defect with a worse
  // payload: the table name is interpolated both into a `COPY ... TO '<path>'`
  // statement and into the destination path, so an unvalidated name wrote a
  // file anywhere the process could reach *and* ran the statements after it.
  const exporters = [
    // For json the url IS the data directory; for duckdb the url is a database
    // file and the export target is `dataDir`.
    {
      name: 'json',
      options: () => ({ type: 'json' as const, url: dir, dbid: randomUUID() }),
    },
    {
      name: 'duckdb',
      options: () => ({
        type: 'duckdb' as const,
        url: ':memory:',
        dataDir: dir,
        writeStrategy: 'manual' as const,
      }),
    },
  ];

  for (const exporter of exporters) {
    describe(`${exporter.name} exportTable`, () => {
      it('rejects a table name that would escape the COPY statement', async () => {
        const db = (await getDatabase(
          exporter.options(),
        )) as DatabaseInterface & {
          exportTable: (table: string) => Promise<void>;
        };
        const t = `export_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER, secret TEXT)`);
        await db.query(`INSERT INTO ${t} VALUES (1, 'topsecret')`);

        const target = join(escapeDir, 'exfil.json');
        // Dollar-quoting avoids the single quotes that would otherwise break
        // the quoted lookups exportTable runs before the COPY.
        const hostile = `${t}") TO $$${target}$$; CREATE TABLE pwned_export (x INTEGER); --`;

        await expect(db.exportTable(hostile)).rejects.toThrow(
          /[Ii]nvalid table name/,
        );

        await expect(readFile(target, 'utf-8')).rejects.toThrow();
        const leaked = await db.query(
          `SELECT table_name FROM information_schema.tables WHERE table_name = 'pwned_export'`,
        );
        expect(leaked.rows).toHaveLength(0);
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

    // The vector capability builds DDL from a table name, a column name and an
    // index type, none of which were validated. `USING ${indexType}` is the
    // sharpest of the three: it is not an identifier position, so no amount of
    // quoting would have helped — only an allowlist does.
    it('rejects hostile identifiers in the vector capability', async () => {
      if (!postgresAvailable) return;

      const vector = db.vector;
      if (!vector) throw new Error('adapter does not expose vector');

      await expect(
        vector.ensureColumn(`${table}" ADD COLUMN injected text; --`, 'emb', 3),
      ).rejects.toThrow(/[Ii]nvalid table name/);

      await expect(
        vector.ensureIndex(`${table}") ; CREATE TABLE pwned (x int); --`, 'v'),
      ).rejects.toThrow(/[Ii]nvalid table name/);

      await expect(
        vector.ensureIndex(table, 'v', {
          type: 'btree (v); CREATE TABLE pwned (x int); --' as never,
        }),
      ).rejects.toThrow(/[Uu]nsupported vector index type/);

      // `metric` never reaches SQL directly — it is mapped through a closed
      // switch with a safe default — but it *is* concatenated into the
      // generated index name, which is then interpolated as a quoted
      // identifier. The safe mapping is what makes this easy to miss.
      await expect(
        vector.ensureIndex(table, 'v', {
          metric: 'cosine" ON t; CREATE TABLE pwned (x int); --' as never,
        }),
      ).rejects.toThrow(/[Uu]nsupported vector metric/);

      await expect(
        vector.upsertVector(
          table,
          { id: 1 },
          'v"; DROP TABLE x; --',
          [1, 2, 3],
        ),
      ).rejects.toThrow(/[Ii]nvalid column name/);

      const leaked = await db.query(
        `SELECT tablename FROM pg_tables WHERE tablename = 'pwned'`,
      );
      expect(leaked.rows).toHaveLength(0);
      const columns = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        table,
      );
      expect(columns.rows.some((r) => r.column_name === 'injected')).toBe(
        false,
      );
    }, 30000);

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
