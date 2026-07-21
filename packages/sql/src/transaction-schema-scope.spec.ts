import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/** `transaction` is optional on DatabaseInterface, so narrow rather than assert. */
function txOf(db: DatabaseInterface) {
  const fn = db.transaction;
  if (!fn) throw new Error('adapter does not expose transaction()');
  return fn.bind(db);
}

function tableExistsOf(db: DatabaseInterface) {
  const fn = db.tableExists;
  if (!fn) throw new Error('adapter does not expose tableExists()');
  return fn.bind(db);
}

function syncSchemaOf(db: DatabaseInterface) {
  const fn = db.syncSchema;
  if (!fn) throw new Error('adapter does not expose syncSchema()');
  return fn.bind(db);
}

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
 * Issue #1111 — the PostgreSQL transaction-scoped interfaces re-exposed the
 * outer `tableExists` and `syncSchema`, both of which close over the *pool*.
 * Calling either on a `tx` therefore ran it on a different connection, outside
 * the transaction: `tx.tableExists()` could not see a table created moments
 * earlier in the same transaction, and `tx.syncSchema()` committed its DDL
 * immediately, so rolling the transaction back did not undo the migration.
 *
 * The single-connection adapters got this right by accident — they have only
 * one connection to run on. These tests pin the contract as identical
 * everywhere, so an adapter cannot answer the same question differently.
 */
describe('transaction-scoped schema methods stay inside the transaction', () => {
  describe('postgres', () => {
    let postgresAvailable = false;
    let db: Awaited<ReturnType<typeof getDatabase>>;
    let table: string;

    beforeEach(async () => {
      postgresAvailable = await checkPostgreSQLConnection();
      if (!postgresAvailable) {
        console.log('PostgreSQL not available, skipping test');
        return;
      }
      db = await getDatabase(
        postgresTestOptions({ dbid: randomUUID(), max: 4 }),
      );
      table = `txscope_${randomUUID().replace(/-/g, '')}`;
    });

    afterEach(async () => {
      if (!postgresAvailable || !db) return;
      await db.query(`DROP TABLE IF EXISTS ${table}`);
      await db.client.end();
    });

    it('tableExists() sees a table created in the same transaction', async () => {
      if (!postgresAvailable) return;

      const seen = await txOf(db)(async (tx) => {
        await tx.query(`CREATE TABLE ${table} (id int primary key)`);
        // Before the fix this ran on a pooled connection that could not see
        // the uncommitted DDL, and returned false.
        return tableExistsOf(tx)(table);
      });

      expect(seen).toBe(true);
    }, 30000);

    it('tableExists() does not see a table whose transaction rolled back', async () => {
      if (!postgresAvailable) return;

      await expect(
        txOf(db)(async (tx) => {
          await tx.query(`CREATE TABLE ${table} (id int primary key)`);
          expect(await tableExistsOf(tx)(table)).toBe(true);
          throw new Error('__rollback__');
        }),
      ).rejects.toThrow('__rollback__');

      expect(await tableExistsOf(db)(table)).toBe(false);
    }, 30000);

    it('syncSchema() DDL is undone when the transaction rolls back', async () => {
      if (!postgresAvailable) return;

      await expect(
        txOf(db)(async (tx) => {
          await syncSchemaOf(tx)(
            `CREATE TABLE ${table} (id TEXT PRIMARY KEY, name TEXT)`,
          );
          throw new Error('__migration_failed__');
        }),
      ).rejects.toThrow('__migration_failed__');

      // Before the fix the DDL had already committed on a different
      // connection, so a failed migration stayed half-applied.
      expect(await tableExistsOf(db)(table)).toBe(false);
    }, 30000);

    it('syncSchema() DDL persists when the transaction commits', async () => {
      if (!postgresAvailable) return;

      await txOf(db)(async (tx) => {
        await syncSchemaOf(tx)(
          `CREATE TABLE ${table} (id TEXT PRIMARY KEY, name TEXT)`,
        );
      });

      expect(await tableExistsOf(db)(table)).toBe(true);
    }, 30000);
  });

  // The single-connection adapters have no second connection to escape onto,
  // so these assertions are here to keep the contract from drifting apart
  // again rather than to fix a defect in them.
  for (const type of ['sqlite', 'duckdb', 'json'] as const) {
    describe(type, () => {
      it('tableExists() sees a table created in the same transaction', async () => {
        const db = await getDatabase({ type, url: ':memory:' });
        // These adapters cache their in-memory connection, so a table name
        // reused across runs would be answered from the previous run's state.
        const t = `txscope_seen_${type}_${randomUUID().replace(/-/g, '')}`;

        const seen = await txOf(db)(async (tx) => {
          await tx.query(`CREATE TABLE ${t} (id INTEGER PRIMARY KEY)`);
          return tableExistsOf(tx)(t);
        });

        expect(seen).toBe(true);
      });
    });
  }

  // Not json: its `syncSchema` also writes `<table>.json` and
  // `<table>.schema.sql` to disk, and those files are outside the engine's
  // transaction. The DuckDB catalog entry is rolled back, but a later
  // connection re-registers the table from the leftover files, so "the DDL was
  // undone" is only true of the half the transaction actually owns.
  for (const type of ['sqlite', 'duckdb'] as const) {
    describe(type, () => {
      it('syncSchema() DDL is undone when the transaction rolls back', async () => {
        const db = await getDatabase({ type, url: ':memory:' });
        const t = `txscope_rollback_${type}_${randomUUID().replace(/-/g, '')}`;

        await expect(
          txOf(db)(async (tx) => {
            await syncSchemaOf(tx)(
              `CREATE TABLE ${t} (id TEXT PRIMARY KEY, name TEXT)`,
            );
            throw new Error('__migration_failed__');
          }),
        ).rejects.toThrow('__migration_failed__');

        expect(await tableExistsOf(db)(t)).toBe(false);
      });
    });
  }
});
