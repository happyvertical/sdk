import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { DatabaseError } from '@happyvertical/utils';
import type { Client } from '@libsql/client';
import { DatabaseSchemaManager } from './schema-manager';
import { createSecureSqliteClient } from './secure-sqlite-client';
import {
  generateAddColumnStatement,
  generateCreateIndexStatement,
  validateColumnName,
  validateColumnNames,
  validateIndexName,
  validateTableName,
} from './shared/alter-utils';
import { validateDatabaseCacheOptions } from './shared/connection-cache';
import { redactDatabaseUrl } from './shared/redact-database-url';
import { getCachedSqliteDatabase } from './shared/sqlite-connection-cache';
import {
  createTransactionLock,
  DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS,
} from './shared/transaction-lock';
import type {
  ColumnDefinition,
  ColumnDefinitionWithName,
  DatabaseInterface,
  DatabaseOptions,
  IndexDefinition,
  QueryResult,
  SchemaInitializationOptions,
  SqliteCapabilitiesOptions,
  TableInterface,
  TableSchemaInfo,
  TransactionHandle,
  UpsertOptions,
} from './shared/types';
import { resolveSchemas } from './shared/types';
import {
  buildWhere,
  formatDbError,
  resolveInsertColumns,
} from './shared/utils';

/**
 * Connection cache for in-memory databases with memoryId
 * Enables sharing of :memory: databases across multiple getDatabase() calls
 */
const NULL_AWARE_UPSERT_MAX_ATTEMPTS = 8;
const NULL_AWARE_UPSERT_BASE_DELAY_MS = 25;
const nullAwareUpsertLocks = new Map<string, Promise<void>>();

interface SqliteTransactionClientLike {
  readonly closed: boolean;
  execute(statement: any): Promise<any>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): void;
}

interface SqliteClientLike {
  readonly transactionReservation?: 'exclusive';
  execute(statement: any): Promise<any>;
  transaction(mode?: any): Promise<SqliteTransactionClientLike>;
  close(): void | Promise<void>;
}

type SqliteExecutor = Pick<SqliteClientLike, 'execute'>;

const MANAGED_TRANSACTION_CONTROL_KEYWORDS = new Set([
  'begin',
  'commit',
  'end',
  'release',
  'rollback',
  'savepoint',
]);

function firstSqlKeyword(sql: string): string | undefined {
  let offset = 0;
  while (offset < sql.length) {
    const remaining = sql.slice(offset);
    const whitespace = remaining.match(/^\s+/)?.[0];
    if (whitespace) {
      offset += whitespace.length;
      continue;
    }
    if (remaining.startsWith('--')) {
      const newline = remaining.indexOf('\n', 2);
      if (newline === -1) return undefined;
      offset += newline + 1;
      continue;
    }
    if (remaining.startsWith('/*')) {
      const end = remaining.indexOf('*/', 2);
      if (end === -1) return undefined;
      offset += end + 2;
      continue;
    }
    if (remaining.startsWith(';')) {
      offset += 1;
      continue;
    }
    return remaining.match(/^[A-Za-z]+/)?.[0]?.toLowerCase();
  }
  return undefined;
}

function prepareManagedStatement(statement: any): any {
  const sql = typeof statement === 'string' ? statement : statement?.sql;
  if (
    typeof sql === 'string' &&
    MANAGED_TRANSACTION_CONTROL_KEYWORDS.has(firstSqlKeyword(sql) ?? '')
  ) {
    throw new DatabaseError(
      'Transaction-control SQL is managed by the SQLite transaction scope',
      {
        hint: 'Use transaction(), beginTransaction(), commit(), or rollback() instead of issuing BEGIN, COMMIT, ROLLBACK, SAVEPOINT, or RELEASE as raw SQL.',
      },
    );
  }

  // Validate and execute the same immutable statement snapshot. A getter or
  // Proxy must not be able to present harmless SQL to the transaction-control
  // guard and different SQL to the queued driver acquisition.
  if (typeof statement === 'object' && statement !== null) {
    const args = statement.args;
    return {
      sql,
      args: Array.isArray(args) ? [...args] : args,
    };
  }
  return statement;
}

interface InvocationBarrier {
  run<T>(work: () => Promise<T>): Promise<T>;
  close(work: () => void | Promise<void>): Promise<void>;
}

/**
 * Orders secure adapter calls at public invocation time.
 *
 * The reservation is appended before this function returns a promise. A later
 * `close()` therefore cannot overtake an operation while it awaits an internal
 * transaction/upsert lock before publishing work to the driver queue.
 */
function createInvocationBarrier(): InvocationBarrier {
  let tail = Promise.resolve();
  let closePromise: Promise<void> | undefined;
  let state: 'open' | 'closing' | 'closed' = 'open';

  const run = <T>(work: () => Promise<T>): Promise<T> => {
    if (state !== 'open') {
      return Promise.reject(
        new DatabaseError('Secure SQLite adapter is closing or closed', {}),
      );
    }

    const previous = tail;
    let release: () => void = () => {};
    const current = new Promise<void>((resolveCurrent) => {
      release = resolveCurrent;
    });
    tail = previous.then(
      () => current,
      () => current,
    );

    return previous.then(work, work).finally(release);
  };

  const close = (work: () => void | Promise<void>): Promise<void> => {
    if (state === 'closed') return Promise.resolve();
    if (closePromise) return closePromise;

    state = 'closing';
    closePromise = tail.then(work, work).then(
      () => {
        state = 'closed';
      },
      (error) => {
        state = 'open';
        closePromise = undefined;
        throw error;
      },
    );
    tail = closePromise.then(
      () => undefined,
      () => undefined,
    );
    return closePromise;
  };

  return { run, close };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toSafeSqliteCount(value: unknown): number {
  const count = typeof value === 'bigint' ? value : BigInt(String(value ?? 0));
  if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DatabaseError('SQLite count exceeds the safe integer range', {
      value: String(value),
      maximum: Number.MAX_SAFE_INTEGER,
    });
  }
  return Number(count);
}

function combineTransactionFailures(
  primary: unknown,
  secondary: unknown,
): AggregateError {
  return new AggregateError(
    [primary, secondary],
    'Transaction callback and accepted transaction work both failed',
    { cause: primary },
  );
}

interface PromiseObservation {
  observed: boolean;
  handlers: Set<Promise<void>>;
  nativeTransfers: Set<unknown>;
  suppressIntrinsicRecovery?: number;
}

async function settleNativePromiseTransfers(
  observations: Iterable<PromiseObservation>,
): Promise<void> {
  const transferred = [...observations].filter(
    (observation) => observation.nativeTransfers.size > 0,
  );
  if (transferred.length === 0) return;

  const unhandled = new Set<unknown>();
  const recordUnhandled = (reason: unknown) => {
    if (
      transferred.some((observation) => observation.nativeTransfers.has(reason))
    ) {
      unhandled.add(reason);
    }
  };
  process.on('unhandledRejection', recordUnhandled);
  try {
    // Native adoption does not expose the adopting Promise. Its rejection
    // checkpoint distinguishes caught await/combinator recovery from a
    // detached rejected adoption that the transaction must still own.
    await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
  } finally {
    process.off('unhandledRejection', recordUnhandled);
  }

  for (const observation of transferred) {
    if (
      [...observation.nativeTransfers].every((reason) => !unhandled.has(reason))
    ) {
      observation.observed = true;
    }
  }
}

function isNativePromiseAssimilation(
  onFulfilled: unknown,
  onRejected: unknown,
): boolean {
  const anonymousPromiseResolver = (handler: {
    name: string;
    length: number;
  }): boolean =>
    handler.name === '' &&
    handler.length === 1 &&
    Function.prototype.toString.call(handler) ===
      'function () { [native code] }';
  return (
    typeof onFulfilled === 'function' &&
    typeof onRejected === 'function' &&
    anonymousPromiseResolver(onFulfilled) &&
    anonymousPromiseResolver(onRejected)
  );
}

/**
 * Returns a native Promise chain that records when rejection is actually
 * consumed. Fulfillment-only `then()` and `finally()` preserve the marker on
 * their derived chain; a later `catch()` therefore still counts, while a
 * detached derived rejection remains visible to transaction draining.
 */
function withRejectionObservation<T>(
  source: Promise<T>,
  observation: PromiseObservation,
): Promise<T> {
  const wrap = <U>(promise: Promise<U>): Promise<U> => {
    const suppressIntrinsicRecovery = <V>(callback: () => V): V => {
      observation.suppressIntrinsicRecovery =
        (observation.suppressIntrinsicRecovery ?? 0) + 1;
      try {
        return callback();
      } finally {
        observation.suppressIntrinsicRecovery -= 1;
      }
    };
    // The transaction owns detached rejection reporting. Prevent the native
    // derived Promise from also surfacing as an unhandledRejection while its
    // shared observation record remains deliberately unhandled. Use the
    // intrinsic directly so this internal sink never counts as caller recovery.
    suppressIntrinsicRecovery(() => {
      void Promise.prototype.then.call(promise, undefined, () => undefined);
    });
    class ObservedPromise extends Promise<U> {
      static get [Symbol.species](): PromiseConstructor {
        const tracksRecovery =
          (observation.suppressIntrinsicRecovery ?? 0) === 0;
        class IntrinsicDerivedPromise extends Promise<unknown> {
          static get [Symbol.species](): PromiseConstructor {
            return (observation.suppressIntrinsicRecovery ?? 0) > 0
              ? Promise
              : (IntrinsicDerivedPromise as unknown as PromiseConstructor);
          }

          constructor(
            executor: (
              resolve: (value: unknown | PromiseLike<unknown>) => void,
              reject: (reason?: any) => void,
            ) => void,
          ) {
            let finishHandling: () => void = () => {};
            const handling = new Promise<void>((resolveHandling) => {
              finishHandling = resolveHandling;
            });
            super((resolve, reject) => {
              try {
                executor(
                  (value) => {
                    if (tracksRecovery) {
                      // Observe the final adoption outcome rather than merely
                      // the resolve() call: a rejection handler can return a
                      // rejected promise, which must remain a failure.
                      void new Promise<unknown>((resolveValue) =>
                        resolveValue(value),
                      ).then(
                        () => {
                          observation.observed = true;
                          finishHandling();
                        },
                        () => finishHandling(),
                      );
                    } else {
                      finishHandling();
                    }
                    resolve(value);
                  },
                  (reason) => {
                    finishHandling();
                    reject(reason);
                  },
                );
              } catch (error) {
                finishHandling();
                throw error;
              }
            });
            // Detached intrinsic chains are still owned by transaction
            // draining. Attach a non-observing rejection sink immediately so
            // a rethrow cannot escape as process-level unhandledRejection.
            suppressIntrinsicRecovery(() => {
              void Promise.prototype.then.call(
                this,
                undefined,
                () => undefined,
              );
            });
            if (tracksRecovery) {
              // Register synchronously: transaction draining may begin before
              // an asynchronous recovery handler resolves the derived promise.
              observation.handlers.add(handling);
              void handling.finally(() =>
                observation.handlers.delete(handling),
              );
            }
          }

          // Promise.prototype.then.call() bypasses ObservedPromise.then(), so
          // keep subsequent native chaining on the same observation record.
          // The species preserves this boundary so direct native chaining can
          // span any number of hops without losing the observation record.
          // biome-ignore lint/suspicious/noThenProperty: this is an actual Promise subclass preserving the public Promise contract.
          override then<TResult1 = unknown, TResult2 = never>(
            onFulfilled?:
              | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
              | null,
            onRejected?:
              | ((reason: any) => TResult2 | PromiseLike<TResult2>)
              | null,
          ): Promise<TResult1 | TResult2> {
            const transfersToNativePromise = isNativePromiseAssimilation(
              onFulfilled,
              onRejected,
            );
            const explicitlyHandlesRejection =
              typeof onRejected === 'function' && !transfersToNativePromise;
            const handleRejected = explicitlyHandlesRejection
              ? async (reason: any) => {
                  const recovered = await onRejected(reason);
                  observation.observed = true;
                  return recovered;
                }
              : transfersToNativePromise && typeof onRejected === 'function'
                ? (reason: any) => {
                    // Await/Promise assimilation transfers rejection to a
                    // native Promise. If that rejection escapes an await, the
                    // enclosing transaction callback still rejects normally;
                    // if the caller catches it, this operation is recovered.
                    observation.nativeTransfers.add(reason);
                    return onRejected(reason);
                  }
                : onRejected;
            const derived = suppressIntrinsicRecovery(
              () =>
                Promise.prototype.then.call(
                  this,
                  onFulfilled,
                  handleRejected,
                ) as Promise<TResult1 | TResult2>,
            );
            if (explicitlyHandlesRejection) {
              const handling = derived.then(
                () => undefined,
                () => undefined,
              );
              observation.handlers.add(handling);
              void handling.finally(() =>
                observation.handlers.delete(handling),
              );
            }
            return wrap(derived);
          }

          override catch<TResult = never>(
            onRejected?:
              | ((reason: any) => TResult | PromiseLike<TResult>)
              | null,
          ): Promise<unknown | TResult> {
            return this.then(undefined, onRejected);
          }

          override finally(
            onFinally?: (() => void | PromiseLike<void>) | null,
          ): Promise<unknown> {
            if (typeof onFinally !== 'function') {
              return this.then(
                (value) => value,
                (reason) => {
                  throw reason;
                },
              );
            }
            return this.then(
              (value) => Promise.resolve(onFinally()).then(() => value),
              (reason) =>
                Promise.resolve(onFinally()).then(() => {
                  throw reason;
                }),
            );
          }
        }
        return IntrinsicDerivedPromise as unknown as PromiseConstructor;
      }

      constructor() {
        super((resolve, reject) => {
          Promise.prototype.then.call(promise, resolve, reject);
        });
      }

      // biome-ignore lint/suspicious/noThenProperty: this is an actual Promise subclass preserving the public Promise contract.
      override then<TResult1 = U, TResult2 = never>(
        onFulfilled?: ((value: U) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
      ): Promise<TResult1 | TResult2> {
        // Promise assimilation (`await`, `Promise.resolve`, `Promise.all`, and
        // async helper adoption) supplies a pair of native resolving functions.
        // Those functions transfer rejection to a native Promise. The
        // enclosing callback still rejects if an await is not caught; a caught
        // await is therefore valid recovery and must not be rolled back again
        // by detached-operation draining.
        const transfersToNativePromise = isNativePromiseAssimilation(
          onFulfilled,
          onRejected,
        );
        const explicitlyHandlesRejection =
          typeof onRejected === 'function' && !transfersToNativePromise;
        const handleRejected = explicitlyHandlesRejection
          ? async (reason: any) => {
              const recovered = await onRejected(reason);
              observation.observed = true;
              return recovered;
            }
          : transfersToNativePromise && typeof onRejected === 'function'
            ? (reason: any) => {
                observation.nativeTransfers.add(reason);
                return onRejected(reason);
              }
            : onRejected;
        const derived = suppressIntrinsicRecovery(
          () =>
            Promise.prototype.then.call(
              this,
              onFulfilled,
              handleRejected,
            ) as Promise<TResult1 | TResult2>,
        );
        if (explicitlyHandlesRejection) {
          const handling = suppressIntrinsicRecovery(
            () =>
              Promise.prototype.then.call(
                derived,
                () => undefined,
                () => undefined,
              ) as Promise<void>,
          );
          observation.handlers.add(handling);
          void handling.finally(() => observation.handlers.delete(handling));
        }
        return wrap(derived);
      }

      override catch<TResult = never>(
        onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
      ): Promise<U | TResult> {
        if (typeof onRejected !== 'function') {
          return wrap(
            suppressIntrinsicRecovery(
              () =>
                Promise.prototype.then.call(
                  this,
                  undefined,
                  onRejected,
                ) as Promise<U | TResult>,
            ),
          );
        }
        const handleRejected = async (reason: any) => {
          const recovered = await onRejected(reason);
          observation.observed = true;
          return recovered;
        };
        const derived = suppressIntrinsicRecovery(
          () =>
            Promise.prototype.then.call(
              this,
              undefined,
              handleRejected,
            ) as Promise<U | TResult>,
        );
        const handling = suppressIntrinsicRecovery(
          () =>
            Promise.prototype.then.call(
              derived,
              () => undefined,
              () => undefined,
            ) as Promise<void>,
        );
        observation.handlers.add(handling);
        void handling.finally(() => observation.handlers.delete(handling));
        return wrap(derived);
      }

      override finally(onFinally?: (() => void) | null): Promise<U> {
        if (typeof onFinally !== 'function') {
          return wrap(
            suppressIntrinsicRecovery(
              () =>
                Promise.prototype.then.call(
                  this,
                  onFinally,
                  onFinally,
                ) as Promise<U>,
            ),
          );
        }
        const derived = suppressIntrinsicRecovery(
          () =>
            Promise.prototype.then.call(
              this,
              (value: U) => Promise.resolve(onFinally()).then(() => value),
              (reason: unknown) =>
                Promise.resolve(onFinally()).then(() => {
                  throw reason;
                }),
            ) as Promise<U>,
        );
        return wrap(derived);
      }
    }

    const observed = new ObservedPromise();
    suppressIntrinsicRecovery(() =>
      Promise.prototype.then.call(observed, undefined, () => undefined),
    );
    return observed;
  };

  return wrap(source);
}

function isRetriableSqliteTransactionError(error: unknown): boolean {
  const formatted = formatDbError(error).toLowerCase();
  return (
    formatted.includes('busy') ||
    formatted.includes('locked') ||
    formatted.includes('database is locked')
  );
}

async function withNullAwareUpsertLock<T>(
  lockKey: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = nullAwareUpsertLocks.get(lockKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => {}).then(() => current);

  nullAwareUpsertLocks.set(lockKey, next);
  await previous.catch(() => {});

  try {
    return await callback();
  } finally {
    release();

    if (nullAwareUpsertLocks.get(lockKey) === next) {
      nullAwareUpsertLocks.delete(lockKey);
    }
  }
}

/**
 * Generates a unique identifier for in-memory databases
 * @returns A unique database identifier string
 */
function generateDbId(): string {
  return `memory-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a LibSQL client using the default client implementation
 * Supports in-memory databases and remote LibSQL URLs
 *
 * @param options - SQLite connection options
 * @returns Promise resolving to a LibSQL client instance
 */
async function createLibSQLClient(
  options: SqliteOptions,
): Promise<SqliteClientLike> {
  const { url = ':memory:', authToken, encryptionKey } = options;

  // Normalize URLs: add file:// prefix for local paths
  let libsqlUrl = url;
  const remoteUrl = url.replace(/[\t\n\r]/g, '').trim();
  const hasRemoteScheme = /^(?:https?|libsql):/i.test(remoteUrl);
  if (hasRemoteScheme) {
    libsqlUrl = remoteUrl;
    let parsedRemoteUrl: URL;
    try {
      parsedRemoteUrl = new URL(remoteUrl);
    } catch {
      const safeUrl = redactDatabaseUrl(remoteUrl);
      throw new DatabaseError(`Invalid remote database URL: ${safeUrl}`, {
        url: safeUrl,
      });
    }
    if (!/^(?:https?|libsql):\/\//i.test(remoteUrl) || !parsedRemoteUrl.host) {
      const safeUrl = redactDatabaseUrl(remoteUrl);
      throw new DatabaseError(`Invalid remote database URL: ${safeUrl}`, {
        url: safeUrl,
      });
    }
  }
  if (url !== ':memory:' && !hasRemoteScheme && !url.startsWith('file:')) {
    // Local file path - resolve to absolute and add file:// prefix
    const { resolve } = await import('node:path');
    const absolutePath = resolve(url);
    // Use file:// format (file URL scheme with authority component omitted)
    libsqlUrl = `file://${absolutePath}`;
  }

  try {
    // Use explicit external import to avoid bundling
    const libsqlClient = '@libsql/client';
    const { createClient } = await import(/* @vite-ignore */ libsqlClient);
    return createClient({ url: libsqlUrl, authToken, encryptionKey }) as Client;
  } catch (error) {
    const errorMessage = redactDatabaseUrl(
      error instanceof Error ? error.message : String(error),
    );
    const safeUrl = redactDatabaseUrl(libsqlUrl);

    // Provide helpful error messages for common issues
    if (errorMessage?.includes('URL_SCHEME_NOT_SUPPORTED')) {
      throw new DatabaseError(
        `Unsupported URL scheme. Use ':memory:' for in-memory databases or 'libsql://' for remote LibSQL databases. URL: ${safeUrl}`,
        { url: safeUrl, originalError: errorMessage },
      );
    }

    // Re-throw other errors with context
    throw new DatabaseError(`Failed to create LibSQL client: ${errorMessage}`, {
      url: safeUrl,
      originalError: errorMessage,
    });
  }
}

/** Options for the trusted-parent SQLite file acquisition boundary. */
export interface SecureSqliteFileOptions {
  /**
   * Built-in driver that owns the secure acquisition and exact integer path.
   *
   * @default 'node:sqlite'
   */
  driver: 'node:sqlite';

  /**
   * Assert that the application controls the database parent directory.
   * The adapter verifies current-user ownership, non-writable group/other
   * permissions, current-user/root ancestor ownership, static symlink absence,
   * and no macOS ACL before acquisition.
   */
  custody: 'trusted-parent';

  /**
   * Optional application data root. Defaults to the database's direct parent.
   * Every database parent at or below this root must satisfy the custody check.
   */
  root?: string;
}

/**
 * Configuration options for SQLite database connections
 */
export interface SqliteOptions extends DatabaseOptions {
  /**
   * Connection URL for SQLite database
   * Supported schemes:
   * - ':memory:' for in-memory databases
   * - 'file:path/to/database.db' for local file databases
   * - 'libsql://...' for remote LibSQL/Turso databases
   */
  url?: string;

  /**
   * Authentication token for Turso/LibSQL remote connections
   */
  authToken?: string;

  /**
   * Encryption key for encrypted SQLite databases (LibSQL feature)
   */
  encryptionKey?: string;

  /**
   * Unique identifier for in-memory databases to enable connection sharing
   * Calls using the same dbid and the same LibSQL/native adapter path receive
   * the same database connection instance. `clearCache` evicts both paths.
   *
   * Auto-generated for :memory: databases if not provided.
   */
  dbid?: string;

  /**
   * Optional native SQLite capabilities for local development and testing.
   *
   * When any capability is enabled, the adapter uses the internal native
   * SQLite implementation instead of the LibSQL client path. Native
   * capabilities are only supported for local SQLite databases.
   */
  capabilities?: SqliteCapabilitiesOptions;

  /**
   * Require trusted-parent acquisition for a local file-backed database.
   *
   * This requires an explicit `trusted-parent` custody assertion, verifies the
   * application data root/parent chain and rejects static symlinks before the
   * built-in `node:sqlite` driver opens the file. Other principals cannot
   * replace a path under the custodied parent. It does not claim protection
   * from a hostile same-account process, which can directly replace or rewrite
   * an unencrypted user-owned database.
   *
   * Existing pathname behavior is unchanged when omitted or false.
   */
  secureFile?: boolean | SecureSqliteFileOptions;

  /**
   * How long a queued transaction waits for the connection, in milliseconds.
   *
   * Applies to the single-connection adapters — SQLite (both the LibSQL and
   * native paths), DuckDB and JSON. Those drive one connection, so transactions
   * run one at a time and an overlapping `transaction()` waits its turn.
   * PostgreSQL pools and ignores this.
   *
   * The clock starts when the call queues, not when the connection frees, so
   * this bounds the total wait rather than any single transaction: raise it for
   * workloads with long transactions *or* with sustained bursts on one
   * connection. Must be positive and finite.
   *
   * Read once, when the connection is created. Adapters that cache connections
   * hand a later `getDatabase()` for the same database the existing one, which
   * keeps the timeout the first caller asked for.
   *
   * @default 30000
   */
  transactionQueueTimeout?: number;

  /**
   * Schema definitions for tables.
   * Accepts a record or a lazy function (see SchemasOption).
   *
   * When provided, these schemas will be used for table creation.
   * Accepts a lazy function to defer schema building until needed.
   */
  schemas?: import('./shared/types').SchemasOption;
}

function hasNativeSqliteCapabilities(options: SqliteOptions): boolean {
  return Boolean(
    options.capabilities?.notifications || options.capabilities?.vector,
  );
}

/**
 * Creates tables from provided schema definitions
 *
 * @param client - LibSQL client
 * @param schemas - Schema definitions to create
 */
async function createTablesFromSchemas(
  client: any,
  schemas: Record<string, import('./shared/types').SchemaProvider>,
): Promise<void> {
  for (const [tableName, schema] of Object.entries(schemas)) {
    try {
      // Check if table already exists
      const result = await client.execute({
        sql: `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        args: [tableName],
      });

      if (result.rows.length > 0) {
        console.log(`[sqlite] Table ${tableName} already exists, skipping`);
        continue;
      }

      console.log(`[sqlite] Creating table ${tableName} from provided schema`);

      // Create table from DDL
      await client.execute(schema.ddl);

      // Create indexes
      if (schema.indexes && schema.indexes.length > 0) {
        for (const indexSQL of schema.indexes) {
          try {
            await client.execute(indexSQL);
          } catch (error) {
            console.warn(
              `[sqlite] Failed to create index for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      // Create triggers (if supported)
      if (schema.triggers && schema.triggers.length > 0) {
        for (const triggerSQL of schema.triggers) {
          try {
            await client.execute(triggerSQL);
          } catch (error) {
            console.warn(
              `[sqlite] Failed to create trigger for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `[sqlite] Error creating table ${tableName}:`,
        error instanceof Error ? error.message : String(error),
      );
      console.error(`[sqlite] DDL was:`, schema.ddl?.substring(0, 200) + '...');
      throw new DatabaseError(
        `Failed to create table ${tableName} from schema: ${error instanceof Error ? error.message : String(error)}`,
        {
          tableName,
          schema,
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}

/**
 * Creates a SQLite database adapter
 *
 * @param options - SQLite connection options
 * @returns Database interface for SQLite
 */
export async function getDatabase(
  options: SqliteOptions = {},
): Promise<DatabaseInterface> {
  validateDatabaseCacheOptions(options);
  const url = options.url || ':memory:';

  // Auto-generate dbid for :memory: databases if not provided
  // Mutate options object to ensure child objects reuse the same connection
  if (url === ':memory:' && !options.dbid && options.cache !== false) {
    options.dbid = generateDbId();
  }

  if (options.secureFile) {
    if (options.secureFile === true) {
      throw new DatabaseError(
        'Secure SQLite acquisition requires an explicit trusted-parent custody contract',
        {
          hint: "Use secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' } after placing the database beneath a current-user-owned parent with no group/world write permission.",
        },
      );
    }
    const secureOptions = options.secureFile;
    if (secureOptions.driver !== 'node:sqlite') {
      throw new DatabaseError(
        `Unsupported secure SQLite driver: ${String(secureOptions.driver)}`,
        {
          hint: "Use secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' }.",
        },
      );
    }
    if (secureOptions.custody !== 'trusted-parent') {
      throw new DatabaseError(
        'Secure SQLite acquisition requires trusted-parent custody',
        {
          hint: "Set custody: 'trusted-parent' only when the application controls the database parent directory.",
        },
      );
    }
    if (options.authToken || options.encryptionKey) {
      throw new DatabaseError(
        'Secure SQLite acquisition does not support LibSQL authentication or encryption options',
        {
          hint: 'Remove authToken/encryptionKey for a local secure file, or disable secureFile to use LibSQL features.',
        },
      );
    }
    if (hasNativeSqliteCapabilities(options)) {
      throw new DatabaseError(
        'Secure SQLite acquisition cannot be combined with native SQLite capabilities',
        {
          hint: 'Use either secureFile custody or optional native capabilities for a connection, not both.',
        },
      );
    }

    return getCachedSqliteDatabase('secure', options, () =>
      createDatabase(options, url, () =>
        createSecureSqliteClient(url, {
          custody: secureOptions.custody,
          root: secureOptions.root,
        }),
      ),
    );
  }

  if (hasNativeSqliteCapabilities(options)) {
    const sqliteNative = await import('./sqlite-native.js');
    return sqliteNative.getNativeSqliteDatabase(options);
  }

  return getCachedSqliteDatabase('libsql', options, () =>
    createDatabase(options, url),
  );
}

async function createDatabase(
  options: SqliteOptions,
  url: string,
  clientFactory: () => Promise<SqliteClientLike> = () =>
    createLibSQLClient(options),
): Promise<DatabaseInterface> {
  return (async () => {
    const client = await clientFactory();

    // One lock per connection. Nothing else in this closure escapes to another
    // caller, and `getDatabase` hands cached callers this same closure, so
    // "created here" and "per connection" are the same scope.
    const connectionLock = createTransactionLock(
      'sqlite',
      options.transactionQueueTimeout,
    );
    const executorContext = new AsyncLocalStorage<SqliteExecutor>();
    const currentExecutor = (): SqliteExecutor =>
      executorContext.getStore() ?? client;

    // Initialize tables from provided schemas (resolves lazy function if needed)
    const resolvedSchemas = resolveSchemas(options.schemas);
    if (resolvedSchemas && Object.keys(resolvedSchemas).length > 0) {
      try {
        await createTablesFromSchemas(client, resolvedSchemas);
      } catch (error) {
        try {
          await client.close();
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'LibSQL schema initialization and cleanup failed',
          );
        }
        throw error;
      }
    }

    /**
     * Serializes a value for SQLite storage
     * Converts objects and arrays to JSON strings
     * Converts Dates to ISO strings
     * Passes through primitives unchanged
     */
    const serializeValue = (value: any): any => {
      if (value === null || value === undefined) {
        return value;
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return value;
    };

    /**
     * Serializes all values in an object
     */
    const serializeRecord = (
      record: Record<string, any>,
    ): Record<string, any> => {
      const serialized: Record<string, any> = {};
      for (const [key, value] of Object.entries(record)) {
        // Skip undefined values - they cannot be passed to the database
        if (value === undefined) {
          continue;
        }
        serialized[key] = serializeValue(value);
      }
      return serialized;
    };

    const hasNullConflictValue = (
      conflictColumns: string[],
      data: Record<string, any>,
    ): boolean => conflictColumns.some((col) => data[col] === null);

    const buildNullAwareUpsertLockKey = (
      table: string,
      conflictColumns: string[],
    ): string => {
      // SQLite equality is schema-affinity dependent: an INTEGER column can
      // treat 1, 1n, true, and the string "1" as the same conflict value. A
      // value-derived key cannot reproduce that without loading the schema.
      // Serialize all null-aware attempts for one logical constraint instead.
      const material = JSON.stringify({
        url,
        table: table.toLowerCase(),
        // SQLite accepts equivalent composite conflict targets in either
        // column order. Canonicalize that caller-provided order so every
        // spelling of one logical constraint shares the same lock.
        conflicts: [
          ...new Set(conflictColumns.map((column) => column.toLowerCase())),
        ].sort(),
      });
      return `sqlite-null-aware:${createHash('sha256').update(material).digest('hex')}`;
    };

    const validateUpsertConflictColumns = (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): void => {
      const missingColumns = conflictColumns.filter(
        (col) => !(col in serializedData),
      );

      if (missingColumns.length > 0) {
        throw new DatabaseError('Conflict columns missing from data', {
          table,
          conflictColumns,
          missingColumns,
          availableColumns: Object.keys(serializedData),
          hint: 'All columns specified in ON CONFLICT must be present in the data being inserted. Undefined values are filtered out during serialization - consider using null or an empty string instead.',
        });
      }
    };

    const executeStandardUpsert = async (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): Promise<QueryResult> => {
      const keys = Object.keys(serializedData);
      const values = Object.values(serializedData);
      const placeholders = keys.map(() => '?').join(', ');
      const updateSet = keys
        .map((key) => `${key} = excluded.${key}`)
        .join(', ');
      const conflict = conflictColumns.join(', ');
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;

      const result = await currentExecutor().execute({ sql, args: values });
      return { operation: 'upsert', affected: result.rowsAffected };
    };

    const executeNullAwareUpsertAttempt = async (
      executor: SqliteExecutor,
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): Promise<QueryResult> => {
      const keys = Object.keys(serializedData);
      const values = Object.values(serializedData);
      const updateSet = keys.map((key) => `${key} = ?`).join(', ');
      const whereClause = conflictColumns
        .map((col) => `${col} IS ?`)
        .join(' AND ');
      const whereValues = conflictColumns.map((col) => serializedData[col]);

      const updateSql = `UPDATE ${table} SET ${updateSet} WHERE ${whereClause}`;
      const updateResult = await executor.execute({
        sql: updateSql,
        args: [...values, ...whereValues],
      });

      if ((updateResult.rowsAffected ?? 0) > 0) {
        return { operation: 'upsert', affected: updateResult.rowsAffected };
      }

      const placeholders = keys.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
      const insertResult = await executor.execute({
        sql: insertSql,
        args: values,
      });

      return { operation: 'upsert', affected: insertResult.rowsAffected };
    };

    const executeNullAwareUpsertWithRetry = async (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
      lockKey: string,
    ): Promise<QueryResult> => {
      if (url === ':memory:') {
        return withNullAwareUpsertLock(lockKey, () =>
          executeNullAwareUpsertAttempt(
            client,
            table,
            conflictColumns,
            serializedData,
          ),
        );
      }

      let lastError: unknown;

      for (
        let attempt = 0;
        attempt < NULL_AWARE_UPSERT_MAX_ATTEMPTS;
        attempt++
      ) {
        let transaction: SqliteTransactionClientLike | undefined;

        // This opens a transaction on the shared connection like any other, so
        // it takes the same lock — otherwise a null-aware upsert overlapping a
        // `transaction()` call reintroduces exactly the corruption the lock
        // exists to prevent. Acquired per attempt so the retry backoff below
        // waits without holding the connection.
        const releaseConnection = await connectionLock.acquire();
        try {
          return await withNullAwareUpsertLock(lockKey, async () => {
            transaction = await client.transaction('write');

            const result = await executeNullAwareUpsertAttempt(
              transaction,
              table,
              conflictColumns,
              serializedData,
            );

            await transaction.commit();
            return result;
          });
        } catch (error) {
          lastError = error;

          if (transaction && !transaction.closed) {
            try {
              await transaction.rollback();
            } catch (rollbackError) {
              lastError = combineTransactionFailures(lastError, rollbackError);
            }
          }
        } finally {
          transaction?.close();
          releaseConnection();
        }

        if (
          lastError &&
          attempt < NULL_AWARE_UPSERT_MAX_ATTEMPTS - 1 &&
          isRetriableSqliteTransactionError(lastError)
        ) {
          await delay(NULL_AWARE_UPSERT_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }

        break;
      }

      throw lastError;
    };

    /**
     * Rejects hostile table/column identifiers before an upsert builds SQL.
     *
     * Called from the public entry points rather than from `executeUpsert`, so
     * the failure reaches the caller naming the bad identifier instead of being
     * flattened into the wrapper's generic "Failed to upsert record into table".
     *
     * Validates the keys of the already-serialized snapshot — the exact array
     * the executors interpolate — not a fresh enumeration of the caller's
     * `data`. Enumerating `data` again could disagree with the snapshot if it is
     * a Proxy whose `ownKeys` trap returns different keys on successive reads.
     */
    const validateUpsertIdentifiers = (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): void => {
      validateTableName(table);
      validateColumnNames([...conflictColumns, ...Object.keys(serializedData)]);
    };

    const executeUpsert = async (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
      options: UpsertOptions | undefined,
      acquireTransaction: boolean,
    ): Promise<QueryResult> => {
      validateUpsertConflictColumns(table, conflictColumns, serializedData);

      if (
        options?.nullsDistinct ||
        !hasNullConflictValue(conflictColumns, serializedData)
      ) {
        return executeStandardUpsert(table, conflictColumns, serializedData);
      }

      if (!acquireTransaction) {
        const executor = currentExecutor();
        return withNullAwareUpsertLock(
          buildNullAwareUpsertLockKey(table, conflictColumns),
          () =>
            executeNullAwareUpsertAttempt(
              executor,
              table,
              conflictColumns,
              serializedData,
            ),
        );
      }

      return executeNullAwareUpsertWithRetry(
        table,
        conflictColumns,
        serializedData,
        buildNullAwareUpsertLockKey(table, conflictColumns),
      );
    };

    /**
     * Inserts one or more records into a table
     *
     * @param table - Table name
     * @param data - Single record or array of records to insert
     * @returns Promise resolving to operation result
     * @throws Error if the insert operation fails
     */
    const insert = async (
      table: string,
      data: Record<string, any> | Record<string, any>[],
    ): Promise<QueryResult> => {
      validateTableName(table);
      let sql: string;
      let values: any[];

      if (Array.isArray(data)) {
        if (data.length === 0) {
          return { operation: 'insert', affected: 0 };
        }
        // Serialize all records in the array
        const serializedRecords: Array<Record<string, any>> = data.map(
          (record) => serializeRecord(record),
        );
        const keys = resolveInsertColumns(table, serializedRecords);
        validateColumnNames(keys);
        const placeholders = serializedRecords
          .map(() => `(${keys.map(() => '?').join(', ')})`)
          .join(', ');
        sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;
        // Project through `keys` rather than each record's own key order, so a
        // record whose keys were inserted in a different order still binds each
        // value to its own column.
        values = serializedRecords.flatMap((record) =>
          keys.map((key) => record[key]),
        );
      } else {
        // Serialize the single record
        const serializedData = serializeRecord(data);
        const keys = Object.keys(serializedData);
        validateColumnNames(keys);
        const placeholders = keys.map(() => '?').join(', ');
        sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        values = Object.values(serializedData);
      }
      try {
        const result = await currentExecutor().execute({
          sql: sql,
          args: values,
        });
        return { operation: 'insert', affected: result.rowsAffected };
      } catch (e) {
        throw new DatabaseError('Failed to insert records into table', {
          table,
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Retrieves a single record matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to matching record or null if not found
     * @throws Error if the query fails
     */
    const get = async (
      table: string,
      where: Record<string, any>,
    ): Promise<Record<string, any> | null> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');
      if (!whereClause) {
        throw new DatabaseError(
          'GET requires at least one WHERE condition to prevent returning an arbitrary record',
          { table },
        );
      }

      const sql = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = await currentExecutor().execute({
          sql: sql,
          args: values,
        });
        return result.rows[0] || null;
      } catch (e) {
        throw new DatabaseError('Failed to retrieve record from table', {
          table,
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Retrieves multiple records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to array of matching records
     * @throws Error if the query fails
     */
    const list = async (
      table: string,
      where: Record<string, any>,
    ): Promise<Record<string, any>[]> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');
      const sql = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = await currentExecutor().execute({ sql, args: values });
        return result.rows;
      } catch (e) {
        throw new DatabaseError('Failed to list records from table', {
          table,
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Updates records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records to update
     * @param data - New data to set
     * @returns Promise resolving to operation result
     * @throws Error if the update operation fails
     */
    const update = async (
      table: string,
      where: Record<string, any>,
      data: Record<string, any>,
    ): Promise<QueryResult> => {
      validateTableName(table);
      // Serialize the data to update
      const serializedData = serializeRecord(data);
      const keys = Object.keys(serializedData);
      validateColumnNames(keys);
      const values = Object.values(serializedData);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      const { sql: whereClause, values: whereValues } = buildWhere(
        where,
        values.length + 1,
        'sqlite',
      );
      if (!whereClause) {
        throw new DatabaseError(
          'UPDATE requires at least one WHERE condition to prevent accidental update of all records',
          { table },
        );
      }

      const sql = `UPDATE ${table} SET ${setClause} ${whereClause}`;
      try {
        const result = await currentExecutor().execute({
          sql,
          args: [...values, ...whereValues],
        });
        return { operation: 'update', affected: result.rowsAffected };
      } catch (e) {
        throw new DatabaseError('Failed to update records in table', {
          table,
          sql,
          values: [...values, ...whereValues],
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Inserts a record or updates it if it already exists (UPSERT)
     *
     * @param table - Table name
     * @param conflictColumns - Columns that define the uniqueness constraint
     * @param data - Data to insert or update
     * @returns Promise resolving to operation result
     * @throws Error if the upsert operation fails
     */
    const upsert = async (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
      options?: UpsertOptions,
    ): Promise<QueryResult> => {
      // Snapshot the record and the conflict columns once and thread both
      // through validation and SQL, so neither a hostile record nor a hostile
      // conflict-column array can present different identifiers to each.
      const serializedData = serializeRecord(data);
      const conflictCols = [...conflictColumns];
      validateUpsertIdentifiers(table, conflictCols, serializedData);
      try {
        return await executeUpsert(
          table,
          conflictCols,
          serializedData,
          options,
          true,
        );
      } catch (e) {
        if (
          e instanceof DatabaseError &&
          e.message === 'Conflict columns missing from data'
        ) {
          throw e;
        }

        throw new DatabaseError('Failed to upsert record into table', {
          table,
          values: data,
          conflictColumns,
          originalError: formatDbError(e),
        });
      }
    };

    // Names nested savepoints. Only ever appended to an identifier the adapter
    // generates, never caller input.
    let savepointSequence = 0;

    const upsertInCurrentTransaction = async (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
      options?: UpsertOptions,
    ): Promise<QueryResult> => {
      // Snapshot the record and the conflict columns once and thread both
      // through validation and SQL, so neither a hostile record nor a hostile
      // conflict-column array can present different identifiers to each.
      const serializedData = serializeRecord(data);
      const conflictCols = [...conflictColumns];
      validateUpsertIdentifiers(table, conflictCols, serializedData);
      try {
        return await executeUpsert(
          table,
          conflictCols,
          serializedData,
          options,
          false,
        );
      } catch (e) {
        if (
          e instanceof DatabaseError &&
          e.message === 'Conflict columns missing from data'
        ) {
          throw e;
        }

        throw new DatabaseError('Failed to upsert record into table', {
          table,
          values: data,
          conflictColumns,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Gets a record matching the where criteria or inserts it if not found
     *
     * @param table - Table name
     * @param where - Criteria to match existing record
     * @param data - Data to insert if no record found
     * @returns Promise resolving to the record (either retrieved or newly inserted)
     * @throws Error if the operation fails or if the record cannot be retrieved after insert
     */
    const getOrInsert = async (
      table: string,
      where: Record<string, any>,
      data: Record<string, any>,
    ): Promise<Record<string, any>> => {
      const result = await get(table, where);
      if (result) return result;
      await insert(table, data);

      const inserted = await get(table, where);
      if (!inserted) {
        throw new DatabaseError('Failed to insert and retrieve record', {
          table,
          where,
          data,
        });
      }
      return inserted;
    };

    /**
     * Deletes records from a table matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records for deletion
     * @returns Promise resolving to operation result with count of deleted rows
     * @throws Error if the delete operation fails
     */
    const deleteRecords = async (
      table: string,
      where: Record<string, any>,
    ): Promise<QueryResult> => {
      validateTableName(table);

      const keys = Object.keys(where);
      if (keys.length === 0) {
        throw new DatabaseError(
          'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
          { table },
        );
      }

      const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');

      try {
        await currentExecutor().execute({
          sql: `DELETE FROM ${table} ${whereClause}`,
          args: values,
        });

        // SQLite doesn't reliably return affected rows, so we can't provide an exact count
        return { operation: 'delete', affected: 1 };
      } catch (e) {
        throw new DatabaseError('Failed to delete records from table', {
          table,
          where,
          originalError: e,
        });
      }
    };

    /**
     * Counts records in a table matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records (optional, counts all if omitted)
     * @returns Promise resolving to count of matching records
     * @throws Error if the count operation fails
     */
    const count = async (
      table: string,
      where?: Record<string, any>,
    ): Promise<number> => {
      validateTableName(table);

      try {
        if (!where || Object.keys(where).length === 0) {
          // Count all records. Built as a plain string rather than through the
          // `pluck` tagged template, which would bind the table name as a
          // parameter and emit `SELECT COUNT(*) FROM ?`. Interpolating the
          // identifier is safe because validateTableName ran above.
          const result = await currentExecutor().execute({
            sql: `SELECT COUNT(*) as count FROM ${table}`,
            args: [],
          });
          return toSafeSqliteCount(result.rows[0]?.count);
        }

        // Count with conditions
        const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');

        const result = await currentExecutor().execute({
          sql: `SELECT COUNT(*) as count FROM ${table} ${whereClause}`,
          args: values,
        });

        return toSafeSqliteCount(result.rows[0]?.count);
      } catch (e) {
        if (e instanceof DatabaseError) throw e;
        throw new DatabaseError('Failed to count records in table', {
          table,
          where,
          originalError: e,
        });
      }
    };

    /**
     * Checks if a table exists in the database
     *
     * @param tableName - Name of the table to check
     * @returns Promise resolving to boolean indicating if the table exists
     */
    const tableExists = async (tableName: string): Promise<boolean> => {
      const tableExists =
        !!(await pluck`SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`);
      return tableExists;
    };

    /**
     * Synchronizes database schema with provided SQL DDL
     * Creates tables if they don't exist and adds missing columns
     *
     * @param schema - SQL schema definition with CREATE TABLE statements
     * @returns Promise that resolves when schema is synchronized
     */
    const syncSchema = async (schema: string): Promise<void> => {
      console.log(
        '[sqlite.syncSchema] Starting schema sync for dbid:',
        options.dbid,
      );
      console.log('[sqlite.syncSchema] Schema length:', schema.length, 'chars');

      // List of SQL reserved keywords that need to stay quoted
      const reservedKeywords = new Set([
        'references',
        'order',
        'group',
        'table',
        'index',
        'select',
        'from',
        'where',
        'join',
        'left',
        'right',
        'inner',
        'outer',
        'on',
        'as',
        'and',
        'or',
        'not',
        'like',
        'in',
        'between',
        'case',
        'when',
        'then',
        'else',
        'end',
        'union',
        'distinct',
        'having',
        'limit',
        'offset',
        'default',
        'check',
        'unique',
        'primary',
        'foreign',
        'key',
        'constraint',
        'cascade',
      ]);

      // Normalize whitespace and simplify CAST expressions
      let normalizedSchema = schema
        .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
        .replace(/DEFAULT CAST\(([^)]+)\s+AS\s+\w+\)/gi, 'DEFAULT $1') // Simplify CAST in DEFAULT clauses
        .trim();

      // Remove quotes around identifiers EXCEPT for reserved keywords
      normalizedSchema = normalizedSchema.replace(
        /"(\w+)"/g,
        (match, identifier) => {
          return reservedKeywords.has(identifier.toLowerCase())
            ? match
            : identifier;
        },
      );

      console.log('[sqlite.syncSchema] Normalized schema:', normalizedSchema);

      // Split into individual commands
      const commands = normalizedSchema
        .split(';')
        .map((cmd) => cmd.trim())
        .filter((cmd) => cmd.length > 0);

      console.log(
        '[sqlite.syncSchema] Found',
        commands.length,
        'commands to process',
      );

      // Execute each command
      for (const command of commands) {
        try {
          console.log(
            '[sqlite.syncSchema] Executing:',
            `${command.substring(0, 50)}...`,
          );
          await currentExecutor().execute(command);
          console.log('[sqlite.syncSchema] Successfully executed command');
        } catch (error) {
          console.error(
            '[sqlite.syncSchema] Failed to execute command:',
            command,
          );
          console.error('[sqlite.syncSchema] Error:', error);
          throw error;
        }
      }
    };

    /**
     * Coordinates nested savepoints for one enclosing transaction.
     *
     * SQLite permits nesting, but releasing an earlier sibling savepoint while
     * a later sibling is open destroys the later savepoint. Each scope owns a
     * child queue; the root drain also keeps un-awaited accepted children alive
     * until the enclosing commit or rollback.
     */
    type NestedTransaction = (<T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
    ) => Promise<T>) & {
      drain: () => Promise<void>;
      runOperation: <T>(operation: () => Promise<T>) => Promise<T>;
      runNested: <T>(
        callback: (tx: DatabaseInterface) => Promise<T>,
      ) => Promise<T>;
    };

    type TransactionOperationRunner = <T>(
      operation: () => Promise<T>,
    ) => Promise<T>;

    type NestedTransactionRunner = <T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
    ) => Promise<T>;

    interface TransactionScope {
      database: DatabaseInterface;
      sealAndDrain: () => Promise<void>;
    }

    const createNestedTransaction = (
      transactionClient: SqliteExecutor,
    ): NestedTransaction => {
      interface NestedScope {
        accepting: boolean;
        tail: Promise<void>;
        children: Set<{
          observed: boolean;
          handlers: Set<Promise<void>>;
          nativeTransfers: Set<unknown>;
          error?: unknown;
        }>;
      }
      const scopeContext = new AsyncLocalStorage<NestedScope>();
      const rootScope: NestedScope = {
        accepting: true,
        tail: Promise.resolve(),
        children: new Set(),
      };

      const enqueueInScope = <T>(
        scope: NestedScope,
        operation: () => Promise<T>,
      ): Promise<T> => {
        if (!scope.accepting) {
          return Promise.reject(
            new DatabaseError('Nested transaction scope is ending', {}),
          );
        }
        const current = scope.tail.then(operation);
        scope.tail = current.then(
          () => undefined,
          () => undefined,
        );
        return current;
      };

      const assertBoundScope = (scope: NestedScope): void => {
        const ambientScope = scopeContext.getStore();
        if (ambientScope && ambientScope !== scope) {
          throw new DatabaseError(
            'A parent transaction handle cannot run inside a nested transaction callback',
            {
              hint: 'Use the nested callback transaction handle, or wait for the nested transaction to settle before using its parent handle.',
            },
          );
        }
      };

      const runBoundOperation = <T>(
        scope: NestedScope,
        operation: () => Promise<T>,
      ): Promise<T> => {
        try {
          assertBoundScope(scope);
          return enqueueInScope(scope, operation);
        } catch (error) {
          return Promise.reject(error);
        }
      };

      const drainNestedScope = async (scope: NestedScope): Promise<void> => {
        await scope.tail;
        while ([...scope.children].some((child) => child.handlers.size > 0)) {
          await Promise.all(
            [...scope.children].flatMap((child) => [...child.handlers]),
          );
        }
        await settleNativePromiseTransfers(scope.children);
        const failures = [...scope.children]
          .filter((child) => !child.observed && 'error' in child)
          .map((child) => child.error);
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) {
          throw new AggregateError(
            failures,
            'Accepted nested transactions failed',
          );
        }
      };

      const runScope = async <T>(
        scope: NestedScope,
        callback: (tx: DatabaseInterface) => Promise<T>,
      ): Promise<T> => {
        savepointSequence += 1;
        const name = `hv_sp_${savepointSequence}`;
        await transactionClient.execute({
          sql: `SAVEPOINT ${name}`,
          args: [],
        });
        const callbackScope = createTransactionScope(
          transactionClient,
          nestedTransaction,
          (operation) => runBoundOperation(scope, operation),
          (nestedCallback) => {
            try {
              assertBoundScope(scope);
              return startNested(scope, nestedCallback);
            } catch (error) {
              return Promise.reject(error);
            }
          },
        );
        const drainScope = async (): Promise<void> => {
          await callbackScope.sealAndDrain();
          // A rejected sibling must not let a later queued savepoint outlive
          // this scope.
          await drainNestedScope(scope);
        };
        try {
          const result = await callback(callbackScope.database);
          scope.accepting = false;
          await drainScope();
          await transactionClient.execute({
            sql: `RELEASE SAVEPOINT ${name}`,
            args: [],
          });
          return result;
        } catch (error) {
          scope.accepting = false;
          let failure = error;
          try {
            await drainScope();
          } catch (drainError) {
            if (drainError !== error) {
              failure = combineTransactionFailures(error, drainError);
            }
          }
          try {
            await transactionClient.execute({
              sql: `ROLLBACK TO SAVEPOINT ${name}`,
              args: [],
            });
            await transactionClient.execute({
              sql: `RELEASE SAVEPOINT ${name}`,
              args: [],
            });
          } catch (teardownError) {
            if (teardownError !== failure) {
              failure = combineTransactionFailures(failure, teardownError);
            }
          }
          throw failure;
        }
      };

      const startNested = <T>(
        parentScope: NestedScope,
        callback: (tx: DatabaseInterface) => Promise<T>,
      ): Promise<T> => {
        if (!parentScope.accepting) {
          return Promise.reject(
            new DatabaseError('Nested transaction scope is ending', {}),
          );
        }
        const scope: NestedScope = {
          accepting: true,
          tail: Promise.resolve(),
          children: new Set(),
        };
        const child = {
          observed: false,
          handlers: new Set<Promise<void>>(),
          nativeTransfers: new Set<unknown>(),
        } as PromiseObservation & {
          error?: unknown;
        };
        parentScope.children.add(child);
        const current = enqueueInScope(parentScope, () =>
          scopeContext.run(scope, () => runScope(scope, callback)),
        );
        void current.catch((error) => {
          child.error = error;
        });
        // Preserve rejection observation through fulfillment-only `.then()`
        // and `.finally()` chains. Only a rejection handler (including the one
        // installed by `await`) makes a failed savepoint recoverable.
        return withRejectionObservation(current, child);
      };

      const nestedTransaction = (<T>(
        callback: (tx: DatabaseInterface) => Promise<T>,
      ): Promise<T> =>
        startNested(
          scopeContext.getStore() ?? rootScope,
          callback,
        )) as NestedTransaction;
      nestedTransaction.drain = () => {
        rootScope.accepting = false;
        return drainNestedScope(rootScope);
      };
      nestedTransaction.runOperation = <T>(
        operation: () => Promise<T>,
      ): Promise<T> => runBoundOperation(rootScope, operation);
      nestedTransaction.runNested = <T>(
        callback: (tx: DatabaseInterface) => Promise<T>,
      ): Promise<T> => {
        try {
          assertBoundScope(rootScope);
          return startNested(rootScope, callback);
        } catch (error) {
          return Promise.reject(error);
        }
      };
      return nestedTransaction;
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
      preAcquiredLock?: Promise<() => void>,
    ): Promise<T> => {
      // Held across the whole BEGIN … COMMIT/ROLLBACK span. Without it two
      // overlapping calls raced on the one connection: the second BEGIN threw,
      // its catch ran ROLLBACK, and that rollback ended the *first*
      // transaction — half of its writes durable, half lost, and its promise
      // rejected, so the caller was told nothing had happened.
      const releaseConnection = await (preAcquiredLock ??
        connectionLock.acquire());
      try {
        if (client.transactionReservation !== 'exclusive') {
          let nestedTransaction: NestedTransaction | undefined;
          let transactionScope: TransactionScope | undefined;
          try {
            await client.execute({ sql: 'BEGIN TRANSACTION', args: [] });
            nestedTransaction = createNestedTransaction(client);
            transactionScope = createTransactionScope(
              client,
              nestedTransaction,
            );
            const result = await callback(transactionScope.database);
            await transactionScope.sealAndDrain();
            await nestedTransaction.drain();
            await client.execute({ sql: 'COMMIT', args: [] });
            return result;
          } catch (error) {
            let failure = error;
            try {
              await transactionScope?.sealAndDrain();
            } catch (drainError) {
              if (drainError !== error) {
                failure = combineTransactionFailures(failure, drainError);
              }
            }
            try {
              await nestedTransaction?.drain();
            } catch (drainError) {
              if (drainError !== failure) {
                failure = combineTransactionFailures(failure, drainError);
              }
            }
            try {
              await client.execute({ sql: 'ROLLBACK', args: [] });
            } catch {
              // Nothing left to roll back.
            }
            throw failure;
          }
        }

        const transactionClient = await client.transaction('write');
        let nestedTransaction: NestedTransaction | undefined;
        let transactionScope: TransactionScope | undefined;
        try {
          nestedTransaction = createNestedTransaction(transactionClient);
          transactionScope = createTransactionScope(
            transactionClient,
            nestedTransaction,
          );
          const result = await callback(transactionScope.database);
          await transactionScope.sealAndDrain();
          await nestedTransaction.drain();
          await transactionClient.commit();
          return result;
        } catch (error) {
          let failure = error;
          try {
            await transactionScope?.sealAndDrain();
          } catch (drainError) {
            if (drainError !== error) {
              failure = combineTransactionFailures(failure, drainError);
            }
          }
          try {
            await nestedTransaction?.drain();
          } catch (drainError) {
            if (drainError !== failure) {
              failure = combineTransactionFailures(failure, drainError);
            }
          }
          // A failing ROLLBACK must not replace the caller's error — SQLite
          // reports "cannot rollback - no transaction is active" whenever the
          // transaction is already gone, which says nothing about what failed.
          if (!transactionClient.closed) {
            try {
              await transactionClient.rollback();
            } catch (rollbackError) {
              failure = combineTransactionFailures(failure, rollbackError);
            }
          }
          throw failure;
        } finally {
          transactionClient.close();
        }
      } finally {
        releaseConnection();
      }
    };

    /**
     * Builds the transaction-scoped interface handed to a transaction callback.
     *
     * The only difference from the top-level interface is `transaction`: this
     * one re-enters the transaction already in progress under a savepoint
     * instead of issuing a second BEGIN. SQLite shares one connection, so the
     * old behaviour of re-exposing the top-level `transaction` sent a nested
     * call into `BEGIN` on a connection that was already in a transaction; that
     * throws, and the nested call's own ROLLBACK then discarded the *enclosing*
     * transaction's work while later writes silently committed in autocommit.
     */
    const createTransactionScope = (
      transactionClient: SqliteExecutor,
      nestedTransaction: NestedTransaction,
      runOperation: TransactionOperationRunner = nestedTransaction.runOperation,
      runNested: NestedTransactionRunner = nestedTransaction.runNested,
    ): TransactionScope => {
      const isSecureTransaction = client.transactionReservation === 'exclusive';
      const scopedExecutor: SqliteExecutor = isSecureTransaction
        ? {
            execute: (statement: any) => {
              return transactionClient.execute(
                prepareManagedStatement(statement),
              );
            },
          }
        : transactionClient;
      let accepting = true;
      const pending = new Set<Promise<unknown>>();
      const operations = new Set<PromiseObservation & { error?: unknown }>();
      let drainPromise: Promise<void> | undefined;
      const bind = <T extends (...args: any[]) => Promise<any>>(
        fn: T,
        trackFailure = true,
      ): T =>
        ((...args: Parameters<T>) => {
          if (!accepting) {
            return Promise.reject(
              new DatabaseError('Transaction scope is ending or ended', {}),
            );
          }
          const run = () =>
            Promise.resolve(
              executorContext.run(scopedExecutor, () => fn(...args)),
            );
          const operation = isSecureTransaction ? runOperation(run) : run();
          const tracked = {
            observed: false,
            handlers: new Set<Promise<void>>(),
            nativeTransfers: new Set<unknown>(),
          } as PromiseObservation & {
            error?: unknown;
          };
          operations.add(tracked);
          pending.add(operation);
          void operation.then(
            () => pending.delete(operation),
            (error) => {
              pending.delete(operation);
              if (trackFailure) tracked.error = error;
            },
          );
          return withRejectionObservation(operation, tracked);
        }) as T;
      const scopedInsert = bind(insert);
      const scopedGet = bind(get);
      const scopedList = bind(list);
      const scopedUpdate = bind(update);
      const scopedUpsert = bind(upsertInCurrentTransaction);
      const scopedGetOrInsert = bind(getOrInsert);
      const scopedDelete = bind(deleteRecords);
      const scopedCount = bind(count);
      const scopedMany = bind(many);
      const scopedSingle = bind(single);
      const scopedPluck = bind(pluck);
      const scopedExecute = bind(execute);
      const scopedQuery = bind(query);
      const scopedTableExists = bind(tableExists);
      const scopedSyncSchema = bind(syncSchema);
      const scopedTable = (tableName: string): TableInterface => {
        if (!accepting) {
          const reject = () =>
            Promise.reject(
              new DatabaseError('Transaction scope is ending or ended', {}),
            );
          return { insert: reject, get: reject, list: reject };
        }
        return {
          insert: (data) => scopedInsert(tableName, data),
          get: (where) => scopedGet(tableName, where),
          list: (where) => scopedList(tableName, where),
        };
      };

      // Do not assimilate the coordinator's observation-aware thenable here.
      // Awaited/caught savepoint rollback is recoverable; detached failure is
      // retained by the nested coordinator and propagated during root drain.
      const scopedTransaction = (<T>(
        callback: (tx: DatabaseInterface) => Promise<T>,
      ): Promise<T> => {
        if (!accepting) {
          return Promise.reject(
            new DatabaseError('Transaction scope is ending or ended', {}),
          );
        }
        return executorContext.run(scopedExecutor, () => runNested(callback));
      }) as typeof nestedTransaction;

      const scopedClient = {
        transactionReservation: 'exclusive' as const,
        execute: bind((statement: any) => scopedExecutor.execute(statement)),
        transaction: () =>
          Promise.reject(
            new DatabaseError(
              'Use the transaction scope transaction() method instead of client.transaction()',
              {},
            ),
          ),
        close: () =>
          Promise.reject(
            new DatabaseError(
              'Transaction-scoped SQLite clients cannot be closed directly',
              {},
            ),
          ),
      };

      const txDb: DatabaseInterface = {
        url,
        client:
          client.transactionReservation === 'exclusive'
            ? scopedClient
            : transactionClient,
        insert: scopedInsert,
        get: scopedGet,
        list: scopedList,
        update: scopedUpdate,
        upsert: scopedUpsert,
        getOrInsert: scopedGetOrInsert,
        delete: scopedDelete,
        count: scopedCount,
        table: scopedTable,
        many: scopedMany,
        single: scopedSingle,
        pluck: scopedPluck,
        execute: scopedExecute,
        query: scopedQuery,
        oo: scopedMany,
        oO: scopedSingle,
        ox: scopedPluck,
        xx: scopedExecute,
        tableExists: scopedTableExists,
        syncSchema: scopedSyncSchema,
        transaction: scopedTransaction,
      };

      return {
        database: txDb,
        sealAndDrain: async () => {
          accepting = false;
          drainPromise ??= (async () => {
            while (pending.size > 0) {
              await Promise.allSettled([...pending]);
            }
            while ([...operations].some((entry) => entry.handlers.size > 0)) {
              await Promise.all(
                [...operations].flatMap((entry) => [...entry.handlers]),
              );
            }
            await settleNativePromiseTransfers(operations);
            const failures = [...operations]
              .filter(
                (operation) => !operation.observed && 'error' in operation,
              )
              .map((operation) => operation.error);
            if (failures.length === 1) throw failures[0];
            if (failures.length > 1) {
              throw new AggregateError(
                failures,
                'Accepted transaction operations failed',
              );
            }
          })();
          return drainPromise;
        },
      };
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
      preAcquiredLock?: Promise<() => void>,
    ): Promise<TransactionHandle> => {
      // The handle owns the connection until the caller ends it, so the lock
      // is held across the gap rather than around a single call. A handle that
      // is never committed or rolled back therefore blocks every later
      // transaction until the queue timeout reports it.
      const releaseConnection = await (preAcquiredLock ??
        connectionLock.acquire());
      let transactionClient: SqliteTransactionClientLike | undefined;
      try {
        if (client.transactionReservation === 'exclusive') {
          transactionClient = await client.transaction('write');
        } else {
          await client.execute({ sql: 'BEGIN TRANSACTION', args: [] });
        }
      } catch (error) {
        // No transaction was opened, so there is no handle to end it and
        // nothing left to release the connection.
        releaseConnection();
        throw error;
      }

      let active = true;
      let nestedTransaction: NestedTransaction | undefined;
      let transactionScope: TransactionScope | undefined;

      // COMMIT and ROLLBACK can both throw, and the transaction is over either
      // way, so the connection goes back before the error is rethrown.
      const end = async (command: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
        if (!active) {
          throw new DatabaseError('Transaction already ended', {});
        }
        active = false;
        try {
          let drainFailure: unknown;
          try {
            await transactionScope?.sealAndDrain();
          } catch (error) {
            drainFailure = error;
          }
          try {
            await nestedTransaction?.drain();
          } catch (error) {
            drainFailure = drainFailure
              ? combineTransactionFailures(drainFailure, error)
              : error;
          }
          if (drainFailure) throw drainFailure;
          if (transactionClient) {
            if (command === 'COMMIT') {
              await transactionClient.commit();
            } else {
              await transactionClient.rollback();
            }
          } else {
            await client.execute({ sql: command, args: [] });
          }
        } catch (error) {
          // COMMIT can fail and leave the transaction *open* — SQLite documents
          // exactly that for SQLITE_BUSY. Releasing the connection then would hand
          // the next queued caller a connection still inside a transaction: its
          // BEGIN would throw, and its catch would ROLLBACK, discarding this
          // transaction's work. So normalize before releasing, the way the pooled
          // adapter's discardTxClient does.
          let failure = error;
          if (transactionClient && !transactionClient.closed) {
            try {
              await transactionClient.rollback();
            } catch (rollbackError) {
              failure = combineTransactionFailures(failure, rollbackError);
            }
          } else if (!transactionClient) {
            try {
              await client.execute({ sql: 'ROLLBACK', args: [] });
            } catch (rollbackError) {
              failure = combineTransactionFailures(failure, rollbackError);
            }
          }
          throw failure;
        } finally {
          transactionClient?.close();
          releaseConnection();
        }
      };

      const commit = (): Promise<void> => end('COMMIT');

      const rollback = (): Promise<void> => end('ROLLBACK');

      const isActive = (): boolean => active;

      // Create a transaction-scoped database interface with commit/rollback.
      // The handle is inside a transaction for the same reason a callback scope
      // is, so it gets the same savepoint-based nesting rather than the
      // top-level `transaction`.
      const executor = transactionClient ?? client;
      nestedTransaction = createNestedTransaction(executor);
      transactionScope = createTransactionScope(executor, nestedTransaction);
      const txHandle: TransactionHandle = {
        ...transactionScope.database,
        commit,
        rollback,
        isActive,
      };

      return txHandle;
    };

    /**
     * Creates a table-specific interface for simplified table operations
     *
     * @param tableName - Table name
     * @returns TableInterface for the specified table
     */
    const table = (tableName: string): TableInterface => ({
      insert: (data) => insert(tableName, data),
      get: (where) => get(tableName, where),
      list: (where) => list(tableName, where),
    });

    /**
     * Parses a tagged template literal into a SQL query and values
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Object with SQL query and values array
     */
    const parseTemplate = (strings: TemplateStringsArray, ...vars: any[]) => {
      let sql = strings[0];
      const values = [];
      for (let i = 0; i < vars.length; i++) {
        values.push(vars[i]);
        sql += `?${strings[i + 1]}`;
      }
      return { sql, values };
    };

    /**
     * Executes a SQL query using template literals and returns a single value
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single value (first column of first row)
     * @throws Error if the query fails
     */
    const pluck = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<any> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await currentExecutor().execute({ sql, args: values });
        return result.rows[0]?.[Object.keys(result.rows[0])[0]] ?? null;
      } catch (e) {
        throw new DatabaseError('Failed to execute pluck query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a SQL query using template literals and returns a single row
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single result record or null
     * @throws Error if the query fails
     */
    const single = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<Record<string, any> | null> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await currentExecutor().execute({ sql, args: values });
        return result.rows[0] || null;
      } catch (e) {
        throw new DatabaseError('Failed to execute single query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a SQL query using template literals and returns multiple rows
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to array of result records
     * @throws Error if the query fails
     */
    const many = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<Record<string, any>[]> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await currentExecutor().execute({ sql, args: values });
        return result.rows;
      } catch (e) {
        throw new DatabaseError('Failed to execute many query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a SQL query using template literals without returning results
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise that resolves when the query completes
     * @throws Error if the query fails
     */
    const execute = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<void> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        await currentExecutor().execute({ sql, args: values });
      } catch (e) {
        throw new DatabaseError('Failed to execute query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a raw SQL query with parameterized values
     *
     * @param str - SQL query string
     * @param values - Variables to use as parameters
     * @returns Promise resolving to query result with rows and metadata
     * @throws Error if the query fails
     */
    const query = async (str: string, ...values: any[]) => {
      const sql = str;
      const args = Array.isArray(values[0]) ? values[0] : values;
      try {
        const result = await currentExecutor().execute({ sql, args });
        return {
          command: sql.split(' ')[0].toUpperCase(),
          rowCount: result.rowsAffected ?? result.rows.length,
          oid: null,
          fields: Object.keys(result.rows[0] || {}).map((name) => ({
            name,
            tableID: 0,
            columnID: 0,
            dataTypeID: 0,
            dataTypeSize: -1,
            dataTypeModifier: -1,
            format: 'text',
          })),
          rows: result.rows,
        };
      } catch (e) {
        throw new DatabaseError('Failed to execute raw query', {
          sql,
          args,
          originalError: formatDbError(e),
        });
      }
    };

    // Shorthand aliases for query methods
    const oo = many; // (o)bjective-(o)bjects: returns multiple rows
    const oO = single; // (o)bjective-(O)bject: returns a single row
    const ox = pluck; // (o)bjective-(x): returns a single value
    const xx = execute; // (x)ecute-(x)ecute: executes without returning

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
        query,
        insert,
        update,
        upsert,
        get,
        list,
        getOrInsert,
        delete: deleteRecords,
        count,
        table,
        tableExists,
        many,
        single,
        pluck,
        execute,
        oo,
        oO,
        ox,
        xx,
        syncSchema,
        transaction,
      };

      await schemaManager.initializeSchemas(currentDb, options);
    };

    /**
     * Retrieves the schema information for a table
     *
     * @param table - Table name
     * @returns Promise resolving to table schema info or null if table doesn't exist
     * @throws Error if the query fails
     */
    const getTableSchema = async (
      table: string,
    ): Promise<TableSchemaInfo | null> => {
      validateTableName(table);

      try {
        // Check if table exists
        const exists = await tableExists(table);
        if (!exists) {
          return null;
        }

        // Get column information from pragma_table_info
        const columnRows =
          await many`SELECT * FROM pragma_table_info(${table})`;

        const columns: Record<string, ColumnDefinition> = {};
        for (const row of columnRows) {
          const colName = row.name as string;
          columns[colName] = {
            type: row.type as string,
            primaryKey: row.pk === 1,
            notNull: row.notnull === 1,
            defaultValue: row.dflt_value,
          };
        }

        // Get index information from sqlite_master
        const indexRows = await many`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'index'
          AND tbl_name = ${table}
          AND name NOT LIKE 'sqlite_%'
      `;

        const indexes: IndexDefinition[] = [];
        for (const row of indexRows) {
          const indexName = row.name as string;

          // Get index columns from pragma_index_info
          const indexInfoRows =
            await many`SELECT * FROM pragma_index_info(${indexName})`;

          const indexColumns: string[] = [];
          for (const infoRow of indexInfoRows) {
            indexColumns.push(infoRow.name as string);
          }

          // Check if index is unique from pragma_index_list
          const indexListRow =
            await single`SELECT * FROM pragma_index_list(${table}) WHERE name = ${indexName}`;

          indexes.push({
            name: indexName,
            columns: indexColumns,
            unique: indexListRow?.unique === 1,
          });
        }

        // Get foreign key information from pragma_foreign_key_list
        const fkRows =
          await many`SELECT * FROM pragma_foreign_key_list(${table})`;

        const foreignKeys: Array<{
          column: string;
          referencesTable: string;
          referencesColumn: string;
          onDelete?: string;
          onUpdate?: string;
        }> = [];

        for (const fkRow of fkRows) {
          foreignKeys.push({
            column: fkRow.from as string,
            referencesTable: fkRow.table as string,
            referencesColumn: fkRow.to as string,
            onDelete: fkRow.on_delete as string | undefined,
            onUpdate: fkRow.on_update as string | undefined,
          });
        }

        return {
          tableName: table,
          columns,
          indexes,
          foreignKeys,
        };
      } catch (e) {
        throw new DatabaseError('Failed to retrieve table schema', {
          table,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * ALTER TABLE operations for schema evolution
     */
    const alterTable = {
      /**
       * Adds a new column to an existing table
       *
       * @param table - Table name
       * @param column - Column definition with name
       * @returns Promise that resolves when column is added
       * @throws Error if the alter operation fails
       */
      addColumn: async (
        table: string,
        column: ColumnDefinitionWithName,
      ): Promise<void> => {
        validateTableName(table);
        validateColumnName(column.name);

        try {
          const sql = generateAddColumnStatement(table, column, 'sqlite');
          await currentExecutor().execute({ sql, args: [] });
        } catch (e) {
          throw new DatabaseError('Failed to add column to table', {
            table,
            column: column.name,
            originalError: formatDbError(e),
          });
        }
      },

      /**
       * Adds a new index to an existing table
       *
       * @param table - Table name
       * @param index - Index definition
       * @returns Promise that resolves when index is created
       * @throws Error if the create index operation fails
       */
      addIndex: async (
        table: string,
        index: IndexDefinition,
      ): Promise<void> => {
        validateTableName(table);
        validateIndexName(index.name);

        for (const col of index.columns) {
          validateColumnName(col);
        }

        try {
          const sql = generateCreateIndexStatement(table, index);
          await currentExecutor().execute({ sql, args: [] });
        } catch (e) {
          throw new DatabaseError('Failed to create index on table', {
            table,
            index: index.name,
            originalError: formatDbError(e),
          });
        }
      },
    };

    let closed = false;
    const rawClose = async () => {
      if (closed) return;
      await client.close();
      closed = true;
    };
    const db: DatabaseInterface = {
      url,
      client,
      query,
      insert,
      update,
      upsert,
      get,
      list,
      getOrInsert,
      delete: deleteRecords,
      count,
      table,
      tableExists,
      many,
      single,
      pluck,
      execute,
      oo,
      oO,
      ox,
      xx,
      syncSchema,
      initializeSchemas,
      transaction,
      beginTransaction,
      getTableSchema,
      alterTable,
      close: rawClose,
    };

    if (client.transactionReservation !== 'exclusive') return db;

    const barrier = createInvocationBarrier();
    const reserve = <T extends (...args: any[]) => Promise<any>>(fn: T): T =>
      ((...args: Parameters<T>) => barrier.run(() => fn(...args))) as T;
    const managedRootExecutor: SqliteExecutor = {
      execute: (statement: any) => {
        return client.execute(prepareManagedStatement(statement));
      },
    };
    const reserveManaged = <T extends (...args: any[]) => Promise<any>>(
      fn: T,
    ): T =>
      ((...args: Parameters<T>) => {
        const timeoutMs =
          options.transactionQueueTimeout ??
          DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS;
        let expired = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(
              new DatabaseError(
                `Timed out after ${timeoutMs}ms waiting for the sqlite connection's current operation to finish`,
                { adapter: 'sqlite', timeoutMs },
              ),
            );
          }, timeoutMs);
        });
        const queued = barrier.run(async () => {
          if (expired) return deadline;
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
          if (connectionLock.held) {
            const releaseConnection = await connectionLock.acquire();
            releaseConnection();
          }
          return executorContext.run(managedRootExecutor, () => fn(...args));
        });
        return Promise.race([queued, deadline]).finally(() => {
          if (timer) clearTimeout(timer);
        });
      }) as T;
    const reservedTable = (tableName: string): TableInterface => {
      const scoped = table(tableName);
      return {
        insert: reserveManaged(scoped.insert),
        get: reserveManaged(scoped.get),
        list: reserveManaged(scoped.list),
      };
    };
    const reservedAlterTable = {
      addColumn: reserveManaged(alterTable.addColumn),
      addIndex: reserveManaged(alterTable.addIndex),
    };
    const reserveTransactionEntry = <T>(
      work: (preAcquiredLock: Promise<() => void>) => Promise<T>,
    ): Promise<T> => {
      // Start the deadline at invocation, but do not enqueue on connectionLock
      // until this call reaches its barrier turn. Speculatively taking the
      // connection while an earlier retrying upsert owns the barrier reverses
      // the normal connection -> nullable-key order and deadlocks both calls.
      const timeoutMs =
        options.transactionQueueTimeout ?? DEFAULT_TRANSACTION_QUEUE_TIMEOUT_MS;
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(
            new DatabaseError(
              `Timed out after ${timeoutMs}ms waiting for the sqlite connection's current transaction to finish`,
              { adapter: 'sqlite', timeoutMs },
            ),
          );
        }, timeoutMs);
      });
      const queued = barrier.run(async () => {
        if (expired) return deadline;
        const acquisition = connectionLock.acquire();
        try {
          const release = await Promise.race([acquisition, deadline]);
          if (expired) {
            release();
            return deadline;
          }
          // transactionQueueTimeout bounds only queue acquisition. Once this
          // invocation owns the connection, its callback/handle lifetime is
          // governed by the caller and must not be rejected by the old wait
          // deadline while it is actively doing work.
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
          return work(Promise.resolve(release));
        } catch (error) {
          // A deadline can win while acquire() remains queued. Give that future
          // turn back immediately so a timed-out invocation never runs later or
          // strands callers behind it.
          if (expired)
            void acquisition.then(
              (release) => release(),
              () => {},
            );
          throw error;
        }
      });
      return Promise.race([queued, deadline]).finally(() => {
        if (timer) clearTimeout(timer);
      });
    };
    const reservedTransaction: typeof transaction = <T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
    ) =>
      reserveTransactionEntry((preAcquiredLock) =>
        transaction(callback, preAcquiredLock),
      );
    const reservedBeginTransaction: typeof beginTransaction = () =>
      reserveTransactionEntry((preAcquiredLock) =>
        beginTransaction(preAcquiredLock),
      );
    const reservedClient = {
      transactionReservation: 'exclusive' as const,
      execute: reserve((statement: any) => {
        return client.execute(prepareManagedStatement(statement));
      }),
      transaction: () =>
        Promise.reject(
          new DatabaseError(
            'Use database.transaction() or database.beginTransaction() instead of client.transaction()',
            {},
          ),
        ),
      close: () => barrier.close(rawClose),
    };

    return {
      ...db,
      client: reservedClient,
      query: reserveManaged(query),
      insert: reserveManaged(insert),
      update: reserveManaged(update),
      upsert: reserveManaged(upsert),
      get: reserveManaged(get),
      list: reserveManaged(list),
      getOrInsert: reserveManaged(getOrInsert),
      delete: reserveManaged(deleteRecords),
      count: reserveManaged(count),
      table: reservedTable,
      tableExists: reserveManaged(tableExists),
      many: reserveManaged(many),
      single: reserveManaged(single),
      pluck: reserveManaged(pluck),
      execute: reserveManaged(execute),
      oo: reserveManaged(oo),
      oO: reserveManaged(oO),
      ox: reserveManaged(ox),
      xx: reserveManaged(xx),
      syncSchema: reserveManaged(syncSchema),
      initializeSchemas: reserveManaged(initializeSchemas),
      transaction: reservedTransaction,
      beginTransaction: reservedBeginTransaction,
      getTableSchema: reserveManaged(getTableSchema),
      alterTable: reservedAlterTable,
      close: () => barrier.close(rawClose),
    };
  })();
}
