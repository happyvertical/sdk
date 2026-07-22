import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase, validateColumnName } from './index';
import {
  validateColumnName as validateColumnNameStrict,
  validateColumnNames,
  validateIndexName,
  validateTableName,
} from './shared/alter-utils';
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

  // #1130 — the validators coerced their argument to a string with a regex
  // `test`, and the upsert paths validated one enumeration of the record and
  // then interpolated another. A value that answered differently on the second
  // read — an object with a stateful `toString`, or a Proxy whose `ownKeys`
  // trap returns different keys on each call — could pass validation and then
  // reach SQL. The validators now reject non-strings outright, and each upsert
  // enumerates the caller's object exactly once, so the validated identifiers
  // are the interpolated identifiers.
  for (const adapter of adapters) {
    describe(`${adapter.name} (stateful identifiers, #1130)`, () => {
      it('rejects a table name whose toString changes between reads', async () => {
        const db = await getDatabase(adapter.options());
        const t = `twoface_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

        // Valid the first time it is coerced, hostile the second.
        let reads = 0;
        const twoFaced = {
          toString: () => (reads++ === 0 ? t : `${t} WHERE 1=1 --`),
        } as unknown as string;

        await expect(db.get(twoFaced, { id: 1 })).rejects.toThrow(
          /[Ii]nvalid table name/,
        );
        await expect(
          db.upsert(twoFaced, ['id'], { id: 1, v: 'x' }),
        ).rejects.toThrow(/[Ii]nvalid table name/);
      }, 30000);

      it('enumerates an upsert record exactly once', async () => {
        const db = await getDatabase(adapter.options());
        const t = `proxy_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

        // A column name that, taken from a second enumeration and interpolated,
        // would run its own statement. It is exposed only on the *second*
        // `ownKeys` call, so a single enumeration never sees it.
        const hostile = `v); DROP TABLE ${t}; --`;
        const target: Record<string, any> = { id: 1, v: 'x', [hostile]: 'z' };
        let ownKeysCalls = 0;
        const proxy = new Proxy(target, {
          ownKeys() {
            ownKeysCalls++;
            return ownKeysCalls === 1 ? ['id', 'v'] : Reflect.ownKeys(target);
          },
        });

        await db.upsert(t, ['id'], proxy as Record<string, any>);

        // The one enumeration governs both validation and SQL, so the hostile
        // branch is never reached. Assert it directly rather than relying on a
        // later statement happening to fail: the record enumerated once, the
        // benign upsert applied, and the table the payload targeted survives.
        expect(ownKeysCalls).toBe(1);
        const rows = await db.query(`SELECT id, v FROM ${t} WHERE id = 1`);
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]?.v).toBe('x');
        expect(
          (await db.query(`SELECT COUNT(*) AS c FROM ${t}`)).rows[0]?.c,
        ).toBeDefined();
      }, 30000);

      it('binds update values to the validated columns, not a second enumeration', async () => {
        const db = await getDatabase(adapter.options());
        const t = `updbind_${randomUUID().replace(/-/g, '')}`;
        await db.query(
          `CREATE TABLE ${t} (id INTEGER PRIMARY KEY, a TEXT, b TEXT)`,
        );
        await db.insert(t, { id: 1, a: 'A0', b: 'B0' });

        // The column list is taken from the first enumeration; a second one
        // that reorders the keys would, if values came from it, bind each value
        // to the wrong column. Values must be read through the validated keys.
        const target: Record<string, any> = { a: 'AAA', b: 'BBB' };
        let enumerations = 0;
        const proxy = new Proxy(target, {
          ownKeys() {
            enumerations++;
            return enumerations === 1 ? ['a', 'b'] : ['b', 'a'];
          },
        });

        await db.update(t, { id: 1 }, proxy as Record<string, any>);

        const row = await db.get(t, { id: 1 });
        expect(row?.a).toBe('AAA');
        expect(row?.b).toBe('BBB');
      }, 30000);

      // DuckDB and JSON quote conflict columns, so a divergent conflict-column
      // array is escaped rather than able to inject; only the bare-interpolation
      // adapters need this.
      if (!adapter.quotesUpsertColumns) {
        it('snapshots conflict columns so a divergent array cannot inject', async () => {
          const db = await getDatabase(adapter.options());
          const t = `cc_${randomUUID().replace(/-/g, '')}`;
          await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);
          await db.insert(t, { id: 1, v: 'orig' });

          // Benign the first time it is read (the snapshot), hostile if read
          // again to build the bare `ON CONFLICT(...)` list.
          let idReads = 0;
          const conflictProxy = new Proxy(['id'], {
            get(inner, prop, receiver) {
              if (prop === '0') {
                idReads++;
                return idReads === 1 ? 'id' : `id); DROP TABLE ${t}; --`;
              }
              return Reflect.get(inner, prop, receiver);
            },
          });

          await db.upsert(t, conflictProxy as unknown as string[], {
            id: 1,
            v: 'new',
          });

          // The snapshot read governs the SQL, so the benign upsert applied and
          // the table the payload targeted still exists.
          const rows = await db.query(`SELECT v FROM ${t} WHERE id = 1`);
          expect(rows.rows[0]?.v).toBe('new');
        }, 30000);
      }
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

/**
 * #1130 — every identifier validator gated on `regex.test(value)`, which coerces
 * its argument to a string. That let five non-string shapes through, two of
 * which are the injection vector: a boxed `String` and an object with a stateful
 * `toString` both coerce to a valid identifier for the check and can present a
 * different one to the interpolation that follows. The validators now reject any
 * non-string up front, so the value checked is the value used.
 */
describe('validators reject non-string identifiers (#1130)', () => {
  const stateful = () => {
    let reads = 0;
    return {
      toString: () => (reads++ === 0 ? 'users' : 'users; DROP TABLE t; --'),
    };
  };

  // Each of these coerces to a valid identifier, so the pre-#1130 regex accepted
  // it. `null`/`undefined` become the perfectly legal identifiers "null" and
  // "undefined"; the boxed String, the array and the stateful object coerce to
  // "users".
  const nonStrings: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 123],
    ['a boxed String', new String('users')],
    ['a single-element array', ['users']],
    ['a stateful toString object', stateful()],
  ];

  it.each(nonStrings)('validateTableName rejects %s', (_label, value) => {
    expect(() => validateTableName(value as string)).toThrow(
      /[Ii]nvalid table name/,
    );
  });

  it.each(
    nonStrings,
  )('validateColumnName (alter-utils) rejects %s', (_label, value) => {
    expect(() => validateColumnNameStrict(value as string)).toThrow(
      /[Ii]nvalid column name/,
    );
  });

  it.each(nonStrings)('validateIndexName rejects %s', (_label, value) => {
    expect(() => validateIndexName(value as string)).toThrow(
      /[Ii]nvalid index name/,
    );
  });

  it.each(
    nonStrings,
  )('validateColumnNames rejects %s inside the list', (_label, value) => {
    expect(() => validateColumnNames(['ok', value as string])).toThrow(
      /[Ii]nvalid column name/,
    );
  });

  it.each(
    nonStrings,
  )('the public validateColumnName rejects %s', (_label, value) => {
    expect(() => validateColumnName(value as string)).toThrow(
      /[Ii]nvalid column name/,
    );
  });

  it('still accepts ordinary string identifiers', () => {
    expect(() => validateTableName('users')).not.toThrow();
    expect(() => validateColumnNameStrict('full_name')).not.toThrow();
    expect(() => validateIndexName('idx_users_email')).not.toThrow();
    expect(() => validateColumnNames(['a', 'b_2', '_c'])).not.toThrow();
    // The public one is dotted-notation aware and returns its argument.
    expect(validateColumnName('table.column')).toBe('table.column');
  });
});
