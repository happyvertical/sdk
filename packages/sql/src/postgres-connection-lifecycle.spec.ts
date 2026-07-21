import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';

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
    const testDb = await getDatabase(
      postgresTestOptions({ dbid: randomUUID() }),
    );
    await testDb.execute`SELECT 1`;
    await testDb.client.end();
    return true;
  } catch {
    return false;
  }
}

describe('postgres connection lifecycle', () => {
  let postgresAvailable = false;
  let db: Awaited<ReturnType<typeof getDatabase>>;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log('PostgreSQL not available, skipping test');
      return;
    }
    // dbid keeps each test on its own pool: the connection cache keys on
    // url/dbid/host only, so without it these tests would share (and end) a
    // pool with the rest of the suite.
    db = await getDatabase(postgresTestOptions({ dbid: randomUUID(), max: 3 }));
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;
    await db.client.end();
  });

  // Issue #1113
  it('registers a pool error handler so an idle client failure cannot crash the process', async () => {
    if (!postgresAvailable) return;

    const pool = db.client as Pool;
    expect(pool.listenerCount('error')).toBeGreaterThan(0);

    // With no listener this emit would throw as an unhandled 'error' event,
    // which in production terminates the process.
    expect(() => {
      pool.emit(
        'error',
        new Error('simulated backend disconnect'),
        {} as never,
      );
    }).not.toThrow();

    const stillWorks = await db.query('SELECT 1 AS ok');
    expect(stillWorks.rows[0].ok).toBe(1);
  });

  // Issue #1112
  it('returns the pooled client when COMMIT fails', async () => {
    if (!postgresAvailable || !db.beginTransaction) return;

    const table = `commit_fail_${randomUUID().replace(/-/g, '')}`;
    await db.query(
      `CREATE TABLE ${table} (
         id int primary key,
         u  int UNIQUE DEFERRABLE INITIALLY DEFERRED
       )`,
    );

    const pool = db.client as Pool;

    // A deferred UNIQUE violation is not detected until COMMIT, so this is a
    // COMMIT that genuinely throws rather than one Postgres downgrades to a
    // silent rollback.
    const tx = await db.beginTransaction();
    await tx.query(`INSERT INTO ${table} (id, u) VALUES (1, 7)`);
    await tx.query(`INSERT INTO ${table} (id, u) VALUES (2, 7)`);
    await expect(tx.commit()).rejects.toThrow(/duplicate key value/);

    expect(tx.isActive()).toBe(false);
    expect(pool.waitingCount).toBe(0);

    // The real symptom of the leak: with max: 3, four more failed commits used
    // to check out every connection permanently and hang all later queries.
    for (let i = 0; i < 4; i++) {
      const leaky = await db.beginTransaction();
      await leaky.query(`INSERT INTO ${table} (id, u) VALUES (${10 + i}, 99)`);
      await leaky.query(`INSERT INTO ${table} (id, u) VALUES (${20 + i}, 99)`);
      await expect(leaky.commit()).rejects.toThrow(/duplicate key value/);
    }

    const after = await Promise.race([
      db.query('SELECT 1 AS ok').then((r) => r.rows[0].ok),
      new Promise((resolve) =>
        setTimeout(() => resolve('pool exhausted'), 5000),
      ),
    ]);
    expect(after).toBe(1);

    await db.query(`DROP TABLE IF EXISTS ${table}`);
  });

  // Issue #1112
  it('rejects a second commit/rollback after the transaction already ended', async () => {
    if (!postgresAvailable || !db.beginTransaction) return;

    const tx = await db.beginTransaction();
    await tx.commit();
    expect(tx.isActive()).toBe(false);
    await expect(tx.commit()).rejects.toThrow('Transaction already ended');
    await expect(tx.rollback()).rejects.toThrow('Transaction already ended');
  });

  // Issue #1112
  it("preserves the caller's error when ROLLBACK also fails", async () => {
    if (!postgresAvailable || !db.transaction) return;

    let caught: Error | undefined;
    try {
      await db.transaction(async (tx) => {
        // Kill the backend so the adapter's ROLLBACK cannot succeed.
        await tx
          .query('SELECT pg_terminate_backend(pg_backend_pid())')
          .catch(() => undefined);
        throw new Error('__ORIGINAL_CALLER_ERROR__');
      });
    } catch (error) {
      caught = error as Error;
    }

    expect(caught?.message).toBe('__ORIGINAL_CALLER_ERROR__');
    // The rollback failure is preserved as context rather than replacing the
    // error the caller actually needs to see.
    expect(caught?.cause).toBeDefined();
  });
});
