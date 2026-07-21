import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseError } from '@happyvertical/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';
import { NestedTransactionError } from './shared/types';

/**
 * `transaction` and `beginTransaction` are optional on DatabaseInterface, so
 * narrow rather than assert: an adapter that stopped exposing them should fail
 * these tests loudly instead of skipping them.
 */
function txOf(db: DatabaseInterface) {
  const fn = db.transaction;
  if (!fn) throw new Error('adapter does not expose transaction()');
  return fn.bind(db);
}

function beginOf(db: DatabaseInterface) {
  const fn = db.beginTransaction;
  if (!fn) throw new Error('adapter does not expose beginTransaction()');
  return fn.bind(db);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Issue #1110 — `transaction()` issued `BEGIN` straight onto the shared
 * connection with no serialization and no record of whether one was already
 * open. Two calls that merely overlapped in time therefore corrupted each
 * other: B's `BEGIN` threw, B's `catch` ran `ROLLBACK`, and that rollback
 * landed on *A's* transaction.
 *
 * The observed result was the failure mode transactions exist to prevent —
 * transaction A half-committed and half-lost, with A's promise rejected, so a
 * caller doing the correct thing was reasoning about a transaction it believed
 * had never happened while part of it was already durable.
 *
 * No nesting is required. Two concurrent requests are enough, which makes it
 * reachable from any server handling more than one at a time.
 */
describe('concurrent transactions', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hv-sql-concurrent-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // Every adapter here drives a single connection, which is the shared
  // precondition for the defect. `sqlite (native)` is a fifth adapter reached
  // whenever a capability is requested, and had the identical bug.
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
      // This adapter caches by URL, so without a distinct dbid every test here
      // would share one connection — and one lock created with the first
      // test's options.
      options: () => ({
        type: 'json' as const,
        url: ':memory:',
        dbid: randomUUID(),
      }),
    },
  ];

  for (const adapter of adapters) {
    describe(adapter.name, () => {
      it('does not tear a transaction apart when another overlaps it', async () => {
        const db = await getDatabase(adapter.options());
        const t = `concurrent_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

        // This is the reproduction from the issue verbatim: A writes, awaits
        // something (any I/O), writes again; B starts during A's await.
        const settled = await Promise.allSettled([
          txOf(db)(async (tx) => {
            await tx.query(`INSERT INTO ${t} (id, v) VALUES (1, 'a')`);
            await delay(30);
            await tx.query(`INSERT INTO ${t} (id, v) VALUES (2, 'a2')`);
          }),
          txOf(db)(async (tx) => {
            await delay(10);
            await tx.query(`INSERT INTO ${t} (id, v) VALUES (3, 'b')`);
          }),
        ]);

        // Before the fix both rejected — one with "cannot start a transaction
        // within a transaction", the other with "cannot rollback - no
        // transaction is active".
        expect(settled.map((s) => s.status)).toEqual([
          'fulfilled',
          'fulfilled',
        ]);

        const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
        expect(rows.rows.map((r) => Number(r.id))).toEqual([1, 2, 3]);
      }, 30000);

      it('keeps a failed transaction from discarding a concurrent one', async () => {
        const db = await getDatabase(adapter.options());
        const t = `concurrent_fail_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

        const settled = await Promise.allSettled([
          txOf(db)(async (tx) => {
            await tx.query(`INSERT INTO ${t} (id, v) VALUES (1, 'keep')`);
            await delay(30);
            await tx.query(`INSERT INTO ${t} (id, v) VALUES (2, 'keep')`);
          }),
          txOf(db)(async (tx) => {
            await delay(10);
            await tx.query(`INSERT INTO ${t} (id, v) VALUES (3, 'discard')`);
            throw new Error('__b_failed__');
          }),
        ]);

        expect(settled[0].status).toBe('fulfilled');
        expect(settled[1].status).toBe('rejected');

        // B's rollback must undo B's work and nothing else.
        const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
        expect(rows.rows.map((r) => Number(r.id))).toEqual([1, 2]);
      }, 30000);

      it('serializes a burst of overlapping transactions', async () => {
        const db = await getDatabase(adapter.options());
        const t = `concurrent_burst_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);

        const settled = await Promise.allSettled(
          Array.from({ length: 8 }, (_, i) =>
            txOf(db)(async (tx) => {
              await tx.query(`INSERT INTO ${t} (id) VALUES (${i})`);
              await delay(5);
            }),
          ),
        );

        expect(settled.every((s) => s.status === 'fulfilled')).toBe(true);
        const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
        expect(rows.rows.map((r) => Number(r.id))).toEqual([
          0, 1, 2, 3, 4, 5, 6, 7,
        ]);
      }, 30000);

      it('makes a transaction wait for an open manual handle', async () => {
        const db = await getDatabase(adapter.options());
        const t = `concurrent_handle_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

        const handle = await beginOf(db)();
        await handle.query(`INSERT INTO ${t} (id, v) VALUES (1, 'handle')`);

        let callbackStarted = false;
        const queued = txOf(db)(async (tx) => {
          callbackStarted = true;
          await tx.query(`INSERT INTO ${t} (id, v) VALUES (2, 'queued')`);
        });

        // The handle still owns the connection, so the queued transaction has
        // not begun. Before the fix it began immediately and its BEGIN threw.
        await delay(30);
        expect(callbackStarted).toBe(false);

        await handle.rollback();
        await queued;

        const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
        expect(rows.rows.map((r) => Number(r.id))).toEqual([2]);
      }, 30000);

      it('reports a clear error instead of stalling forever on a leaked handle', async () => {
        const db = await getDatabase({
          ...adapter.options(),
          transactionQueueTimeout: 150,
        });
        const t = `concurrent_timeout_${randomUUID().replace(/-/g, '')}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);

        // Acquired and never ended — the caller bug the timeout exists for.
        const leaked = await beginOf(db)();

        await expect(
          txOf(db)(async (tx) => {
            await tx.query(`INSERT INTO ${t} (id) VALUES (1)`);
          }),
        ).rejects.toThrow(
          /waiting for the .* connection's current transaction/,
        );

        await expect(
          txOf(db)(async (tx) => {
            await tx.query(`INSERT INTO ${t} (id) VALUES (1)`);
          }),
        ).rejects.toBeInstanceOf(DatabaseError);

        await leaked.rollback();

        // Once the connection is back, the queue is usable again — a timed-out
        // waiter must not leave its slot in the chain unresolved.
        await txOf(db)(async (tx) => {
          await tx.query(`INSERT INTO ${t} (id) VALUES (2)`);
        });
        const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
        expect(rows.rows.map((r) => Number(r.id))).toEqual([2]);
      }, 30000);
    });
  }

  // Serialization must not swallow the re-entrant case: a nested call already
  // holds the connection, so routing it through the same queue would make it
  // wait on itself.
  describe('re-entrancy is not queued', () => {
    it('sqlite still nests under a savepoint without deadlocking', async () => {
      const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
      const t = `reentrant_${randomUUID().replace(/-/g, '')}`;
      await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

      const outcome = await Promise.race([
        txOf(db)(async (tx) => {
          await tx.query(`INSERT INTO ${t} VALUES (1, 'outer')`);
          await txOf(tx)(async (inner) => {
            await inner.query(`INSERT INTO ${t} VALUES (2, 'inner')`);
          });
          return 'completed';
        }),
        delay(5000).then(() => 'DEADLOCKED'),
      ]);

      expect(outcome).toBe('completed');
      const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
      expect(rows.rows.map((r) => Number(r.id))).toEqual([1, 2]);
    }, 30000);

    it('sqlite (native) refuses a nested beginTransaction rather than deadlocking', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: `file:${join(dir, `native-reentrant-${randomUUID()}.db`)}`,
        capabilities: { vector: true },
      });
      const t = `reentrant_begin_${randomUUID().replace(/-/g, '')}`;
      await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);

      // This adapter's transaction scope exposes `beginTransaction`. It used to
      // issue a second BEGIN and throw; with the connection serialized it would
      // instead wait on the lock its own caller holds, so it must refuse.
      const outcome = await Promise.race([
        txOf(db)(async (tx) => {
          await expect(beginOf(tx)()).rejects.toBeInstanceOf(
            NestedTransactionError,
          );
          await tx.query(`INSERT INTO ${t} (id) VALUES (1)`);
          return 'completed';
        }),
        delay(5000).then(() => 'DEADLOCKED'),
      ]);

      expect(outcome).toBe('completed');
      const rows = await db.query(`SELECT id FROM ${t}`);
      expect(rows.rows.map((r) => Number(r.id))).toEqual([1]);
    }, 30000);

    it('sqlite upserts inside a transaction without waiting on the connection', async () => {
      const db = await getDatabase({
        type: 'sqlite',
        url: `file:${join(dir, `upsert-${randomUUID()}.db`)}`,
      });
      const t = `reentrant_upsert_${randomUUID().replace(/-/g, '')}`;
      await db.query(
        `CREATE TABLE ${t} (id INTEGER PRIMARY KEY, tag TEXT, v TEXT)`,
      );
      await db.query(`CREATE UNIQUE INDEX ${t}_tag ON ${t} (tag)`);

      // A null conflict value takes the null-aware path, which opens its own
      // transaction at the top level and so takes the connection lock. Inside a
      // transaction it must not, or it would wait on its caller.
      const outcome = await Promise.race([
        txOf(db)(async (tx) => {
          await tx.upsert(t, ['tag'], { id: 1, tag: null, v: 'first' });
          return 'completed';
        }),
        delay(5000).then(() => 'DEADLOCKED'),
      ]);

      expect(outcome).toBe('completed');
      const rows = await db.query(`SELECT v FROM ${t}`);
      expect(rows.rows.map((r) => r.v)).toEqual(['first']);
    }, 30000);
  });
});
