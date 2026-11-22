import { loadEnvConfig } from '@happyvertical/utils';
import type { PGliteOptions } from './pglite';
import type { PostgresOptions } from './postgres';
import {
  generateMemoryDbId,
  type ReadOption,
  readOpenOptions,
  readOption,
  refuseInvalidPGliteClient,
  refuseUnusedClientOption,
} from './shared/client-option';
import type {
  DatabaseInterface,
  DuckDBOptions,
  JSONOptions,
  ReopenOptions,
} from './shared/types';
import type { SqliteOptions } from './sqlite';

/**
 * Union type of options for creating different database types
 */
export type GetDatabaseOptions =
  | (PostgresOptions & { type?: 'postgres' })
  | (SqliteOptions & { type?: 'sqlite' })
  | (DuckDBOptions & { type?: 'duckdb' })
  | (PGliteOptions & { type?: 'pglite' })
  | JSONOptions;

/**
 * In-memory SQLite identities generated for options objects that could not
 * store them (see `getDatabase`). Keyed weakly by the caller's object.
 */
const retainedMemoryDbids = new WeakMap<object, string>();

/**
 * Decides the refusal of a caller-supplied (non-null) `client` from the
 * adapter type, reading only `type` and, when no type is set, `url`; those
 * reads go into `preread` so the snapshot does not repeat them.
 */
function refuseClientEarly(
  source: object,
  client: unknown,
  preread: Record<string, ReadOption>,
): void {
  let environment: Record<string, unknown> | undefined;
  const fromEnvironment = (key: 'type' | 'url') => {
    environment ??= loadEnvConfig(
      {},
      { packageName: 'sql', schema: { type: 'string', url: 'string' } },
    ) as Record<string, unknown>;
    return environment[key];
  };
  const typeRead = readOption(source, 'type');
  preread.type = typeRead;
  let type = typeRead.present ? typeRead.value : fromEnvironment('type');
  if (!type) {
    const urlRead = readOption(source, 'url');
    preread.url = urlRead;
    const url = urlRead.present ? urlRead.value : fromEnvironment('url');
    if (
      typeof url === 'string' &&
      (url.startsWith('file:') || url === ':memory:')
    ) {
      type = 'sqlite';
    }
  }
  if (
    type === 'postgres' ||
    type === 'sqlite' ||
    type === 'duckdb' ||
    type === 'json'
  ) {
    refuseUnusedClientOption({ client }, type);
  }
  if (type === 'pglite') refuseInvalidPGliteClient(client);
}

/**
 * Creates a database connection based on the provided options, or returns an existing database instance
 *
 * Loads configuration from environment variables using the HAVE_SQL_* pattern:
 * - HAVE_SQL_TYPE → type ('sqlite' | 'postgres' | 'pglite' | 'duckdb' | 'json')
 * - HAVE_SQL_URL → url (connection string)
 * - HAVE_SQL_HOST → host (database server hostname)
 * - HAVE_SQL_PORT → port (database server port number)
 * - HAVE_SQL_DATABASE → database (database name)
 * - HAVE_SQL_USER → user (authentication username)
 * - HAVE_SQL_PASSWORD → password (authentication password)
 *
 * User-provided options always take precedence over environment variables.
 *
 * ## Lazy schemas
 *
 * The `schemas` option accepts either an eagerly-built record or a lazy
 * function (`() => Record<string, SchemaProvider>`).  Adapters that manage
 * tables via migrations (Postgres, SQLite) never resolve the function, so
 * there is zero cost for callers that pass schemas uniformly regardless of
 * adapter type.  Only JSON and DuckDB adapters call the function.
 *
 * ```typescript
 * // Caller doesn't need to know the adapter type:
 * await getDatabase({
 *   ...config,
 *   schemas: () => ObjectRegistry.getAllSchemas(),
 * });
 * ```
 *
 * @param options - Configuration options for the database connection or an existing database instance
 * @returns Promise resolving to a DatabaseInterface implementation
 * @throws Error if the database type is invalid
 */
export async function getDatabase(
  options: GetDatabaseOptions | ReopenOptions | DatabaseInterface = {},
): Promise<DatabaseInterface> {
  // A database instance passes through untouched. Only the four members the
  // check needs are read, each once, on the argument itself: nothing is
  // enumerated and no environment is merged, so a wrapper (a Proxy over a
  // transaction handle, an instance with unrelated getters) comes back as it
  // went in. `client` is read here once and reused as configuration below.
  const source = (options ?? {}) as Record<string, unknown>;
  // Functions are objects too: a callable configuration is read like any
  // other, never mistaken for an empty one.
  const isObject =
    source !== null &&
    (typeof source === 'object' || typeof source === 'function');
  const client = isObject ? source.client : undefined;
  if (
    isObject &&
    typeof client !== 'undefined' &&
    typeof source.insert === 'function' &&
    typeof source.get === 'function' &&
    typeof source.query === 'function'
  ) {
    return options as DatabaseInterface;
  }

  // A supplied client is refused on `type` alone, read first: nothing else on
  // the caller's object is read before that decision, so an unrelated option
  // (a throwing getter, a Proxy trap) cannot replace the refusal. Without an
  // explicit type, the environment's type and then the URL's inference
  // decide it, as they do below. Values read here are not read again.
  const preread: Record<string, ReadOption> = {};
  if (isObject && client !== undefined && client !== null) {
    refuseClientEarly(source, client, preread);
  }

  // Configuration is captured once, before the first await, by reading the
  // supported option names directly (see `readOpenOptions`). Everything below
  // works on this snapshot.
  const snapshot = (
    isObject ? readOpenOptions(source, client, preread) : {}
  ) as GetDatabaseOptions & { dbid?: string | null; cache?: boolean };

  // What this call resolves (HAVE_SQL_* values, an inferred type, a generated
  // in-memory SQLite dbid) is written to the caller's object afterwards, as
  // it always has been, for keys it did not have: later opens with the same
  // options object depend on it (dbid propagation). Nothing is written for a
  // refused open.
  const resolved: Array<[string, unknown]> = [];
  const resolve = (key: string, value: unknown) => {
    (snapshot as Record<string, unknown>)[key] = value;
    resolved.push([key, value]);
  };

  // Load HAVE_SQL_* environment variables; user-provided options win.
  const environment = loadEnvConfig(snapshot as any, {
    packageName: 'sql',
    schema: {
      type: 'string',
      url: 'string',
      host: 'string',
      port: 'number',
      database: 'string',
      user: 'string',
      password: 'string',
    },
  }) as Record<string, unknown>;
  for (const [key, value] of Object.entries(environment)) {
    if (!(key in snapshot)) resolve(key, value);
  }

  // if no type but url starts with file:, set to sqlite
  if (
    !snapshot.type &&
    (snapshot.url?.startsWith('file:') || snapshot.url === ':memory:')
  ) {
    resolve('type', 'sqlite');
  }

  // An adapter that does not use `client` refuses it, before anything is
  // generated or written to the caller's object.
  if (
    snapshot.type === 'postgres' ||
    snapshot.type === 'sqlite' ||
    snapshot.type === 'duckdb' ||
    snapshot.type === 'json'
  ) {
    refuseUnusedClientOption(snapshot, snapshot.type);
  }
  if (snapshot.type === 'pglite') {
    refuseInvalidPGliteClient((snapshot as { client?: unknown }).client);
  }

  // SQLite gives an in-memory database a generated identity so that later
  // opens with the same options object reuse the connection. Absent means
  // undefined or null; an explicit empty dbid is refused by the adapter.
  let generatedDbid: string | undefined;
  if (
    snapshot.type === 'sqlite' &&
    (snapshot.url || ':memory:') === ':memory:' &&
    (snapshot.dbid === undefined || snapshot.dbid === null) &&
    snapshot.cache !== false
  ) {
    // An options object that could not take the identity last time (frozen,
    // non-extensible, read-only dbid) keeps the one generated for it then, so
    // reusing it reopens the same database instead of a fresh one.
    generatedDbid =
      (isObject ? retainedMemoryDbids.get(source) : undefined) ??
      generateMemoryDbId();
    snapshot.dbid = generatedDbid;
  }

  if (isObject) {
    for (const [key, value] of resolved) {
      if (!(key in source)) {
        try {
          source[key] = value;
        } catch {
          // A frozen or non-extensible options object keeps its shape.
        }
      }
    }
    if (generatedDbid !== undefined) {
      try {
        source.dbid = generatedDbid;
      } catch {
        // Propagation through the object is impossible; remember the
        // identity by the object itself instead.
        retainedMemoryDbids.set(source, generatedDbid);
      }
    }
  }

  if (snapshot.type === 'pglite') {
    const pglite = await import('./pglite.js');
    return pglite.getDatabase(snapshot as PGliteOptions);
  }

  if (snapshot.type === 'postgres') {
    const postgres = await import('./postgres.js');
    return postgres.getDatabase(snapshot as PostgresOptions);
  }
  if (snapshot.type === 'sqlite') {
    const sqlite = await import('./sqlite.js');
    return sqlite.getDatabase(snapshot as SqliteOptions);
  }
  if (snapshot.type === 'duckdb') {
    const duckdb = await import('./duckdb.js');
    return duckdb.getDatabase(snapshot as DuckDBOptions);
  }
  if (snapshot.type === 'json') {
    const json = await import('./json.js');
    return json.getDatabase(snapshot as JSONOptions);
  }
  throw new Error('Invalid database type');
}

/**
 * Validates if a table name consists only of alphanumeric characters and underscores
 *
 * @param name - Table name to validate
 * @returns Boolean indicating if the name is valid
 */
function _isValidTableName(name: string): boolean {
  // Simple regex to allow only alphanumeric characters and underscores
  return /^[a-zA-Z0-9_]+$/.test(name);
}

// Driver-independent helpers live in ./query (also `@happyvertical/sql/query`).
import { buildWhere, raw, syncSchema, tableExists } from './query.js';

export type {
  AggregateArithmeticOp,
  AggregateComparisonOp,
  AggregateExpression,
  AggregateJoin,
  AggregateLiteral,
  AggregateOperand,
} from './aggregate-expression';
// Generic database integrity-check framework
export {
  checkExpectedTables,
  checkRelationship,
  checkUniqueColumn,
  type DoctorCheck,
  type DoctorContext,
  type DoctorIssue,
  type DoctorLevel,
  type DoctorResult,
  type RelationshipSpec,
  type RunDoctorOptions,
  runDoctor,
  type UniqueColumnSpec,
} from './doctor';
// Export adapter cache utilities (for testing)
export { clearConnectionCache } from './json.js';
// PGlite (browser-capable Postgres). Types only: the adapter and its
// `PGlitePeerMissingError` load from `@happyvertical/sql/pglite`, which keeps
// the root entry free of the optional `@electric-sql/pglite` peer.
export type { PGliteLike, PGliteOptions } from './pglite';

/**
 * Clears the PostgreSQL connection cache.
 * Useful for test isolation and reconnection scenarios.
 *
 * The PostgreSQL adapter (and its `pg` driver) loads on first call, so the
 * root entry does not pull the driver in for callers that never use it.
 */
export async function clearPostgresConnectionCache(): Promise<void> {
  const postgres = await import('./postgres.js');
  await postgres.clearPostgresConnectionCache();
}
// Postgres CLI shell-outs and URL helpers
export {
  assertCanExportDatabase,
  assertCanImportDatabase,
  type CreateDropOptions,
  createPostgresDatabase,
  type DumpOptions,
  databaseNameFromUrl,
  dropPostgresDatabase,
  dumpPostgresDatabase,
  isLocalDatabaseUrl,
  type PostgresImportLocalityOptions,
  type PostgresLocalityOptions,
  postgresEnvFromUrl,
  type RestoreOptions,
  redactDatabaseUrl,
  restorePostgresDatabase,
} from './postgres-cli';
export {
  type AggregateBuildResult,
  type AggregateFunction,
  type AggregateSelectExpr,
  type AggregateSpec,
  type AggregateTimeBucketUnit,
  bucketExpr,
  buildAggregate,
  buildWhere,
  convertUniqueIndexesToInlineConstraints,
  DatabaseSchemaManager,
  ExpressionError,
  type ExpressionErrorCode,
  type ExpressionResultType,
  escapeSqlValue,
  formatDbError,
  type PortableExpression,
  type RawSqlKey,
  type RenderExpressionOptions,
  type RenderExpressionResult,
  raw,
  renderExpression,
  type SchemaInitializationResult,
  type SqlAdapterType,
  syncSchema,
  type TypedDateLiteral,
  tableExists,
  validateColumnName,
} from './query.js';
export type { SecureSqliteWindowsCustody } from './secure-sqlite-client.js';
// Handle roles and transaction markers (sdk#1249)
export {
  type ClientSource,
  describeHandle,
  type HandleDescription,
  type HandleRole,
  isDatabaseRoot,
  isTransactionHandle,
  markTransactionHandle,
  type RootReads,
  TRANSACTION_SCOPE,
  type TransactionScopeKind,
} from './shared/handle-provenance.js';
export * from './shared/types';
export type { SecureSqliteFileOptions, SqliteOptions } from './sqlite.js';

export default {
  getDatabase,
  syncSchema,
  tableExists,
  buildWhere,
  raw,
};

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;

export type { IdentifierOptions } from './shared/alter-utils.js';
