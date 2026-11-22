import { describe, expect, it } from 'vitest';
import { getDatabase, type TransactionHandle } from './index';

/**
 * Native SQLite (`capabilities`) transaction handles do not carry the root's
 * `close`: closing belongs to the root, and no other adapter's transaction
 * handles expose it (sdk#1249).
 */

async function openNative() {
  return getDatabase({
    type: 'sqlite',
    url: ':memory:',
    cache: false,
    capabilities: { vector: true },
  });
}

describe('native SQLite transaction handles', () => {
  it('callback and savepoint handles have no close and stay usable', async () => {
    const db = await openNative();
    try {
      await db.query('CREATE TABLE nc (id INTEGER PRIMARY KEY)');
      await db.transaction?.(async (tx) => {
        expect(tx.close).toBeUndefined();
        expect('close' in tx).toBe(false);
        await tx.query('INSERT INTO nc (id) VALUES (1)');
        await tx.transaction?.(async (inner) => {
          expect(inner.close).toBeUndefined();
          await inner.query('INSERT INTO nc (id) VALUES (2)');
        });
      });
      const rows = await db.query('SELECT id FROM nc ORDER BY id');
      expect(rows.rows.map((r) => Number(r.id))).toEqual([1, 2]);
    } finally {
      await db.close?.();
    }
  });

  it('beginTransaction() handles have no close; the root still closes', async () => {
    const db = await openNative();
    const handle = (await db.beginTransaction?.()) as TransactionHandle;
    expect(handle.close).toBeUndefined();
    await handle.query('SELECT 1');
    await handle.rollback();
    expect(typeof db.close).toBe('function');
    await db.query('SELECT 1');
    await db.close?.();
  });
});
