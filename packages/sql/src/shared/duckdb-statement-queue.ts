import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The `@duckdb/node-api` connection methods this package drives, each of which
 * fully materializes its result before the returned promise settles.
 *
 * Streaming methods (`runAndRead`, `stream`, `prepare`, ...) keep the native
 * query open after their promise resolves, so wrapping their promise cannot
 * serialize them; this package does not use them, and callers reaching them
 * through `db.client` own their own ordering.
 */
const SERIALIZED_METHODS = ['run', 'runAndReadAll'] as const;

/**
 * Serializes every statement issued on one DuckDB connection (#1231).
 *
 * A `DuckDBConnection` cannot have two statements in flight: starting a second
 * one invalidates the first, which then rejects with the bindings' bare
 * `Failed to execute prepared statement` and no DuckDB message. The DuckDB and
 * JSON adapters share one connection across every call on a handle, and their
 * transaction lock covers only `BEGIN` … `COMMIT`, so any two overlapping
 * `db.*` calls — two reads, or a read beside a transaction body — could abort
 * each other.
 *
 * The queue is per statement, not per transaction. A transaction body's
 * statements and the `BEGIN`/`COMMIT` around them each take one turn, so a
 * statement issued from inside a `transaction()` callback never waits on a
 * lock its own caller holds. This fixes only the native collision: a top-level
 * statement issued while another caller's transaction is open still runs on
 * the connection inside that transaction, as it did before. (SQLite and PGlite
 * make such a statement wait for the transaction instead.)
 *
 * @param connection - A connected `DuckDBConnection`
 * @returns The same connection object, with `run`/`runAndReadAll` queued FIFO
 */
export function serializeDuckDBStatements<T extends object>(connection: T): T {
  // Settles (never rejects) when the statement now on the connection finishes.
  let tail: Promise<unknown> = Promise.resolve();
  // Set while a statement holds its turn. `runAndReadAll` calls `this.run`,
  // and a caller may wrap `client.run` around the method it captured; both
  // re-enter from inside the turn and must not queue behind it.
  const inTurn = new AsyncLocalStorage<true>();
  const target = connection as Record<PropertyKey, unknown>;
  for (const name of SERIALIZED_METHODS) {
    const native = target[name];
    if (typeof native !== 'function') continue;
    Object.defineProperty(connection, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: (...args: unknown[]) => {
        if (inTurn.getStore()) return native.apply(connection, args);
        const turn = tail.then(() =>
          inTurn.run(true, () => native.apply(connection, args)),
        );
        // A failed statement must not wedge the ones queued behind it.
        tail = turn.catch(() => undefined);
        return turn;
      },
    });
  }
  return connection;
}
