import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type DatabaseInterface,
  describeHandle,
  getDatabase,
  isDatabaseRoot,
  isTransactionHandle,
  type SessionHandle,
  type TransactionHandle,
} from './index';

/**
 * Handle roles on a real PostgreSQL server (sdk#1249): the pinned session
 * database is a session, not a root; its transaction handles are marked; and
 * a pool root does not see another connection's uncommitted row
 * (`rootReads: 'isolated'`). Runs in the `test:postgres` lane.
 */

function options(overrides: Record<string, unknown> = {}) {
  return {
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    dbid: randomUUID(),
    ...overrides,
  };
}

async function postgresReachable(): Promise<boolean> {
  try {
    const probe = await getDatabase(options({ max: 1 }));
    try {
      await probe.query('SELECT 1');
    } finally {
      await probe.close?.();
    }
    return true;
  } catch {
    return false;
  }
}

const available = await postgresReachable();
if (!available && process.env.TEST_DB_ADAPTER === 'postgres') {
  throw new Error('test:postgres requires a reachable PostgreSQL server');
}

const opened: DatabaseInterface[] = [];
const sessions: SessionHandle[] = [];

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    await session.release().catch(() => {});
  }
  for (const db of opened.splice(0)) {
    await db.close?.().catch(() => {});
  }
});

async function open() {
  const db = await getDatabase(options());
  opened.push(db);
  return db;
}

describe.skipIf(!available)('PostgreSQL handle roles', () => {
  it('a session database is a session, and its transaction handles are marked', async () => {
    const db = await open();
    const session = (await db.acquireSession?.()) as SessionHandle;
    sessions.push(session);
    const sessionDb = session.database?.() as DatabaseInterface;
    expect(describeHandle(sessionDb)).toMatchObject({
      role: 'session',
      engine: 'postgres',
      rootReads: 'serialized',
    });
    expect(describeHandle(sessionDb).owner).toBeDefined();
    expect(describeHandle(sessionDb).owner).toBe(describeHandle(db).owner);
    expect(isDatabaseRoot(sessionDb)).toBe(false);
    expect(isTransactionHandle(sessionDb)).toBe(false);
    // Copies of a session are neither sessions nor roots.
    for (const copy of [
      { ...sessionDb },
      Object.create(sessionDb),
      new Proxy(sessionDb, {}),
      Object.defineProperties({}, Object.getOwnPropertyDescriptors(sessionDb)),
    ]) {
      expect(describeHandle(copy)).toEqual({ role: 'unknown' });
      expect(isDatabaseRoot(copy)).toBe(false);
    }

    await sessionDb.transaction?.(async (tx) => {
      expect(describeHandle(tx)).toMatchObject({
        role: 'transaction',
        transactionKind: 'callback',
        engine: 'postgres',
      });
      expect(describeHandle(tx).owner).toBe(describeHandle(db).owner);
      await tx.transaction?.(async (inner) => {
        expect(inner).toBe(tx);
      });
    });

    const manual = (await sessionDb.beginTransaction?.()) as TransactionHandle;
    expect(describeHandle(manual)).toMatchObject({
      role: 'transaction',
      transactionKind: 'manual',
    });
    await manual.rollback();
    expect(isTransactionHandle(manual)).toBe(true);
  });

  it('a pool root does not see an open transaction’s uncommitted row', async () => {
    const db = await open();
    expect(describeHandle(db).rootReads).toBe('isolated');
    const table = `prov_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await db.query(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY)`);
    let handle: TransactionHandle | undefined;
    try {
      handle = (await db.beginTransaction?.()) as TransactionHandle;
      expect(describeHandle(handle).transactionKind).toBe('manual');
      await handle.query(`INSERT INTO ${table} (id) VALUES (1)`);
      const seen = await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      expect(seen.rows[0].n).toBe(0);
    } finally {
      // End the transaction before the drop, or the drop waits on its lock.
      if (handle?.isActive()) await handle.rollback();
      await db.query(`DROP TABLE ${table}`);
    }
  });
});
