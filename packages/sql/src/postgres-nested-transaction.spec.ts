import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

/** `transaction` is optional on DatabaseInterface, so narrow rather than assert. */
function txOf(db: DatabaseInterface) {
  const fn = db.transaction;
  if (!fn) throw new Error('adapter does not expose transaction()');
  return fn.bind(db);
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
 * Issue #1108 — `tx.transaction()` re-exposed the top-level `transaction`, so a
 * nested call checked out a second pooled connection and began an independent
 * transaction. It could not see the enclosing transaction's uncommitted rows,
 * and if the enclosing transaction held a lock the nested one needed, the two
 * deadlocked undetectably: PostgreSQL sees the outer connection waiting on a
 * promise, not a lock, so the deadlock detector never fires.
 */
describe('postgres nested transactions', () => {
  let postgresAvailable = false;
  let db: Awaited<ReturnType<typeof getDatabase>>;
  let table: string;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log('PostgreSQL not available, skipping test');
      return;
    }
    db = await getDatabase(postgresTestOptions({ dbid: randomUUID(), max: 4 }));
    table = `nested_${randomUUID().replace(/-/g, '')}`;
    await db.query(`CREATE TABLE ${table} (id int primary key, v text)`);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;
    await db.query(`DROP TABLE IF EXISTS ${table}`);
    await db.client.end();
  });

  it('sees the enclosing transaction and does not end it', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await tx.query(`INSERT INTO ${table} VALUES (1, 'outer')`);

      const seen = await txOf(tx)(async (inner) => {
        const rows = await inner.query(`SELECT v FROM ${table} WHERE id = 1`);
        await inner.query(`INSERT INTO ${table} VALUES (2, 'inner')`);
        return rows.rows[0]?.v;
      });

      expect(seen).toBe('outer');
      await tx.query(`INSERT INTO ${table} VALUES (3, 'after')`);
    });

    const rows = await db.query(`SELECT id FROM ${table} ORDER BY id`);
    expect(rows.rows.map((r) => r.id)).toEqual([1, 2, 3]);
  }, 30000);

  it('does not deadlock when the nested scope touches a row the outer locked', async () => {
    if (!postgresAvailable) return;

    await db.query(`INSERT INTO ${table} VALUES (1, 'locked')`);

    // This is the production hang from the issue: the outer transaction holds
    // SELECT ... FOR UPDATE and a library call updates the same row. Running
    // under a savepoint it is the same transaction, so there is no lock to wait
    // on. Before the fix this blocked forever with no deadlock report.
    const work = txOf(db)(async (tx) => {
      await tx.query(`SELECT * FROM ${table} WHERE id = 1 FOR UPDATE`);
      await txOf(tx)(async (inner) => {
        await inner.query(`UPDATE ${table} SET v = 'updated' WHERE id = 1`);
      });
    });

    const outcome = await Promise.race([
      work.then(() => 'completed'),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 8000)),
    ]);
    expect(outcome).toBe('completed');

    const rows = await db.query(`SELECT v FROM ${table} WHERE id = 1`);
    expect(rows.rows[0].v).toBe('updated');
  }, 30000);

  it('rolls the nested scope back without losing the enclosing work', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await tx.query(`INSERT INTO ${table} VALUES (1, 'outer')`);
      await expect(
        txOf(tx)(async (inner) => {
          await inner.query(`INSERT INTO ${table} VALUES (2, 'inner')`);
          throw new Error('__nested_failed__');
        }),
      ).rejects.toThrow('__nested_failed__');

      // A failed savepoint does not poison the enclosing transaction.
      await tx.query(`INSERT INTO ${table} VALUES (3, 'after')`);
    });

    const rows = await db.query(`SELECT id FROM ${table} ORDER BY id`);
    expect(rows.rows.map((r) => r.id)).toEqual([1, 3]);
  }, 30000);

  it('discards the whole tree when the outer transaction fails', async () => {
    if (!postgresAvailable) return;

    await expect(
      txOf(db)(async (tx) => {
        await tx.query(`INSERT INTO ${table} VALUES (1, 'outer')`);
        await txOf(tx)(async (inner) => {
          await inner.query(`INSERT INTO ${table} VALUES (2, 'inner')`);
        });
        throw new Error('__outer_failed__');
      }),
    ).rejects.toThrow('__outer_failed__');

    const rows = await db.query(`SELECT id FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('supports more than one level', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await tx.query(`INSERT INTO ${table} VALUES (1, 'a')`);
      await txOf(tx)(async (a) => {
        await a.query(`INSERT INTO ${table} VALUES (2, 'b')`);
        await txOf(a)(async (b) => {
          await b.query(`INSERT INTO ${table} VALUES (3, 'c')`);
        });
        await expect(
          txOf(a)(async (c) => {
            await c.query(`INSERT INTO ${table} VALUES (4, 'd')`);
            throw new Error('__deep_failed__');
          }),
        ).rejects.toThrow('__deep_failed__');
      });
    });

    const rows = await db.query(`SELECT id FROM ${table} ORDER BY id`);
    expect(rows.rows.map((r) => r.id)).toEqual([1, 2, 3]);
  }, 30000);

  it('serializes overlapping nested scopes on the enclosing client', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await Promise.all([
        txOf(tx)(async (first) => {
          await first.query(`INSERT INTO ${table} VALUES (1, 'first')`);
        }),
        txOf(tx)(async (second) => {
          await second.query(`INSERT INTO ${table} VALUES (2, 'second')`);
        }),
      ]);
    });

    const rows = await db.query(`SELECT id FROM ${table} ORDER BY id`);
    expect(rows.rows.map((r) => r.id)).toEqual([1, 2]);
  }, 30000);

  it('serializes siblings started from within a nested scope', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await txOf(tx)(async (parent) => {
        await Promise.all([
          txOf(parent)(async (first) => {
            await first.query(`INSERT INTO ${table} VALUES (1, 'first')`);
          }),
          txOf(parent)(async (second) => {
            await second.query(`INSERT INTO ${table} VALUES (2, 'second')`);
          }),
        ]);
      });
    });

    const rows = await db.query(`SELECT id FROM ${table} ORDER BY id`);
    expect(rows.rows.map((r) => r.id)).toEqual([1, 2]);
  }, 30000);

  it('drains a queued sibling before rolling the outer transaction back', async () => {
    if (!postgresAvailable) return;

    let startSecond!: () => void;
    let continueSecond!: () => void;
    const secondStarted = new Promise<void>((resolve) => {
      startSecond = resolve;
    });
    const allowSecond = new Promise<void>((resolve) => {
      continueSecond = resolve;
    });
    let outerSettled = false;

    const outer = txOf(db)(async (tx) => {
      const first = txOf(tx)(async () => {
        throw new Error('__first_sibling_failed__');
      });
      const second = txOf(tx)(async (later) => {
        startSecond();
        await allowSecond;
        await later.query(`INSERT INTO ${table} VALUES (2, 'second')`);
      });
      await Promise.all([first, second]);
    });
    void outer.catch(() => {
      outerSettled = true;
    });

    await secondStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(outerSettled).toBe(false);

    continueSecond();
    await expect(outer).rejects.toThrow('__first_sibling_failed__');

    const rows = await db.query(`SELECT id FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('nests on a beginTransaction handle without checking out a second connection', async () => {
    if (!postgresAvailable || !db.beginTransaction) return;

    const pool = db.client as { totalCount: number };
    const tx = await db.beginTransaction();
    const connectionsAfterBegin = pool.totalCount;

    await tx.query(`INSERT INTO ${table} VALUES (1, 'outer')`);
    await txOf(tx)(async (inner) => {
      await inner.query(`INSERT INTO ${table} VALUES (2, 'inner')`);
    });

    // Re-entering must reuse the enclosing transaction's connection.
    expect(pool.totalCount).toBe(connectionsAfterBegin);
    await tx.commit();

    const rows = await db.query(`SELECT id FROM ${table} ORDER BY id`);
    expect(rows.rows.map((r) => r.id)).toEqual([1, 2]);
  }, 30000);
});
