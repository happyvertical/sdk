import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * Issue #1129, PostgreSQL half — see `insert-column-binding.spec.ts` for the
 * defect. PostgreSQL has three separate insert implementations that all bound
 * values by the record's own key order: the top-level one, the tx-scoped
 * interface handed to `transaction()`, and the `beginTransaction()` handle.
 * Each is covered here; a fix applied to only one of them would leave the
 * others corrupting data.
 */

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

/** `transaction`/`beginTransaction` are optional, so narrow rather than assert. */
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

describe('postgres batch insert column binding', () => {
  let postgresAvailable = false;
  let db: DatabaseInterface;
  let table: string;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) {
      console.log('PostgreSQL not available, skipping test');
      return;
    }
    db = await getDatabase(postgresTestOptions({ dbid: randomUUID(), max: 4 }));
    table = `bind_${randomUUID().replace(/-/g, '')}`;
    await db.query(`CREATE TABLE ${table} (name text, role text, note text)`);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;
    await db.query(`DROP TABLE IF EXISTS ${table}`);
    await db.client.end();
  });

  const reordered = () => [
    { name: 'alice', role: 'user', note: 'first' },
    // Same keys, different insertion order. Bound positionally this stored
    // { name: 'admin', role: 'second', note: 'mallory' }.
    { role: 'admin', note: 'second', name: 'mallory' },
  ];

  const expectRowsCorrect = async () => {
    const rows = await db.query(
      `SELECT name, role, note FROM ${table} ORDER BY note`,
    );
    expect(rows.rows).toEqual([
      { name: 'alice', role: 'user', note: 'first' },
      { name: 'mallory', role: 'admin', note: 'second' },
    ]);
  };

  it('binds each value to its own column when a later record reorders its keys', async () => {
    if (!postgresAvailable) return;

    await db.insert(table, reordered());
    await expectRowsCorrect();
  }, 30000);

  it('binds correctly inside transaction()', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      await tx.insert(table, reordered());
    });
    await expectRowsCorrect();
  }, 30000);

  it('binds correctly through a beginTransaction() handle', async () => {
    if (!postgresAvailable) return;

    const tx = await beginOf(db)();
    await tx.insert(table, reordered());
    await tx.commit();
    await expectRowsCorrect();
  }, 30000);

  it('rejects a batch whose later record has an extra key', async () => {
    if (!postgresAvailable) return;

    await expect(
      db.insert(table, [
        { name: 'alice', role: 'user', note: 'first' },
        { name: 'mallory', role: 'user', note: 'second', extra: 'x' },
      ]),
    ).rejects.toThrow(/same keys.*record 1.*unexpected extra/s);

    // Validation runs before any SQL is built, so the batch is rejected whole
    // rather than partly applied.
    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('rejects a batch whose later record is missing a key', async () => {
    if (!postgresAvailable) return;

    await expect(
      db.insert(table, [
        { name: 'alice', role: 'user', note: 'first' },
        { name: 'mallory', note: 'second' },
      ]),
    ).rejects.toThrow(/same keys.*record 1.*missing role/s);

    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('rejects a ragged batch inside transaction() too', async () => {
    if (!postgresAvailable) return;

    await expect(
      txOf(db)(async (tx) => {
        await tx.insert(table, [
          { name: 'alice', role: 'user', note: 'first' },
          { name: 'mallory', note: 'second' },
        ]);
      }),
    ).rejects.toThrow(/same keys.*record 1.*missing role/s);

    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  // Each of the three postgres insert implementations got the validation and
  // the empty-batch guard independently, so each needs its own coverage —
  // otherwise removing either from this path passes every other test.
  it('rejects a ragged batch through a beginTransaction() handle too', async () => {
    if (!postgresAvailable) return;

    const tx = await beginOf(db)();
    try {
      await expect(
        tx.insert(table, [
          { name: 'alice', role: 'user', note: 'first' },
          { name: 'mallory', note: 'second' },
        ]),
      ).rejects.toThrow(/same keys.*record 1.*missing role/s);
    } finally {
      // The insert threw before any SQL was issued, so the handle is still
      // open; without this its pooled client is never released and the
      // afterEach `client.end()` hangs.
      await tx.rollback();
    }

    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('accepts an empty batch as a no-op', async () => {
    if (!postgresAvailable) return;

    const result = await db.insert(table, []);
    expect(result.affected).toBe(0);

    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('accepts an empty batch as a no-op inside transaction()', async () => {
    if (!postgresAvailable) return;

    await txOf(db)(async (tx) => {
      const result = await tx.insert(table, []);
      expect(result.affected).toBe(0);
    });

    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);

  it('accepts an empty batch as a no-op through a beginTransaction() handle', async () => {
    if (!postgresAvailable) return;

    const tx = await beginOf(db)();
    try {
      const result = await tx.insert(table, []);
      expect(result.affected).toBe(0);
    } finally {
      await tx.rollback();
    }

    const rows = await db.query(`SELECT name FROM ${table}`);
    expect(rows.rows).toHaveLength(0);
  }, 30000);
});
