import { loadEnvConfig } from '@happyvertical/utils';
import type { PGliteOptions } from './pglite';
import type { PostgresOptions } from './postgres';
import type {
  DatabaseInterface,
  DuckDBOptions,
  JSONOptions,
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
 * Checks if the provided value is a database instance rather than configuration options
 *
 * @param value - Value to check
 * @returns True if the value appears to be a DatabaseInterface instance
 */
function isDatabaseInstance(value: any): value is DatabaseInterface {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.client !== 'undefined' &&
    typeof value.insert === 'function' &&
    typeof value.get === 'function' &&
    typeof value.query === 'function'
  );
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
  options: GetDatabaseOptions | DatabaseInterface = {},
): Promise<DatabaseInterface> {
  // If a database instance is passed, return it directly
  if (isDatabaseInstance(options)) {
    return options;
  }

  // Load HAVE_SQL_* environment variables and merge into options
  // This ensures options object is mutated (needed for dbid propagation)
  Object.assign(
    options,
    loadEnvConfig(options as any, {
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
    }) as Partial<GetDatabaseOptions>,
  );

  // if no type but url starts with file:, set to sqlite
  if (
    !options.type &&
    (options.url?.startsWith('file:') || options.url === ':memory:')
  ) {
    options.type = 'sqlite';
  }

  if (options.type === 'postgres') {
    const postgres = await import('./postgres.js');
    return postgres.getDatabase(options as PostgresOptions);
  }
  if (options.type === 'pglite') {
    const pglite = await import('./pglite.js');
    return pglite.getDatabase(options as PGliteOptions);
  }
  if (options.type === 'sqlite') {
    const sqlite = await import('./sqlite.js');
    return sqlite.getDatabase(options as SqliteOptions);
  }
  if (options.type === 'duckdb') {
    const duckdb = await import('./duckdb.js');
    return duckdb.getDatabase(options as DuckDBOptions);
  }
  if (options.type === 'json') {
    const json = await import('./json.js');
    return json.getDatabase(options as JSONOptions);
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
export { clearPostgresConnectionCache } from './postgres.js';
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
  escapeSqlValue,
  formatDbError,
  type RawSqlKey,
  raw,
  type SchemaInitializationResult,
  type SqlAdapterType,
  syncSchema,
  tableExists,
  validateColumnName,
} from './query.js';
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
