import { AsyncLocalStorage } from 'node:async_hooks';
import { webcrypto } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import {
  DatabaseError as PgDatabaseError,
  type QueryResult as PgQueryResult,
  Pool,
  type PoolClient,
} from 'pg';
import { DatabaseSchemaManager } from './schema-manager';
import {
  ConnectionCache,
  validateDatabaseCacheOptions,
} from './shared/connection-cache';
import {
  createAlterTable,
  createGetTableSchema,
  createPostgresDialect,
  createTransactionErrorTracker,
  createVectorCapabilities,
  type NestedScope,
  normalizePostgresRawQuery,
  type PostgresQueryExecutor,
} from './shared/postgres-dialect';
import type {
  DatabaseCacheOptions,
  DatabaseInterface,
  SchemaInitializationOptions,
  SessionHandle,
  TransactionHandle,
} from './shared/types';
import { wrapDatabaseError } from './shared/utils';

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

globalThis.__haveSqlPostgresCacheHmacKey ??= webcrypto.subtle.generateKey(
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
) as Promise<CryptoKey>;
globalThis.__haveSqlPostgresConnectionCache ??=
  new ConnectionCache<DatabaseInterface>();
const connectionCache = globalThis.__haveSqlPostgresConnectionCache;

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
  const hmacKey = await globalThis.__haveSqlPostgresCacheHmacKey;
  if (!hmacKey) {
    throw new Error('PostgreSQL cache identity key was not initialized');
  }
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
    syncSchema,
  } = createClientMethods(client, false, serializeRecord);
  const getTableSchema = createGetTableSchema({ many, tableExists });
  const alterTable = createAlterTable(client);

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

    // pg-pool removes its idle 'error' listener when a client is checked out.
    // A session is pinned for the process lifetime and mostly idle between
    // queries, so a backend disconnect/failover would emit 'error' on a
    // listener-less client and crash the process. Absorb it and mark the
    // session dead instead; the next query()/isActive() surfaces it.
    sessionClient.on('error', () => {
      lost = true;
    });

    return {
      query: async (sql: string, ...values: any[]) => {
        if (released) {
          throw new DatabaseError('Session has been released', {});
        }
        if (lost) {
          throw new DatabaseError('Session connection was lost', {});
        }
        const normalized = normalizePostgresRawQuery(sql, values);
        try {
          const result = await sessionClient.query(
            normalized.sql,
            normalized.values,
          );
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
      isActive: () => !released && !lost,
      release: async () => {
        if (released) return;
        released = true;
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
            await sessionClient.query('ROLLBACK');
          } catch {
            // No open transaction, or already gone — proceed to unlock.
          }
          try {
            await sessionClient.query('SELECT pg_advisory_unlock_all()');
          } catch {
            // Best-effort; the destroy below frees locks at backend exit.
          }
        }
        // Destroy the physical connection rather than returning it to the pool.
        // Returning it would NOT clear residual session state, which could then
        // leak onto a connection later handed to unrelated code.
        sessionClient.release(true);
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
        client: transactionState.client,
        ...createClientMethods(
          transactionState.executor,
          true,
          serializeRecord,
          transactionState.clearError,
        ),
        transaction: nestedTransaction,
      };

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
  const beginTransaction = async (): Promise<TransactionHandle> => {
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
      client: transactionState.client,
      ...createClientMethods(
        transactionState.executor,
        true,
        serializeRecord,
        transactionState.clearError,
      ),
      transaction: nestedTransaction,
      commit,
      rollback,
      isActive,
    };

    return txHandle;
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
      transaction,
    };

    await schemaManager.initializeSchemas(currentDb, options);
  };

  db = {
    url,
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

  return db;
}
