import { randomUUID } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import { DatabaseError as PgDatabaseError } from 'pg';
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

function beginOf(db: DatabaseInterface) {
  const fn = db.beginTransaction;
  if (!fn) throw new Error('adapter does not expose beginTransaction()');
  return fn.bind(db);
}

/** Runs `work` and returns whatever it threw. */
async function captureError(work: () => Promise<unknown>): Promise<any> {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error('expected the operation to reject, but it resolved');
}

/**
 * Issue #1115 — the transaction-scoped method set was a hand-maintained copy of
 * the pool-backed one that called the client bare, so failures inside a
 * transaction escaped as raw `pg` errors while the same call outside a
 * transaction produced `DatabaseError` from `@happyvertical/utils`.
 *
 * The trap is that `pg` exports its own class *also* named `DatabaseError`, so
 * `err.name`, `err.constructor.name` and any logged stack read `DatabaseError`
 * either way. Only `instanceof` tells them apart — which is exactly what
 * error-handling code branches on.
 */
describe('postgres transaction error contract', () => {
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
    table = `txerr_${randomUUID().replace(/-/g, '')}`;
    await db.query(`CREATE TABLE ${table} (id int primary key, v text)`);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;
    await db.query(`DROP TABLE IF EXISTS ${table}`);
    await db.client.end();
  });

  it('confirms the two DatabaseError classes are distinct and same-named', () => {
    // If this ever stops holding, the bug this suite guards becomes visible by
    // eye and the rest of these assertions lose their point.
    expect(PgDatabaseError).not.toBe(DatabaseError);
    expect(PgDatabaseError.name).toBe(DatabaseError.name);
  });

  it('throws the same error type inside a transaction as outside', async () => {
    if (!postgresAvailable) return;

    const outside = await captureError(() =>
      db.query('SELECT * FROM table_that_does_not_exist'),
    );
    const inside = await captureError(() =>
      txOf(db)((tx) => tx.query('SELECT * FROM table_that_does_not_exist')),
    );

    expect(outside).toBeInstanceOf(DatabaseError);
    // Before the fix this was a raw pg error, and `instanceof` silently sent
    // the caller down the "not a database error, rethrow" branch.
    expect(inside).toBeInstanceOf(DatabaseError);
    expect(inside).not.toBeInstanceOf(PgDatabaseError);
  }, 30000);

  it('keeps safe structured diagnostics on a failure inside a transaction', async () => {
    if (!postgresAvailable) return;

    const error = await captureError(() =>
      txOf(db)((tx) => tx.query('SELECT * FROM table_that_does_not_exist')),
    );

    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.context).toMatchObject({
      sql: '[redacted]',
    });
    expect(String(error.context.originalError)).toContain('does not exist');
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error & { code?: string }).code).toBe('42P01');
  }, 30000);

  it.each([
    [
      'get',
      (tx: DatabaseInterface) => tx.get('table_that_does_not_exist', { id: 1 }),
    ],
    [
      'list',
      (tx: DatabaseInterface) => tx.list('table_that_does_not_exist', {}),
    ],
    [
      'update',
      (tx: DatabaseInterface) =>
        tx.update('table_that_does_not_exist', { id: 1 }, { v: 'x' }),
    ],
    [
      'delete',
      (tx: DatabaseInterface) =>
        tx.delete('table_that_does_not_exist', { id: 1 }),
    ],
    ['count', (tx: DatabaseInterface) => tx.count('table_that_does_not_exist')],
    [
      'single',
      (tx: DatabaseInterface) =>
        tx.single`SELECT * FROM table_that_does_not_exist`,
    ],
    [
      'many',
      (tx: DatabaseInterface) =>
        tx.many`SELECT * FROM table_that_does_not_exist`,
    ],
    [
      'pluck',
      (tx: DatabaseInterface) =>
        tx.pluck`SELECT * FROM table_that_does_not_exist`,
    ],
    [
      'execute',
      (tx: DatabaseInterface) =>
        tx.execute`SELECT * FROM table_that_does_not_exist`,
    ],
  ])(
    'wraps %s failures inside a transaction',
    async (_name, call) => {
      if (!postgresAvailable) return;

      const error = await captureError(() => txOf(db)((tx) => call(tx)));
      expect(error).toBeInstanceOf(DatabaseError);
    },
    30000,
  );

  it('wraps failures on a manual transaction handle too', async () => {
    if (!postgresAvailable) return;

    const tx = await beginOf(db)();
    const error = await captureError(() =>
      tx.query('SELECT * FROM table_that_does_not_exist'),
    );
    await tx.rollback();

    expect(error).toBeInstanceOf(DatabaseError);
    expect(error).not.toBeInstanceOf(PgDatabaseError);
  }, 30000);

  it('serializes CRUD values identically inside and outside transactions', async () => {
    if (!postgresAvailable) return;

    const shapes = `${table}_shapes`;
    await db.query(
      `CREATE TABLE ${shapes} (
        id int primary key,
        meta jsonb,
        happened timestamptz,
        note text,
        enabled boolean,
        score int
      )`,
    );
    try {
      const happenedAt = new Date('2026-09-03T12:34:56.000Z');
      const initial = {
        meta: { source: 'pool', values: [1, 2] },
        happened: happenedAt,
        note: null,
        enabled: true,
        score: 7,
      };
      await db.insert(shapes, { id: 1, ...initial });
      await txOf(db)((tx) => tx.insert(shapes, { id: 2, ...initial }));

      await txOf(db)((tx) =>
        tx.update(
          shapes,
          { id: 2 },
          {
            meta: ['transaction', { nested: true }],
            happened: new Date('2026-09-04T01:02:03.000Z'),
            note: null,
            enabled: false,
            score: 9,
          },
        ),
      );

      const manual = await beginOf(db)();
      await manual.update(
        shapes,
        { id: 1 },
        { meta: ['manual'], happened: happenedAt },
      );
      await manual.commit();

      const rows = await db.query(
        `SELECT id, meta, happened, note, enabled, score FROM ${shapes} ORDER BY id`,
      );
      expect(rows.rows).toEqual([
        {
          id: 1,
          meta: ['manual'],
          happened: happenedAt,
          note: null,
          enabled: true,
          score: 7,
        },
        {
          id: 2,
          meta: ['transaction', { nested: true }],
          happened: new Date('2026-09-04T01:02:03.000Z'),
          note: null,
          enabled: false,
          score: 9,
        },
      ]);
    } finally {
      await db.query(`DROP TABLE IF EXISTS ${shapes}`);
    }
  }, 30000);

  it('preserves the first statement failure when a later query sees 25P02', async () => {
    if (!postgresAvailable) return;

    const error = await captureError(() =>
      txOf(db)(async (tx) => {
        await captureError(() => tx.query('SELECT $1::jsonb', '{invalid json'));
        await tx.query('SELECT 1');
      }),
    );

    expect(error).toBeInstanceOf(DatabaseError);
    if (!(error.cause instanceof Error) || !('code' in error.cause)) {
      throw new Error('expected the original PostgreSQL code on the cause');
    }
    expect(error.cause.code).toBe('22P02');
    expect(String(error.context.originalError)).toContain(
      'invalid input syntax for type json',
    );
    expect(String(error.context.originalError)).not.toContain(
      'current transaction is aborted',
    );
  }, 30000);

  it('rejects commit with the first error after a callback swallows it', async () => {
    if (!postgresAvailable) return;

    const callbackError = await captureError(() =>
      txOf(db)(async (tx) => {
        await captureError(() => tx.query('SELECT $1::jsonb', '{invalid json'));
      }),
    );
    expect(callbackError).toBeInstanceOf(PgDatabaseError);
    expect(callbackError.code).toBe('22P02');

    const manual = await beginOf(db)();
    await captureError(() => manual.query('SELECT $1::jsonb', '{invalid json'));
    const manualError = await captureError(() => manual.commit());
    expect(manualError).toBeInstanceOf(PgDatabaseError);
    expect(manualError.code).toBe('22P02');
  }, 30000);

  it('tracks failures issued through the exposed transaction client', async () => {
    if (!postgresAvailable) return;

    const callbackError = await captureError(() =>
      txOf(db)(async (tx) => {
        await captureError(() =>
          tx.client.query('SELECT * FROM table_that_does_not_exist'),
        );
        await captureError(() => tx.query('SELECT 1'));
      }),
    );
    expect(callbackError).toBeInstanceOf(PgDatabaseError);
    expect(callbackError.code).toBe('42P01');

    const manual = await beginOf(db)();
    await captureError(() =>
      manual.client.query('SELECT * FROM table_that_does_not_exist'),
    );
    const manualError = await captureError(() => manual.commit());
    expect(manualError).toBeInstanceOf(PgDatabaseError);
    expect(manualError.code).toBe('42P01');
  }, 30000);

  it('waits for started queries before callback or manual commit', async () => {
    if (!postgresAvailable) return;

    const callbackError = await captureError(() =>
      txOf(db)((tx) => {
        void tx
          .query('SELECT * FROM table_that_does_not_exist')
          .catch(() => undefined);
        return Promise.resolve();
      }),
    );
    expect(callbackError).toBeInstanceOf(PgDatabaseError);
    expect(callbackError.code).toBe('42P01');

    const manual = await beginOf(db)();
    const pending = manual
      .query('SELECT * FROM table_that_does_not_exist')
      .catch(() => undefined);
    const manualError = await captureError(() => manual.commit());
    await pending;
    expect(manualError).toBeInstanceOf(PgDatabaseError);
    expect(manualError.code).toBe('42P01');
  }, 30000);

  it('clears a recovered nested-savepoint error before outer commit', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await captureError(() =>
        txOf(tx)((nested) => nested.query('SELECT $1::jsonb', '{invalid json')),
      );
      await tx.insert(table, { id: 99, v: 'after savepoint rollback' });
    });

    expect(await db.get(table, { id: 99 })).toMatchObject({
      v: 'after savepoint rollback',
    });
  }, 30000);

  it('clears a recovered caller-managed savepoint error', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await tx.query('SAVEPOINT caller_recovery');
      await captureError(() => tx.query('SELECT $1::jsonb', '{invalid json'));
      await tx.query('ROLLBACK TO SAVEPOINT caller_recovery');
      await tx.query('RELEASE SAVEPOINT caller_recovery');
      await tx.insert(table, { id: 100, v: 'callback recovered' });
    });

    const manual = await beginOf(db)();
    await manual.query('SAVEPOINT manual_recovery');
    await captureError(() => manual.query('SELECT $1::jsonb', '{invalid json'));
    await manual.query('ROLLBACK TO manual_recovery');
    await manual.query('RELEASE SAVEPOINT manual_recovery');
    await manual.insert(table, { id: 101, v: 'manual recovered' });
    await manual.commit();

    const recovered = await db.query(
      `SELECT id, v FROM ${table} WHERE id >= 100 ORDER BY id`,
    );
    expect(recovered.rows).toEqual([
      { id: 100, v: 'callback recovered' },
      { id: 101, v: 'manual recovered' },
    ]);
  }, 30000);

  it('recognizes a comment-prefixed caller-managed savepoint rollback', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await tx.query('SAVEPOINT commented_recovery');
      await captureError(() => tx.query('SELECT $1::jsonb', '{invalid json'));
      await tx.query(
        '/* recover the failed statement */ ROLLBACK TO SAVEPOINT commented_recovery',
      );
      await tx.query('RELEASE SAVEPOINT commented_recovery');
      await tx.insert(table, { id: 102, v: 'commented rollback recovered' });
    });

    expect(await db.get(table, { id: 102 })).toMatchObject({
      v: 'commented rollback recovered',
    });

    const manual = await beginOf(db)();
    await manual.client.query('SAVEPOINT raw_client_recovery');
    await captureError(() =>
      manual.client.query('SELECT * FROM table_that_does_not_exist'),
    );
    await manual.client.query(
      '/* raw client recovery */ ROLLBACK TO SAVEPOINT raw_client_recovery',
    );
    await manual.client.query('RELEASE SAVEPOINT raw_client_recovery');
    await manual.insert(table, { id: 103, v: 'raw client recovered' });
    await manual.commit();

    expect(await db.get(table, { id: 103 })).toMatchObject({
      v: 'raw client recovered',
    });
  }, 30000);

  it('preserves a root error when the next operation opens a nested scope', async () => {
    if (!postgresAvailable) return;

    const error = await captureError(() =>
      txOf(db)(async (tx) => {
        await captureError(() =>
          tx.query('SELECT * FROM table_that_does_not_exist'),
        );
        await txOf(tx)(async () => {});
      }),
    );

    expect(error).toBeInstanceOf(PgDatabaseError);
    expect(error.code).toBe('42P01');
    expect(String(error.message)).toContain('does not exist');
    expect(String(error.message)).not.toContain(
      'current transaction is aborted',
    );
  }, 30000);

  it('returns the connection when COMMIT itself throws', async () => {
    if (!postgresAvailable) return;

    // COMMIT throws in ordinary operation — a deferred constraint is the
    // easiest way to make it do so on demand. It is the teardown path most
    // likely to leak, because the failure happens *after* the work succeeded,
    // and a leak here is invisible until the pool is exhausted. The pool is
    // capped at 4, so a leak per failed commit shows up within a few rounds.
    const deferred = `${table}_deferred`;
    await db.query(
      `CREATE TABLE ${deferred} (id int, CONSTRAINT ${deferred}_uq UNIQUE (id) DEFERRABLE INITIALLY DEFERRED)`,
    );
    try {
      for (let round = 0; round < 6; round++) {
        await expect(
          txOf(db)(async (tx) => {
            await tx.query(`INSERT INTO ${deferred} VALUES (1)`);
            await tx.query(`INSERT INTO ${deferred} VALUES (1)`);
          }),
        ).rejects.toThrow(/duplicate key/);
      }

      // If any of those six had stranded its client, the pool would be empty
      // and this would hang rather than fail.
      const after = await txOf(db)(async (tx) => {
        const rows = await tx.query(
          `SELECT count(*)::int AS n FROM ${deferred}`,
        );
        return rows.rows[0].n;
      });
      expect(after).toBe(0);
    } finally {
      await db.query(`DROP TABLE IF EXISTS ${deferred}`);
    }
  }, 30000);

  it('raises a constraint violation identically inside and outside', async () => {
    if (!postgresAvailable) return;

    await db.insert(table, { id: 1, v: 'first' });

    const outside = await captureError(() =>
      db.insert(table, { id: 1, v: 'duplicate' }),
    );
    const inside = await captureError(() =>
      txOf(db)((tx) => tx.insert(table, { id: 1, v: 'duplicate' })),
    );

    // `insert` is the one CRUD method the pool-backed interface has never
    // wrapped — it surfaces the driver error so callers can branch on
    // `err.code === '23505'`, which the wrapped form flattens into a string.
    // The contract this issue is about is that the answer does not depend on
    // being inside a transaction, so assert the two agree rather than
    // asserting a type only one of them ever had.
    expect(inside.constructor).toBe(outside.constructor);
    expect(inside).toBeInstanceOf(PgDatabaseError);
    expect(inside.code).toBe(outside.code);
    expect(String(inside.message)).toContain('duplicate key');
  }, 30000);
});
