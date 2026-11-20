import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type {
  DatabaseInterface,
  IntrospectableTransactions,
} from './shared/types';

/**
 * 0.115 compatibility: PostgreSQL and PGlite transaction handles have no
 * `getTableSchema` unless the transaction opts in. smrt core's SchemaManager
 * branches on `this.db.getTableSchema?.(...)`: with it absent the foreign-key
 * preflight skips its live column-type guard and goes straight to the orphan
 * probe, so a legacy text/uuid mismatch reports "existing rows do not match";
 * with it present the type guard throws "incompatible column types" first.
 */

const open: DatabaseInterface[] = [];
afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.().catch(() => {});
});

describe('PGlite transaction getTableSchema is opt-in', () => {
  async function make() {
    const db = await getDatabase({ type: 'pglite' });
    open.push(db);
    await db.query('CREATE TABLE t (id integer PRIMARY KEY)');
    return db as DatabaseInterface & IntrospectableTransactions;
  }

  it('is absent on a default transaction handle, present on the root', async () => {
    const db = await make();
    expect(typeof db.getTableSchema).toBe('function');
    await db.transaction((tx) => {
      expect(tx.getTableSchema).toBeUndefined();
      expect('getTableSchema' in tx).toBe(false);
      return Promise.resolve();
    });
    const handle = await db.beginTransaction();
    try {
      expect(handle.getTableSchema).toBeUndefined();
    } finally {
      await handle.rollback();
    }
  });

  it('is present when the transaction opts in, including nested scopes', async () => {
    const db = await make();
    await db.transaction(
      async (tx) => {
        expect((await tx.getTableSchema?.('t'))?.tableName).toBe('t');
        await tx.transaction?.(async (inner) => {
          expect(typeof inner.getTableSchema).toBe('function');
        });
      },
      { introspection: true },
    );
    const handle = await db.beginTransaction({ introspection: true });
    try {
      expect((await handle.getTableSchema?.('t'))?.tableName).toBe('t');
    } finally {
      await handle.rollback();
    }
  });
});
