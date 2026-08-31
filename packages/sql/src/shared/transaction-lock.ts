import { DatabaseError } from '@happyvertical/utils';

/**
 * How long a queued transaction waits for the connection before giving up.
 *
 * A transaction that legitimately runs longer than this will make the ones
 * behind it fail rather than stall indefinitely. Raise it with the adapter's
 * `transactionQueueTimeout` option if that is the wrong trade for a workload.
 */
export const DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS = 30_000;

/**
 * Serializes transactions on a connection that cannot hold more than one.
 */
export interface TransactionLock {
  /** Whether one caller currently owns the connection. */
  readonly held: boolean;

  /**
   * Takes the connection and returns the function that gives it back.
   *
   * Calling the returned function more than once is a no-op, so a teardown
   * path that runs twice cannot hand the connection to two callers at once.
   */
  acquire(): Promise<() => void>;

  /**
   * Runs `work` with exclusive use of the connection, releasing it however
   * `work` finishes.
   */
  run<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Creates a lock that serializes transactions on one connection.
 *
 * SQLite, DuckDB and the JSON adapter each drive a single connection, and a
 * connection can only be in one transaction at a time. `transaction()` used to
 * issue `BEGIN` on that shared connection with no serialization and no record
 * of whether one was already open, so two overlapping calls corrupted each
 * other: the second `BEGIN` threw, its `catch` ran `ROLLBACK`, and that
 * rollback landed on the *first* transaction — committing part of its work,
 * discarding the rest, and rejecting its promise. Nesting was not required;
 * two concurrent requests were enough, which made it reachable from any server
 * handling more than one at a time.
 *
 * The lock spans the whole `BEGIN` … `COMMIT`/`ROLLBACK` sequence, so a queued
 * transaction starts only once the previous one has ended. It is a
 * promise-chain mutex, the same shape as the `withNullAwareUpsertLock` the
 * SQLite adapter already used for the narrower upsert case.
 *
 * Re-entrant calls must not come through here. A nested `tx.transaction()`
 * arrives via the transaction-scoped interface, which re-enters under a
 * `SAVEPOINT` (SQLite) or refuses (DuckDB, JSON) without ever reaching the
 * top-level `transaction()`; routing one here instead would make it wait on a
 * lock its own caller is holding.
 *
 * @param adapter - Adapter name, for the timeout error
 * @param timeoutMs - Ceiling on how long to wait for a turn
 */
export function createTransactionLock(
  adapter: string,
  timeoutMs: number = DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS,
): TransactionLock {
  // The timer is measured from enqueue, not from when the lock frees, so this
  // bounds the total wait rather than any one holder. A caller that expects
  // sustained bursts on one connection should raise it: a hundred queued
  // 400ms transactions exceed 30s even though none of them is stuck.
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new DatabaseError(
      'transactionQueueTimeout must be a positive, finite number of milliseconds',
      { adapter, timeoutMs },
    );
  }
  // Resolves when the transaction currently holding the connection ends.
  let tail: Promise<void> = Promise.resolve();
  let held = false;

  const acquire = async (): Promise<() => void> => {
    const previous = tail;
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Publish our turn before awaiting, so a caller that arrives while we are
    // suspended queues behind us rather than racing us for the connection.
    tail = previous.then(
      () => current,
      () => current,
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new DatabaseError(
              `Timed out after ${timeoutMs}ms waiting for the ${adapter} connection's current transaction to finish. This connection runs one transaction at a time. Usually one of: a beginTransaction() handle that was never committed or rolled back; a top-level db.* call that opens its own transaction being made inside a transaction callback, which waits on the connection its own caller holds (use the tx-scoped method instead); or simply more queued transactions than transactionQueueTimeout allows for.`,
              { adapter, timeoutMs },
            ),
          );
        }, timeoutMs);
        previous.then(resolve, resolve);
      });
    } catch (error) {
      // Drop out of the queue rather than wedge it: `tail` still chains through
      // `current`, so resolving it lets the callers behind us take their turn.
      release();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    let released = false;
    held = true;
    return () => {
      if (released) return;
      released = true;
      held = false;
      release();
    };
  };

  const run = async <T>(work: () => Promise<T>): Promise<T> => {
    const release = await acquire();
    try {
      return await work();
    } finally {
      release();
    }
  };

  return {
    acquire,
    get held() {
      return held;
    },
    run,
  };
}
