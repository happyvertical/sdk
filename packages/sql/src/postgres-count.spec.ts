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
 * Companion to `count.spec.ts` — see #1128. The no-`where` branch of `count()`
 * was only ever exercised against the JSON adapter, which is how the LibSQL
 * implementation shipped binding the table name as a parameter. PostgreSQL
 * defines `count()` three separate times (top level, the transaction-scoped
 * `txDb`, and the `txHandle` returned by `beginTransaction`), so each is
 * pinned here rather than assumed equivalent.
 */
describe('postgres count() without a where clause', () => {
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
    table = `count_${randomUUID().replace(/-/g, '')}`;
    await db.query(`CREATE TABLE ${table} (id int primary key, v text)`);
    for (let i = 1; i <= 4; i++) {
      await db.query(`INSERT INTO ${table} VALUES (${i}, 'v${i % 2}')`);
    }
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;
    await db.query(`DROP TABLE IF EXISTS ${table}`);
    await db.client.end();
  });

  it('counts every row in the table', async () => {
    if (!postgresAvailable || !db) return;
    expect(await db.count(table)).toBe(4);
  });

  it('counts every row when given an empty where object', async () => {
    if (!postgresAvailable || !db) return;
    expect(await db.count(table, {})).toBe(4);
  });

  it('returns 0 for an empty table', async () => {
    if (!postgresAvailable || !db) return;
    const empty = `count_empty_${randomUUID().replace(/-/g, '')}`;
    await db.query(`CREATE TABLE ${empty} (id int primary key)`);
    try {
      expect(await db.count(empty)).toBe(0);
    } finally {
      await db.query(`DROP TABLE IF EXISTS ${empty}`);
    }
  });

  it('still counts a filtered subset', async () => {
    if (!postgresAvailable || !db) return;
    expect(await db.count(table, { v: 'v1' })).toBe(2);
  });

  it('counts inside transaction()', async () => {
    if (!postgresAvailable || !db) return;
    const seen = await txOf(db)(async (tx) => {
      await tx.query(`INSERT INTO ${table} VALUES (5, 'v1')`);
      return tx.count(table);
    });
    // Reads the transaction's own uncommitted insert, so this exercises the
    // transaction-scoped implementation rather than falling through to the
    // pooled one.
    expect(seen).toBe(5);
  });

  it('counts inside beginTransaction()', async () => {
    if (!postgresAvailable || !db) return;
    const begin = db.beginTransaction;
    if (!begin) throw new Error('adapter does not expose beginTransaction()');
    const tx = await begin.call(db);
    try {
      await tx.query(`INSERT INTO ${table} VALUES (6, 'v0')`);
      expect(await tx.count(table)).toBe(5);
    } finally {
      await tx.rollback();
    }
  });
});
