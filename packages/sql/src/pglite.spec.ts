import { randomUUID } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { clearPGliteConnectionCache } from './pglite';
import type { DatabaseInterface, TransactionHandle } from './shared/types';

/**
 * The Postgres dialect running against in-memory PGlite: the same statement
 * logic the `pg` adapter uses, with no server.
 */

const tableName = (prefix: string) =>
  `${prefix}_${randomUUID().replace(/-/g, '')}`;

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

describe('pglite adapter', () => {
  let db: DatabaseInterface;

  beforeAll(async () => {
    db = await getDatabase({ type: 'pglite' });
  });

  afterAll(async () => {
    await db.close?.();
  });

  describe('statements', () => {
    it('inserts, gets, lists, updates, counts and deletes', async () => {
      const t = tableName('crud');
      await db.query(
        `CREATE TABLE ${t} (id uuid PRIMARY KEY, name text NOT NULL, qty bigint, meta jsonb, at timestamptz, raw bytea)`,
      );
      const id = randomUUID();
      const at = new Date('2026-01-02T03:04:05.000Z');

      const inserted = await db.insert(t, {
        id,
        name: 'one',
        qty: 5,
        meta: { a: [1, 2] },
        at,
        raw: new Uint8Array([1, 2, 3]),
      });
      expect(inserted).toEqual({ operation: 'insert', affected: 1 });
      await db.insert(t, [
        { id: randomUUID(), name: 'two', qty: 6 },
        { id: randomUUID(), name: 'three', qty: 7 },
      ]);

      const row = await db.get(t, { id });
      expect(row).toMatchObject({
        id,
        name: 'one',
        qty: 5,
        meta: { a: [1, 2] },
      });
      expect(Number.isSafeInteger(row?.qty)).toBe(true);
      expect(row?.at).toEqual(at);
      expect([...(row?.raw ?? [])]).toEqual([1, 2, 3]);

      expect(await db.count(t)).toBe(3);
      expect(await db.count(t, { name: 'two' })).toBe(1);
      expect(
        (await db.list(t, { 'qty >': 5 })).map((r) => r.name).sort(),
      ).toEqual(['three', 'two']);

      expect(await db.update(t, { id }, { name: 'uno' })).toEqual({
        operation: 'update',
        affected: 1,
      });
      expect((await db.get(t, { id }))?.name).toBe('uno');

      expect(await db.delete(t, { id })).toEqual({
        operation: 'delete',
        affected: 1,
      });
      expect(await db.get(t, { id })).toBeNull();
      await expect(db.get(t, {})).rejects.toBeInstanceOf(DatabaseError);
    });

    it('runs tagged-template and raw queries', async () => {
      // Template values are bound parameters, so the table name is a literal.
      await db.query('CREATE TABLE tpl_items (id int PRIMARY KEY, label text)');
      await db.query(
        'INSERT INTO tpl_items (id, label) VALUES ($1, $2)',
        1,
        'a',
      );
      await db.query('INSERT INTO tpl_items (id, label) VALUES (?, ?)', 2, 'b');

      expect(await db.pluck`SELECT label FROM tpl_items WHERE id = ${1}`).toBe(
        'a',
      );
      expect(await db.single`SELECT * FROM tpl_items WHERE id = ${2}`).toEqual({
        id: 2,
        label: 'b',
      });
      expect((await db.many`SELECT * FROM tpl_items ORDER BY id`).length).toBe(
        2,
      );
      await db.execute`UPDATE tpl_items SET label = ${'z'} WHERE id = ${1}`;
      expect(await db.pluck`SELECT label FROM tpl_items WHERE id = ${1}`).toBe(
        'z',
      );

      const result = await db.query('SELECT * FROM tpl_items ORDER BY id');
      expect(result.rowCount).toBe(2);
      expect(result.rows.map((r) => r.label)).toEqual(['z', 'b']);

      // No parameters: the simple protocol, so a script works.
      await db.query(
        'CREATE TABLE tpl_items_b (a int); INSERT INTO tpl_items_b VALUES (1), (2);',
      );
      expect(await db.count('tpl_items_b')).toBe(2);
    });

    it('upserts, including null-aware conflicts', async () => {
      const t = tableName('ups');
      await db.query(
        `CREATE TABLE ${t} (id serial PRIMARY KEY, tenant text, slug text NOT NULL, n int, UNIQUE (tenant, slug))`,
      );
      await db.upsert(t, ['tenant', 'slug'], { tenant: 'a', slug: 's', n: 1 });
      await db.upsert(t, ['tenant', 'slug'], { tenant: 'a', slug: 's', n: 2 });
      expect(await db.count(t)).toBe(1);
      expect((await db.get(t, { slug: 's' }))?.n).toBe(2);

      // NULL never conflicts in a plain unique index; the adapter must dedupe.
      await db.upsert(t, ['tenant', 'slug'], { tenant: null, slug: 'x', n: 1 });
      await db.upsert(t, ['tenant', 'slug'], { tenant: null, slug: 'x', n: 2 });
      expect(await db.count(t, { slug: 'x' })).toBe(1);
      expect((await db.get(t, { slug: 'x' }))?.n).toBe(2);

      await expect(
        db.upsert(t, ['tenant', 'slug'], { slug: 'y' }),
      ).rejects.toThrow('Conflict columns missing from data');
    });

    it('getOrInsert returns the existing row', async () => {
      const t = tableName('goi');
      await db.query(`CREATE TABLE ${t} (id int PRIMARY KEY, v text)`);
      const first = await db.getOrInsert(t, { id: 1 }, { id: 1, v: 'x' });
      const second = await db.getOrInsert(t, { id: 1 }, { id: 1, v: 'y' });
      expect(first).toEqual(second);
      expect(second.v).toBe('x');
    });

    it('wraps failures in DatabaseError', async () => {
      await expect(db.get('no_such_table', { id: 1 })).rejects.toBeInstanceOf(
        DatabaseError,
      );
      await expect(
        db.query('SELECT * FROM no_such_table'),
      ).rejects.toBeInstanceOf(DatabaseError);
    });

    it('keeps native uuid ids and foreign keys', async () => {
      const parent = tableName('parent');
      const child = tableName('child');
      await db.query(`CREATE TABLE ${parent} (id uuid PRIMARY KEY)`);
      await db.query(
        `CREATE TABLE ${child} (id uuid PRIMARY KEY, owner uuid NOT NULL REFERENCES ${parent}(id))`,
      );
      const parentId = randomUUID();
      await db.insert(parent, { id: parentId });
      await db.insert(child, { id: randomUUID(), owner: parentId });
      await expect(
        db.insert(child, { id: randomUUID(), owner: randomUUID() }),
      ).rejects.toThrow();
      const info = await db.getTableSchema?.(child);
      expect(info?.foreignKeys).toEqual([
        expect.objectContaining({
          column: 'owner',
          referencesTable: parent,
          referencesColumn: 'id',
        }),
      ]);
    });
  });

  describe('schema', () => {
    it('tableExists, syncSchema, getTableSchema and alterTable', async () => {
      const t = tableName('schema');
      expect(await db.tableExists(t)).toBe(false);

      await db.syncSchema(
        `CREATE TABLE ${t} (\n  id uuid PRIMARY KEY,\n  name text NOT NULL\n);\nCREATE INDEX idx_${t}_name ON ${t} (name);`,
      );
      expect(await db.tableExists(t)).toBe(true);

      // Adds the missing column, leaves the index alone on a second run.
      await db.syncSchema(
        `CREATE TABLE ${t} (\n  id uuid PRIMARY KEY,\n  name text NOT NULL,\n  note text\n);\nCREATE INDEX idx_${t}_name ON ${t} (name);`,
      );

      const info = await db.getTableSchema?.(t);
      expect(Object.keys(info?.columns ?? {})).toEqual(['id', 'name', 'note']);
      expect(info?.columns.id).toMatchObject({ primaryKey: true });
      expect(info?.indexes.map((i) => i.name)).toContain(`idx_${t}_name`);

      await db.alterTable?.addColumn(t, { name: 'extra', type: 'TEXT' });
      await db.alterTable?.addIndex(t, {
        name: `idx_${t}_extra`,
        columns: ['extra'],
      });
      const after = await db.getTableSchema?.(t);
      expect(Object.keys(after?.columns ?? {})).toContain('extra');
      expect(after?.indexes.map((i) => i.name)).toContain(`idx_${t}_extra`);
      expect(await db.getTableSchema?.('absent_table')).toBeNull();
    });
  });

  describe('transaction()', () => {
    let t: string;
    beforeAll(async () => {
      t = tableName('tx');
      await db.query(`CREATE TABLE ${t} (id int PRIMARY KEY, v text)`);
    });

    it('commits on success and rolls back on throw', async () => {
      await txOf(db)(async (tx) => {
        await tx.insert(t, { id: 1, v: 'kept' });
      });
      expect(await db.count(t, { id: 1 })).toBe(1);

      await expect(
        txOf(db)(async (tx) => {
          await tx.insert(t, { id: 2, v: 'lost' });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await db.count(t, { id: 2 })).toBe(0);
    });

    it('sees its own uncommitted rows, including DDL', async () => {
      const ddl = tableName('txddl');
      await expect(
        txOf(db)(async (tx) => {
          await tx.query(`CREATE TABLE ${ddl} (id int)`);
          expect(await tx.tableExists(ddl)).toBe(true);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await db.tableExists(ddl)).toBe(false);
    });

    it('rethrows the first statement failure, not the 25P02 that follows', async () => {
      const error = await txOf(db)(async (tx) => {
        await tx.insert(t, { id: 10, v: 'a' });
        await tx.insert(t, { id: 10, v: 'dup' }); // unique violation
      }).catch((caught: unknown) => caught);
      // The driver's own error, carrying the actionable code.
      expect(error).toMatchObject({ code: '23505' });
      expect(await db.count(t, { id: 10 })).toBe(0);
    });

    it('does not report success when a swallowed failure aborted the transaction', async () => {
      // PostgreSQL answers COMMIT on an aborted transaction with a ROLLBACK tag
      // and no error; without a check the caller would be told it committed.
      await expect(
        txOf(db)(async (tx) => {
          await tx.insert(t, { id: 20, v: 'a' });
          await tx
            .query('SELECT * FROM table_that_does_not_exist')
            .catch(() => {});
        }),
      ).rejects.toMatchObject({ code: '42P01' });
      expect(await db.count(t, { id: 20 })).toBe(0);
    });

    it('tx-scoped upserts, syncSchema and queries share the transaction', async () => {
      const u = tableName('txups');
      await expect(
        txOf(db)(async (tx) => {
          await tx.syncSchema(
            `CREATE TABLE ${u} (\n  id int PRIMARY KEY,\n  k text\n)`,
          );
          await tx.upsert(u, ['id'], { id: 1, k: null });
          await tx.upsert(u, ['id'], { id: 1, k: 'x' });
          expect(await tx.count(u)).toBe(1);
          throw new Error('rollback me');
        }),
      ).rejects.toThrow('rollback me');
      expect(await db.tableExists(u)).toBe(false);
    });

    it('does not remember a catalog probe that failed inside an aborted transaction', async () => {
      const u = tableName('probe');
      await db.query(
        `CREATE TABLE ${u} (id int PRIMARY KEY, tenant text, slug text NOT NULL, UNIQUE (tenant, slug))`,
      );
      const fresh = await getDatabase({ type: 'pglite' });
      try {
        await fresh.query(
          `CREATE TABLE ${u} (id serial PRIMARY KEY, tenant text, slug text NOT NULL, UNIQUE (tenant, slug))`,
        );
        // The first null-aware upsert on this database runs inside a
        // transaction a swallowed failure has already aborted.
        await expect(
          txOf(fresh)(async (tx) => {
            await tx.query('SELECT * FROM missing_table').catch(() => {});
            await tx.upsert(u, ['tenant', 'slug'], { tenant: null, slug: 'a' });
          }),
        ).rejects.toThrow();

        // A healthy transaction afterwards must not inherit that failure.
        await txOf(fresh)(async (tx) => {
          await tx.upsert(u, ['tenant', 'slug'], { tenant: null, slug: 'a' });
          await tx.upsert(u, ['tenant', 'slug'], { tenant: null, slug: 'a' });
        });
        expect(await fresh.count(u)).toBe(1);
      } finally {
        await fresh.close?.();
      }
    });

    it('surfaces a deferred constraint failure raised at COMMIT', async () => {
      const d = tableName('deferred');
      await db.query(
        `CREATE TABLE ${d} (id int, CONSTRAINT ${d}_u UNIQUE (id) DEFERRABLE INITIALLY DEFERRED)`,
      );
      await expect(
        txOf(db)(async (tx) => {
          await tx.insert(d, { id: 1 });
          await tx.insert(d, { id: 1 });
        }),
      ).rejects.toThrow();
      expect(await db.count(d)).toBe(0);
    });
  });

  describe('nested transactions', () => {
    let t: string;
    beforeAll(async () => {
      t = tableName('nest');
      await db.query(`CREATE TABLE ${t} (id int PRIMARY KEY, v text)`);
    });

    it('releases a savepoint on success', async () => {
      await txOf(db)(async (tx) => {
        await tx.insert(t, { id: 1, v: 'outer' });
        await tx.transaction(async (inner) => {
          // Sees the enclosing transaction's uncommitted row.
          expect(await inner.count(t, { id: 1 })).toBe(1);
          await inner.insert(t, { id: 2, v: 'inner' });
        });
      });
      expect(await db.count(t)).toBe(2);
    });

    it('rolls back only the nested work when the nested callback throws', async () => {
      await txOf(db)(async (tx) => {
        await tx.insert(t, { id: 10, v: 'outer' });
        await expect(
          tx.transaction(async (inner) => {
            await inner.insert(t, { id: 11, v: 'inner' });
            throw new Error('inner failed');
          }),
        ).rejects.toThrow('inner failed');
        await tx.insert(t, { id: 12, v: 'after' });
      });
      expect(
        (await db.list(t, { 'id >=': 10 })).map((r) => r.id).sort(),
      ).toEqual([10, 12]);
    });

    it('recovers from a failed statement inside a nested scope', async () => {
      await txOf(db)(async (tx) => {
        await tx.insert(t, { id: 20, v: 'outer' });
        await tx
          .transaction(async (inner) => {
            await inner.insert(t, { id: 20, v: 'duplicate' });
          })
          .catch(() => {});
        await tx.insert(t, { id: 21, v: 'still usable' });
      });
      expect(await db.count(t, { 'id >=': 20 })).toBe(2);
    });

    it('nests through the handle each callback is given', async () => {
      await txOf(db)(async (tx) => {
        await tx.transaction(async (level1) => {
          await level1.insert(t, { id: 30, v: 'l1' });
          await level1.transaction(async (level2) => {
            await level2.insert(t, { id: 31, v: 'l2' });
            await expect(
              level2.transaction(async (level3) => {
                await level3.insert(t, { id: 32, v: 'l3' });
                throw new Error('l3 failed');
              }),
            ).rejects.toThrow('l3 failed');
          });
        });
      });
      expect(
        (await db.list(t, { 'id >=': 30 })).map((r) => r.id).sort(),
      ).toEqual([30, 31]);
    });

    it('serializes concurrently started siblings', async () => {
      await txOf(db)(async (tx) => {
        await Promise.all(
          [40, 41, 42].map((id) =>
            tx.transaction(async (inner) => {
              await inner.insert(t, { id, v: 'sibling' });
            }),
          ),
        );
      });
      expect(await db.count(t, { v: 'sibling' })).toBe(3);
    });

    it('waits for nested work that was started but not awaited', async () => {
      await txOf(db)(async (tx) => {
        void tx.transaction(async (inner) => {
          await inner.insert(t, { id: 50, v: 'late' });
        });
      });
      expect(await db.count(t, { id: 50 })).toBe(1);
    });
  });

  describe('beginTransaction()', () => {
    let t: string;
    beforeAll(async () => {
      t = tableName('handle');
      await db.query(`CREATE TABLE ${t} (id int PRIMARY KEY, v text)`);
    });

    it('commits through the handle', async () => {
      const handle = await beginOf(db)();
      expect(handle.isActive()).toBe(true);
      await handle.insert(t, { id: 1, v: 'a' });
      await handle.commit();
      expect(handle.isActive()).toBe(false);
      expect(await db.count(t, { id: 1 })).toBe(1);
    });

    it('rolls back through the handle', async () => {
      const handle = await beginOf(db)();
      await handle.insert(t, { id: 2, v: 'b' });
      await handle.rollback();
      expect(await db.count(t, { id: 2 })).toBe(0);
    });

    it('refuses a second end', async () => {
      const handle = await beginOf(db)();
      await handle.commit();
      await expect(handle.commit()).rejects.toThrow(
        'Transaction already ended',
      );
      await expect(handle.rollback()).rejects.toThrow(
        'Transaction already ended',
      );
    });

    it('refuses to commit a transaction a swallowed failure aborted', async () => {
      const handle = await beginOf(db)();
      await handle.insert(t, { id: 3, v: 'c' });
      await handle.query('SELECT * FROM nope_nope').catch(() => {});
      await expect(handle.commit()).rejects.toMatchObject({ code: '42P01' });
      expect(handle.isActive()).toBe(false);
      expect(await db.count(t, { id: 3 })).toBe(0);
    });

    it('supports nesting on a handle', async () => {
      const handle: TransactionHandle = await beginOf(db)();
      await handle.insert(t, { id: 4, v: 'outer' });
      await handle
        .transaction(async (inner) => {
          await inner.insert(t, { id: 5, v: 'inner' });
          throw new Error('nope');
        })
        .catch(() => {});
      await handle.rollback();
      expect(await db.count(t, { 'id >=': 4 })).toBe(0);
    });

    it('is usable again after a handle ends', async () => {
      const handle = await beginOf(db)();
      await handle.rollback();
      expect(await db.count(t)).toBeGreaterThanOrEqual(0);
    });
  });

  describe('transaction lock', () => {
    it('queues overlapping transactions and runs them one at a time', async () => {
      const t = tableName('lock');
      await db.query(`CREATE TABLE ${t} (n int)`);
      const order: string[] = [];
      const run = (label: string) =>
        txOf(db)(async (tx) => {
          order.push(`${label}:start`);
          await tx.insert(t, { n: 1 });
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push(`${label}:end`);
        });
      await Promise.all([run('a'), run('b'), run('c')]);
      expect(order).toEqual([
        'a:start',
        'a:end',
        'b:start',
        'b:end',
        'c:start',
        'c:end',
      ]);
      expect(await db.count(t)).toBe(3);
    });

    it('keeps a top-level statement out of an open transaction', async () => {
      const t = tableName('isolated');
      await db.query(`CREATE TABLE ${t} (n int)`);
      const handle = await beginOf(db)();
      await handle.insert(t, { n: 1 });
      let seen: number | undefined;
      const outside = db.count(t).then((value) => {
        seen = value;
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(seen).toBeUndefined(); // still waiting
      await handle.rollback();
      await outside;
      expect(seen).toBe(0); // never saw, and was never rolled back with, the tx
    });

    it('times out with an explanation instead of hanging', async () => {
      const short = await getDatabase({
        type: 'pglite',
        transactionQueueTimeout: 50,
      });
      try {
        const handle = await beginOf(short)();
        await expect(txOf(short)(async () => 1)).rejects.toThrow(
          /Timed out after 50ms/,
        );
        // A top-level call made while a transaction is open fails the same way.
        await expect(short.query('SELECT 1')).rejects.toThrow(
          /Timed out after 50ms/,
        );
        await handle.rollback();
        expect((await short.query('SELECT 1')).rows).toEqual([
          { '?column?': 1 },
        ]);
      } finally {
        await short.close?.();
      }
    });

    it('rejects an invalid transactionQueueTimeout', async () => {
      await expect(
        getDatabase({ type: 'pglite', transactionQueueTimeout: 0 }),
      ).rejects.toThrow(/transactionQueueTimeout/);
    });
  });

  describe('connection cache', () => {
    it('shares a database by dbid and keeps in-memory databases private', async () => {
      const id = randomUUID();
      const a = await getDatabase({ type: 'pglite', dbid: id });
      const b = await getDatabase({ type: 'pglite', dbid: id });
      const c = await getDatabase({ type: 'pglite' });
      const d = await getDatabase({ type: 'pglite' });
      try {
        expect(a).toBe(b);
        expect(c).not.toBe(d);
        expect(a).not.toBe(c);
      } finally {
        await clearPGliteConnectionCache();
        await c.close?.();
        await d.close?.();
      }
    });

    it('evicts a database from the cache when it closes', async () => {
      const id = randomUUID();
      const first = await getDatabase({ type: 'pglite', dbid: id });
      await first.close?.();
      const second = await getDatabase({ type: 'pglite', dbid: id });
      try {
        expect(second).not.toBe(first);
        expect((await second.query('SELECT 1 AS one')).rows).toEqual([
          { one: 1 },
        ]);
      } finally {
        await second.close?.();
      }
    });
  });
});
