import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type DatabaseInterface,
  describeHandle,
  getDatabase,
  type TransactionHandle,
} from './index';

/**
 * `rootReads` (sdk#1249) states what a root statement sees while one of its
 * own adapter-managed transactions (`beginTransaction()` / `transaction()`) is
 * open. These tests pin the claim against the behaviour for every adapter
 * that runs in-process. Raw transaction control through `query` is outside
 * the claim; the PGlite case below pins that too.
 */

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(await realpath(tmpdir()), 'hv-sql-root-reads-'));
});

const callerClients: Array<{ close(): Promise<void> }> = [];

afterAll(async () => {
  for (const client of callerClients.splice(0)) await client.close();
  await rm(dir, { recursive: true, force: true });
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function countRows(db: DatabaseInterface, table: string) {
  const result = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(result.rows[0].n);
}

const cases: Array<{
  name: string;
  rootReads: 'serialized' | 'shared';
  open: () => Promise<DatabaseInterface>;
}> = [
  {
    name: 'libsql :memory:',
    rootReads: 'shared',
    open: () => getDatabase({ type: 'sqlite', url: ':memory:', cache: false }),
  },
  {
    name: 'libsql file',
    rootReads: 'shared',
    open: () =>
      getDatabase({
        type: 'sqlite',
        url: `file:${join(dir, `l-${randomUUID()}.db`)}`,
        cache: false,
      }),
  },
  {
    name: 'native SQLite',
    rootReads: 'shared',
    open: () =>
      getDatabase({
        type: 'sqlite',
        url: ':memory:',
        cache: false,
        capabilities: { vector: true },
      }),
  },
  {
    name: 'DuckDB',
    rootReads: 'shared',
    open: () => getDatabase({ type: 'duckdb', url: ':memory:', cache: false }),
  },
  {
    name: 'JSON',
    rootReads: 'shared',
    open: () =>
      getDatabase({ type: 'json', url: ':memory:', dbid: randomUUID() }),
  },
  {
    name: 'libsql secureFile',
    rootReads: 'serialized',
    open: () =>
      getDatabase({
        type: 'sqlite',
        url: join(dir, `s-${randomUUID()}.db`),
        cache: false,
        secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' },
      }),
  },
  {
    name: 'PGlite owned',
    rootReads: 'serialized',
    open: () => getDatabase({ type: 'pglite' }),
  },
  {
    name: 'PGlite injected client',
    rootReads: 'serialized',
    open: async () => {
      const { PGlite } = await import('@electric-sql/pglite');
      const client = await PGlite.create();
      callerClients.push(client);
      return getDatabase({ type: 'pglite', client });
    },
  },
];

for (const adapter of cases) {
  describe(`rootReads: ${adapter.name}`, () => {
    for (const outcome of ['commit', 'rollback'] as const) {
      it(`claims ${adapter.rootReads} and behaves that way during a beginTransaction() handle that ends in ${outcome}`, async () => {
        const db = await adapter.open();
        const table = `rr_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        try {
          expect(describeHandle(db).rootReads).toBe(adapter.rootReads);
          await db.query(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
          const handle = (await db.beginTransaction?.()) as TransactionHandle;
          await handle.query(`INSERT INTO ${table} (id) VALUES (1)`);

          if (adapter.rootReads === 'shared') {
            // The root's statement runs on the one connection, inside the
            // open transaction, and sees its uncommitted row.
            expect(await countRows(db, table)).toBe(1);
            await handle[outcome]();
            expect(await countRows(db, table)).toBe(
              outcome === 'commit' ? 1 : 0,
            );
          } else {
            // The root's statement waits until the transaction ends, and then
            // sees only what was committed.
            let settled = false;
            const read = countRows(db, table).then((n) => {
              settled = true;
              return n;
            });
            await delay(100);
            expect(settled).toBe(false);
            await handle[outcome]();
            expect(await read).toBe(outcome === 'commit' ? 1 : 0);
          }
        } finally {
          await db.close?.();
        }
      }, 30000);
    }
  });
}

describe('rootReads does not cover raw transaction control', () => {
  it('a PGlite root sees its own raw-BEGIN uncommitted row', async () => {
    const db = await getDatabase({ type: 'pglite' });
    try {
      expect(describeHandle(db).rootReads).toBe('serialized');
      await db.query('CREATE TABLE raw_rr (id INTEGER PRIMARY KEY)');
      await db.query('BEGIN');
      await db.query('INSERT INTO raw_rr (id) VALUES (1)');
      expect(await countRows(db, 'raw_rr')).toBe(1);
      await db.query('ROLLBACK');
      expect(await countRows(db, 'raw_rr')).toBe(0);
    } finally {
      await db.close?.();
    }
  });
});

describe('rootReads: PostgreSQL pool', () => {
  it('claims isolated (other pool connections; behaviour runs in the PostgreSQL lane)', async () => {
    const db = await getDatabase({
      type: 'postgres',
      url: 'postgresql://hv:hv@127.0.0.1:9/hv_root_reads',
      cache: false,
    });
    try {
      expect(describeHandle(db)).toMatchObject({
        role: 'root',
        rootReads: 'isolated',
        clientSource: 'adapter',
      });
    } finally {
      await db.close?.();
    }
  });
});
