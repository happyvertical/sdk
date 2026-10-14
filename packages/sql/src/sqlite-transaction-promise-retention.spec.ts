import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

function txOf(db: DatabaseInterface) {
  const fn = db.transaction;
  if (!fn) throw new Error('adapter does not expose transaction()');
  return fn.bind(db);
}

/**
 * Issue #1320 — while a SQLite transaction was open, the native promise
 * correlation hook allocated `new WeakRef(promise)` for every Promise created
 * in the process. V8 keeps the target of every WeakRef created during a
 * macrotask alive until that macrotask ends, and in-memory SQLite work never
 * yields one, so a long chain of transactional work pinned every promise it
 * created until the heap was exhausted.
 *
 * These tests drive many sequential queries and awaits inside transactions
 * without yielding a macrotask, then assert the tracking allocates no
 * per-promise WeakRefs and leaves completed promises collectable.
 */
describe('SQLite transaction promise tracking retention (#1320)', () => {
  const NativeWeakRef = globalThis.WeakRef;
  let db: DatabaseInterface | undefined;

  afterEach(async () => {
    globalThis.WeakRef = NativeWeakRef;
    await db?.close?.();
    db = undefined;
  });

  async function openDb(): Promise<DatabaseInterface> {
    db = await getDatabase({ type: 'sqlite', url: ':memory:', cache: false });
    await db.query('CREATE TABLE retention (x INTEGER)');
    return db;
  }

  async function runTransactions(
    database: DatabaseInterface,
    transactions: number,
    awaitsPerTransaction: number,
  ): Promise<void> {
    for (let i = 0; i < transactions; i += 1) {
      await txOf(database)(async (tx) => {
        await tx.query('INSERT INTO retention VALUES (1)');
        for (let j = 0; j < awaitsPerTransaction; j += 1) {
          await Promise.resolve(j);
        }
        await tx.query('INSERT INTO retention VALUES (2)');
      });
    }
  }

  it('does not allocate a WeakRef per promise created inside a transaction', async () => {
    const database = await openDb();
    let constructed = 0;
    globalThis.WeakRef = class CountingWeakRef<
      T extends WeakKey,
    > extends NativeWeakRef<T> {
      constructor(target: T) {
        super(target);
        constructed += 1;
      }
    } as WeakRefConstructor;

    await runTransactions(database, 1, 10);
    const small = constructed;
    constructed = 0;
    await runTransactions(database, 20, 500);
    const large = constructed;
    globalThis.WeakRef = NativeWeakRef;

    // ~10,000 promises were created in the large run. Tracking must not scale
    // its WeakRef allocations with that count.
    expect(large).toBeLessThanOrEqual(small * 20);
    expect(large).toBeLessThan(100);
    expect(await database.count('retention')).toBe(42);
  });

  it('leaves completed transactional promises collectable before the macrotask ends', async () => {
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const database = await openDb();
    let finalized = 0;
    const registry = new FinalizationRegistry(() => {
      finalized += 1;
    });
    const tracked = 2_000;

    // Everything below runs in one macrotask: SQLite :memory: queries and
    // awaited promises settle on the microtask queue.
    await txOf(database)(async (tx) => {
      await tx.query('INSERT INTO retention VALUES (1)');
      for (let j = 0; j < tracked; j += 1) {
        const promise = Promise.resolve(j);
        registry.register(promise, j);
        await promise;
      }
    });
    gc();

    // Finalization callbacks run in a later task. Under the WeakRef tracking
    // every promise above survived gc() because it was pinned for the whole
    // macrotask; now completed promises are collected by that gc() call.
    for (let attempt = 0; attempt < 50 && finalized === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(finalized).toBeGreaterThan(tracked / 2);
  });
});
