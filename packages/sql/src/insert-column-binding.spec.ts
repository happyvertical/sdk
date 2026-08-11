import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * Issue #1129 — a batch `insert` takes its column list from the first record
 * but used to take each row's values from that row's own key order. A later
 * record carrying the same keys in a different order therefore had its values
 * cross-assigned into each other's columns, silently.
 *
 * That is privilege-escalation-shaped wherever a batch body is
 * attacker-influenced: reordering your own keys steers your own value into a
 * column you were not meant to write. The `role` column here is the point.
 *
 * The adapters diverged — `postgres` and the libsql `sqlite` path bound
 * positionally, while `duckdb`, `json` and the native sqlite path already
 * projected through the column list — so every adapter is covered here to keep
 * them from drifting apart again. PostgreSQL lives in
 * `postgres-insert-column-binding.spec.ts` because it needs a live server.
 */

interface Adapter {
  name: string;
  /** Returns the database plus anything the test must clean up afterwards. */
  create: () => Promise<{
    db: DatabaseInterface;
    cleanup: () => void | Promise<void>;
  }>;
}

const noCleanup = () => {};

const ADAPTERS: Adapter[] = [
  {
    name: 'sqlite (libsql)',
    create: async () => ({
      db: await getDatabase({ type: 'sqlite', url: ':memory:' }),
      cleanup: noCleanup,
    }),
  },
  {
    // `capabilities` routes getDatabase() to sqlite-native.ts, a separate
    // implementation with its own insert path.
    name: 'sqlite (native capabilities)',
    create: async () => ({
      db: await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        capabilities: { vector: true },
      }),
      cleanup: noCleanup,
    }),
  },
  {
    name: 'duckdb',
    create: async () => ({
      db: await getDatabase({ type: 'duckdb', url: ':memory:' }),
      cleanup: noCleanup,
    }),
  },
  {
    // The JSON adapter treats `url` as a data directory it creates and writes
    // JSON files into, so it needs a real temp directory per test — passing
    // ':memory:' makes a literal ':memory:' directory in the working tree.
    name: 'json',
    create: async () => {
      const dir = mkdtempSync(join(tmpdir(), 'insert-column-binding-'));
      const cleanup = async () => {
        await clearConnectionCache();
        rmSync(dir, { recursive: true, force: true });
      };
      await clearConnectionCache();
      try {
        return { db: await getDatabase({ type: 'json', url: dir }), cleanup };
      } catch (error) {
        // The caller never received `cleanup`, so drop the temp dir here.
        await cleanup();
        throw error;
      }
    },
  },
];

describe('batch insert column binding', () => {
  for (const adapter of ADAPTERS) {
    describe(adapter.name, () => {
      let cleanup = noCleanup;

      afterEach(async () => {
        await cleanup();
        cleanup = noCleanup;
      });

      // Every create() yields a fresh database (sqlite auto-generates a dbid
      // for ':memory:', sqlite-native only caches when one is passed, duckdb
      // does not cache), but each test still uses its own table so a leak
      // between them would surface as a name clash rather than silent bleed.
      const setup = async (suffix: string) => {
        const created = await adapter.create();
        cleanup = created.cleanup;
        const table = `bind_${suffix}`;
        await created.db.query(
          `CREATE TABLE ${table} (name TEXT, role TEXT, note TEXT)`,
        );
        return { db: created.db, table };
      };

      it('binds each value to its own column when a later record reorders its keys', async () => {
        const { db, table } = await setup('reorder');

        await db.insert(table, [
          { name: 'alice', role: 'user', note: 'first' },
          // Same keys, different insertion order. Bound positionally this
          // stored { name: 'admin', role: 'second', note: 'mallory' }.
          { role: 'admin', note: 'second', name: 'mallory' },
        ]);

        const rows = await db.query(
          `SELECT name, role, note FROM ${table} ORDER BY note`,
        );
        expect(rows.rows).toEqual([
          { name: 'alice', role: 'user', note: 'first' },
          { name: 'mallory', role: 'admin', note: 'second' },
        ]);
      });

      it('rejects a batch whose later record has an extra key', async () => {
        const { db, table } = await setup('extra');

        await expect(
          db.insert(table, [
            { name: 'alice', role: 'user', note: 'first' },
            // The key is named `nickname`, not `extra`, so the assertion below
            // genuinely pins the reported key name rather than matching the
            // word the error format happens to use.
            { name: 'mallory', role: 'user', note: 'second', nickname: 'm' },
          ]),
        ).rejects.toThrow(/same keys.*record 1.*unexpected nickname/s);

        // Validation runs before any SQL is built, so the batch is rejected
        // whole rather than partly applied.
        const rows = await db.query(`SELECT name FROM ${table}`);
        expect(rows.rows).toHaveLength(0);
      });

      it('rejects a batch whose later record is missing a key', async () => {
        const { db, table } = await setup('missing');

        await expect(
          db.insert(table, [
            { name: 'alice', role: 'user', note: 'first' },
            { name: 'mallory', note: 'second' },
          ]),
        ).rejects.toThrow(/same keys.*record 1.*missing role/s);

        const rows = await db.query(`SELECT name FROM ${table}`);
        expect(rows.rows).toHaveLength(0);
      });

      // Adapters that serialize records first drop undefined-valued keys before
      // validation while the rest pass them through, so without normalizing
      // this the same batch would throw on some adapters and silently write
      // NULL on others. `{...base, optional: maybeUndefined}` is the most
      // common way real callers produce a ragged batch, so it is pinned per
      // adapter rather than only in the helper's unit test.
      it('rejects a batch whose later record has an undefined value for a key', async () => {
        const { db, table } = await setup('undef');

        await expect(
          db.insert(table, [
            { name: 'alice', role: 'user', note: 'first' },
            { name: 'mallory', role: undefined, note: 'second' },
          ]),
        ).rejects.toThrow(/same keys.*record 1.*missing role/s);

        const rows = await db.query(`SELECT name FROM ${table}`);
        expect(rows.rows).toHaveLength(0);
      });

      it('rejects a batch whose first record has an undefined value for a key', async () => {
        const { db, table } = await setup('undeffirst');

        await expect(
          db.insert(table, [
            { name: 'alice', role: undefined, note: 'first' },
            { name: 'mallory', role: 'admin', note: 'second' },
          ]),
        ).rejects.toThrow(/same keys.*record 1.*unexpected role/s);

        const rows = await db.query(`SELECT name FROM ${table}`);
        expect(rows.rows).toHaveLength(0);
      });

      it('accepts a batch that omits the same key consistently, binding it null', async () => {
        // Every record agrees on the defined key set, so this is accepted
        // rather than rejected — and it is the one shape that reaches each
        // adapter's undefined-value binding branch (the divergent cases throw
        // before binding). DuckDB and JSON must map undefined to NULL rather
        // than failing the statement.
        const { db, table } = await setup('undefconsistent');

        await db.insert(table, [
          { name: 'alice', role: 'user', note: undefined },
          { name: 'bob', role: 'user', note: undefined },
        ]);

        const rows = await db.query(
          `SELECT name, note FROM ${table} ORDER BY name`,
        );
        expect(rows.rows).toEqual([
          { name: 'alice', note: null },
          { name: 'bob', note: null },
        ]);
      });

      it('still inserts a well-formed batch and a single record', async () => {
        const { db, table } = await setup('ok');

        await db.insert(table, { name: 'solo', role: 'user', note: 'single' });
        await db.insert(table, [
          { name: 'bob', role: 'user', note: 'batch1' },
          { name: 'carol', role: 'user', note: 'batch2' },
        ]);

        const rows = await db.query(`SELECT name FROM ${table} ORDER BY name`);
        expect(rows.rows.map((r) => r.name)).toEqual(['bob', 'carol', 'solo']);
      });

      it('accepts an empty batch as a no-op', async () => {
        const { db, table } = await setup('empty');

        const result = await db.insert(table, []);
        expect(result.affected).toBe(0);

        const rows = await db.query(`SELECT name FROM ${table}`);
        expect(rows.rows).toHaveLength(0);
      });
    });
  }

  // The JSON adapter's startup loader reads records out of a file rather than
  // from a caller, so it is deliberately exempt from the key-set validation:
  // optional fields are ordinary in a JSON document, and `loadJSONData`
  // swallows failures as warnings, so rejecting the batch would turn a partial
  // load into a silently empty table.
  describe('json startup loader (exempt from validation)', () => {
    let dir: string;

    beforeEach(async () => {
      dir = mkdtempSync(join(tmpdir(), 'insert-column-binding-loader-'));
      await clearConnectionCache();
    });

    afterEach(async () => {
      await clearConnectionCache();
      rmSync(dir, { recursive: true, force: true });
    });

    const seed = (records: Record<string, unknown>[]) => {
      writeFileSync(join(dir, 'items.json'), JSON.stringify(records));
      writeFileSync(
        join(dir, 'items.schema.sql'),
        `CREATE TABLE items (
          id TEXT PRIMARY KEY,
          name TEXT,
          note TEXT
        )`,
      );
    };

    it('loads a record that omits an optional field, as NULL', async () => {
      seed([
        { id: 'a', name: 'first', note: 'has note' },
        { id: 'b', name: 'second' },
      ]);

      const db = await getDatabase({ type: 'json', url: dir });
      const rows = await db.query('SELECT id, note FROM items ORDER BY id');
      expect(rows.rows).toEqual([
        { id: 'a', note: 'has note' },
        { id: 'b', note: null },
      ]);
    });

    it('loads a record carrying a field the first record lacks, dropping it', async () => {
      seed([
        { id: 'a', name: 'first' },
        { id: 'b', name: 'second', nickname: 'bee' },
      ]);

      const db = await getDatabase({ type: 'json', url: dir });
      const rows = await db.query('SELECT id, name FROM items ORDER BY id');
      expect(rows.rows).toEqual([
        { id: 'a', name: 'first' },
        { id: 'b', name: 'second' },
      ]);
    });
  });
});
