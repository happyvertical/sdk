import { AsyncLocalStorage } from 'node:async_hooks';
import { webcrypto } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import {
  DatabaseError as PgDatabaseError,
  type QueryResult as PgQueryResult,
  Pool,
  type PoolClient,
  type QueryConfig,
} from 'pg';
import { DatabaseSchemaManager } from './schema-manager';
import { claimConnectionAffinity } from './shared/connection-affinity';
import {
  ConnectionCache,
  validateDatabaseCacheOptions,
} from './shared/connection-cache';
import {
  createAlterTable,
  createPostgresDialect,
  createTransactionErrorTracker,
  createVectorCapabilities,
  type NestedScope,
  normalizePostgresRawQuery,
  type PostgresQueryExecutor,
} from './shared/postgres-dialect';
import { DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS } from './shared/transaction-lock';
import type {
  DatabaseCacheOptions,
  DatabaseInterface,
  ReopenOptions,
  SchemaInitializationOptions,
  SessionHandle,
  TransactionHandle,
  TransactionOptions,
} from './shared/types';
import { wrapDatabaseError } from './shared/utils';

/** Default pool size of a reopened PostgreSQL connection. */
const REOPEN_POOL_MAX = 5;

const MAX_TIMER_DELAY_MILLIS = 2_147_483_647;

/**
 * Configuration options for PostgreSQL database connections
 */
export interface PostgresOptions extends DatabaseCacheOptions {
  /**
   * Connection URL for PostgreSQL
   */
  url?: string;

  /**
   * Database name
   */
  database?: string;

  /**
   * Database server hostname
   */
  host?: string;

  /**
   * Username for authentication
   */
  user?: string;

  /**
   * Password for authentication
   */
  password?: string;

  /**
   * Port number for the PostgreSQL server
   */
  port?: number;

  /**
   * Opaque caller-owned cache identity for connection pooling.
   * If provided, the same dbid returns the same cached connection.
   * When omitted, a keyed digest is derived from effective connection and pool
   * options, including credentials, without retaining them in readable keys.
   */
  dbid?: string;

  /**
   * Maximum number of connections in the pool.
   * Defaults to 20. The pg library defaults to 10, which is too low
   * for applications with many SMRT collections.
   */
  max?: number;

  /**
   * Maximum time to wait for a pool connection, in milliseconds.
   * Must not exceed Node.js's maximum timer delay of 2,147,483,647.
   * Set to 0 to wait indefinitely. When omitted, pg's default is used.
   */
  connectionTimeoutMillis?: number;

  /**
   * Maximum time an idle client remains in the pool, in milliseconds.
   * Must not exceed Node.js's maximum timer delay of 2,147,483,647.
   * Set to 0 to retain idle clients. When omitted, pg's default is used.
   */
  idleTimeoutMillis?: number;

  /**
   * Schema definitions for tables.
   * Accepts a record or a lazy function (see SchemasOption).
   *
   * **Postgres ignores this option** — tables are managed by migrations.
   * The option exists so callers can pass schemas uniformly to all adapters
   * without knowing the adapter type. Only JSON/DuckDB adapters resolve it.
   */
  schemas?: import('./shared/types').SchemasOption;
}

/**
 * Module-level cache for PostgreSQL connections.
 * Keyed by dbid (or derived from connection URL).
 * Prevents creating multiple pg.Pool instances for the same database.
 */
declare global {
  // A non-extractable process-local HMAC key keeps password-bearing cache
  // identities resistant to offline guessing even if cache keys are inspected.
  // eslint-disable-next-line no-var
  var __haveSqlPostgresCacheHmacKey: Promise<CryptoKey> | undefined;
  // eslint-disable-next-line no-var
  var __haveSqlPostgresConnectionCache:
    | ConnectionCache<DatabaseInterface>
    | undefined;
}

globalThis.__haveSqlPostgresConnectionCache ??=
  new ConnectionCache<DatabaseInterface>();
const connectionCache = globalThis.__haveSqlPostgresConnectionCache;

/**
 * Returns the process-local cache identity HMAC key, generating it on first
 * use. Generating it at import would leave a WebCrypto key job in flight in
 * every isolate that loads the package, and Node aborts the whole process when
 * a worker thread is terminated while such a job completes (#1518).
 *
 * Concurrent first callers share one pending promise. The promise lives on
 * `globalThis` so every copy of this module in an isolate derives the same
 * cache identities. A rejected generation is dropped so the next call retries.
 */
function getPostgresCacheHmacKey(): Promise<CryptoKey> {
  const existing = globalThis.__haveSqlPostgresCacheHmacKey;
  if (existing) {
    return existing;
  }
  let pending: Promise<CryptoKey>;
  try {
    pending = webcrypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    ) as Promise<CryptoKey>;
  } catch (error) {
    pending = Promise.reject(error);
  }
  globalThis.__haveSqlPostgresCacheHmacKey = pending;
  pending.catch(() => {
    if (globalThis.__haveSqlPostgresCacheHmacKey === pending) {
      globalThis.__haveSqlPostgresCacheHmacKey = undefined;
    }
  });
  return pending;
}

/**
 * Clears the PostgreSQL connection cache.
 * Useful for test isolation and reconnection scenarios.
 */
export async function clearPostgresConnectionCache(): Promise<void> {
  await connectionCache.clear(closePostgresDatabase);
}

async function closePostgresDatabase(db: DatabaseInterface): Promise<void> {
  if (db.close) {
    await db.close();
    return;
  }
  await db.client.end();
}

type EffectivePostgresConfig = {
  url?: string;
  database?: string;
  host?: string;
  user?: string;
  password?: string;
  port: number;
  max: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
};

function resolvePostgresConfig(
  options: PostgresOptions,
): EffectivePostgresConfig {
  const preferred = <T>(option: T | undefined, environment: T | undefined) =>
    option !== undefined ? option : environment;
  const envPort = process.env.HAVE_SQL_PORT;
  const primary = {
    url: preferred(options.url, process.env.HAVE_SQL_URL),
    database: preferred(options.database, process.env.HAVE_SQL_DATABASE),
    host: preferred(options.host, process.env.HAVE_SQL_HOST),
    user: preferred(options.user, process.env.HAVE_SQL_USER),
    password: preferred(options.password, process.env.HAVE_SQL_PASSWORD),
    port: preferred(
      options.port,
      envPort === undefined ? undefined : Number(envPort),
    ),
  };
  const useLegacy =
    !primary.url && !primary.host && !primary.database && !primary.user;
  const legacy = <T>(value: T | undefined, environment: T | undefined) =>
    value !== undefined || !useLegacy ? value : environment;
  const legacyPort = process.env.SQLOO_PORT;

  const port =
    legacy(
      primary.port,
      legacyPort === undefined ? undefined : Number(legacyPort),
    ) ?? 5432;
  const max = options.max ?? 20;
  const { connectionTimeoutMillis, idleTimeoutMillis } = options;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PostgreSQL port must be an integer between 1 and 65535');
  }
  if (!Number.isInteger(max) || max < 1) {
    throw new Error('PostgreSQL pool max must be a positive integer');
  }
  if (
    connectionTimeoutMillis !== undefined &&
    (!Number.isInteger(connectionTimeoutMillis) ||
      connectionTimeoutMillis < 0 ||
      connectionTimeoutMillis > MAX_TIMER_DELAY_MILLIS)
  ) {
    throw new Error(
      `PostgreSQL pool connectionTimeoutMillis must be an integer between 0 and ${MAX_TIMER_DELAY_MILLIS}`,
    );
  }
  if (
    idleTimeoutMillis !== undefined &&
    (!Number.isInteger(idleTimeoutMillis) ||
      idleTimeoutMillis < 0 ||
      idleTimeoutMillis > MAX_TIMER_DELAY_MILLIS)
  ) {
    throw new Error(
      `PostgreSQL pool idleTimeoutMillis must be an integer between 0 and ${MAX_TIMER_DELAY_MILLIS}`,
    );
  }

  return {
    url: legacy(primary.url, process.env.SQLOO_URL),
    database: legacy(primary.database, process.env.SQLOO_DATABASE),
    host: legacy(primary.host, process.env.SQLOO_HOST),
    user: legacy(primary.user, process.env.SQLOO_USER),
    password: legacy(primary.password, process.env.SQLOO_PASSWORD),
    port,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis,
  };
}

async function derivePostgresConnectionCacheKey(
  options: PostgresOptions,
  effective: EffectivePostgresConfig,
): Promise<string | undefined> {
  if (options.dbid) {
    return options.dbid;
  }

  const identity = JSON.stringify({
    url: effective.url ?? null,
    host: effective.host ?? 'localhost',
    port: effective.port,
    database: effective.database ?? null,
    user: effective.user ?? null,
    password: effective.password ?? null,
    max: effective.max,
    connectionTimeoutMillis: effective.connectionTimeoutMillis ?? null,
    idleTimeoutMillis: effective.idleTimeoutMillis ?? null,
  });
  const hmacKey = await getPostgresCacheHmacKey();
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(
      `@happyvertical/sql:postgres-cache:v1\0${identity}`,
    ),
  );
  return `pg:hmac-sha256:v1:${Buffer.from(signature).toString('hex')}`;
}

/** @internal Exported for adversarial identity tests. */
export async function getPostgresConnectionCacheKey(
  options: PostgresOptions,
): Promise<string | undefined> {
  validateDatabaseCacheOptions(options);
  return derivePostgresConnectionCacheKey(
    options,
    resolvePostgresConfig(options),
  );
}

/**
 * Creates a PostgreSQL database adapter
 *
 * Loads configuration from environment variables with backward compatibility:
 * - First checks HAVE_SQL_* environment variables (new standard)
 * - Falls back to SQLOO_* environment variables (legacy)
 * - User-provided options always take precedence
 *
 * Environment variables:
 * - HAVE_SQL_URL / SQLOO_URL → Connection string (takes precedence)
 * - HAVE_SQL_DATABASE / SQLOO_DATABASE → Database name
 * - HAVE_SQL_HOST / SQLOO_HOST → Host (default: 'localhost')
 * - HAVE_SQL_USER / SQLOO_USER → Username
 * - HAVE_SQL_PASSWORD / SQLOO_PASSWORD → Password
 * - HAVE_SQL_PORT / SQLOO_PORT → Port (default: 5432)
 *
 * @param options - PostgreSQL connection options
 * @returns Database interface for PostgreSQL
 */
export async function getDatabase(
  options: PostgresOptions = {},
): Promise<DatabaseInterface> {
  validateDatabaseCacheOptions(options);
  const effective = resolvePostgresConfig(options);
  const cacheKey = await derivePostgresConnectionCacheKey(options, effective);
  return connectionCache.getOrCreate(
    cacheKey,
    options,
    () => createDatabase(effective),
    closePostgresDatabase,
  );
}

/**
 * Internal: creates the actual database connection and caches it.
 */
async function createDatabase(
  config: EffectivePostgresConfig,
): Promise<DatabaseInterface> {
  // Apply defaults
  const { database, host = 'localhost', user, password, port = 5432 } = config;

  // Construct url if not provided (for DatabaseInterface requirement)
  const url: string =
    (config.url as string) ||
    `postgresql://${user}${password ? `:${password}` : ''}@${host}:${port}/${database || 'postgres'}`;

  // Another thread can open its own pool against the same server, so the
  // effective options are the reopen options. They may carry credentials.
  const reopenOptions = (): ReopenOptions => {
    const reopened: PostgresOptions & { type: 'postgres' } = {
      ...(Object.fromEntries(
        Object.entries(config).filter(([, value]) => value !== undefined),
      ) as PostgresOptions),
      type: 'postgres',
      // An equal configuration would otherwise return this cached pool.
      cache: false,
      // Every reopen is a pool of its own. Keep it small by default; a caller
      // who needs more overrides `max` on the returned options.
      max: Math.min(config.max, REOPEN_POOL_MAX),
    };
    return reopened;
  };

  // Create a connection pool with explicit max to prevent exhaustion.
  // pg defaults to 10 which is too low for SMRT apps that sync 30+ table
  // schemas on startup. Default to 20 but allow callers to override.
  const { max: poolMax, connectionTimeoutMillis, idleTimeoutMillis } = config;
  const pool = new Pool(
    config.url
      ? {
          connectionString: config.url as string,
          max: poolMax,
          connectionTimeoutMillis,
          idleTimeoutMillis,
        }
      : {
          host: host as string,
          user: user as string,
          password: password as string,
          port: port as number,
          database: database as string,
          max: poolMax,
          connectionTimeoutMillis,
          idleTimeoutMillis,
        },
  );

  // An idle pooled client that loses its backend (restart, failover, proxy
  // idle timeout, TCP reset) emits 'error' on the pool. Without a listener Node
  // treats that as an unhandled 'error' event and terminates the process, so
  // routine database maintenance would crash every consumer of this adapter.
  // pg has already removed the client from the pool by this point; absorb the
  // event and let the pool carry on with its remaining connections.
  pool.on('error', (error) => {
    console.warn(
      'Warning: PostgreSQL pool client error (connection discarded):',
      error instanceof Error ? error.message : String(error),
    );
  });

  // Wrap pool.end() to evict from cache so stale pools are never returned.
  // This fixes the "Cannot use a pool after calling end on the pool" error
  // when tests or shutdown code calls db.client.end() and subsequent calls
  // to getDatabase() would otherwise return the ended pool.
  const originalEnd = pool.end.bind(pool);
  let db: DatabaseInterface;
  let endPromise: Promise<void> | undefined;
  const evictFromCache = () => connectionCache.forget(db);
  (pool as any).end = (callback?: (error?: Error) => void) => {
    if (!endPromise) {
      evictFromCache();
      endPromise = originalEnd();
    }
    if (callback) {
      endPromise.then(
        () => callback(),
        (error) =>
          callback(error instanceof Error ? error : new Error(String(error))),
      );
      return;
    }
    return endPromise;
  };

  const client = pool;

  /**
   * Absorbs 'error' events for the clients currently checked out for a
   * transaction, keyed by client so the listener can be removed on release.
   */
  const txErrorAbsorbers = new WeakMap<PoolClient, () => void>();
  const releasedTxClients = new WeakSet<PoolClient>();

  /**
   * Checks out a pooled client for a transaction.
   *
   * pg-pool drops its own idle 'error' listener while a client is checked out,
   * so a backend that dies mid-transaction would emit an unhandled 'error' and
   * terminate the process. Absorb it here — the failure still reaches the
   * caller as a rejected query — and drop the listener again on release so
   * repeated checkouts of the same client cannot accumulate them.
   */
  const acquireTxClient = async (): Promise<PoolClient> => {
    const txClient = await client.connect();
    // The pool hands back the same client objects, so the release guard has to
    // be reset per checkout — otherwise every reuse after the first would be
    // treated as already released and stay checked out forever.
    releasedTxClients.delete(txClient);
    const absorb = () => {};
    txClient.on('error', absorb);
    txErrorAbsorbers.set(txClient, absorb);
    return txClient;
  };

  /**
   * Returns a transaction client to the pool exactly once.
   *
   * Every teardown path must run this, including the ones reached by a throwing
   * COMMIT or ROLLBACK — a client that is never released stays checked out for
   * the life of the process, and enough of them exhaust the pool. Releasing
   * twice throws, so the released clients are tracked rather than assumed.
   *
   * @param txClient - The pooled client backing a transaction
   * @param destroy - Destroy the connection instead of reusing it, for when the
   *   transaction state could not be cleaned up
   */
  const releaseTxClient = (txClient: PoolClient, destroy = false): void => {
    if (releasedTxClients.has(txClient)) return;
    releasedTxClients.add(txClient);
    const absorb = txErrorAbsorbers.get(txClient);
    if (absorb) {
      txClient.off('error', absorb);
      txErrorAbsorbers.delete(txClient);
    }
    txClient.release(destroy || undefined);
  };

  /**
   * Rolls back a failed transaction and returns its client to the pool.
   *
   * The connection may still be inside a transaction, so ROLLBACK is attempted
   * to normalize it. If that works the connection is clean and worth reusing;
   * if it does not, the state is unknown and the connection is destroyed rather
   * than handed to unrelated code later.
   *
   * @returns The rollback failure, if the connection could not be normalized
   */
  const discardTxClient = async (txClient: PoolClient): Promise<unknown> => {
    try {
      await txClient.query('ROLLBACK');
      releaseTxClient(txClient);
      return undefined;
    } catch (rollbackError) {
      releaseTxClient(txClient, true);
      return rollbackError;
    }
  };

  /**
   * Keeps the first PostgreSQL statement failure attached to a transaction.
   *
   * PostgreSQL reports every later statement in an aborted transaction as
   * 25P02. Replacing the first failure with that generic state error hides the
   * actionable code and diagnostics from callers. The scoped executor instead
   * rethrows the first failure whenever PostgreSQL reports 25P02, and exposes
   * the recorded failure so a swallowed statement error cannot make COMMIT's
   * implicit rollback look successful.
   */
  const createTransactionExecutor = (txClient: PoolClient) => {
    const tracker = createTransactionErrorTracker(
      (error) => error instanceof PgDatabaseError,
    );
    const { pending, preserve: preserveFirstError } = tracker;

    const executor: PostgresQueryExecutor = {
      query: (sql, values) => tracker.track(txClient.query(sql, values), sql),
    };

    const client = new Proxy(txClient, {
      get(target, property) {
        if (property === 'query') {
          return (...args: any[]) => {
            const query = args[0];
            const callbackIndex =
              typeof args.at(-1) === 'function' ? args.length - 1 : -1;
            const submittable =
              typeof query === 'object' &&
              query !== null &&
              'submit' in query &&
              typeof query.submit === 'function';

            if (submittable) {
              if (
                !('handleError' in query) ||
                typeof query.handleError !== 'function' ||
                !('handleReadyForQuery' in query) ||
                typeof query.handleReadyForQuery !== 'function'
              ) {
                return Reflect.apply(target.query, target, args);
              }

              const handleError = query.handleError;
              const handleReadyForQuery = query.handleReadyForQuery;
              let complete!: () => void;
              const completion = new Promise<void>((resolve) => {
                complete = resolve;
              });
              let completed = false;
              const finish = () => {
                if (completed) return;
                completed = true;
                query.handleError = handleError;
                query.handleReadyForQuery = handleReadyForQuery;
                pending.delete(completion);
                complete();
              };
              pending.add(completion);
              query.handleError = function (...handlerArgs: unknown[]) {
                const error = preserveFirstError(handlerArgs[0]);
                try {
                  return Reflect.apply(handleError, this, [
                    error,
                    ...handlerArgs.slice(1),
                  ]);
                } finally {
                  finish();
                }
              };
              query.handleReadyForQuery = function (...handlerArgs: unknown[]) {
                try {
                  const result = Reflect.apply(
                    handleReadyForQuery,
                    this,
                    handlerArgs,
                  );
                  tracker.confirm(query);
                  return result;
                } finally {
                  finish();
                }
              };
              try {
                return Reflect.apply(target.query, target, args);
              } catch (error) {
                finish();
                throw preserveFirstError(error);
              }
            }

            if (callbackIndex !== -1) {
              const callback = args[callbackIndex];
              let complete!: () => void;
              const completion = new Promise<void>((resolve) => {
                complete = resolve;
              });
              pending.add(completion);
              args[callbackIndex] = (error: unknown, result: unknown) => {
                const callbackError =
                  error === null || error === undefined
                    ? error
                    : preserveFirstError(error);
                if (callbackError === null || callbackError === undefined) {
                  tracker.confirm(query);
                }
                pending.delete(completion);
                complete();
                callback(callbackError, result);
              };
              try {
                return Reflect.apply(target.query, target, args);
              } catch (error) {
                pending.delete(completion);
                complete();
                throw preserveFirstError(error);
              }
            }

            const result = Reflect.apply(target.query, target, args);
            if (
              typeof result === 'object' &&
              result !== null &&
              'then' in result &&
              typeof result.then === 'function'
            ) {
              return tracker.track(Promise.resolve(result), query);
            }
            if (
              typeof result === 'object' &&
              result !== null &&
              'once' in result &&
              typeof result.once === 'function'
            ) {
              let complete!: () => void;
              const completion = new Promise<void>((resolve) => {
                complete = resolve;
              });
              const finish = () => {
                pending.delete(completion);
                complete();
              };
              pending.add(completion);
              result.once('error', (error: unknown) => {
                preserveFirstError(error);
                finish();
              });
              result.once('end', () => {
                tracker.confirm(query);
                finish();
              });
              result.once('close', finish);
            }
            return result;
          };
        }
        return Reflect.get(target, property, target);
      },
    });

    return {
      client,
      executor,
      clearError: tracker.clearError,
      drain: tracker.drain,
      getError: tracker.getError,
      getUnconfirmedError: tracker.getUnconfirmedError,
    };
  };

  const assertCommitted = (
    result: PgQueryResult,
    transactionState?: ReturnType<typeof createTransactionExecutor>,
  ): void => {
    if (result.command === 'COMMIT') return;

    const queryError =
      transactionState?.getError() ?? transactionState?.getUnconfirmedError();
    if (queryError !== undefined) throw queryError;

    throw new DatabaseError(
      'PostgreSQL rolled back the transaction at commit',
      {
        command: result.command,
      },
    );
  };

  const dialect = createPostgresDialect({
    client,
    // Pooled: a probe on its own connection cannot abort the caller's
    // transaction.
    probeExecutor: () => client,
    runInTransaction: async (work) => {
      const txClient = await acquireTxClient();

      try {
        await txClient.query('BEGIN');
        const result = await work(txClient);
        const commitResult = await txClient.query('COMMIT');
        assertCommitted(commitResult);
        releaseTxClient(txClient);
        return result;
      } catch (error) {
        const rollbackError = await discardTxClient(txClient);
        if (rollbackError !== undefined && error instanceof Error) {
          error.cause ??= rollbackError;
        }
        throw error;
      }
    },
  });
  const { serializeRecord, createClientMethods, createNestedTransaction } =
    dialect;

  const {
    insert,
    get,
    list,
    update,
    upsert,
    getOrInsert,
    delete: deleteRecords,
    count,
    table,
    many,
    single,
    pluck,
    execute,
    query,
    oo,
    oO,
    ox,
    xx,
    tableExists,
    getTableSchema,
    syncSchema,
  } = createClientMethods(client, false, serializeRecord);
  const alterTable = createAlterTable(client);

  /**
   * Builds the root-shaped interface of one pinned session
   * ({@link SessionHandle.database}).
   *
   * Invariant: every statement this interface issues, including catalog
   * probes, transaction control and savepoints, runs on the session's client
   * and nothing else. It never checks a client out of the pool, so session
   * state such as an advisory lock held by that backend covers all of its
   * work. Once the session is released, destroyed or its connection is lost,
   * every call rejects; there is no reconnect.
   *
   * Ordering has two layers:
   *
   * - The session's statement FIFO (`session.enqueue`), shared with
   *   `session.query()` and `release()`. A statement takes its place when it is
   *   issued and keeps it until node-postgres has finished with it, so
   *   statements reach the connection one at a time in issue order, never
   *   through node-postgres's internal queue.
   * - The transaction turn. While a transaction holds the connection, calls
   *   from outside it (plain statements and further transactions) wait in
   *   arrival order and are admitted when it ends; they reject after
   *   {@link DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS} of waiting, or at once when
   *   the session closes. With no transaction open a plain statement goes
   *   straight into the FIFO and never times out, however long the statements
   *   ahead of it take. A call made from inside one of this interface's own
   *   transaction or savepoint callbacks would wait on the transaction its
   *   caller holds, so it rejects at once instead.
   */
  const createSessionDatabase = (session: {
    client: PoolClient;
    closedError: () => DatabaseError | undefined;
    enqueue: <T>(work: () => Promise<T>) => Promise<T>;
    onClose: (listener: () => void) => void;
    /** Ends the lease as lost and closes the connection without sending. */
    discard: () => void;
  }): DatabaseInterface => {
    const sessionClient = session.client;

    const assertIssuable = (): void => {
      const closed = session.closedError();
      if (closed) throw closed;
    };

    /** One statement on the pinned connection, in the session FIFO. */
    const direct = <R = any>(sql: string, values?: any[]): Promise<R> => {
      try {
        assertIssuable();
      } catch (error) {
        return Promise.reject(error);
      }
      return session.enqueue(
        () => sessionClient.query(sql, values) as unknown as Promise<R>,
      );
    };

    const directExecutor: PostgresQueryExecutor = {
      query: (sql, values) => direct(sql, values),
    };

    /** Transaction control on the pinned connection, with its command tag. */
    const control = (sql: string): Promise<PgQueryResult> => direct(sql);

    // Marks the async scope of a running transaction or savepoint callback on
    // this interface, so a call on the interface itself from inside it is
    // refused instead of waiting on the turn its own caller holds. `open`
    // turns false when the transaction ends, so work the callback left running
    // afterwards waits normally.
    const callbackScope = new AsyncLocalStorage<{ open: boolean }>();
    const refuseInsideOwnTransaction = (): void => {
      if (callbackScope.getStore()?.open) {
        throw new DatabaseError(
          'A session database call was made from inside its own transaction callback, where it would wait for that transaction to end. Use the transaction handle passed to the callback.',
          {},
        );
      }
    };

    // The scope of a running syncSchema()/initializeSchemas() call.
    const schemaScope = new AsyncLocalStorage<{ failure?: unknown }>();

    // The transaction turn.
    type Waiter = {
      admit: () => void;
      fail: (error: unknown) => void;
      timer?: ReturnType<typeof setTimeout>;
    };
    let turnHeld = false;
    const waiters: Waiter[] = [];
    let current: { invalidate: (error: DatabaseError) => void } | undefined;

    /**
     * Runs `admit` synchronously when no transaction holds the connection and
     * nobody is waiting, otherwise when the waiters ahead of it have been
     * admitted and no transaction holds it. `admit` must take its FIFO place
     * (or the turn) synchronously, which is what keeps issue order.
     */
    const whenAdmitted = <T>(admit: () => T | Promise<T>): Promise<T> => {
      try {
        assertIssuable();
        if (!turnHeld && waiters.length === 0) {
          return Promise.resolve(admit());
        }
      } catch (error) {
        return Promise.reject(error);
      }
      return new Promise<T>((resolve, reject) => {
        const waiter: Waiter = {
          admit: () => {
            try {
              resolve(admit());
            } catch (error) {
              reject(error);
            }
          },
          fail: reject,
        };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) waiters.splice(index, 1);
          const timeout = new DatabaseError(
            `Timed out after ${DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS}ms waiting for the session database's open transaction to end. Usually a beginTransaction() handle that was never committed or rolled back.`,
            { timeoutMs: DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS },
          );
          reject(timeout);
        }, DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS);
        waiters.push(waiter);
      });
    };

    const admitWaiting = (): void => {
      while (!turnHeld && waiters.length > 0) {
        const waiter = waiters.shift() as Waiter;
        clearTimeout(waiter.timer);
        const closed = session.closedError();
        if (closed) waiter.fail(closed);
        else waiter.admit();
      }
    };

    // A closed session admits nobody: fail the waiters now, and end the open
    // transaction's handle so its owner gets the session error.
    session.onClose(() => {
      const closed =
        session.closedError() ??
        new DatabaseError('Session connection was lost', {});
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.fail(closed);
      }
      current?.invalidate(closed);
    });

    /**
     * Takes the transaction turn and issues BEGIN in the same tick, so BEGIN
     * lands in the FIFO right after the statements admitted before it.
     */
    const startTransaction = () =>
      whenAdmitted(() => {
        const begun = control('BEGIN');
        turnHeld = true;
        let ended = false;
        const endTurn = (): void => {
          if (ended) return;
          ended = true;
          current = undefined;
          turnHeld = false;
          admitWaiting();
        };
        return { begun, endTurn };
      });

    /**
     * Takes the turn, waits for BEGIN, and checks the session once more
     * before any user code runs: a release() or destroy() issued while BEGIN
     * was queued has no handle to end yet, so it is caught here.
     */
    const openTransaction = async (): Promise<{ endTurn: () => void }> => {
      const { begun, endTurn } = await startTransaction();
      try {
        await begun;
        assertIssuable();
      } catch (error) {
        // A BEGIN that failed without a server answer (a client-side
        // query_timeout, for one) may still have opened a transaction on the
        // backend. Freeing the turn would let the next statement run inside
        // it and vanish with a later rollback, so the lease is discarded
        // instead. A server error means BEGIN did not happen.
        if (
          !(error instanceof PgDatabaseError) &&
          session.closedError() === undefined
        ) {
          session.discard();
        }
        endTurn();
        throw error;
      }
      return { endTurn };
    };

    // Statements outside a transaction: straight into the FIFO, or after the
    // open transaction ends.
    const outside: PostgresQueryExecutor = {
      query: (sql, values) => {
        try {
          refuseInsideOwnTransaction();
        } catch (error) {
          return Promise.reject(error);
        }
        return whenAdmitted(() => direct(sql, values)).catch(
          (error: unknown) => {
            // Inside syncSchema()/initializeSchemas(), record every failure
            // that is not a server's answer to the statement: never admitted
            // (the turn timeout), the session closing (including a FATAL from
            // the backend), or a client-side failure whose outcome on the
            // server is unknown (query_timeout). The schema helpers tolerate
            // DDL errors and would otherwise swallow these and report success.
            const scope = schemaScope.getStore();
            if (
              scope &&
              scope.failure === undefined &&
              (!(error instanceof PgDatabaseError) ||
                session.closedError() !== undefined)
            ) {
              scope.failure = session.closedError() ?? error;
            }
            throw error;
          },
        );
      },
    };

    /**
     * Ends a failed transaction on the pinned connection. The rollback failure,
     * if any, is returned for the caller's error `cause`; on a lost connection
     * the server has already rolled the transaction back.
     */
    const rollbackPinned = async (): Promise<unknown> => {
      try {
        await control('ROLLBACK');
        return undefined;
      } catch (rollbackError) {
        return rollbackError;
      }
    };

    const sessionDialect = createPostgresDialect({
      client: outside,
      // Never reached: a pinned session refuses the nullable-key upserts that
      // would need catalog discovery (see refuseNullableUpsert).
      probeExecutor: (executor) => executor,
      runInTransaction: async (work) => {
        refuseInsideOwnTransaction();
        const { endTurn } = await openTransaction();
        try {
          const result = await work(directExecutor);
          assertCommitted(await control('COMMIT'));
          return result;
        } catch (error) {
          const rollbackError = await rollbackPinned();
          if (rollbackError !== undefined && error instanceof Error) {
            error.cause ??= rollbackError;
          }
          throw error;
        } finally {
          endTurn();
        }
      },
    });

    /**
     * Refuses an upsert with a NULL conflict value and no explicit
     * `nullsDistinct`. Choosing between the native ON CONFLICT path and the
     * NULL-aware fallback needs a catalog probe, and on a pinned session that
     * probe could not be bound to the statement it decides (a queued SET
     * search_path or DDL can change the answer), so the choice is left to the
     * caller.
     */
    const refuseNullableUpsert = <F extends DatabaseInterface['upsert']>(
      upsert: F,
    ): F =>
      ((table, conflictColumns, data, options) => {
        if (
          options?.nullsDistinct !== true &&
          Array.isArray(conflictColumns) &&
          conflictColumns.some((column) => data?.[column] === null)
        ) {
          return Promise.reject(
            new DatabaseError(
              'upsert() on a pinned session database does not accept a NULL conflict value without { nullsDistinct: true }. Pass { nullsDistinct: true } for database-native NULL handling, or run this upsert on the root database handle.',
              { table, conflictColumns },
            ),
          );
        }
        return upsert(table, conflictColumns, data, options);
      }) as F;

    const sessionMethods = sessionDialect.createClientMethods(
      outside,
      false,
      sessionDialect.serializeRecord,
    );

    /**
     * The interface handed to a transaction opened on the session, and the
     * state that ends it. Its statements go straight into the FIFO (the
     * transaction holds the turn). Its own callbacks, and its savepoint
     * callbacks, run inside `scope` so a call on the session database from
     * there is refused rather than self-waiting.
     */
    const createSessionTransaction = (
      transactionOptions: TransactionOptions | undefined,
    ) => {
      const scope = { open: true };
      let active = true;
      let invalidatedBy: DatabaseError | undefined;
      // `tx.client`: promise-form query(sql, values?) only, and only while
      // the transaction is open. There is no raw client to reach around the
      // FIFO or the turn.
      const transactionClient = {
        query: (...args: any[]) => {
          const [sql, values] = args;
          if (
            typeof sql !== 'string' ||
            args.length > 2 ||
            (values !== undefined && !Array.isArray(values))
          ) {
            throw new DatabaseError(
              'A session transaction client supports only query(sql, values?) returning a promise',
              {},
            );
          }
          if (!active) {
            return Promise.reject(
              invalidatedBy ??
                new DatabaseError('Transaction already ended', {}),
            );
          }
          return direct(sql, values);
        },
      } as unknown as PoolClient;
      const transactionState = createTransactionExecutor(transactionClient);
      let scoped!: DatabaseInterface;
      const nested = sessionDialect.createNestedTransaction(
        transactionState.executor,
        () => scoped,
        transactionState.clearError,
        new AsyncLocalStorage<NestedScope>(),
      );
      const scopedNested = Object.assign(
        <T>(callback: (tx: DatabaseInterface) => Promise<T>): Promise<T> =>
          nested((tx) => callbackScope.run(scope, () => callback(tx))),
        { drain: nested.drain },
      );
      const transactionMethods = sessionDialect.createClientMethods(
        transactionState.executor,
        true,
        sessionDialect.serializeRecord,
        transactionState.clearError,
        transactionOptions?.introspection === true,
      );
      scoped = {
        url,
        engine: 'postgres',
        client: transactionState.client,
        ...transactionMethods,
        upsert: refuseNullableUpsert(transactionMethods.upsert),
        transaction: scopedNested,
      };
      // Nested savepoint callbacks receive this same object.
      claimConnectionAffinity(scoped, 'transaction');
      current = {
        invalidate: (error) => {
          active = false;
          invalidatedBy ??= error;
        },
      };
      return {
        scope,
        transactionState,
        nested,
        scoped,
        isActive: () => active,
        /** Marks the handle ended; returns the reason it was already ended. */
        finish: (): DatabaseError | undefined => {
          const reason = active
            ? undefined
            : (invalidatedBy ??
              new DatabaseError('Transaction already ended', {}));
          active = false;
          scope.open = false;
          return reason;
        },
      };
    };

    const transaction = async <T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
      transactionOptions?: TransactionOptions,
    ): Promise<T> => {
      refuseInsideOwnTransaction();
      const { endTurn } = await openTransaction();
      const { scope, transactionState, nested, scoped, finish } =
        createSessionTransaction(transactionOptions);
      try {
        const result = await callbackScope.run(scope, () => callback(scoped));
        await nested.drain();
        await transactionState.drain();
        const statementError = transactionState.getError();
        if (statementError !== undefined) throw statementError;
        const ended = finish();
        if (ended) throw ended;
        assertCommitted(await control('COMMIT'), transactionState);
        return result;
      } catch (error) {
        finish();
        await nested.drain();
        await transactionState.drain();
        const rollbackError = await rollbackPinned();
        if (rollbackError !== undefined && error instanceof Error) {
          error.cause ??= rollbackError;
        }
        throw error;
      } finally {
        endTurn();
      }
    };

    const beginTransaction = async (
      transactionOptions?: TransactionOptions,
    ): Promise<TransactionHandle> => {
      refuseInsideOwnTransaction();
      const { endTurn } = await openTransaction();
      const { transactionState, nested, scoped, isActive, finish } =
        createSessionTransaction(transactionOptions);
      let ending = false;

      // The transaction is over however this ends, so the session's
      // transaction turn is freed whether COMMIT succeeds or throws.
      const end = async (command: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
        if (ending) throw new DatabaseError('Transaction already ended', {});
        ending = true;
        try {
          await nested.drain();
          await transactionState.drain();
          const ended = finish();
          if (ended) throw ended;
          const statementError = transactionState.getError();
          if (command === 'COMMIT' && statementError !== undefined) {
            throw statementError;
          }
          const result = await control(command);
          if (command === 'COMMIT') assertCommitted(result, transactionState);
        } catch (error) {
          const rollbackError = await rollbackPinned();
          if (rollbackError !== undefined && error instanceof Error) {
            error.cause ??= rollbackError;
          }
          throw error;
        } finally {
          endTurn();
        }
      };

      return Object.assign(scoped, {
        commit: () => end('COMMIT'),
        rollback: () => end('ROLLBACK'),
        isActive,
      }) as TransactionHandle;
    };

    /**
     * Schema helpers tolerate individual DDL failures, which would also hide
     * the session closing underneath them. Refuse at the entry point, and
     * report a session that closed during the work instead of success.
     */
    const schemaWork = async (work: () => Promise<unknown>): Promise<void> => {
      refuseInsideOwnTransaction();
      assertIssuable();
      if (schemaScope.getStore()) {
        // Nested (initializeSchemas calling syncSchema): the outer call
        // reports what the shared scope recorded.
        await work();
        return;
      }
      const scope: { failure?: unknown } = {};
      await schemaScope.run(scope, work);
      if (scope.failure !== undefined) throw scope.failure;
      assertIssuable();
    };

    // `db.client`: promise-form query(sql, values?) through the same path as
    // `db.query`. There is no raw client to reach around the FIFO or the turn.
    const rootClient = Object.freeze({
      query: (...args: any[]) => {
        const [sql, values] = args;
        if (
          typeof sql !== 'string' ||
          args.length > 2 ||
          (values !== undefined && !Array.isArray(values))
        ) {
          throw new DatabaseError(
            'A session database client supports only query(sql, values?) returning a promise',
            {},
          );
        }
        return outside.query(sql, values);
      },
    });

    // Every public method checks the session and the callback scope at its
    // boundary, so one that can succeed without a statement (an empty insert
    // batch) still rejects on a closed session or from inside its own
    // transaction callback. The check is synchronous, so a raw query still
    // takes its FIFO place at the call.
    const guarded = <F extends (...args: any[]) => any>(fn: F): F =>
      ((...args: any[]) => {
        try {
          refuseInsideOwnTransaction();
          assertIssuable();
        } catch (error) {
          return Promise.reject(error);
        }
        return fn(...args);
      }) as F;
    const guardedMethods: Record<string, unknown> = {};
    for (const [name, member] of Object.entries(sessionMethods)) {
      guardedMethods[name] =
        typeof member === 'function' && name !== 'table'
          ? guarded(member as (...args: any[]) => any)
          : member;
    }
    const guardedTable = (name: string) => {
      const target = sessionMethods.table(name) as unknown as Record<
        string,
        unknown
      >;
      const wrapped: Record<string, unknown> = {};
      for (const [key, member] of Object.entries(target)) {
        wrapped[key] =
          typeof member === 'function'
            ? guarded(member as (...args: any[]) => any)
            : member;
      }
      return wrapped as unknown as ReturnType<typeof sessionMethods.table>;
    };

    const sessionDb: DatabaseInterface = {
      url,
      engine: 'postgres',
      client: rootClient,
      ...(guardedMethods as typeof sessionMethods),
      upsert: guarded(refuseNullableUpsert(sessionMethods.upsert)),
      table: guardedTable,
      syncSchema: (schema: string) =>
        schemaWork(() => sessionMethods.syncSchema(schema)),
      initializeSchemas: (options: SchemaInitializationOptions) =>
        schemaWork(() =>
          new DatabaseSchemaManager().initializeSchemas(sessionDb, options),
        ),
      transaction,
      beginTransaction,
      alterTable: createAlterTable(outside),
      vector: createVectorCapabilities(outside),
    };
    return claimConnectionAffinity(sessionDb, 'session');
  };

  /**
   * Acquire a pinned connection from the pool for session-scoped state such as
   * `pg_advisory_lock`. Every query on the returned handle runs on the same
   * client until {@link SessionHandle.release} drops the connection (which
   * frees any session locks it held). The connection is held for the handle's
   * lifetime, so hold one session per process, not per operation.
   */
  const acquireSession = async (): Promise<SessionHandle> => {
    const sessionClient = await pool.connect();
    let released = false;
    let lost = false;
    let dropped = false;
    let sessionDatabase: DatabaseInterface | undefined;
    const closeListeners = new Set<() => void>();

    const releasedError = () =>
      new DatabaseError('Session has been released', {});
    const lostError = () =>
      new DatabaseError('Session connection was lost', {});

    // Tells the session database that no further call can succeed, so calls
    // waiting for a transaction turn reject now instead of at their timeout.
    const notifyClosed = (): void => {
      for (const listener of [...closeListeners]) listener();
    };

    // Readiness waiters, released only when the physical connection is gone.
    // Closing admission (release()) is not enough: the socket is still live
    // and may still be running a statement.
    const endListeners = new Set<() => void>();
    const notifyEnded = (): void => {
      for (const listener of [...endListeners]) listener();
      notifyClosed();
    };

    // pg-pool removes its idle 'error' listener when a client is checked out.
    // A session is pinned for the process lifetime and mostly idle between
    // queries, so a backend disconnect/failover would emit 'error' on a
    // listener-less client and crash the process. Absorb it and mark the
    // session dead instead; the next query()/isActive() surfaces it.
    sessionClient.on('error', () => {
      lost = true;
      notifyEnded();
    });
    // The connection ended without an error event (for example after a
    // FATAL already reported through a statement): it is lost unless the
    // session itself dropped it.
    sessionClient.on('end', () => {
      if (!dropped) lost = true;
      notifyEnded();
    });

    /** Whether a new call may be issued on the session. */
    const closedError = (): DatabaseError | undefined =>
      released ? releasedError() : lost || dropped ? lostError() : undefined;

    // The protocol connection under the client. Its 'readyForQuery' event is
    // the server saying the previous statement is completely finished.
    const protocol = (
      sessionClient as unknown as {
        connection?: {
          once: (event: string, listener: () => void) => void;
          off: (event: string, listener: () => void) => void;
        };
      }
    ).connection;

    /**
     * Resolves when the server reports readiness for the next statement, or
     * when the connection ends. A statement's promise can settle before that:
     * node-postgres rejects on an ErrorResponse that precedes ReadyForQuery,
     * and its client-side query_timeout rejects while the statement is still
     * running. Handing the next statement to the client before readiness would
     * park it in node-postgres's own (deprecated) queue.
     */
    const untilReady = (): { promise: Promise<void>; done: () => void } => {
      if (lost || dropped || !protocol) {
        return { promise: Promise.resolve(), done: () => {} };
      }
      let done!: () => void;
      const promise = new Promise<void>((resolve) => {
        done = (): void => {
          protocol.off('readyForQuery', done);
          sessionClient.off('end', done);
          endListeners.delete(done);
          resolve();
        };
        protocol.once('readyForQuery', done);
        sessionClient.once('end', done);
        endListeners.add(done);
      });
      return { promise, done };
    };

    // node-postgres's own readiness flag. It is already true when a statement
    // failed client-side before reaching the server (no ReadyForQuery will
    // follow), and false while a statement is still running, including one
    // whose client-side query_timeout has fired.
    const clientReady = (): boolean =>
      (sessionClient as unknown as { readyForQuery?: boolean })
        .readyForQuery === true;

    // A FATAL (or PANIC) ErrorResponse means the backend is exiting. The
    // statement's rejection can arrive before the socket closes, so the
    // session is marked lost here rather than on the client's later 'error'
    // event. The severity text is localised with lc_messages, so the
    // SQLSTATE is checked too: class 57P0 (operator intervention: terminated,
    // shut down, idle session timeout) and class 08 (connection exception).
    const isTerminalServerError = (error: unknown): boolean =>
      error instanceof PgDatabaseError &&
      (error.severity === 'FATAL' ||
        error.severity === 'PANIC' ||
        error.code?.startsWith('57P0') === true ||
        error.code?.startsWith('08') === true);

    // The session's own FIFO statement queue. node-postgres 8.x deprecates
    // calling client.query() while another query is running, so statements
    // are handed to the client one at a time, in the order they were issued.
    // A statement's place is taken when it is issued and held until the
    // server is ready for the next one (or the connection ends), not merely
    // until its promise settles. When its turn comes it runs unless the
    // connection itself is gone (a release() issued after it queues its
    // ROLLBACK behind it, so it still runs).
    let statementTail: Promise<void> = Promise.resolve();
    const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
      let ready: Promise<void> = Promise.resolve();
      const turn = statementTail.then(async () => {
        if (lost) throw lostError();
        if (dropped) throw releasedError();
        const readiness = untilReady();
        ready = readiness.promise;
        try {
          return await work();
        } catch (error) {
          if (isTerminalServerError(error) && !lost) {
            lost = true;
            notifyEnded();
          }
          throw error;
        } finally {
          if (clientReady()) readiness.done();
        }
      });
      statementTail = turn.then(
        () => ready,
        () => ready,
      );
      return turn;
    };

    // Discards the physical connection exactly once, without sending
    // anything: the socket is destroyed first, so node-postgres's end() can
    // no longer write its Terminate message. The client is never returned to
    // the pool: that would not clear residual session state, which could then
    // leak onto a connection later handed to unrelated code.
    function hardClose(): void {
      if (dropped) return;
      dropped = true;
      try {
        (
          sessionClient as unknown as {
            connection?: { stream?: { destroy?: () => void } };
          }
        ).connection?.stream?.destroy?.();
      } catch {
        // Already closed.
      }
      sessionClient.release(true);
      notifyEnded();
    }

    // The graceful end of release(): node-postgres sends Terminate on an idle
    // client and destroys the socket when a statement is still active.
    const dropConnection = (): void => {
      if (dropped) return;
      dropped = true;
      sessionClient.release(true);
      notifyEnded();
    };

    // node-postgres's client-side query_timeout (from the connection options),
    // in milliseconds; 0 when unset.
    const clientQueryTimeout = (): number => {
      const value = Number(
        (
          sessionClient as unknown as {
            // biome-ignore lint/style/useNamingConvention: node-postgres option name
            connectionParameters?: { query_timeout?: unknown };
          }
        ).connectionParameters?.query_timeout,
      );
      return Number.isFinite(value) && value > 0 ? value : 0;
    };

    return {
      database: () => {
        sessionDatabase ??= createSessionDatabase({
          client: sessionClient,
          closedError,
          enqueue,
          onClose: (listener) => closeListeners.add(listener),
          discard: () => {
            lost = true;
            hardClose();
          },
        });
        return sessionDatabase;
      },
      destroy: () => {
        released = true;
        hardClose();
      },
      query: async (sql: string, ...values: any[]) => {
        const closed = closedError();
        if (closed) throw closed;
        const normalized = normalizePostgresRawQuery(sql, values);
        // A raw query's client-side query_timeout runs from the call, as it
        // did when node-postgres queued it: work still waiting in the session
        // queue when its deadline passes is dropped without being sent, and
        // work sent later gets only the time it has left.
        const timeout = clientQueryTimeout();
        const deadline = timeout > 0 ? Date.now() + timeout : undefined;
        let submitted = false;
        let expired = false;
        const readTimeout = () => new Error('Query read timeout');
        const queued = enqueue(() => {
          if (deadline === undefined) {
            return sessionClient.query(normalized.sql, normalized.values);
          }
          const remaining = deadline - Date.now();
          if (expired || remaining <= 0) return Promise.reject(readTimeout());
          submitted = true;
          // query_timeout per query is honoured by node-postgres, though its
          // QueryConfig type does not declare it.
          return sessionClient.query({
            text: normalized.sql,
            values: normalized.values,
            // biome-ignore lint/style/useNamingConvention: node-postgres option name
            query_timeout: remaining,
          } as QueryConfig);
        });
        const outcome =
          deadline === undefined
            ? queued
            : new Promise<Awaited<typeof queued>>((resolve, reject) => {
                const timer = setTimeout(() => {
                  // Still waiting its turn: reject now and never send it.
                  // Once sent, node-postgres's own timer (set to the time
                  // that was left) governs it.
                  if (submitted) return;
                  expired = true;
                  reject(readTimeout());
                }, timeout);
                queued.then(
                  (value) => {
                    clearTimeout(timer);
                    resolve(value);
                  },
                  (error) => {
                    clearTimeout(timer);
                    reject(error);
                  },
                );
              });
        try {
          const result = await outcome;
          return {
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
          };
        } catch (e) {
          throw wrapDatabaseError('Failed to execute session query', e, {
            sql: normalized.sql,
            values: normalized.values,
          });
        }
      },
      isActive: () => !released && !lost && !dropped,
      release: async () => {
        if (released) return;
        released = true;
        // Calls still waiting for a transaction turn will never get one.
        notifyClosed();
        // Free session advisory locks before tearing down so the contract
        // "after release() the locks are gone" holds deterministically — the
        // destroy below is async (TCP teardown) and resolves later. Skip on a
        // lost connection (nothing to talk to; backend exit frees them anyway).
        if (!lost) {
          try {
            // A caller that left the connection in an aborted transaction
            // (BEGIN, a failed statement, then release) would make
            // pg_advisory_unlock_all() error with "current transaction is
            // aborted". Roll back first (a no-op when no transaction is open)
            // so the unlock runs and the deterministic-release contract holds.
            await enqueue(() => sessionClient.query('ROLLBACK'));
          } catch {
            // No open transaction, or already gone — proceed to unlock.
          }
          try {
            await enqueue(() =>
              sessionClient.query('SELECT pg_advisory_unlock_all()'),
            );
          } catch {
            // Best-effort; the destroy below frees locks at backend exit.
          }
        }
        // Destroy the physical connection rather than returning it to the pool
        // (see dropConnection). A destroy() during the statements above has
        // already done it.
        dropConnection();
      },
    };
  };

  /**
   * Executes a callback within a database transaction
   * Automatically commits on success or rolls back on error
   *
   * @param callback - Function to execute within transaction
   * @returns Promise resolving to callback result
   */
  const transaction = async <T>(
    callback: (tx: DatabaseInterface) => Promise<T>,
    transactionOptions?: TransactionOptions,
  ): Promise<T> => {
    // Get a client from the pool for the transaction
    const txClient = await acquireTxClient();

    let nestedTransaction:
      | ReturnType<typeof createNestedTransaction>
      | undefined;
    const transactionState = createTransactionExecutor(txClient);
    try {
      await txClient.query('BEGIN');

      // Create a transaction-scoped database interface
      let txDb!: DatabaseInterface;
      nestedTransaction = createNestedTransaction(
        transactionState.executor,
        () => txDb,
        transactionState.clearError,
        new AsyncLocalStorage<NestedScope>(),
      );
      txDb = {
        url,
        engine: 'postgres',
        reopenOptions,
        client: transactionState.client,
        ...createClientMethods(
          transactionState.executor,
          true,
          serializeRecord,
          transactionState.clearError,
          transactionOptions?.introspection === true,
        ),
        transaction: nestedTransaction,
      };
      // Nested savepoint callbacks receive this same object.
      claimConnectionAffinity(txDb, 'transaction');

      const result = await callback(txDb);
      await nestedTransaction.drain();
      await transactionState.drain();
      const statementError = transactionState.getError();
      if (statementError !== undefined) {
        throw statementError;
      }
      const commitResult = await txClient.query('COMMIT');
      assertCommitted(commitResult, transactionState);
      releaseTxClient(txClient);
      return result;
    } catch (error) {
      // Promise.all may reject before queued nested scopes finish. Do not
      // release this client until their savepoint work has drained.
      await nestedTransaction?.drain();
      await transactionState.drain();
      // Never let a failing ROLLBACK replace the caller's error. On a dead
      // connection the rollback throws "Connection terminated unexpectedly",
      // which would otherwise be the only thing the caller ever sees.
      const rollbackError = await discardTxClient(txClient);
      if (rollbackError !== undefined && error instanceof Error) {
        error.cause ??= rollbackError;
      }
      throw error;
    }
  };

  /**
   * Begins a new transaction and returns a handle for manual control
   *
   * Unlike transaction(), this gives you explicit control over commit/rollback.
   * Ideal for test isolation where you want to rollback after each test.
   *
   * @returns Promise resolving to a TransactionHandle
   */
  const beginTransaction = async (
    transactionOptions?: TransactionOptions,
  ): Promise<TransactionHandle> => {
    // Get a client from the pool for the transaction
    const txClient = await acquireTxClient();
    try {
      await txClient.query('BEGIN');
    } catch (error) {
      // BEGIN failed, so there is no transaction for the caller to end and no
      // handle to release the client — return it here or it is stranded.
      releaseTxClient(txClient, true);
      throw error;
    }

    let active = true;
    let nestedTransaction:
      | ReturnType<typeof createNestedTransaction>
      | undefined;
    const transactionState = createTransactionExecutor(txClient);

    // COMMIT and ROLLBACK both throw in ordinary operation — deferred
    // constraint violations, serialization failures, a connection lost at
    // commit time. The transaction is over either way, so end it and return the
    // client before rethrowing; leaving it checked out would strand a pooled
    // connection permanently and eventually deadlock the pool.
    const end = async (command: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
      if (!active) {
        throw new DatabaseError('Transaction already ended', {});
      }
      try {
        await nestedTransaction?.drain();
        await transactionState.drain();
        const statementError = transactionState.getError();
        if (command === 'COMMIT' && statementError !== undefined) {
          throw statementError;
        }
        const result = await txClient.query(command);
        if (command === 'COMMIT') assertCommitted(result, transactionState);
        active = false;
        releaseTxClient(txClient);
      } catch (error) {
        active = false;
        const rollbackError = await discardTxClient(txClient);
        if (rollbackError !== undefined && error instanceof Error) {
          error.cause ??= rollbackError;
        }
        throw error;
      }
    };

    const commit = (): Promise<void> => end('COMMIT');

    const rollback = (): Promise<void> => end('ROLLBACK');

    const isActive = (): boolean => active;

    // Create a transaction-scoped database interface with commit/rollback
    let txHandle!: TransactionHandle;
    nestedTransaction = createNestedTransaction(
      transactionState.executor,
      () => txHandle,
      transactionState.clearError,
      new AsyncLocalStorage<NestedScope>(),
    );
    txHandle = {
      url,
      engine: 'postgres',
      reopenOptions,
      client: transactionState.client,
      ...createClientMethods(
        transactionState.executor,
        true,
        serializeRecord,
        transactionState.clearError,
        transactionOptions?.introspection === true,
      ),
      transaction: nestedTransaction,
      commit,
      rollback,
      isActive,
    };

    return claimConnectionAffinity(txHandle, 'transaction');
  };

  /**
   * Initialize database schemas from JSON manifest
   * Supports dependency resolution and schema overrides
   *
   * @param options - Schema initialization options
   * @returns Promise that resolves when schemas are initialized
   */
  const initializeSchemas = async (
    options: SchemaInitializationOptions,
  ): Promise<void> => {
    const schemaManager = new DatabaseSchemaManager();
    const currentDb: DatabaseInterface = {
      url,
      engine: 'postgres',
      reopenOptions,
      client,
      insert,
      update,
      upsert,
      get,
      getOrInsert,
      delete: deleteRecords,
      count,
      list,
      table,
      many,
      single,
      pluck,
      execute,
      query,
      oo,
      oO,
      ox,
      xx,
      tableExists,
      getTableSchema,
      syncSchema,
      transaction,
    };
    claimConnectionAffinity(currentDb, 'pool');

    await schemaManager.initializeSchemas(currentDb, options);
  };

  db = {
    url,
    engine: 'postgres',
    reopenOptions,
    client,
    insert,
    update,
    upsert,
    get,
    getOrInsert,
    delete: deleteRecords,
    count,
    list,
    table,
    many,
    single,
    pluck,
    execute,
    query,
    oo,
    oO,
    ox,
    xx,
    tableExists,
    syncSchema,
    initializeSchemas,
    transaction,
    beginTransaction,
    acquireSession,
    getTableSchema,
    alterTable,
    vector: createVectorCapabilities(pool),
    close: async () => {
      await pool.end();
    },
  };

  return claimConnectionAffinity(db, 'pool');
}
