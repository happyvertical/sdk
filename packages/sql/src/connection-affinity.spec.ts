import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { claimConnectionAffinity } from './shared/connection-affinity';
import { CONNECTION_AFFINITY, getConnectionAffinity } from './shared/types';

/**
 * Connection-affinity claims (#1567). The PostgreSQL adapter's handles are
 * covered against a real server in postgres-session-database.spec.ts; this
 * file pins the claim's shape and identity rule in-process.
 */
describe('connection-affinity claim', () => {
  it('uses the global symbol key', () => {
    expect(CONNECTION_AFFINITY).toBe(
      Symbol.for('@happyvertical/sql/connection-affinity'),
    );
  });

  it('stamps a frozen, non-enumerable, non-writable claim naming the handle', () => {
    const handle = claimConnectionAffinity({ query: () => {} }, 'session');
    const descriptor = Object.getOwnPropertyDescriptor(
      handle,
      CONNECTION_AFFINITY,
    );
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
    expect(Object.isFrozen(descriptor?.value)).toBe(true);
    expect(getConnectionAffinity(handle)).toEqual({ kind: 'session', handle });
    expect(getConnectionAffinity(handle)?.handle).toBe(handle);
  });

  it('is not inherited by a spread copy, a proxy or a derived object', () => {
    const handle = claimConnectionAffinity({ query: () => {} }, 'transaction');
    expect(getConnectionAffinity({ ...handle })).toBeUndefined();
    expect(getConnectionAffinity(new Proxy(handle, {}))).toBeUndefined();
    expect(getConnectionAffinity(Object.create(handle))).toBeUndefined();
  });

  it('rejects a claim that names another object or an unknown kind', () => {
    const other = {};
    const forged = {
      [CONNECTION_AFFINITY]: Object.freeze({ kind: 'pool', handle: other }),
    };
    expect(getConnectionAffinity(forged)).toBeUndefined();
    const odd: Record<symbol, unknown> = {};
    odd[CONNECTION_AFFINITY] = { kind: 'cluster', handle: odd };
    expect(getConnectionAffinity(odd)).toBeUndefined();
    expect(getConnectionAffinity(null)).toBeUndefined();
    expect(getConnectionAffinity('db')).toBeUndefined();
  });

  it('is not set by the single-connection adapters', async () => {
    const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
    try {
      expect(getConnectionAffinity(db)).toBeUndefined();
    } finally {
      await db.close?.();
    }
  });
});
