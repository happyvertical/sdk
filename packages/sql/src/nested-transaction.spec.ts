import { describe, expect, it } from 'vitest';
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

/**
 * Issue #1109 — on the single-connection adapters a nested `tx.transaction()`
 * used to issue a second BEGIN on the connection that was already in a
 * transaction. That throws, and the nested call's own ROLLBACK then discarded
 * the *enclosing* transaction, so its writes vanished while anything the outer
 * callback wrote afterwards committed in autocommit.
 */
describe('nested transactions', () => {
  describe('sqlite (savepoint re-entry)', () => {
    it('sees the enclosing transaction and does not end it', async () => {
      const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
      await db.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');

      await txOf(db)(async (tx) => {
        await tx.query(`INSERT INTO t VALUES (1, 'outer')`);

        const seen = await txOf(tx)(async (inner) => {
          const rows = await inner.query('SELECT v FROM t WHERE id = 1');
          await inner.query(`INSERT INTO t VALUES (2, 'inner')`);
          return rows.rows[0]?.v;
        });

        // The nested scope reads the enclosing transaction's uncommitted work
        // instead of being isolated from it.
        expect(seen).toBe('outer');
        await tx.query(`INSERT INTO t VALUES (3, 'after')`);
      });

      const rows = await db.query('SELECT id FROM t ORDER BY id');
      expect(rows.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it('rolls the nested scope back without losing the enclosing work', async () => {
      const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
      await db.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');

      await txOf(db)(async (tx) => {
        await tx.query(`INSERT INTO t VALUES (1, 'outer')`);
        await expect(
          txOf(tx)(async (inner) => {
            await inner.query(`INSERT INTO t VALUES (2, 'inner')`);
            throw new Error('__nested_failed__');
          }),
        ).rejects.toThrow('__nested_failed__');

        // The enclosing transaction survives a failed nested scope and can
        // still be used.
        await tx.query(`INSERT INTO t VALUES (3, 'after')`);
      });

      const rows = await db.query('SELECT id FROM t ORDER BY id');
      expect(rows.rows.map((r) => r.id)).toEqual([1, 3]);
    });

    it('discards the whole tree when the outer transaction fails', async () => {
      const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
      await db.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');

      await expect(
        txOf(db)(async (tx) => {
          await tx.query(`INSERT INTO t VALUES (1, 'outer')`);
          await txOf(tx)(async (inner) => {
            await inner.query(`INSERT INTO t VALUES (2, 'inner')`);
          });
          throw new Error('__outer_failed__');
        }),
      ).rejects.toThrow('__outer_failed__');

      const rows = await db.query('SELECT id FROM t');
      expect(rows.rows).toHaveLength(0);
    });

    it('supports more than one level', async () => {
      const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
      await db.query('CREATE TABLE t (id INTEGER PRIMARY KEY)');

      await txOf(db)(async (tx) => {
        await tx.query('INSERT INTO t VALUES (1)');
        await txOf(tx)(async (a) => {
          await a.query('INSERT INTO t VALUES (2)');
          await txOf(a)(async (b) => {
            await b.query('INSERT INTO t VALUES (3)');
          });
          await expect(
            txOf(a)(async (c) => {
              await c.query('INSERT INTO t VALUES (4)');
              throw new Error('__deep_failed__');
            }),
          ).rejects.toThrow('__deep_failed__');
        });
      });

      const rows = await db.query('SELECT id FROM t ORDER BY id');
      expect(rows.rows.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it('applies the same nesting rules to a beginTransaction handle', async () => {
      const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
      await db.query('CREATE TABLE t (id INTEGER PRIMARY KEY)');

      const tx = await beginOf(db)();
      await tx.query('INSERT INTO t VALUES (1)');
      await txOf(tx)(async (inner) => {
        await inner.query('INSERT INTO t VALUES (2)');
      });
      await tx.commit();

      const rows = await db.query('SELECT id FROM t ORDER BY id');
      expect(rows.rows.map((r) => r.id)).toEqual([1, 2]);
    });
  });

  // DuckDB has no SAVEPOINT, so there is no way to re-enter the current
  // transaction; nesting has to be refused rather than silently reinterpreted.
  for (const type of ['duckdb', 'json'] as const) {
    describe(`${type} (refuses to nest)`, () => {
      // These adapters cache their in-memory connection, so each test uses its
      // own table rather than relying on a fresh database.
      it('throws NestedTransactionError and leaves the transaction usable', async () => {
        const db = await getDatabase({ type, url: ':memory:' });
        const t = `nest_usable_${type}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY, v TEXT)`);

        await txOf(db)(async (tx) => {
          await tx.query(`INSERT INTO ${t} VALUES (1, 'outer')`);

          await expect(txOf(tx)(async () => undefined)).rejects.toBeInstanceOf(
            NestedTransactionError,
          );

          // The refusal never touched the connection, so the enclosing
          // transaction is intact and still accepts writes.
          await tx.query(`INSERT INTO ${t} VALUES (2, 'after')`);
        });

        const rows = await db.query(`SELECT id FROM ${t} ORDER BY id`);
        expect(rows.rows.map((r) => Number(r.id))).toEqual([1, 2]);
      });

      it('still rolls the outer transaction back when it fails', async () => {
        const db = await getDatabase({ type, url: ':memory:' });
        const t = `nest_rollback_${type}`;
        await db.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);

        await expect(
          txOf(db)(async (tx) => {
            await tx.query(`INSERT INTO ${t} VALUES (1)`);
            throw new Error('__outer_failed__');
          }),
        ).rejects.toThrow('__outer_failed__');

        const rows = await db.query(`SELECT id FROM ${t}`);
        expect(rows.rows).toHaveLength(0);
      });
    });
  }
});
