/**
 * The root entry must never load `@electric-sql/pglite`; the peer loads only
 * when a pglite database is created. This file makes no pglite database before
 * the root-entry cases run.
 */

import { describe, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ pglite: 0 }));

vi.mock('@electric-sql/pglite', async (importOriginal) => {
  loads.pglite++;
  return importOriginal();
});

describe('optional peer isolation', () => {
  it('does not load the peer for the root entry or other adapters', async () => {
    const root = await import('./index');
    expect(typeof root.getDatabase).toBe('function');

    const sqlite = await root.getDatabase({ type: 'sqlite', url: ':memory:' });
    await sqlite.close?.();
    expect(loads.pglite).toBe(0);
  });

  it('does not load the peer when the adapter module is imported', async () => {
    const adapter = await import('./pglite');
    expect(typeof adapter.getDatabase).toBe('function');
    expect(loads.pglite).toBe(0);
  });

  it('loads the peer on first use', async () => {
    const { getDatabase } = await import('./index');
    const db = await getDatabase({ type: 'pglite' });
    try {
      expect(loads.pglite).toBe(1);
      expect((await db.query('SELECT 1 AS one')).rows).toEqual([{ one: 1 }]);
    } finally {
      await db.close?.();
    }
  });
});
