/**
 * PGlite adapter: real PostgreSQL compiled to WebAssembly, in the browser and
 * in Node.
 *
 * `@electric-sql/pglite` is an optional peer dependency, imported only when
 * this adapter creates a database. The module's import graph is browser-safe —
 * no `node:` built-ins and no `pg` — so it can be bundled for a page. Import it
 * from `@happyvertical/sql/pglite` there; the package root also reaches
 * Node-only adapters.
 *
 * It speaks the same Postgres dialect as the `pg` adapter (native UUID ids and
 * foreign keys, BIGINT, migrations): both run the statement logic in
 * `./shared/postgres-dialect`.
 *
 * @packageDocumentation
 */

import { DatabaseError } from '@happyvertical/utils';
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
  type PostgresQueryExecutor,
} from './shared/postgres-dialect';
import { createTransactionLock } from './shared/transaction-lock';
import type {
  DatabaseCacheOptions,
  DatabaseInterface,
  SchemaInitializationOptions,
  SchemasOption,
  TransactionHandle,
} from './shared/types';

/** Package an install hint should name. */
const PGLITE_PACKAGE = '@electric-sql/pglite';

/**
 * Thrown when the optional `@electric-sql/pglite` peer cannot be imported.
 */
export class PGlitePeerMissingError extends DatabaseError {
  constructor(cause?: unknown) {
    super(
      `The pglite database type needs the optional peer dependency ${PGLITE_PACKAGE}. Install it with \`pnpm add ${PGLITE_PACKAGE}\` (or the npm/yarn equivalent).`,
      { adapter: 'pglite', peer: PGLITE_PACKAGE },
      cause,
    );
    this.name = 'PGlitePeerMissingError';
  }
}

/**
 * The part of a PGlite query result this adapter reads.
 */
interface PGliteResultLike {
  rows: any[];
  affectedRows?: number;
  rowCount?: number;
  command?: string;
}

/**
 * The part of a PGlite transaction object this adapter drives.
 */
interface PGliteTransactionLike {
  query(sql: string, params?: any[]): Promise<PGliteResultLike>;
  exec(sql: string): Promise<PGliteResultLike[]>;
  rollback(): Promise<void>;
  readonly closed: boolean;
}

/**
 * The part of a PGlite instance this adapter drives. A `PGlite` and a
 * `PGliteWorker` both satisfy it.
 */
export interface PGliteLike {
  query(sql: string, params?: any[]): Promise<PGliteResultLike>;
  exec(sql: string): Promise<PGliteResultLike[]>;
  transaction<T>(
    callback: (tx: PGliteTransactionLike) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

/**
 * Configuration options for PGlite databases
 */
export interface PGliteOptions extends DatabaseCacheOptions {
  /**
   * Database type identifier
   */
  type?: 'pglite';

  /**
   * Where the database lives.
   *
   * - `memory://` or omitted: in memory, gone when the instance closes
   * - `idb://<name>`: IndexedDB (browser)
   * - `opfs-ahp://<name>`: Origin Private File System (browser, in a worker)
   * - any other value: a filesystem directory (Node, Bun, Deno)
   *
   * `url` is accepted as an alias so `HAVE_SQL_URL` selects a location.
   */
  dataDir?: string;

  /**
   * Alias for {@link dataDir}.
   */
  url?: string;

  /**
   * PGlite extensions to load, keyed by the name `CREATE EXTENSION` uses.
   * Forwarded as-is to PGlite, so pass the extension objects the PGlite
   * packages export, for example:
   *
   * ```typescript
   * import { vector } from '@electric-sql/pglite-pgvector';
   * await getDatabase({ type: 'pglite', extensions: { vector } });
   * ```
   */
  extensions?: Record<string, unknown>;

  /**
   * Further options forwarded to PGlite's constructor (`relaxedDurability`,
   * `initialMemory`, `loadDataDir`, `fs`, `parsers`, ...). `dataDir` and
   * `extensions` are taken from the options above.
   */
  pglite?: Record<string, unknown>;

  /**
   * Use a PGlite instance you created yourself, such as a `PGliteWorker` that
   * keeps the database off the main thread. The adapter never closes it and
   * never caches the database it builds around it.
   */
  client?: PGliteLike;

  /**
   * Opaque caller-owned cache identity. Calls with the same `dbid` share one
   * database. Without one, a persistent `dataDir` is its own identity — two
   * PGlite instances on the same storage would corrupt it — while an in-memory
   * database is private to the call that made it.
   */
  dbid?: string;

  /**
   * How long a queued transaction — or a statement issued while a transaction
   * is open — waits for the connection, in milliseconds. PGlite runs one
   * connection, so these run one at a time. Must be positive and finite.
   *
   * @default 30000
   */
  transactionQueueTimeout?: number;

  /**
   * Schema definitions for tables.
   *
   * **PGlite ignores this option** — like PostgreSQL, tables are managed by
   * migrations. It exists so callers can pass schemas uniformly to all
   * adapters.
   */
  schemas?: SchemasOption;
}

const connectionCache = new ConnectionCache<DatabaseInterface>();

/**
 * Clears the PGlite connection cache, closing every cached database.
 * Useful for test isolation.
 */
export async function clearPGliteConnectionCache(): Promise<void> {
  await connectionCache.clear(async (db) => {
    await db.close?.();
  });
}

interface PGliteModule {
  // biome-ignore lint/style/useNamingConvention: mirrors the package's export
  PGlite: {
    create(
      dataDir?: string,
      options?: Record<string, unknown>,
    ): Promise<PGliteLike>;
  };
  // biome-ignore lint/style/useNamingConvention: mirrors the package's export
  messages: { DatabaseError: new (...args: any[]) => Error };
}

/**
 * Imports the optional peer. Isolated so a missing install becomes a typed
 * {@link PGlitePeerMissingError} instead of a bare module-resolution failure.
 */
export async function importPGlite(): Promise<PGliteModule> {
  try {
    const loaded = (await import('@electric-sql/pglite')) as unknown as
      | (PGliteModule & { default?: PGliteModule })
      | undefined;
    const module =
      typeof loaded?.PGlite?.create === 'function' ? loaded : loaded?.default;
    if (typeof module?.PGlite?.create !== 'function') {
      throw new Error(`${PGLITE_PACKAGE} did not export PGlite`);
    }
    return module;
  } catch (error) {
    throw new PGlitePeerMissingError(error);
  }
}

const IN_MEMORY = 'memory://';

const isInMemory = (dataDir: string): boolean =>
  dataDir === '' || dataDir.startsWith(IN_MEMORY);

/**
 * Creates a PGlite database adapter.
 *
 * @param options - PGlite options
 * @returns Database interface for PGlite
 * @throws {PGlitePeerMissingError} When `@electric-sql/pglite` is not installed
 */
export async function getDatabase(
  options: PGliteOptions = {},
): Promise<DatabaseInterface> {
  validateDatabaseCacheOptions(options);
  const dataDir = options.dataDir ?? options.url ?? IN_MEMORY;
  const key = options.client
    ? undefined
    : options.dbid
      ? `pglite:id:${options.dbid}`
      : isInMemory(dataDir)
        ? undefined
        : `pglite:dir:${dataDir}`;
  return connectionCache.getOrCreate(
    key,
    options,
    () => createDatabase(options, dataDir),
    async (db) => {
      await db.close?.();
    },
  );
}

/**
 * Internal: creates the database. Loads the peer, so it never runs for a
 * cached hit.
 */
async function createDatabase(
  options: PGliteOptions,
  dataDir: string,
): Promise<DatabaseInterface> {
  const pglite = await importPGlite();
  const isStatementError = (error: unknown): boolean =>
    error instanceof pglite.messages.DatabaseError;

  const ownsClient = !options.client;
  const pg: PGliteLike =
    options.client ??
    (await pglite.PGlite.create(dataDir, {
      ...options.pglite,
      ...(options.extensions ? { extensions: options.extensions } : {}),
    }));

  // One connection: transactions take turns, and so do top-level statements
  // while a transaction is open. PGlite queues them itself, but without a
  // deadline — a transaction handle that is never ended, or a top-level call
  // made from inside a transaction callback, would hang forever rather than
  // fail with an explanation.
  const lock = createTransactionLock('pglite', options.transactionQueueTimeout);

  let db: DatabaseInterface;
  let closePromise: Promise<void> | undefined;

  type Target = Pick<PGliteTransactionLike, 'query' | 'exec'>;

  /**
   * Runs one statement. Without parameters PostgreSQL's simple protocol is
   * used, like `pg`, so a multi-statement script works through `query()`.
   */
  const run = async (
    target: Target,
    sql: string,
    values?: any[],
  ): Promise<{ rows: any[]; rowCount: number | null }> => {
    const result =
      values && values.length > 0
        ? await target.query(sql, values)
        : (await target.exec(sql)).at(-1);
    if (!result) return { rows: [], rowCount: 0 };
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.affectedRows ?? result.rows.length,
    };
  };

  // Statements outside a transaction.
  const client: PostgresQueryExecutor = {
    query: (sql, values) => lock.run(() => run(pg, sql, values)),
  };

  /**
   * Binds the statement-error tracking to one PGlite transaction object.
   * See `createTransactionErrorTracker` for why a statement failure has to
   * outlive the `catch` that swallowed it.
   */
  const createTransactionState = (pgTx: PGliteTransactionLike) => {
    const tracker = createTransactionErrorTracker(isStatementError);
    const executor: PostgresQueryExecutor = {
      query: (sql, values) => tracker.track(run(pgTx, sql, values), sql),
    };
    // `tx.client` is PGlite's own surface; route it through the tracker too so
    // raw use cannot hide a failure from the commit check.
    const rawClient = {
      query: (sql: string, params?: any[]) =>
        tracker.track(pgTx.query(sql, params), sql),
      exec: (sql: string) => tracker.track(pgTx.exec(sql), sql),
    };

    /**
     * Fails if the transaction can no longer commit. PostgreSQL answers COMMIT
     * on an aborted transaction with a ROLLBACK tag and no error, and PGlite
     * issues that COMMIT itself, so the aborted state is probed for here while
     * there is still an error to throw.
     */
    const assertCommittable = async (): Promise<void> => {
      await tracker.drain();
      const statementError = tracker.getError();
      if (statementError !== undefined) throw statementError;
      try {
        await pgTx.query('SELECT 1');
      } catch (error) {
        throw tracker.getError() ?? tracker.getUnconfirmedError() ?? error;
      }
      const unconfirmed = tracker.getUnconfirmedError();
      if (unconfirmed !== undefined) throw unconfirmed;
    };

    return { tracker, executor, rawClient, assertCommittable };
  };

  const dialect = createPostgresDialect({
    client,
    // One connection, so a probe cannot be answered from a second one.
    probeExecutor: (executor) => executor,
    runInTransaction: (work) =>
      lock.run(() =>
        pg.transaction(async (pgTx) => {
          const state = createTransactionState(pgTx);
          const result = await work(state.executor);
          await state.assertCommittable();
          return result;
        }),
      ),
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
   * Builds the interface handed to a transaction callback.
   *
   * There is no `AsyncLocalStorage` in a browser, so nested scopes are not
   * tracked ambiently: each nested callback receives a handle bound to its own
   * savepoint. Nested work must call the handle it was given.
   */
  const createScopedDatabase = (
    pgTx: PGliteTransactionLike,
    extra: (scoped: DatabaseInterface) => Record<string, unknown> = () => ({}),
  ) => {
    const state = createTransactionState(pgTx);
    let scoped!: DatabaseInterface;
    const nested = createNestedTransaction(
      state.executor,
      (override) => (override ? { ...scoped, transaction: override } : scoped),
      state.tracker.clearError,
    );
    scoped = {
      url: dataDir,
      client: state.rawClient,
      ...createClientMethods(
        state.executor,
        true,
        serializeRecord,
        state.tracker.clearError,
      ),
      transaction: nested,
    } as DatabaseInterface;
    Object.assign(scoped, extra(scoped));
    return { state, nested, scoped };
  };

  /**
   * Executes a callback within a database transaction. Commits on success and
   * rolls back when the callback throws.
   */
  const transaction = async <T>(
    callback: (tx: DatabaseInterface) => Promise<T>,
  ): Promise<T> => {
    const release = await lock.acquire();
    try {
      return await pg.transaction(async (pgTx) => {
        const { state, nested, scoped } = createScopedDatabase(pgTx);
        try {
          const result = await callback(scoped);
          await nested.drain();
          await state.assertCommittable();
          return result;
        } catch (error) {
          // A rejected Promise.all can leave queued savepoint work running;
          // PGlite rolls back as soon as this callback settles.
          await nested.drain();
          await state.tracker.drain();
          throw error;
        }
      });
    } finally {
      release();
    }
  };

  /**
   * Begins a transaction and returns a handle for manual control.
   *
   * PGlite only offers a callback form, so the callback is held open until the
   * handle is committed or rolled back.
   */
  const beginTransaction = async (): Promise<TransactionHandle> => {
    const release = await lock.acquire();
    try {
      let settle!: (outcome: 'commit' | 'rollback') => void;
      const outcome = new Promise<'commit' | 'rollback'>((resolve) => {
        settle = resolve;
      });
      let begun!: (tx: PGliteTransactionLike) => void;
      let failedToBegin!: (error: unknown) => void;
      const started = new Promise<PGliteTransactionLike>((resolve, reject) => {
        begun = resolve;
        failedToBegin = reject;
      });
      const finished = pg.transaction(async (pgTx) => {
        begun(pgTx);
        if ((await outcome) === 'rollback') await pgTx.rollback();
      });
      // BEGIN failing rejects `finished` before the callback ever runs.
      finished.catch(failedToBegin);
      const pgTx = await started;

      let active = true;
      const { state, nested, scoped } = createScopedDatabase(pgTx, () => ({
        commit: () => end('COMMIT'),
        rollback: () => end('ROLLBACK'),
        isActive: () => active,
      }));

      // The transaction is over however this ends, so the connection is
      // returned whether COMMIT succeeds, throws, or was never reachable.
      const end = async (command: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
        if (!active) {
          throw new DatabaseError('Transaction already ended', {});
        }
        active = false;
        let failure: { error: unknown } | undefined;
        try {
          await nested.drain();
          await state.tracker.drain();
          if (command === 'COMMIT') await state.assertCommittable();
        } catch (error) {
          failure = { error };
        }
        settle(command === 'COMMIT' && !failure ? 'commit' : 'rollback');
        try {
          await finished;
        } catch (error) {
          failure ??= { error };
        } finally {
          release();
        }
        if (failure) throw failure.error;
      };

      return scoped as TransactionHandle;
    } catch (error) {
      release();
      throw error;
    }
  };

  const initializeSchemas = async (
    schemaOptions: SchemaInitializationOptions,
  ): Promise<void> => {
    const schemaManager = new DatabaseSchemaManager();
    const currentDb: DatabaseInterface = {
      url: dataDir,
      client: pg,
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

    await schemaManager.initializeSchemas(currentDb, schemaOptions);
  };

  db = {
    url: dataDir,
    client: pg,
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
    getTableSchema,
    alterTable,
    vector: createVectorCapabilities(client),
    close: async () => {
      closePromise ??= (async () => {
        connectionCache.forget(db);
        if (ownsClient) await pg.close();
      })();
      return closePromise;
    },
  };

  return db;
}
