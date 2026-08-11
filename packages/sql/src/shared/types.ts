import { DatabaseError } from '@happyvertical/utils';

/**
 * Error thrown when `transaction()` is called on a transaction-scoped interface
 * belonging to an adapter whose engine has no savepoints.
 *
 * DuckDB — and therefore the JSON adapter built on it — does not implement
 * `SAVEPOINT`, so there is no way to re-enter the current transaction. Adapters
 * that can re-enter (PostgreSQL, SQLite) do so under a savepoint and never
 * throw this.
 *
 * The alternative would be to open a second, independent transaction, which is
 * what these adapters used to do; on a shared connection that silently
 * destroyed the enclosing transaction's uncommitted work.
 *
 * @example Ensuring a helper works on every adapter
 * ```typescript
 * // Take the transaction as a parameter rather than opening a nested one.
 * async function recordClick(db: DatabaseInterface, id: string) {
 *   await db.update('links', { id }, { clicks: 1 });
 * }
 * await db.transaction(async (tx) => recordClick(tx, id));
 * ```
 */
export class NestedTransactionError extends DatabaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'NestedTransactionError';
  }
}

/**
 * WHERE clause input for database queries
 *
 * Supports two formats:
 * 1. Object format (AND-only): `{ status: 'active', 'price >': 100 }`
 *    - All conditions are AND-joined
 *
 * 2. 2D array format (OR/AND compound logic): `[[cond1, cond2], [cond3, cond4]]`
 *    - Inner arrays are AND-joined: `(cond1 AND cond2)`
 *    - Outer array is OR-joined: `(cond1 AND cond2) OR (cond3 AND cond4)`
 *
 * @example Object format (backward compatible)
 * ```typescript
 * // WHERE status = 'active' AND price > 100
 * const where = { status: 'active', 'price >': 100 };
 * ```
 *
 * @example 2D array format for OR/AND compound logic
 * ```typescript
 * // WHERE (status = 'active' AND price > 100) OR (status = 'pending' AND priority = 'high')
 * const where = [
 *   [{ status: 'active' }, { 'price >': 100 }],
 *   [{ status: 'pending' }, { priority: 'high' }]
 * ];
 * ```
 */
export type WhereClause = Record<string, any> | Record<string, any>[][];

/**
 * Common database connection options
 */
export interface DatabaseCacheOptions {
  /**
   * Stable, caller-supplied cache identity. When omitted, adapters derive an
   * identity from their effective connection configuration.
   */
  dbid?: string;

  /**
   * Whether this request may reuse and retain a shared adapter.
   * Set to `false` for a distinct connection that is never inserted into the
   * shared cache. Existing cached connections are left untouched.
   *
   * @default true for adapters that support caching
   */
  cache?: boolean;

  /**
   * Evict and close the matching cached adapter before serving this request.
   * Eviction waits for both resource closure and any in-flight initializer.
   * The replacement is cached unless `cache` is also `false`.
   *
   * @default false
   */
  clearCache?: boolean;
}

export interface DatabaseOptions extends DatabaseCacheOptions {
  /**
   * Database connection URL
   */
  url?: string;

  /**
   * Authentication token for the database connection
   */
  authToken?: string;

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
}

/**
 * DuckDB-specific connection options
 */
export interface DuckDBOptions extends DatabaseOptions {
  /**
   * Database type identifier
   */
  type?: 'duckdb';

  /**
   * Path to directory containing JSON files to auto-register as tables
   * @default './data'
   */
  dataDir?: string;

  /**
   * Automatically register JSON files in dataDir as queryable tables
   * @default true
   */
  autoRegisterJSON?: boolean;

  /**
   * Strategy for writing data back to JSON files
   * - 'immediate': Write changes to JSON files immediately
   * - 'manual': Require explicit export calls
   * - 'none': Read-only mode, no writes to JSON files
   * @default 'none'
   */
  writeStrategy?: 'immediate' | 'manual' | 'none';

  /**
   * Whether to use a persistent DuckDB file for caching/indexes
   * If true, uses url or defaults to ':memory:'
   * @default false
   */
  persistent?: boolean;

  /**
   * Accepted for uniform configuration. DuckDB creates a fresh adapter on
   * every call, so this option does not change its behavior.
   */
  cache?: boolean;

  /**
   * Accepted for uniform configuration. DuckDB has no shared cache to evict,
   * so this option does not change its behavior.
   */
  clearCache?: boolean;

  /**
   * Explicit schema definitions for tables
   * When provided, these schemas will be used for table creation
   */
  schemas?: SchemasOption;
}

/**
 * A JSON data file that parsed but whose records could not be loaded into the
 * table — e.g. a renamed or dropped column, a NOT NULL / PRIMARY KEY violation,
 * or a file whose fields match no column on the table.
 *
 * The JSON adapter keeps the table (empty) and continues loading every other
 * table, logging the failure to stderr. This record makes the same failure
 * observable to calling code so a table that silently stays empty can be
 * detected. See issue #1139.
 */
export interface JSONTableLoadError {
  /** Name of the table whose data file failed to load */
  table: string;
  /** Path to the JSON data file that could not be loaded */
  filePath: string;
  /**
   * The underlying failure. Typically a `DatabaseError` whose `context`
   * carries the engine-level cause (e.g. the DuckDB constraint message).
   */
  error: unknown;
}

/**
 * JSON database adapter options (DuckDB-backed)
 *
 * Uses DuckDB's in-memory engine to query JSON files directly.
 * No WAL files or persistent database files are created.
 */
export interface JSONOptions extends DatabaseOptions {
  /**
   * Database type identifier
   */
  type: 'json';

  /**
   * Path to directory containing JSON files (required)
   * JSON files in this directory will be loaded as queryable tables
   */
  url: string;

  /**
   * Automatically load all JSON files in dataDir as tables
   * @default true
   */
  autoRegister?: boolean;

  /**
   * Strategy for writing changes back to JSON files
   * - 'immediate': Auto-save after every insert/update (default)
   * - 'manual': Require explicit exportTable() calls
   * - 'none': Read-only mode, throws error on writes
   * @default 'immediate'
   */
  writeStrategy?: 'immediate' | 'manual' | 'none';

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
   * Explicit schema definitions for tables
   *
   * When provided, these schemas will be used instead of auto-detection.
   * This allows frameworks to provide explicit schemas via dependency injection.
   *
   * @example
   * ```typescript
   * const db = await getDatabase({
   *   type: 'json',
   *   url: './data',
   *   schemas: {
   *     users: {
   *       tableName: 'users',
   *       ddl: 'CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT)',
   *       indexes: ['CREATE INDEX idx_users_name ON users(name)']
   *     }
   *   }
   * });
   * ```
   */
  schemas?: SchemasOption;

  /**
   * Unique identifier for in-memory DuckDB instances to enable connection sharing
   * When multiple getDatabase() calls use the same dbid, they receive
   * the same database connection instance.
   *
   * Auto-generated if not provided, enabling connection sharing by default.
   * This solves the issue where multiple collections create separate in-memory
   * databases that can't see each other's tables.
   */
  dbid?: string;

  /**
   * Eagerly load all JSON files as tables at connection time
   *
   * When true (default), creates tables with inferred schemas for all JSON files
   * in the data directory, even those without explicit schemas or .schema.sql files.
   * This enables cross-table queries (JOINs, NOT EXISTS subqueries) before
   * syncSchema() is called.
   *
   * Note: Inferred schemas don't include UNIQUE constraints. UPSERT operations
   * require syncSchema() to be called first to establish proper constraints.
   * When syncSchema() is called, tables with inferred schemas are dropped and
   * recreated with the proper schema.
   *
   * @default true
   */
  eagerLoadTables?: boolean;

  /**
   * Evict and close the existing database connection before creating a fresh one
   *
   * The new adapter is cached unless `cache` is also false. Eviction is awaited.
   * Useful when you need to reload the database from disk after external changes.
   *
   * @default false
   *
   * @example
   * // Initial connection - cached
   * const db1 = await getDatabase({ type: 'json', url: './data' });
   *
   * // External process adds JSON files...
   *
   * // Force reload from disk
   * const db2 = await getDatabase({
   *   type: 'json',
   *   url: './data',
   *   clearCache: true
   * });
   */
  clearCache?: boolean;

  /**
   * Called when a JSON data file parses but its records cannot be loaded into a
   * table that was created for it — from a provided schema, a `.schema.sql`
   * file, or deferred `syncSchema()` / `execute()` DDL — leaving that table
   * present but empty (renamed/dropped column, NOT NULL / PRIMARY KEY violation,
   * or a file whose fields match no column). Every other table still loads.
   *
   * This targets the *silent* failure: a present-but-empty table a query cannot
   * tell apart from a legitimately empty one. A file with no schema at all is
   * loaded by DuckDB's own inference; if that fails the table is simply not
   * created, which already surfaces as an error when you query it, so it is not
   * reported here.
   *
   * Fires for both connection-time and deferred (`syncSchema()` / `execute()`)
   * loads. Without it, such a failure is only visible as a `console.error` on
   * stderr. The same failures are also retrievable after the fact via the
   * adapter's `getTableLoadErrors()` method.
   *
   * Registered once, on the `getDatabase()` call that creates the connection.
   * The JSON adapter caches connections per URL, so a later `getDatabase()` for
   * the same directory returns the existing connection and does *not* re-wire a
   * different `onTableLoadError` — read `getTableLoadErrors()` on the returned
   * adapter instead, which reflects the shared connection's failures.
   *
   * A callback that throws is caught and ignored so it cannot break loading of
   * the remaining tables. See issue #1139.
   */
  onTableLoadError?: (info: JSONTableLoadError) => void;
}

/**
 * Result of a database operation that modifies data
 */
export interface QueryResult {
  /**
   * Type of operation performed (e.g., "insert", "update", "delete")
   */
  operation: string;

  /**
   * Number of rows affected by the operation
   */
  affected: number;
}

/**
 * Options for upsert operations.
 */
export interface UpsertOptions {
  /**
   * Preserve database-native NULL-distinct conflict behavior.
   *
   * By default, upsert treats NULL values in conflict columns as matching
   * existing NULL values. Set this to true to opt out and use the underlying
   * database's native ON CONFLICT behavior where NULLs are distinct.
   */
  nullsDistinct?: boolean;
}

/**
 * Schema definition that can be provided to database adapters
 *
 * Allows frameworks like SMRT to provide explicit schemas instead of
 * relying on auto-detection or circular dependencies.
 *
 * This is a simpler, DDL-based alternative to SchemaDefinition which is
 * used for structured JSON manifests.
 */
export interface SchemaProvider {
  /**
   * Table name in snake_case plural form
   */
  tableName: string;

  /**
   * DDL statement(s) to create the table
   * Can be a single CREATE TABLE statement or multiple statements
   */
  ddl: string;

  /**
   * Index creation statements (optional)
   * Each string should be a complete CREATE INDEX statement
   */
  indexes?: string[];

  /**
   * Trigger creation statements (optional, adapter-specific support)
   * Each string should be a complete CREATE TRIGGER statement
   */
  triggers?: string[];

  /**
   * Schema version for migration tracking (optional)
   */
  version?: string;

  /**
   * Field metadata (optional, for advanced use cases)
   * Can be used by frameworks for runtime type information and validation
   */
  fields?: Map<string, any>;
}

/**
 * Schema definitions for getDatabase(), either eagerly built or lazy.
 *
 * Callers can pass schemas as a lazy function so that building the schema
 * map (potentially 200+ objects from ObjectRegistry) is deferred until an
 * adapter actually needs it. Adapters that manage tables via migrations
 * (Postgres, SQLite) never call the function, making the cost zero.
 *
 * @example Lazy — only resolved by JSON/DuckDB adapters
 * ```typescript
 * await getDatabase({
 *   type: 'postgres',
 *   url: '...',
 *   schemas: () => ObjectRegistry.getAllSchemas(), // never called
 * });
 * ```
 *
 * @example Eager — built upfront (fine for JSON/DuckDB)
 * ```typescript
 * await getDatabase({
 *   type: 'json',
 *   url: './data',
 *   schemas: { users: { tableName: 'users', ddl: '...' } },
 * });
 * ```
 */
export type SchemasOption =
  | Record<string, SchemaProvider>
  | (() => Record<string, SchemaProvider>);

/**
 * Resolves a SchemasOption to its concrete value.
 *
 * Adapters that need schemas (JSON, DuckDB) call this to unwrap the
 * lazy function. Adapters that don't (Postgres, SQLite) simply ignore
 * the `schemas` option without calling this.
 */
export function resolveSchemas(
  schemas: SchemasOption | undefined,
): Record<string, SchemaProvider> | undefined {
  if (!schemas) return undefined;
  if (typeof schemas === 'function') return schemas();
  return schemas;
}

/**
 * Schema manifest structure for JSON-based schema management
 */
export interface SchemaManifest {
  version: string;
  timestamp: number;
  packageName: string;
  schemas: Record<string, SchemaDefinition>;
  dependencies: string[];
}

/**
 * Schema definition for individual tables
 */
export interface SchemaDefinition {
  tableName: string;
  columns: Record<string, ColumnDefinition>;
  indexes: IndexDefinition[];
  triggers: TriggerDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  dependencies: string[];
  version: string;
  packageName: string;
  baseClass?: string;
}

/**
 * Column definition structure
 */
export interface ColumnDefinition {
  type: string;
  primaryKey?: boolean;
  unique?: boolean;
  notNull?: boolean;
  defaultValue?: any;
  check?: string;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: string;
    onUpdate?: string;
  };
  description?: string;
}

/**
 * Column definition with name for ALTER TABLE operations
 */
export interface ColumnDefinitionWithName extends ColumnDefinition {
  name: string;
}

/**
 * Index definition structure
 */
export interface IndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
  where?: string;
  description?: string;
}

/**
 * Trigger definition structure
 */
export interface TriggerDefinition {
  name: string;
  when: string;
  event: string;
  table: string;
  condition?: string;
  body: string;
  description?: string;
}

/**
 * Foreign key constraint definition
 */
export interface ForeignKeyDefinition {
  column: string;
  referencesTable: string;
  referencesColumn: string;
  onDelete?: string;
  onUpdate?: string;
}

/**
 * Options for schema initialization and management
 */
export interface SchemaInitializationOptions {
  /** Schema manifest containing table definitions */
  manifest?: SchemaManifest;
  /** Raw SQL DDL schema string (legacy support) */
  schema?: string;
  /** Schema overrides for extending base schemas */
  overrides?: Record<string, SchemaDefinition>;
  /** Force recreation of tables */
  force?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Table schema information returned by getTableSchema()
 */
export interface TableSchemaInfo {
  /** Table name */
  tableName: string;
  /** Columns in the table */
  columns: Record<string, ColumnDefinition>;
  /** Indexes on the table */
  indexes: IndexDefinition[];
  /** Foreign key constraints */
  foreignKeys: ForeignKeyDefinition[];
}

/**
 * Options for vector similarity search
 */
export interface VectorSearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Distance metric for similarity comparison @default 'cosine' */
  metric?: 'cosine' | 'l2' | 'ip';
  /**
   * Additional SQL WHERE clause.
   * Use $2, $3, etc. for parameter placeholders ($1 is reserved for the query vector).
   * @example `category = $2`
   */
  where?: string;
  /** Parameters for the WHERE clause, bound to $2, $3, etc. */
  params?: any[];
}

/**
 * Result of a vector similarity search
 */
export interface VectorSearchResult {
  /** Row primary key */
  id: string;
  /**
   * Distance from query vector (lower = more similar).
   * Range varies by metric: cosine [0, 2], L2 [0, Infinity), ip (-Infinity, Infinity).
   */
  distance: number;
  /** Additional columns from the row */
  [key: string]: any;
}

/**
 * Options for creating a vector index
 */
export interface VectorIndexOptions {
  /** Number of dimensions (informational only, dimensions are set via ensureColumn) */
  dimensions?: number;
  /** Distance metric @default 'cosine' */
  metric?: 'cosine' | 'l2' | 'ip';
  /** Index type @default 'hnsw' */
  type?: 'hnsw' | 'ivfflat';
}

/**
 * Vector operations capability for database adapters
 *
 * Provides native vector similarity search, storage, and indexing.
 * Implemented by PostgreSQL via pgvector and optionally by SQLite via
 * sqlite-vector.
 */
export interface VectorCapabilities {
  /**
   * Search for similar vectors
   *
   * @param table - Table containing vector column
   * @param column - Name of the vector column
   * @param embedding - Query vector
   * @param options - Search options
   * @returns Ranked results by similarity
   */
  search(
    table: string,
    column: string,
    embedding: number[],
    options?: VectorSearchOptions,
  ): Promise<VectorSearchResult[]>;

  /**
   * Ensure a vector column exists on a table
   *
   * @param table - Table name
   * @param column - Column name
   * @param dimensions - Number of vector dimensions
   */
  ensureColumn(
    table: string,
    column: string,
    dimensions: number,
  ): Promise<void>;

  /**
   * Ensure a vector index exists on a column
   *
   * @param table - Table name
   * @param column - Column name
   * @param options - Index options
   */
  ensureIndex(
    table: string,
    column: string,
    options?: VectorIndexOptions,
  ): Promise<void>;

  /**
   * Store or update a vector in a specific row
   *
   * @param table - Table name
   * @param where - Conditions to identify the row
   * @param column - Vector column name
   * @param embedding - Vector data
   */
  upsertVector(
    table: string,
    where: Record<string, any>,
    column: string,
    embedding: number[],
  ): Promise<void>;
}

/**
 * SQLite notification delivered by optional notification capabilities.
 */
export interface DatabaseNotification {
  id: number;
  channel: string;
  payload: any;
  createdAt?: number | string | Date | null;
}

/**
 * Options for notification listeners.
 */
export interface NotificationListenOptions {
  /**
   * Fallback poll interval in milliseconds when the native watcher does not
   * receive an update signal.
   */
  fallbackPollMs?: number | null;
}

/**
 * Options for waiting on the next database update.
 */
export interface NotificationWaitOptions {
  /**
   * Maximum time to wait in milliseconds. When omitted, waits indefinitely.
   */
  timeoutMs?: number;

  /**
   * Optional abort signal to cancel the wait.
   */
  signal?: AbortSignal;
}

/**
 * Options for pruning persisted notification rows.
 */
export interface NotificationPruneOptions {
  /** Delete notifications older than this many seconds. */
  olderThanS?: number | null;
  /** Keep at most this many most-recent notifications. */
  maxKeep?: number | null;
}

/**
 * Optional notification/pub-sub capabilities for database adapters.
 */
export interface NotificationCapabilities {
  notify(channel: string, payload: any): Promise<number>;
  listen(
    channel: string,
    options?: NotificationListenOptions,
  ): AsyncIterable<DatabaseNotification>;
  waitForUpdate(options?: NotificationWaitOptions): Promise<boolean>;
  prune(options?: NotificationPruneOptions): Promise<number>;
}

/**
 * Options for SQLite native notification support.
 */
export interface SqliteNotificationCapabilityOptions {
  watcherBackend?: 'polling' | 'kernel' | 'shm';
  maxReaders?: number;
}

/**
 * Options for SQLite native vector support.
 */
export interface SqliteVectorCapabilityOptions {
  preload?: boolean;
  quantization?: 'turbo4' | 'turbo3' | 'turbo2' | 'uint8' | 'int8' | '1bit';
  maxMemory?: string;
}

/**
 * Optional SQLite-only native capabilities.
 */
export interface SqliteCapabilitiesOptions {
  notifications?: boolean | SqliteNotificationCapabilityOptions;
  vector?: boolean | SqliteVectorCapabilityOptions;
}

/**
 * Common interface for database adapters
 * Provides a unified API for different database backends
 */
export interface DatabaseInterface {
  /**
   * Database location identifier
   * For file-based databases: file path
   * For directory-based databases (JSON/DuckDB with JSON): directory path
   * For in-memory databases: ':memory:'
   * For remote databases: connection URL
   */
  url: string;

  /**
   * Underlying database client instance
   */
  client: any;

  /**
   * Inserts one or more records into a table
   *
   * @param table - Table name
   * @param data - Single record or array of records to insert
   * @returns Promise resolving to operation result
   */
  insert: (
    table: string,
    data: Record<string, any> | Record<string, any>[],
  ) => Promise<QueryResult>;

  /**
   * Retrieves a single record matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records (object for AND-only, 2D array for OR/AND)
   * @returns Promise resolving to matching record or null if not found
   */
  get: (
    table: string,
    where: WhereClause,
  ) => Promise<Record<string, any> | null>;

  /**
   * Retrieves multiple records matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records (object for AND-only, 2D array for OR/AND)
   * @returns Promise resolving to array of matching records
   */
  list: (table: string, where: WhereClause) => Promise<Record<string, any>[]>;

  /**
   * Updates records matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records to update (object for AND-only, 2D array for OR/AND)
   * @param data - New data to set
   * @returns Promise resolving to operation result
   */
  update: (
    table: string,
    where: WhereClause,
    data: Record<string, any>,
  ) => Promise<QueryResult>;

  /**
   * Inserts a record or updates it if it already exists (UPSERT)
   * Uses database-specific ON CONFLICT / ON DUPLICATE KEY syntax
   *
   * @param table - Table name
   * @param conflictColumns - Columns that define the uniqueness constraint
   * @param data - Data to insert or update
   * @returns Promise resolving to operation result
   *
   * @example
   * ```typescript
   * // Upsert a user by email
   * await db.upsert('users', ['email'], {
   *   email: 'user@example.com',
   *   name: 'John Doe',
   *   updated_at: new Date().toISOString()
   * });
   *
   * // Upsert with composite key
   * await db.upsert('settings', ['user_id', 'key'], {
   *   user_id: '123',
   *   key: 'theme',
   *   value: 'dark'
   * });
   * ```
   */
  upsert: (
    table: string,
    conflictColumns: string[],
    data: Record<string, any>,
    options?: UpsertOptions,
  ) => Promise<QueryResult>;

  /**
   * Gets a record matching the where criteria or inserts it if not found
   *
   * @param table - Table name
   * @param where - Criteria to match existing record (object for AND-only, 2D array for OR/AND)
   * @param data - Data to insert if no record found
   * @returns Promise resolving to the record (either retrieved or newly inserted)
   */
  getOrInsert: (
    table: string,
    where: WhereClause,
    data: Record<string, any>,
  ) => Promise<Record<string, any>>;

  /**
   * Deletes records from a table matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records for deletion (object for AND-only, 2D array for OR/AND)
   * @returns Promise resolving to operation result with count of deleted rows
   *
   * @example
   * ```typescript
   * // Delete by ID
   * await db.delete('products', { id: 'prod-123' });
   *
   * // Delete by criteria
   * await db.delete('orders', { status: 'cancelled' });
   *
   * // Delete with multiple conditions
   * await db.delete('sessions', {
   *   user_id: 'user-123',
   *   expired: true
   * });
   * ```
   */
  delete: (table: string, where: WhereClause) => Promise<QueryResult>;

  /**
   * Counts records in a table matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records (optional, counts all if omitted; object for AND-only, 2D array for OR/AND)
   * @returns Promise resolving to count of matching records
   *
   * @example
   * ```typescript
   * // Count all records
   * const total = await db.count('products');
   *
   * // Count with single condition
   * const activeCount = await db.count('products', { active: true });
   *
   * // Count with multiple conditions
   * const filteredCount = await db.count('orders', {
   *   status: 'pending',
   *   priority: 'high'
   * });
   * ```
   */
  count: (table: string, where?: WhereClause) => Promise<number>;

  /**
   * Creates a table-specific interface for simplified table operations
   *
   * @param table - Table name
   * @returns TableInterface for the specified table
   */
  table: (table: string) => TableInterface;

  /**
   * Checks if a table exists in the database
   *
   * @param table - Table name
   * @returns Promise resolving to boolean indicating existence
   */
  tableExists: (table: string) => Promise<boolean>;

  /**
   * Whether this adapter requires schema existence checks at runtime.
   *
   * Set to `true` on adapters where tables may not exist yet and need
   * to be verified before use (e.g. JSON/DuckDB with auto-created tables).
   *
   * When absent or `false`, frameworks skip `tableExists()` calls during
   * collection initialization — tables are assumed to exist because
   * schema is managed by migrations (e.g. `smrt db:migrate`).
   *
   * - Postgres adapter: not set (migration-managed)
   * - SQLite adapter: not set (migration-managed)
   * - JSON/DuckDB adapter: `true` (tables may be auto-created)
   */
  requiresSchemaCheck?: boolean;

  /**
   * Executes a SQL query using template literals and returns multiple rows
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to array of result records
   */
  many: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any>[]>;

  /**
   * Executes a SQL query using template literals and returns a single row
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to a single result record or null
   */
  single: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any> | null>;

  /**
   * Executes a SQL query using template literals and returns a single value
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to a single value (first column of first row)
   */
  pluck: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;

  /**
   * Executes a SQL query using template literals without returning results
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise that resolves when the query completes
   */
  execute: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;

  /**
   * Alias for many() - Executes a SQL query and returns multiple rows
   */
  oo: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any>[]>;

  /**
   * Alias for single() - Executes a SQL query and returns a single row
   */
  oO: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any> | null>;

  /**
   * Alias for pluck() - Executes a SQL query and returns a single value
   */
  ox: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;

  /**
   * Alias for execute() - Executes a SQL query without returning results
   */
  xx: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;

  /**
   * Executes a raw SQL query with parameterized values
   *
   * Raw queries use the adapter's native placeholder syntax.
   * Parameters may be passed as rest arguments or as one values array.
   * For adapter-specific array parameter caveats, see the package docs.
   *
   * @param str - SQL query string
   * @param vars - Variables to use as parameters
   * @returns Promise resolving to query result with rows and count
   */
  query: (
    str: string,
    ...vars: any[]
  ) => Promise<{ rows: Record<string, any>[]; rowCount: number }>;

  /**
   * Synchronizes database schema with provided SQL DDL
   * Creates tables if they don't exist and adds missing columns
   *
   * @param schema - SQL schema definition with CREATE TABLE statements
   * @returns Promise that resolves when schema is synchronized
   */
  syncSchema?: (schema: string) => Promise<void>;

  /**
   * Initialize database schemas from JSON manifest
   * Supports dependency resolution and schema overrides
   *
   * @param options - Schema initialization options
   * @returns Promise that resolves when schemas are initialized
   */
  initializeSchemas?: (options: SchemaInitializationOptions) => Promise<void>;

  /**
   * Executes a callback within a database transaction
   * Automatically commits on success or rolls back on error
   *
   * Calling `transaction()` again on the `tx` handed to a callback is
   * adapter-specific — do not assume one behaviour across adapters:
   *
   * - **SQLite** (both the libsql and native-capabilities paths) — the nested
   *   scope re-enters the transaction already in progress under a `SAVEPOINT`.
   *   It reads the enclosing transaction's uncommitted rows, and if it throws,
   *   only its own work is rolled back; the enclosing transaction stays usable.
   * - **DuckDB and JSON** — the engine has no `SAVEPOINT`, so nesting throws
   *   {@link NestedTransactionError} without touching the connection. The
   *   enclosing transaction is unaffected and can continue.
   * - **PostgreSQL** — the nested scope re-enters the enclosing transaction
   *   under a `SAVEPOINT` on the same pooled connection, like SQLite. It used
   *   to check out a second connection and begin an independent transaction,
   *   which could not see the enclosing transaction's uncommitted rows and
   *   could deadlock against it undetectably; that was fixed in #1108.
   *
   * Code that must run on every adapter should take the transaction as a
   * parameter rather than opening a nested one.
   *
   * **Transactions are serialized per connection on the single-connection
   * adapters** — SQLite (both paths), DuckDB and JSON drive one connection, and
   * a connection can only be in one transaction at a time, so a concurrent
   * `transaction()` waits for the one in progress rather than corrupting it. A
   * queued call that waits longer than `transactionQueueTimeout` (30s by
   * default) rejects rather than stalling indefinitely. Re-entrant calls do not
   * queue — they take the savepoint or refusal path described above.
   * PostgreSQL pools, so top-level transactions run concurrently. Nested scopes
   * on one PostgreSQL transaction use a scope-local queue: concurrently started
   * siblings serialize, while each child gets its own queue for further nesting.
   *
   * @param callback - Function to execute within transaction
   * @returns Promise resolving to callback result
   * @throws {NestedTransactionError} When nesting on an adapter without
   *   savepoint support
   *
   * @example Portable across all adapters
   * ```typescript
   * async function recordClick(db: DatabaseInterface, id: string) {
   *   await db.update('links', { id }, { clicks: 1 });
   * }
   *
   * await db.transaction(async (tx) => {
   *   await tx.query('SELECT * FROM links WHERE id = $1 FOR UPDATE', id);
   *   await recordClick(tx, id); // reuses tx; never opens its own
   * });
   * ```
   */
  transaction?: <T>(
    callback: (tx: DatabaseInterface) => Promise<T>,
  ) => Promise<T>;

  /**
   * Begins a new transaction and returns a handle for manual control
   *
   * Unlike transaction(), this gives you explicit control over commit/rollback.
   * Ideal for test isolation where you want to rollback after each test.
   *
   * On the single-connection adapters — SQLite (both paths), DuckDB and JSON —
   * the handle owns the connection until {@link TransactionHandle.commit} or
   * {@link TransactionHandle.rollback} is called, so every other transaction on
   * that connection waits in the meantime. **A handle that is never ended holds
   * the connection for the life of the process**, and later transactions then
   * fail with the queue-timeout error instead of proceeding. End the handle in
   * a `finally`, and in per-test setup guard the teardown, because an
   * assertion that throws between `beginTransaction()` and the teardown would
   * otherwise strand it.
   *
   * @returns Promise resolving to a TransactionHandle
   *
   * @example Test isolation pattern
   * ```typescript
   * let tx: TransactionHandle | undefined;
   *
   * beforeEach(async () => {
   *   tx = await db.beginTransaction();
   * });
   *
   * afterEach(async () => {
   *   // Guarded: if beforeEach threw, there is no handle to end, and an
   *   // unguarded rollback would mask that failure with its own.
   *   await tx?.rollback(); // Discard all test changes
   *   tx = undefined;
   * });
   *
   * it('creates user', async () => {
   *   await tx.insert('users', { id: '1', name: 'Test' });
   *   const user = await tx.get('users', { id: '1' });
   *   expect(user).toBeDefined();
   *   // Changes rolled back in afterEach
   * });
   * ```
   */
  beginTransaction?: () => Promise<TransactionHandle>;

  /**
   * Acquire a pinned single-connection session.
   *
   * Returns a {@link SessionHandle} whose queries all run on one underlying
   * connection, enabling session-scoped state (e.g. PostgreSQL session advisory
   * locks) that the pooled top-level {@link query} cannot hold reliably. The
   * caller must {@link SessionHandle.release} it.
   *
   * Only meaningful for engines with session-scoped state, so it is currently
   * implemented for PostgreSQL only; check for the method before calling
   * (`if (db.acquireSession)`). Single-connection engines (SQLite, DuckDB) have
   * no session-scoped locks to hold, so they leave it undefined.
   *
   * @returns Promise resolving to a SessionHandle
   *
   * @example Hold a Postgres session advisory lock
   * ```typescript
   * const session = await db.acquireSession();
   * try {
   *   await session.query('SELECT pg_advisory_lock($1)', 42);
   *   // ... lock is held for the life of this session ...
   * } finally {
   *   await session.release(); // frees the lock and drops the connection
   * }
   * ```
   */
  acquireSession?: () => Promise<SessionHandle>;

  /**
   * Retrieves the schema information for a table
   *
   * @param table - Table name
   * @returns Promise resolving to table schema info or null if table doesn't exist
   */
  getTableSchema?: (table: string) => Promise<TableSchemaInfo | null>;

  /**
   * Vector operations for native similarity search
   *
   * When available, enables database-level vector operations (e.g., pgvector).
   * Consumers should check for this capability rather than checking the database type.
   */
  vector?: VectorCapabilities;

  /**
   * Optional notification/pub-sub operations.
   */
  notifications?: NotificationCapabilities;

  /**
   * Close the database adapter and release native resources when supported.
   */
  close?: () => Promise<void>;

  /**
   * ALTER TABLE operations for schema evolution
   */
  alterTable?: {
    /**
     * Adds a new column to an existing table
     *
     * @param table - Table name
     * @param column - Column definition with name
     * @returns Promise that resolves when column is added
     */
    addColumn: (
      table: string,
      column: ColumnDefinitionWithName,
    ) => Promise<void>;

    /**
     * Adds a new index to an existing table
     *
     * @param table - Table name
     * @param index - Index definition
     * @returns Promise that resolves when index is created
     */
    addIndex: (table: string, index: IndexDefinition) => Promise<void>;
  };
}

/**
 * Transaction handle for manual transaction control
 *
 * Extends DatabaseInterface with commit() and rollback() methods.
 * Use beginTransaction() to obtain a handle, then explicitly
 * commit or rollback when done.
 *
 * @example Test isolation with rollback
 * ```typescript
 * const tx = await db.beginTransaction();
 * try {
 *   // All operations happen in the transaction
 *   await tx.insert('users', { id: '1', name: 'Test' });
 *   const user = await tx.get('users', { id: '1' });
 *
 *   // Rollback discards all changes (useful for test isolation)
 *   await tx.rollback();
 * } catch (error) {
 *   await tx.rollback();
 *   throw error;
 * }
 * ```
 *
 * @example Manual commit
 * ```typescript
 * const tx = await db.beginTransaction();
 * try {
 *   await tx.insert('orders', { id: '1', total: 100 });
 *   await tx.insert('order_items', { order_id: '1', product: 'Widget' });
 *   await tx.commit(); // Persist changes
 * } catch (error) {
 *   await tx.rollback();
 *   throw error;
 * }
 * ```
 */
export interface TransactionHandle extends DatabaseInterface {
  /**
   * Commits the transaction, persisting all changes
   *
   * After commit, the transaction handle should not be used.
   */
  commit: () => Promise<void>;

  /**
   * Rolls back the transaction, discarding all changes
   *
   * After rollback, the transaction handle should not be used.
   * This is the key method for test isolation - rollback after each test.
   */
  rollback: () => Promise<void>;

  /**
   * Whether the transaction is still active (not committed or rolled back)
   */
  isActive: () => boolean;
}

/**
 * Pinned single-connection session handle.
 *
 * Obtained via {@link DatabaseInterface.acquireSession}. Unlike the pooled
 * top-level `query` (which may run each statement on a different connection),
 * every call on a session handle runs on the *same* underlying connection for
 * the handle's lifetime. This is required for session-scoped state such as
 * PostgreSQL session advisory locks (`pg_advisory_lock`), which must be
 * acquired, observed, and released on one connection — and which release
 * automatically if the connection drops (e.g. the process dies).
 *
 * A session holds one connection out of the pool (default max 20) for its
 * entire lifetime, so it is meant to be held one-per-process, not per-operation.
 * Always {@link SessionHandle.release} the handle when done, and release it
 * *before* calling `db.client.end()` — a pinned connection keeps `pool.end()`
 * from resolving.
 */
export interface SessionHandle {
  /**
   * Execute a raw query on this session's pinned connection.
   * Same placeholder/return contract as {@link DatabaseInterface.query}.
   * Throws if the session has been released or its connection was lost.
   */
  query: (
    sql: string,
    ...vars: any[]
  ) => Promise<{ rows: Record<string, any>[]; rowCount: number }>;

  /**
   * Whether the session is still usable — not released and its connection has
   * not errored/dropped. A long-lived lock holder can poll this without
   * issuing a query.
   */
  isActive: () => boolean;

  /**
   * Release the session. Idempotent. After release the handle must not be used.
   * Best-effort frees session-scoped locks, then drops the underlying
   * connection (it is NOT returned to the pool) so the database releases any
   * remaining session state — returning it to the pool would leak that state
   * onto a later, unrelated checkout.
   */
  release: () => Promise<void>;
}

/**
 * Simplified interface for table-specific operations
 */
export interface TableInterface {
  /**
   * Inserts one or more records into the table
   *
   * @param data - Single record or array of records to insert
   * @returns Promise resolving to operation result
   */
  insert: (
    data: Record<string, any> | Record<string, any>[],
  ) => Promise<QueryResult>;

  /**
   * Retrieves a single record from the table matching the where criteria
   *
   * @param where - Criteria to match records (object for AND-only, 2D array for OR/AND)
   * @returns Promise resolving to matching record or null if not found
   */
  get: (where: WhereClause) => Promise<Record<string, any> | null>;

  /**
   * Retrieves multiple records from the table matching the where criteria
   *
   * @param where - Criteria to match records (object for AND-only, 2D array for OR/AND)
   * @returns Promise resolving to array of matching records
   */
  list: (where: WhereClause) => Promise<Record<string, any>[]>;
}
