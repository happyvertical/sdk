import { AsyncLocalStorage } from 'node:async_hooks';
import { webcrypto } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import pg, {
  DatabaseError as PgDatabaseError,
  type QueryResult as PgQueryResult,
  Pool,
  type PoolClient,
  type QueryConfig,
} from 'pg';
import { DatabaseSchemaManager } from './schema-manager';
import { refuseUnusedClientOption } from './shared/client-option';
import { claimConnectionAffinity } from './shared/connection-affinity';
import {
  ConnectionCache,
  validateDatabaseCacheOptions,
} from './shared/connection-cache';
import {
  createHandleProvenance,
  type TransactionScopeKind,
} from './shared/handle-provenance';
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
 * node-postgres's own parameter encoder (`utils.prepareValue`): Dates, arrays,
 * JSON objects and `toPostgres()` values become the text it would send, and
 * Buffers and typed arrays become Buffers. It is applied again when the
 * statement is sent, which leaves an already encoded value unchanged.
 */
const prepareValue = (
  pg as unknown as { utils?: { prepareValue?: (value: unknown) => unknown } }
).utils?.prepareValue;

/**
 * Encodes statement parameters at the call, for a statement that may be
 * handed to the client later (a pinned session's queue). Afterwards nothing
 * the caller does to its array, its Buffers or its objects reaches the
 * statement. Buffers are copied, since the encoder returns them as they are.
 */
function captureValues(values: readonly unknown[] | undefined) {
  if (values === undefined) return undefined;
  return values.map((value) => {
    const prepared = prepareValue ? prepareValue(value) : value;
    return Buffer.isBuffer(prepared) ? Buffer.from(prepared) : prepared;
  });
}

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
  var __haveSqlPostgresConnectionCacheV3:
    | ConnectionCache<DatabaseInterface>
    | undefined;
}

// Entries live in a slot (and under keys) that older copies of this package
// never read: copies before 0.118.0 look up `__haveSqlPostgresConnectionCache`
// with v1 keys, and 0.118.0 looks up `__haveSqlPostgresConnectionCacheV2`
// with v2 keys. Both ignore a `client` option, so an older copy's
// `{ client, url }` open must never return a pool this copy created and
// recorded as a root. (The provenance registry is versioned for the same
// reason, so the pools those copies record read `unknown` here.) The cost: a
// process holding an older and a newer copy opens one pool per copy.
globalThis.__haveSqlPostgresConnectionCacheV3 ??=
  new ConnectionCache<DatabaseInterface>();
const connectionCache = globalThis.__haveSqlPostgresConnectionCacheV3;

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
    return `pg:dbid:v3:${options.dbid}`;
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
      `@happyvertical/sql:postgres-cache:v3\0${identity}`,
    ),
  );
  return `pg:hmac-sha256:v3:${Buffer.from(signature).toString('hex')}`;
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
  refuseUnusedClientOption(options, 'postgres');
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
  const provenance = createHandleProvenance({
    engine: 'postgres',
    rootReads: 'isolated',
  });

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
    /** Like enqueue, plus that entry's own readiness promise. */
    enqueueTracked: <T>(work: () => Promise<T>) => {
      promise: Promise<T>;
      ready: Promise<void>;
    };
    onClose: (listener: () => void) => void;
    /** Ends the lease as lost and closes the connection without sending. */
    discard: () => void;
    /** Transaction status byte of the last ReadyForQuery ('I', 'T', 'E'). */
    transactionStatus: () => string;
    /** Encodes statement parameters at the call (see captureValues). */
    capture: (values: readonly unknown[] | undefined) => unknown[] | undefined;
  }): DatabaseInterface => {
    const sessionClient = session.client;

    const assertIssuable = (): void => {
      const closed = session.closedError();
      if (closed) throw closed;
    };

    /** One statement on the pinned connection, in the session FIFO. */
    /**
     * One statement on the pinned connection, in the session FIFO, with that
     * FIFO entry's own readiness: it settles once the statement no longer
     * holds the connection (its ReadyForQuery, or the connection's end).
     */
    const directTracked = <R = any>(
      sql: string,
      values?: any[],
    ): { promise: Promise<R>; ready: Promise<void> } => {
      let bound: unknown[] | undefined;
      try {
        assertIssuable();
        // The bound values are encoded at issue time; the statement may be
        // handed to the client later. An encoding failure is a rejection.
        bound = session.capture(values);
      } catch (error) {
        return { promise: Promise.reject(error), ready: Promise.resolve() };
      }
      return session.enqueueTracked(
        () => sessionClient.query(sql, bound) as unknown as Promise<R>,
      );
    };

    /** One statement on the pinned connection, in the session FIFO. */
    const direct = <R = any>(sql: string, values?: any[]): Promise<R> =>
      directTracked<R>(sql, values).promise;

    // Raised instead of a managed BEGIN while the connection is, or may be,
    // inside a transaction it did not open: its outcome is known, nothing was
    // sent, so the lease is kept.
    const refusedBegins = new WeakSet<object>();

    /**
     * BEGIN for a managed transaction. Checked when its turn comes, against
     * the transaction status of the last ReadyForQuery: a second BEGIN inside
     * a transaction already open would only warn, and the managed COMMIT
     * would then commit that transaction's earlier work too. While no status
     * has been reported yet (a client fresh from the pool may carry a
     * transaction a previous borrower left open), an internal `SELECT 1` is
     * queued just ahead to obtain one.
     */
    const begin = (): Promise<PgQueryResult> => {
      try {
        assertIssuable();
      } catch (error) {
        return Promise.reject(error);
      }
      if (session.transactionStatus() === '?') {
        session
          .enqueue(() => sessionClient.query('SELECT 1'))
          .catch(() => {
            // Its only purpose is the status byte; a failure leaves the
            // status unconfirmed and the BEGIN below refuses.
          });
      }
      return session.enqueue(() => {
        const status = session.transactionStatus();
        if (status !== 'I') {
          const refusal = new DatabaseError(
            status === '?'
              ? 'The transaction status of this session could not be confirmed, so transaction() and beginTransaction() refuse to start.'
              : `PostgreSQL reports a transaction already open on this session (status ${status}): for example one opened with query('BEGIN'), left open by an earlier user of the connection, or left by a COMMIT that did not complete. transaction() and beginTransaction() refuse to run inside it; COMMIT or ROLLBACK it first.`,
            { transactionStatus: status },
          );
          refusedBegins.add(refusal);
          return Promise.reject(refusal);
        }
        return sessionClient.query('BEGIN');
      });
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
        const begun = begin();
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
        // instead. A server error, or a refusal because the caller's own
        // transaction is open, means BEGIN was not run.
        if (
          !(error instanceof PgDatabaseError) &&
          !refusedBegins.has(error as object) &&
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
        // A schema helper that has recorded an intolerable failure fails
        // fast: none of its later statements is enqueued (it could only wait
        // behind the statement that failed), and the helper reports the
        // original failure.
        const failedScope = schemaScope.getStore();
        if (failedScope?.failure !== undefined) {
          return Promise.reject(failedScope.failure);
        }
        let bound: unknown[] | undefined;
        try {
          refuseInsideOwnTransaction();
          // Encoded now, at the public call, before the statement waits for
          // a transaction turn or its FIFO place. An encoding failure is a
          // rejection, never a synchronous throw.
          bound = session.capture(values);
        } catch (error) {
          return Promise.reject(error);
        }
        // Inside syncSchema()/initializeSchemas(), record every failure that
        // is not a server's answer to the statement: never admitted (the turn
        // timeout), the session closing (including a FATAL from the backend),
        // or a client-side failure whose outcome on the server is unknown
        // (query_timeout). The schema helpers tolerate DDL errors and would
        // otherwise swallow these and report success.
        // Returns whether the error is intolerable, whether or not an earlier
        // failure was already recorded: the first failure is kept, and every
        // intolerable one is propagated at once (a later client-side timeout
        // must not wait on its statement's readiness behind a lock).
        const recordIfIntolerable = (error: unknown): boolean => {
          const scope = schemaScope.getStore();
          if (!scope) return false;
          if (
            !(error instanceof PgDatabaseError) ||
            session.closedError() !== undefined ||
            // A shutdown or termination code, or a FATAL, is never a
            // tolerable DDL outcome, even when it arrives as an ordinary
            // ERROR that leaves this session usable.
            error.severity === 'FATAL' ||
            error.severity === 'PANIC' ||
            error.code?.startsWith('57P0') === true
          ) {
            scope.failure ??= session.closedError() ?? error;
            return true;
          }
          return false;
        };
        return whenAdmitted(() => ({ statement: directTracked(sql, bound) }))
          .catch((error: unknown) => {
            // Not admitted: the turn timeout or a closed session.
            recordIfIntolerable(error);
            throw error;
          })
          .then(({ statement }) =>
            statement.promise.catch(async (error: unknown) => {
              const scope = schemaScope.getStore();
              if (!scope || recordIfIntolerable(error)) throw error;
              // A server error is tolerable only if the connection survived
              // it: wait for this statement's own readiness (its
              // ReadyForQuery, or the connection's end; a FATAL with a
              // translated severity, such as transaction_timeout's 25P04,
              // ends it only then), not for work queued after it.
              await statement.ready;
              const closed = session.closedError();
              if (closed && scope.failure === undefined) scope.failure = closed;
              throw error;
            }),
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
      // Nullable-key discovery is refused on a pinned session (see
      // refuseNullableUpsert). This is the enforcement point: the dialect
      // asks for a probe executor only after deciding, from its own snapshot
      // of the record, that discovery is needed, so a record whose values
      // change between reads cannot slip past. Nothing is sent.
      probeExecutor: () => ({
        query: () => Promise.reject(nullableUpsertRefusal()),
      }),
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
     * caller. This early check gives the clear message; the pinned
     * `probeExecutor` enforces the same rule on the record as executed.
     */
    function nullableUpsertRefusal(
      context: Record<string, unknown> = {},
    ): DatabaseError {
      return new DatabaseError(
        'upsert() on a pinned session database does not accept a NULL conflict value without { nullsDistinct: true }. Pass { nullsDistinct: true } for database-native NULL handling, or write the INSERT … ON CONFLICT statement yourself with query() on this handle (or its transaction). Work that depends on this session’s lock must stay on this handle; use the root database handle only for work that does not.',
        context,
      );
    }
    /**
     * Copies array arguments of a raw `query(sql, ...values)` at the call, so
     * the dialect binds, and redacts its error with, the values as they were
     * submitted rather than an array the caller may reuse or overwrite before
     * an error (which can echo a value) arrives.
     */
    const snapshotQuery = <F extends DatabaseInterface['query']>(query: F): F =>
      ((sql: string, ...values: any[]) =>
        query(
          sql,
          ...values.map((value) => (Array.isArray(value) ? [...value] : value)),
        )) as F;

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
            nullableUpsertRefusal({ table, conflictColumns }),
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
      kind: TransactionScopeKind,
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
        query: snapshotQuery(transactionMethods.query),
        transaction: scopedNested,
      };
      // Nested savepoint callbacks receive this same object.
      claimConnectionAffinity(scoped, 'transaction');
      provenance.transaction(scoped, kind);
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
        createSessionTransaction('callback', transactionOptions);
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
        createSessionTransaction('manual', transactionOptions);
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
      try {
        await schemaScope.run(scope, work);
      } catch (error) {
        // A step the helper does not tolerate may have failed only because
        // the scope was already failing; report the original failure.
        if (scope.failure !== undefined) throw scope.failure;
        throw error;
      }
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
      query: guarded(snapshotQuery(sessionMethods.query)),
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
    provenance.session(sessionDb);
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
          on: (event: string, listener: (message?: unknown) => void) => void;
          once: (event: string, listener: () => void) => void;
          off: (event: string, listener: () => void) => void;
        };
      }
    ).connection;

    // The transaction status byte of the last ReadyForQuery seen by this
    // session: 'I' idle, 'T' in a transaction block, 'E' in a failed one, or
    // '?' before the first one. A pooled client can be handed out with a
    // transaction a previous borrower left open, so nothing is assumed: a
    // managed BEGIN first confirms the status (see the session database).
    let transactionStatus = '?';
    protocol?.on('readyForQuery', (message) => {
      const status = (message as { status?: unknown } | undefined)?.status;
      if (typeof status === 'string') transactionStatus = status;
    });

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

    // A FATAL (or PANIC) ErrorResponse from this backend means it is
    // exiting. The statement's rejection can arrive before the socket
    // closes, so the session is marked lost here rather than on the client's
    // later 'error' event. Only the local severity counts: a SQLSTATE such as
    // 57P01 can arrive in an ordinary ERROR (forwarded from another server by
    // dblink, or raised by a function) on a backend that stays connected. A
    // localised FATAL, and any other real loss, still arrives as 'error' or
    // 'end' on the connection.
    const isTerminalServerError = (error: unknown): boolean =>
      error instanceof PgDatabaseError &&
      (error.severity === 'FATAL' || error.severity === 'PANIC');

    // Raw session.query() calls handed straight to node-postgres (before
    // database() is first called) that have not settled yet. database()
    // refuses to start while any is pending.
    let directPending = 0;

    // The session's own FIFO statement queue, used once database() has been
    // called. node-postgres 8.x deprecates calling client.query() while
    // another query is running, so statements are handed to the client one at
    // a time, in the order they were issued. A statement's place is taken when
    // it is issued and held until the server is ready for the next one (or
    // the connection ends), not merely until its promise settles. When its
    // turn comes it runs unless the connection itself is gone (a release()
    // issued after it queues its ROLLBACK behind it, so it still runs). An
    // entry can be cancelled before its turn; it is then unlinked and its
    // references dropped.
    type Entry = {
      run?: () => Promise<unknown>;
      resolve?: (value: unknown) => void;
      reject?: (error: unknown) => void;
      started: boolean;
      // Settles once this entry no longer holds the connection: after its
      // statement's ReadyForQuery (or the connection's end), or at once if it
      // never ran.
      ready: () => void;
    };
    const entries: Entry[] = [];
    let pumping = false;

    const pump = async (): Promise<void> => {
      if (pumping) return;
      pumping = true;
      try {
        for (;;) {
          // Rechecked here, after every await: entries can be withdrawn while
          // the previous statement waits for readiness.
          const entry = entries.shift();
          if (!entry) break;
          const { run, resolve, reject } = entry;
          entry.run = entry.resolve = entry.reject = undefined;
          if (!run || !resolve || !reject) {
            entry.ready();
            continue;
          }
          entry.started = true;
          if (lost) {
            reject(lostError());
            entry.ready();
            continue;
          }
          if (dropped) {
            reject(releasedError());
            entry.ready();
            continue;
          }
          const readiness = untilReady();
          try {
            resolve(await run());
          } catch (error) {
            if (isTerminalServerError(error) && !lost) {
              lost = true;
              notifyEnded();
            }
            reject(error);
          } finally {
            if (clientReady()) readiness.done();
          }
          await readiness.promise;
          entry.ready();
        }
      } finally {
        pumping = false;
      }
    };

    const enqueueEntry = <T>(
      work: () => Promise<T>,
    ): {
      promise: Promise<T>;
      ready: Promise<void>;
      cancel: (error: unknown) => boolean;
    } => {
      let markReady!: () => void;
      const ready = new Promise<void>((resolve) => {
        markReady = resolve;
      });
      const entry: Entry = { started: false, ready: markReady };
      const promise = new Promise<T>((resolve, reject) => {
        entry.run = work;
        entry.resolve = resolve as (value: unknown) => void;
        entry.reject = reject;
      });
      entries.push(entry);
      void pump();
      return {
        promise,
        ready,
        // Withdraws an entry that has not started: unlinks it and drops its
        // statement, values and callbacks. Returns false once it has started.
        cancel: (error) => {
          if (entry.started) return false;
          const index = entries.indexOf(entry);
          if (index !== -1) entries.splice(index, 1);
          const reject = entry.reject;
          entry.run = entry.resolve = entry.reject = undefined;
          reject?.(error);
          markReady();
          return true;
        },
      };
    };

    const enqueue = <T>(work: () => Promise<T>): Promise<T> =>
      enqueueEntry(work).promise;

    /** enqueue(), plus the entry's own readiness (see Entry.ready). */
    const enqueueTracked = <T>(
      work: () => Promise<T>,
    ): { promise: Promise<T>; ready: Promise<void> } => {
      const { promise, ready } = enqueueEntry(work);
      return { promise, ready };
    };

    // Set when database() is first called: from then on session.query() and
    // release() go through the FIFO too.
    let queued = false;

    const readTimeout = () => new Error('Query read timeout');
    const now = (): number => performance.now();

    /**
     * One statement through the FIFO with node-postgres's client-side
     * query_timeout counted from the call, on a monotonic clock, as it was
     * when node-postgres queued it: an entry still waiting at its deadline is
     * withdrawn (never sent) and rejects then; one sent later gets only the
     * time it has left. Without a configured timeout it simply queues.
     */
    const enqueueWithDeadline = <T>(
      submit: (remaining: number | undefined) => Promise<T>,
      // An absolute deadline on the monotonic clock, fixed at the public
      // call; undefined when no query_timeout is configured.
      deadline: number | undefined = deadlineFromNow(),
    ): Promise<T> => {
      if (deadline === undefined) return enqueue(() => submit(undefined));
      // Encoding (or anything else) may already have used the budget.
      if (deadline - now() <= 0) return Promise.reject(readTimeout());
      const { promise, cancel } = enqueueEntry(() => {
        const remaining = Math.ceil(deadline - now());
        if (remaining <= 0) return Promise.reject(readTimeout());
        return submit(remaining);
      });
      const timer = setTimeout(
        () => {
          cancel(readTimeout());
        },
        Math.max(0, deadline - now()),
      );
      return promise.finally(() => clearTimeout(timer));
    };

    /** The query_timeout deadline for a call made now, if one is set. */
    function deadlineFromNow(): number | undefined {
      const timeout = clientQueryTimeout();
      return timeout === 0 ? undefined : now() + timeout;
    }

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
    function clientQueryTimeout(): number {
      const value = Number(
        (
          sessionClient as unknown as {
            // biome-ignore lint/style/useNamingConvention: node-postgres option name
            connectionParameters?: { query_timeout?: unknown };
          }
        ).connectionParameters?.query_timeout,
      );
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    return {
      database: () => {
        const closed = closedError();
        if (closed) throw closed;
        if (!queued) {
          // The switch to the session's queue happens only on an idle
          // session, so nothing issued on the direct path can still be
          // running, and no transaction known to be open can be picked up by
          // managed transactions. A status not yet reported ('?') is
          // confirmed by the first managed BEGIN instead.
          if (directPending > 0 || !clientReady()) {
            throw new DatabaseError(
              'database() needs an idle session: a session.query() call is still running. Wait for it to settle (and, after a client-side timeout, for the statement to finish) before calling database().',
              {},
            );
          }
          if (transactionStatus === 'T' || transactionStatus === 'E') {
            throw new DatabaseError(
              `database() needs an idle session: PostgreSQL reports a transaction open on this connection (status ${transactionStatus}). COMMIT or ROLLBACK it first.`,
              { transactionStatus },
            );
          }
        }
        queued = true;
        sessionDatabase ??= createSessionDatabase({
          client: sessionClient,
          closedError,
          enqueue,
          enqueueTracked,
          onClose: (listener) => closeListeners.add(listener),
          discard: () => {
            lost = true;
            hardClose();
          },
          transactionStatus: () => transactionStatus,
          capture: captureValues,
        });
        return sessionDatabase;
      },
      destroy: () => {
        released = true;
        hardClose();
      },
      query: async (sql: string, ...values: any[]) => {
        // The query_timeout budget starts here, at the public call, and
        // covers encoding, waiting in the queue and running.
        const deadline = queued ? deadlineFromNow() : undefined;
        const closed = closedError();
        if (closed) throw closed;
        const normalized = normalizePostgresRawQuery(sql, values);
        // The parameters the error is redacted against. On the direct path
        // that is the caller's array, exactly as before the queue existed:
        // node-postgres binds from that same array when it submits, so it
        // holds what was actually sent. On the queue it is the snapshot
        // captured at the call (set below), which is what is sent there.
        let submittedValues: unknown[] = normalized.values;
        let outcome: Promise<PgQueryResult>;
        if (!queued) {
          // Until database() is first called the session is exactly as it
          // was before the queue existed: the statement is handed to
          // node-postgres now, with node-postgres's own timers.
          const sent = sessionClient.query(normalized.sql, normalized.values);
          directPending += 1;
          outcome = sent.finally(() => {
            directPending -= 1;
          });
        } else {
          // Through the FIFO. The bound values are encoded now, so a caller
          // that reuses its array, or mutates a Buffer or object in it,
          // cannot change this call.
          // An encoding failure (a cyclic object, say) becomes this call's
          // rejection, wrapped below like any other failure.
          const text = normalized.sql;
          // Nothing is sent if encoding fails; redact against a copy taken
          // now in that case.
          submittedValues = [...normalized.values];
          let bound: unknown[] | undefined;
          let encodingError: { error: unknown } | undefined;
          try {
            bound = captureValues(normalized.values) as unknown[];
          } catch (error) {
            encodingError = { error };
          }
          if (encodingError || bound === undefined) {
            outcome = Promise.reject(encodingError?.error);
          } else {
            const values = bound;
            submittedValues = bound;
            outcome = enqueueWithDeadline(
              (remaining) =>
                remaining === undefined
                  ? sessionClient.query(text, values)
                  : sessionClient.query({
                      text,
                      values,
                      // node-postgres honours a per-query query_timeout,
                      // though its QueryConfig type does not declare it.
                      // biome-ignore lint/style/useNamingConvention: node-postgres option name
                      query_timeout: remaining,
                    } as QueryConfig),
              deadline,
            );
          }
        }
        try {
          const result = await outcome;
          return {
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
          };
        } catch (e) {
          throw wrapDatabaseError('Failed to execute session query', e, {
            sql: normalized.sql,
            values: submittedValues,
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
        if (!lost && !queued) {
          // Never queued: exactly as before the queue existed.
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
        } else if (!lost) {
          // Through the FIFO, after the statements already queued. With a
          // client-side query_timeout configured, the cleanup statements
          // carry its deadline: if one cannot be sent (or finish) in time,
          // the lease is discarded without sending anything more, and the
          // server frees its locks when the backend exits.
          for (const statement of [
            'ROLLBACK',
            'SELECT pg_advisory_unlock_all()',
          ]) {
            try {
              await enqueueWithDeadline((remaining) =>
                remaining === undefined
                  ? sessionClient.query(statement)
                  : sessionClient.query({
                      text: statement,
                      // biome-ignore lint/style/useNamingConvention: node-postgres option name
                      query_timeout: remaining,
                    } as QueryConfig),
              );
            } catch (error) {
              if (!(error instanceof PgDatabaseError) && !lost && !dropped) {
                // A timeout (or another client-side failure): the
                // connection's state is unknown.
                hardClose();
                break;
              }
              // A server error (for example no transaction to roll back):
              // carry on with the next step.
            }
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
      provenance.transaction(txDb, 'callback');

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

    provenance.transaction(txHandle, 'manual');
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

  provenance.root(db);
  return claimConnectionAffinity(db, 'pool');
}
