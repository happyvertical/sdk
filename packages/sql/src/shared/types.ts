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
export interface DatabaseOptions {
  /**
   * Database connection URL
   */
  url?: string;

  /**
   * Authentication token for the database connection
   */
  authToken?: string;
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
   * Explicit schema definitions for tables
   * When provided, these schemas will be used for table creation
   */
  schemas?: Record<string, SchemaProvider>;
}

/**
 * JSON database adapter options (DuckDB-backed)
 *
 * Uses DuckDB's in-memory engine to query JSON files directly.
 * No WAL files or persistent database files are created.
 */
export interface JSONOptions {
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
  schemas?: Record<string, SchemaProvider>;

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
   * Force a fresh database connection, bypassing the connection cache
   *
   * When true, clears any cached connection for this URL before creating a new one.
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
  /** Additional SQL WHERE clause */
  where?: string;
  /** Parameters for the WHERE clause */
  params?: any[];
}

/**
 * Result of a vector similarity search
 */
export interface VectorSearchResult {
  /** Row primary key */
  id: string;
  /** Distance from query vector (lower = more similar for cosine distance) */
  distance: number;
  /** Additional columns from the row */
  [key: string]: any;
}

/**
 * Options for creating a vector index
 */
export interface VectorIndexOptions {
  /** Number of dimensions in the vector */
  dimensions: number;
  /** Distance metric @default 'cosine' */
  metric?: 'cosine' | 'l2' | 'ip';
  /** Index type @default 'hnsw' */
  type?: 'hnsw' | 'ivfflat';
}

/**
 * Vector operations capability for database adapters
 *
 * Provides native vector similarity search, storage, and indexing.
 * Currently implemented by the PostgreSQL adapter via pgvector.
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
   * @param callback - Function to execute within transaction
   * @returns Promise resolving to callback result
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
   * @returns Promise resolving to a TransactionHandle
   *
   * @example Test isolation pattern
   * ```typescript
   * let tx: TransactionHandle;
   *
   * beforeEach(async () => {
   *   tx = await db.beginTransaction();
   * });
   *
   * afterEach(async () => {
   *   await tx.rollback(); // Discard all test changes
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
