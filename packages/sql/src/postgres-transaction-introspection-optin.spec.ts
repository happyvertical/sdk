import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type {
  DatabaseInterface,
  IntrospectableTransactions,
} from './shared/types';

/**
 * Real-PostgreSQL twin of transaction-introspection-optin.spec.ts (#1560).
 *
 * smrt core branches on `tx.getTableSchema?.(...)`. 0.116.0-0.116.3 exposed
 * it on every `pg` transaction handle, which reordered core's foreign-key
 * preflight (type guard before the orphan probe) and replaced core's own
 * catalog reader, whose index shape (`columns: ['order']` plus `where`)
 * differs from the SDK inspector's (`columns: ['"order" DESC']`, no `where`).
 * The PGlite spec cannot catch a regression in the `pg` adapter
 * (postgres.ts), so this one runs in `test:postgres` against a real server.
 */

type Db = DatabaseInterface & IntrospectableTransactions;

const url = process.env.SQLOO_URL ?? process.env.DATABASE_URL;

function options() {
  return {
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    dbid: randomUUID(),
  };
}

const open: Db[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.().catch(() => {});
});

function transactionOf(db: Db): NonNullable<Db['transaction']> {
  if (!db.transaction) throw new Error('adapter does not expose transaction()');
  return db.transaction.bind(db);
}

async function make(): Promise<{ db: Db; parent: string; child: string }> {
  const db = (await getDatabase(options())) as Db;
  open.push(db);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  return {
    db,
    parent: `optin_parent_${suffix}`,
    child: `optin_child_${suffix}`,
  };
}

async function createFixture(
  tx: DatabaseInterface,
  parent: string,
  child: string,
) {
  await tx.query(`CREATE TABLE ${parent} (id uuid PRIMARY KEY)`);
  await tx.query(`CREATE TABLE ${child} (id uuid PRIMARY KEY, parent_id text)`);
}

describe.skipIf(!url)('PostgreSQL transaction getTableSchema is opt-in', () => {
  it('is absent on default transaction handles, present on the root', async () => {
    const { db, parent, child } = await make();
    expect(typeof db.getTableSchema).toBe('function');

    await expect(
      transactionOf(db)(async (tx) => {
        await createFixture(tx, parent, child);
        expect(tx.getTableSchema).toBeUndefined();
        expect('getTableSchema' in tx).toBe(false);
        await tx.transaction?.(async (inner) => {
          expect(inner.getTableSchema).toBeUndefined();
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    const handle = await db.beginTransaction();
    try {
      expect(handle.getTableSchema).toBeUndefined();
      expect('getTableSchema' in handle).toBe(false);
    } finally {
      await handle.rollback();
    }
  });

  it('introspects uncommitted tables on its own transaction when opted in', async () => {
    const { db, parent, child } = await make();

    await expect(
      transactionOf(db)(
        async (tx) => {
          await createFixture(tx, parent, child);
          const childSchema = await tx.getTableSchema?.(child);
          const parentSchema = await tx.getTableSchema?.(parent);
          expect(childSchema?.columns.parent_id?.type).toBe('text');
          expect(parentSchema?.columns.id?.type).toBe('uuid');
          await tx.transaction?.(async (inner) => {
            expect((await inner.getTableSchema?.(child))?.tableName).toBe(
              child,
            );
          });
          throw new Error('rollback');
        },
        { introspection: true },
      ),
    ).rejects.toThrow('rollback');
    // The opted-in reads ran on the transaction: nothing leaked.
    expect(await db.tableExists(child)).toBe(false);

    const handle = await db.beginTransaction({ introspection: true });
    try {
      await createFixture(handle, parent, child);
      expect((await handle.getTableSchema?.(child))?.columns).toHaveProperty(
        'parent_id',
      );
    } finally {
      await handle.rollback();
    }
  });
});
