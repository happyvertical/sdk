import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type {
  DatabaseInterface,
  DuckDBOptions,
  JSONOptions,
} from './shared/types';
import type { SqliteOptions } from './sqlite';

/**
 * `count()` with no `where` argument built its SQL through the `pluck` tagged
 * template, which parameterizes every interpolation. The table name was bound
 * as a value, so the adapter emitted `SELECT COUNT(*) FROM ?` and the driver
 * rejected it — `db.count(table)` had never worked on the LibSQL SQLite
 * adapter. The `where` branch interpolates the identifier directly, which is
 * why it stayed green.
 *
 * The no-`where` shape was exercised only against the `json` adapter (in
 * `json-identifier-quoting.spec.ts` and `json-system-tables.spec.ts`), which
 * builds the query correctly, so nothing covered the adapters that could get
 * it wrong. These tests pin the shape on every adapter, since the same mistake
 * is available to each of them.
 */

async function seed(db: DatabaseInterface, table: string, rows: number) {
  await db.query(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, v TEXT)`);
  for (let i = 1; i <= rows; i++) {
    await db.query(`INSERT INTO ${table} VALUES (${i}, 'v${i % 2}')`);
  }
}

/**
 * Typed rather than `Record<string, unknown>` for editor feedback — note this
 * is not a safety net, since the package tsconfig excludes `*.spec.ts` from
 * typecheck. The `verify` hook below is what actually holds: a typo in
 * `capabilities` silently hands back the LibSQL adapter, which would turn the
 * native block into a second copy of the block above it — green, and testing
 * nothing new.
 */
type AdapterOptions =
  | (SqliteOptions & { type: 'sqlite' })
  | (DuckDBOptions & { type: 'duckdb' })
  | (JSONOptions & { type: 'json' });

/** Each adapter reachable without external services, and how to construct it. */
const ADAPTERS: Array<{
  name: string;
  options: AdapterOptions;
  /** Asserts the intended implementation was the one actually constructed. */
  verify?: (db: DatabaseInterface) => void;
}> = [
  { name: 'sqlite (libsql)', options: { type: 'sqlite', url: ':memory:' } },
  // Reached whenever a capability is requested — a separate implementation
  // with its own query construction, so it needs its own coverage. This
  // deliberately hard-requires the optional `@sqliteai/sqlite-vector` peer
  // rather than gating on its presence: gating would silently skip the block
  // wherever the peer is missing, which is the failure mode this file exists
  // to close. The lockfile pins the peer, so CI always exercises it.
  {
    name: 'sqlite (native capabilities path)',
    options: {
      type: 'sqlite',
      url: ':memory:',
      capabilities: { vector: true },
    },
    // Only the native adapter exposes `vector`, so this fails loudly if the
    // capability stops routing there — or is simply misspelled here.
    verify: (db) => expect(db.vector).toBeDefined(),
  },
  { name: 'duckdb', options: { type: 'duckdb', url: ':memory:' } },
  { name: 'json', options: { type: 'json', url: ':memory:' } },
];

describe('count() without a where clause', () => {
  for (const adapter of ADAPTERS) {
    describe(adapter.name, () => {
      async function open(): Promise<DatabaseInterface> {
        const db = await getDatabase(adapter.options);
        adapter.verify?.(db);
        return db;
      }

      // The duckdb and json adapters cache their in-memory connection, so each
      // test uses its own table rather than relying on a fresh database.
      it('counts every row in the table', async () => {
        const db = await open();
        const table = `count_all_${randomUUID().replace(/-/g, '')}`;
        await seed(db, table, 3);

        expect(await db.count(table)).toBe(3);
      });

      it('returns 0 for an empty table', async () => {
        const db = await open();
        const table = `count_empty_${randomUUID().replace(/-/g, '')}`;
        await seed(db, table, 0);

        expect(await db.count(table)).toBe(0);

        // `Number(...) || 0` collapses NaN to 0, so a broken result-shape read
        // would also return 0 here. Counting again after an insert proves the
        // zero above was real rather than a masked extraction failure.
        await db.query(`INSERT INTO ${table} VALUES (1, 'v1')`);
        expect(await db.count(table)).toBe(1);
      });

      // An empty `where` object takes the same branch as no `where` at all.
      it('counts every row when given an empty where object', async () => {
        const db = await open();
        const table = `count_emptywhere_${randomUUID().replace(/-/g, '')}`;
        await seed(db, table, 2);

        expect(await db.count(table, {})).toBe(2);
      });

      // Guards the branch that already worked, so a fix to the no-where path
      // cannot regress it.
      it('still counts a filtered subset', async () => {
        const db = await open();
        const table = `count_where_${randomUUID().replace(/-/g, '')}`;
        await seed(db, table, 4);

        expect(await db.count(table, { v: 'v1' })).toBe(2);
      });
    });
  }
});
