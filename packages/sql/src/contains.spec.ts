import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

interface Adapter {
  name: string;
  create: () => Promise<{
    db: DatabaseInterface;
    cleanup: () => void | Promise<void>;
  }>;
}

const close = (db: DatabaseInterface) => async () => {
  await db.close?.();
};

const LOCAL_ADAPTERS: Adapter[] = [
  {
    name: 'sqlite (libsql)',
    create: async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        cache: false,
      });
      return { db, cleanup: close(db) };
    },
  },
  {
    name: 'sqlite (native capabilities)',
    create: async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: ':memory:',
        capabilities: { vector: true },
        cache: false,
      });
      expect(db.vector).toBeDefined();
      return { db, cleanup: close(db) };
    },
  },
  {
    name: 'duckdb',
    create: async () => {
      const db = await getDatabase({
        type: 'duckdb',
        url: ':memory:',
        cache: false,
      });
      return { db, cleanup: close(db) };
    },
  },
  {
    name: 'json',
    create: async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sql-contains-'));
      try {
        const db = await getDatabase({
          type: 'json',
          url: dir,
          cache: false,
          writeStrategy: 'immediate',
        });
        return {
          db,
          cleanup: async () => {
            await db.close?.();
            rmSync(dir, { recursive: true, force: true });
          },
        };
      } catch (error) {
        rmSync(dir, { recursive: true, force: true });
        throw error;
      }
    },
  },
];

const POSTGRES_ADAPTER: Adapter = {
  name: 'postgres',
  create: async () => {
    const url = process.env.TEST_DB_URL || process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'PostgreSQL contains tests require TEST_DB_URL or DATABASE_URL',
      );
    }
    const db = await getDatabase({
      type: 'postgres',
      url,
      dbid: randomUUID(),
      cache: false,
    });
    return { db, cleanup: close(db) };
  },
};

const ROWS = [
  { id: 1, body: 'Alpha 100% done' },
  { id: 2, body: 'alpha snake_case' },
  { id: 3, body: 'slash\\path' },
  { id: 4, body: 'alpha snakeXcase' },
  { id: 5, body: null },
];

function defineContainsContract(adapter: Adapter, enabled = true) {
  const suite = enabled ? describe : describe.skip;

  suite(adapter.name, () => {
    async function withRows(
      assertion: (db: DatabaseInterface, table: string) => Promise<void>,
    ) {
      const { db, cleanup } = await adapter.create();
      const table = `contains_${randomUUID().replace(/-/g, '')}`;
      try {
        await db.query(
          `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, body TEXT)`,
        );
        await db.insert(table, ROWS);
        await assertion(db, table);
      } finally {
        try {
          await db.query(`DROP TABLE IF EXISTS ${table}`);
        } finally {
          await cleanup();
        }
      }
    }

    async function ids(
      db: DatabaseInterface,
      table: string,
      where: Record<string, unknown>,
    ) {
      const rows = await db.list(table, where);
      return rows.map((row) => Number(row.id)).sort((a, b) => a - b);
    }

    it('matches literal substrings case-sensitively', async () => {
      await withRows(async (db, table) => {
        expect(await ids(db, table, { 'body contains': 'Alpha' })).toEqual([1]);
        expect(await ids(db, table, { 'body contains': 'alpha' })).toEqual([
          2, 4,
        ]);
      });
    });

    it('treats percent, underscore and backslash as literal data', async () => {
      await withRows(async (db, table) => {
        expect(await ids(db, table, { 'body contains': '%' })).toEqual([1]);
        expect(await ids(db, table, { 'body contains': '_' })).toEqual([2]);
        expect(await ids(db, table, { 'body contains': '\\' })).toEqual([3]);
      });
    });

    it('matches an empty substring on every non-null text value', async () => {
      await withRows(async (db, table) => {
        expect(await ids(db, table, { 'body contains': '' })).toEqual([
          1, 2, 3, 4,
        ]);
      });
    });

    it('uses backslash to escape LIKE metacharacters consistently', async () => {
      await withRows(async (db, table) => {
        expect(await ids(db, table, { 'body like': '%100\\%%' })).toEqual([1]);
        expect(await ids(db, table, { 'body like': '%snake\\_case%' })).toEqual(
          [2],
        );
        expect(
          await ids(db, table, { 'body like': '%slash\\\\path%' }),
        ).toEqual([3]);
      });
    });

    it('preserves percent and underscore as LIKE wildcards', async () => {
      await withRows(async (db, table) => {
        expect(await ids(db, table, { 'body like': '%snake%case%' })).toEqual([
          2, 4,
        ]);
        expect(await ids(db, table, { 'body like': '%snake_case%' })).toEqual([
          2, 4,
        ]);
      });
    });
  });
}

for (const adapter of LOCAL_ADAPTERS) {
  defineContainsContract(adapter);
}

// The package-wide suite remains service-free. `test:postgres` runs through
// run-with-ci-postgres.mjs, which sets this marker and provisions a real server;
// when it does, connection failures must fail rather than silently skip.
defineContainsContract(
  POSTGRES_ADAPTER,
  process.env.TEST_DB_ADAPTER === 'postgres',
);
