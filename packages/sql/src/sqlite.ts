import { DatabaseError } from '@happyvertical/utils';
import type { Client } from '@libsql/client';
import { DatabaseSchemaManager } from './schema-manager';
import {
  generateAddColumnStatement,
  generateCreateIndexStatement,
  validateColumnName,
  validateIndexName,
  validateTableName,
} from './shared/alter-utils';
import { createTransactionLock } from './shared/transaction-lock';
import type {
  ColumnDefinition,
  ColumnDefinitionWithName,
  DatabaseInterface,
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
import { buildWhere, formatDbError } from './shared/utils';

/**
 * Connection cache for in-memory databases with memoryId
 * Enables sharing of :memory: databases across multiple getDatabase() calls
 */
const memoryConnectionCache = new Map<string, DatabaseInterface>();

/**
 * Pending connection promises to handle concurrent getDatabase() calls
 * Prevents creating duplicate connections when parallel calls happen
 */
const pendingConnections = new Map<string, Promise<DatabaseInterface>>();
const NULL_AWARE_UPSERT_MAX_ATTEMPTS = 8;
const NULL_AWARE_UPSERT_BASE_DELAY_MS = 25;
const nullAwareUpsertLocks = new Map<string, Promise<void>>();

type SqliteExecutor = Pick<Client, 'execute'>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
async function createLibSQLClient(options: SqliteOptions): Promise<Client> {
  const { url = ':memory:', authToken, encryptionKey } = options;

  // Normalize URLs: add file:// prefix for local paths
  let libsqlUrl = url;
  if (
    url !== ':memory:' &&
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    !url.startsWith('libsql://') &&
    !url.startsWith('file:')
  ) {
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
    return createClient({ url: libsqlUrl, authToken, encryptionKey });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages for common issues
    if (errorMessage?.includes('URL_SCHEME_NOT_SUPPORTED')) {
      throw new DatabaseError(
        `Unsupported URL scheme. Use ':memory:' for in-memory databases or 'libsql://' for remote LibSQL databases. Original: ${url}, Converted: ${libsqlUrl}`,
        { url: libsqlUrl, originalError: errorMessage },
      );
    }

    // Re-throw other errors with context
    throw new DatabaseError(`Failed to create LibSQL client: ${errorMessage}`, {
      url: libsqlUrl,
      originalError: errorMessage,
    });
  }
}

/**
 * Configuration options for SQLite database connections
 */
export interface SqliteOptions {
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
   * When multiple getDatabase() calls use the same dbid, they receive
   * the same database connection instance.
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
   * How long a queued transaction waits for the connection, in milliseconds.
   *
   * This adapter drives one connection, so transactions run one at a time and
   * an overlapping `transaction()` waits its turn. Raise this if a workload has
   * transactions that legitimately run longer than the default.
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
  const url = options.url || ':memory:';

  // Auto-generate dbid for :memory: databases if not provided
  // Mutate options object to ensure child objects reuse the same connection
  if (url === ':memory:' && !options.dbid) {
    options.dbid = generateDbId();
  }

  if (hasNativeSqliteCapabilities(options)) {
    const sqliteNative = await import('./sqlite-native.js');
    return sqliteNative.getNativeSqliteDatabase(options);
  }

  // Check if we have a cached connection for this dbid
  if (options.dbid) {
    const cached = memoryConnectionCache.get(options.dbid);
    if (cached) {
      return cached;
    }

    // Check if there's a pending connection for this dbid
    const pending = pendingConnections.get(options.dbid);
    if (pending) {
      return pending;
    }
  }

  // Create a new connection promise
  const connectionPromise = (async () => {
    const client = await createLibSQLClient(options);

    // One lock per connection. Nothing else in this closure escapes to another
    // caller, and `getDatabase` hands cached callers this same closure, so
    // "created here" and "per connection" are the same scope.
    const connectionLock = createTransactionLock(
      'sqlite',
      options.transactionQueueTimeout,
    );

    // Initialize tables from provided schemas (resolves lazy function if needed)
    const resolvedSchemas = resolveSchemas(options.schemas);
    if (resolvedSchemas && Object.keys(resolvedSchemas).length > 0) {
      await createTablesFromSchemas(client, resolvedSchemas);
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
      data: Record<string, any>,
    ): string => {
      const conflictValues = conflictColumns
        .map((col) => `${col}:${JSON.stringify(data[col])}`)
        .join('|');
      return `${url}:${table}:${conflictValues}`;
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

      const result = await client.execute({ sql, args: values });
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
    ): Promise<QueryResult> => {
      if (url === ':memory:') {
        return executeNullAwareUpsertAttempt(
          client,
          table,
          conflictColumns,
          serializedData,
        );
      }

      let lastError: unknown;

      for (
        let attempt = 0;
        attempt < NULL_AWARE_UPSERT_MAX_ATTEMPTS;
        attempt++
      ) {
        let transaction: Awaited<ReturnType<Client['transaction']>> | undefined;

        // This opens a transaction on the shared connection like any other, so
        // it takes the same lock — otherwise a null-aware upsert overlapping a
        // `transaction()` call reintroduces exactly the corruption the lock
        // exists to prevent. Acquired per attempt so the retry backoff below
        // waits without holding the connection.
        const releaseConnection = await connectionLock.acquire();
        try {
          transaction = await client.transaction('write');

          const result = await executeNullAwareUpsertAttempt(
            transaction,
            table,
            conflictColumns,
            serializedData,
          );

          await transaction.commit();
          return result;
        } catch (error) {
          lastError = error;

          if (transaction && !transaction.closed) {
            try {
              await transaction.rollback();
            } catch (_rollbackError) {
              // Preserve the original failure; rollback errors are secondary here.
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

    const executeUpsert = async (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
      options: UpsertOptions | undefined,
      acquireTransaction: boolean,
    ): Promise<QueryResult> => {
      const serializedData = serializeRecord(data);
      validateUpsertConflictColumns(table, conflictColumns, serializedData);

      if (
        options?.nullsDistinct ||
        !hasNullConflictValue(conflictColumns, serializedData)
      ) {
        return executeStandardUpsert(table, conflictColumns, serializedData);
      }

      if (!acquireTransaction) {
        return executeNullAwareUpsertAttempt(
          client,
          table,
          conflictColumns,
          serializedData,
        );
      }

      return withNullAwareUpsertLock(
        buildNullAwareUpsertLockKey(table, conflictColumns, serializedData),
        () =>
          executeNullAwareUpsertWithRetry(
            table,
            conflictColumns,
            serializedData,
          ),
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
      let sql: string;
      let values: any[];

      if (Array.isArray(data)) {
        // Serialize all records in the array
        const serializedRecords: Array<Record<string, any>> = data.map(
          (record) => serializeRecord(record),
        );
        const keys = Object.keys(serializedRecords[0]);
        const placeholders = serializedRecords
          .map(() => `(${keys.map(() => '?').join(', ')})`)
          .join(', ');
        sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;
        // Flatten all values into a single array for batch insert
        const flattenedValues: any[] = [];
        for (const record of serializedRecords) {
          flattenedValues.push(...Object.values(record));
        }
        values = flattenedValues;
      } else {
        // Serialize the single record
        const serializedData = serializeRecord(data);
        const keys = Object.keys(serializedData);
        const placeholders = keys.map(() => '?').join(', ');
        sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        values = Object.values(serializedData);
      }
      try {
        const result = await client.execute({ sql: sql, args: values });
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
      const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');
      if (!whereClause) {
        throw new DatabaseError(
          'GET requires at least one WHERE condition to prevent returning an arbitrary record',
          { table },
        );
      }

      const sql = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = await client.execute({ sql: sql, args: values });
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
      const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');
      const sql = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = await client.execute({ sql, args: values });
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
      // Serialize the data to update
      const serializedData = serializeRecord(data);
      const keys = Object.keys(serializedData);
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
        const result = await client.execute({
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
      try {
        return await executeUpsert(table, conflictColumns, data, options, true);
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
      try {
        return await executeUpsert(
          table,
          conflictColumns,
          data,
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
        await client.execute({
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
          // Count all records
          const result = await pluck`SELECT COUNT(*) FROM ${table}`;
          return Number(result) || 0;
        }

        // Count with conditions
        const { sql: whereClause, values } = buildWhere(where, 1, 'sqlite');

        const result = await client.execute({
          sql: `SELECT COUNT(*) as count FROM ${table} ${whereClause}`,
          args: values,
        });

        return Number(result.rows[0]?.count) || 0;
      } catch (e) {
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
          await client.execute(command);
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
     * Executes a callback within a database transaction
     * Automatically commits on success or rolls back on error
     *
     * @param callback - Function to execute within transaction
     * @returns Promise resolving to callback result
     */
    const transaction = async <T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
    ): Promise<T> =>
      // Held across the whole BEGIN … COMMIT/ROLLBACK span. Without it two
      // overlapping calls raced on the one connection: the second BEGIN threw,
      // its catch ran ROLLBACK, and that rollback ended the *first*
      // transaction — half of its writes durable, half lost, and its promise
      // rejected, so the caller was told nothing had happened.
      connectionLock.run(async () => {
        try {
          await client.execute({ sql: 'BEGIN TRANSACTION', args: [] });

          const result = await callback(createTransactionScope());
          await client.execute({ sql: 'COMMIT', args: [] });
          return result;
        } catch (error) {
          // A failing ROLLBACK must not replace the caller's error — SQLite
          // reports "cannot rollback - no transaction is active" whenever the
          // transaction is already gone, which says nothing about what failed.
          try {
            await client.execute({ sql: 'ROLLBACK', args: [] });
          } catch {
            // Nothing left to roll back.
          }
          throw error;
        }
      });

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
    const createTransactionScope = (): DatabaseInterface => {
      // SQLite doesn't have separate transaction clients, so we reuse the same client
      const txDb: DatabaseInterface = {
        url,
        client,
        insert,
        get,
        list,
        update,
        upsert: upsertInCurrentTransaction,
        getOrInsert,
        delete: deleteRecords,
        count,
        table,
        many,
        single,
        pluck,
        execute,
        query,
        oo: many,
        oO: single,
        ox: pluck,
        xx: execute,
        tableExists,
        syncSchema,
        transaction: async <T>(
          callback: (tx: DatabaseInterface) => Promise<T>,
        ): Promise<T> => {
          savepointSequence += 1;
          const name = `hv_sp_${savepointSequence}`;
          await client.execute({ sql: `SAVEPOINT ${name}`, args: [] });
          try {
            const result = await callback(createTransactionScope());
            await client.execute({
              sql: `RELEASE SAVEPOINT ${name}`,
              args: [],
            });
            return result;
          } catch (error) {
            try {
              // ROLLBACK TO leaves the savepoint in place, so release it as
              // well or it accumulates for the life of the transaction.
              await client.execute({
                sql: `ROLLBACK TO SAVEPOINT ${name}`,
                args: [],
              });
              await client.execute({
                sql: `RELEASE SAVEPOINT ${name}`,
                args: [],
              });
            } catch {
              // The enclosing transaction is already unwinding; let its own
              // teardown deal with the connection.
            }
            throw error;
          }
        },
      };

      return txDb;
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
      // The handle owns the connection until the caller ends it, so the lock
      // is held across the gap rather than around a single call. A handle that
      // is never committed or rolled back therefore blocks every later
      // transaction until the queue timeout reports it.
      const releaseConnection = await connectionLock.acquire();
      try {
        await client.execute({ sql: 'BEGIN TRANSACTION', args: [] });
      } catch (error) {
        // No transaction was opened, so there is no handle to end it and
        // nothing left to release the connection.
        releaseConnection();
        throw error;
      }

      let active = true;

      // COMMIT and ROLLBACK can both throw, and the transaction is over either
      // way, so the connection goes back before the error is rethrown.
      const end = async (command: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
        if (!active) {
          throw new DatabaseError('Transaction already ended', {});
        }
        try {
          await client.execute({ sql: command, args: [] });
        } finally {
          active = false;
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
      const txHandle: TransactionHandle = {
        ...createTransactionScope(),
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
        const result = await client.execute({ sql, args: values });
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
        const result = await client.execute({ sql, args: values });
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
        const result = await client.execute({ sql, args: values });
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
        await client.execute({ sql, args: values });
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
        const result = await client.execute({ sql, args });
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
          await client.execute({ sql, args: [] });
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
          await client.execute({ sql, args: [] });
        } catch (e) {
          throw new DatabaseError('Failed to create index on table', {
            table,
            index: index.name,
            originalError: formatDbError(e),
          });
        }
      },
    };

    return {
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
    };
  })();

  // Store the pending connection promise if dbid exists
  if (options.dbid) {
    pendingConnections.set(options.dbid, connectionPromise);
  }

  try {
    // Wait for the connection to be established
    const db = await connectionPromise;

    // Cache the connection for reuse if dbid exists
    if (options.dbid) {
      memoryConnectionCache.set(options.dbid, db);
    }

    return db;
  } finally {
    // Clean up pending connection promise
    if (options.dbid) {
      pendingConnections.delete(options.dbid);
    }
  }
}
