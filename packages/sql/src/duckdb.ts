import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { DatabaseError } from '@happyvertical/utils';
import { DatabaseSchemaManager } from './schema-manager';
import {
  generateAddColumnStatement,
  generateCreateIndexStatement,
  validateColumnName,
  validateIndexName,
  validateTableName,
} from './shared/alter-utils';
import { convertUniqueIndexesToInlineConstraints } from './shared/duckdb-schema-utils';
import type {
  ColumnDefinition,
  ColumnDefinitionWithName,
  DatabaseInterface,
  DuckDBOptions,
  IndexDefinition,
  QueryResult,
  SchemaInitializationOptions,
  TableInterface,
  TableSchemaInfo,
  TransactionHandle,
} from './shared/types';
import { buildWhere, formatDbError } from './shared/utils';

/**
 * Creates tables from provided schema definitions
 *
 * DuckDB has a known limitation (issue #12684) where ON CONFLICT clauses
 * fail with UNIQUE INDEX but work with inline UNIQUE constraints.
 * This function converts UNIQUE indexes to inline constraints for compatibility.
 *
 * @param connection - DuckDB connection
 * @param schemas - Schema definitions to create
 */
async function createTablesFromSchemas(
  connection: any,
  schemas: Record<string, import('./shared/types').SchemaProvider>,
): Promise<void> {
  for (const [tableName, schema] of Object.entries(schemas)) {
    try {
      // Check if table already exists
      const result = await connection.runAndReadAll(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`,
      );
      const rows = result.getRowObjects();

      if (rows.length > 0) {
        console.log(`[duckdb] Table ${tableName} already exists, skipping`);
        continue;
      }

      console.log(`[duckdb] Creating table ${tableName} from provided schema`);

      // Convert UNIQUE indexes to inline UNIQUE constraints for DuckDB compatibility
      // DuckDB's ON CONFLICT requires inline constraints, not separate indexes
      const transformed = convertUniqueIndexesToInlineConstraints(
        schema.ddl,
        schema.indexes,
      );

      // Create table from transformed DDL
      await connection.run(transformed.ddl);

      // Create remaining indexes (non-UNIQUE indexes only)
      // UNIQUE indexes have been converted to inline constraints
      if (transformed.indexes && transformed.indexes.length > 0) {
        for (const indexSQL of transformed.indexes) {
          try {
            await connection.run(indexSQL);
          } catch (error) {
            console.warn(
              `[duckdb] Failed to create index for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      // Create triggers (if supported)
      if (schema.triggers && schema.triggers.length > 0) {
        for (const triggerSQL of schema.triggers) {
          try {
            await connection.run(triggerSQL);
          } catch (error) {
            console.warn(
              `[duckdb] Failed to create trigger for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } catch (error) {
      throw new DatabaseError(
        `Failed to create table ${tableName} from schema`,
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
 * Resolves a DuckDB URL, handling :memory: variants to prevent file leakage.
 *
 * DuckDB interprets any string as a file path unless it's exactly ':memory:'.
 * URLs like ':memory:12345' create files named ':memory:12345' in the working directory.
 *
 * This function:
 * - Returns ':memory:' unchanged (pure in-memory database)
 * - Converts ':memory:*' patterns to temp files in os.tmpdir()
 * - Returns other URLs unchanged (file paths, etc.)
 *
 * @param url - The database URL to resolve
 * @returns The resolved URL safe for DuckDB
 */
function resolveDuckDBUrl(url: string): string {
  // Pure in-memory: use as-is
  if (url === ':memory:') {
    return url;
  }

  // Pattern: :memory: followed by anything (e.g., :memory:12345-0.5678)
  // These would create files in CWD - redirect to temp directory instead
  if (url.startsWith(':memory:')) {
    const suffix = url.slice(':memory:'.length);
    const tempPath = join(tmpdir(), `duckdb-memory-${suffix}.db`);
    return tempPath;
  }

  // Other URLs (file paths, etc.): use as-is
  return url;
}

/**
 * Creates a DuckDB connection instance
 *
 * @param options - DuckDB connection options
 * @returns Promise resolving to a DuckDB connection
 */
async function createDuckDBConnection(options: DuckDBOptions) {
  const {
    url = ':memory:',
    dataDir = './data',
    autoRegisterJSON = true,
    schemas = {},
  } = options;

  // Resolve URL to prevent file leakage from :memory:* patterns
  const resolvedUrl = resolveDuckDBUrl(url);

  try {
    // Dynamic import to avoid bundling
    const duckdbModule = '@duckdb/node-api';
    const { DuckDBInstance } = await import(/* @vite-ignore */ duckdbModule);

    // Create DuckDB instance with resolved URL
    const instance = await DuckDBInstance.create(resolvedUrl);
    const connection = await instance.connect();

    // Create tables from provided schemas first
    if (schemas && Object.keys(schemas).length > 0) {
      await createTablesFromSchemas(connection, schemas);
    }

    // Auto-register JSON files if enabled
    if (autoRegisterJSON && dataDir) {
      await registerJSONFiles(connection, dataDir);
    }

    return connection;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new DatabaseError(
      `Failed to create DuckDB connection: ${errorMessage}`,
      {
        url,
        originalError: errorMessage,
      },
    );
  }
}

/**
 * Scans the data directory and registers JSON files as queryable tables
 *
 * @param connection - DuckDB connection
 * @param dataDir - Directory containing JSON files
 */
async function registerJSONFiles(connection: any, dataDir: string) {
  try {
    const files = await readdir(dataDir);
    const jsonFiles = files.filter(
      (file) => extname(file).toLowerCase() === '.json',
    );

    for (const file of jsonFiles) {
      const filePath = join(dataDir, file);
      const tableName = basename(file, '.json');

      // Create view that reads from JSON file
      // DuckDB automatically infers schema with ISO date/timestamp parsing
      await connection.run(
        `CREATE OR REPLACE VIEW ${tableName} AS SELECT * FROM read_json('${filePath}', auto_detect=true, format='auto', timestampformat='iso', dateformat='iso')`,
      );
    }
  } catch (error) {
    // If directory doesn't exist, that's okay - user might not have JSON files yet
    if ((error as any).code !== 'ENOENT') {
      throw new DatabaseError(`Failed to register JSON files from ${dataDir}`, {
        dataDir,
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Converts DuckDB-specific type representations to JavaScript types
 *
 * Handles two cases:
 * 1. JavaScript BigInt values → converted to numbers
 * 2. DuckDB timestamp objects ({ micros: number }) → converted to Date objects
 *
 * DuckDB represents TIMESTAMP values as objects with a single property
 * called 'micros' containing microseconds since Unix epoch. This function
 * converts them to JavaScript Date objects for proper serialization.
 *
 * @param obj - Object that may contain BigInt or timestamp values
 * @returns Object with DuckDB types converted to JavaScript types
 */
function convertBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);

  // Handle DuckDB timestamp objects: { micros: number | bigint }
  // Convert to JavaScript Date for proper serialization
  // Fixes issue #314: DuckDB returns dates as { micros } objects
  if (
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    'micros' in obj &&
    Object.keys(obj).length === 1 &&
    (typeof obj.micros === 'number' || typeof obj.micros === 'bigint')
  ) {
    // Convert microseconds to milliseconds for Date constructor
    // DuckDB stores timestamps as microseconds since Unix epoch
    // Handle both number and bigint types (DuckDB can return either)
    const micros =
      typeof obj.micros === 'bigint' ? Number(obj.micros) : obj.micros;
    const milliseconds = micros / 1000;
    return new Date(milliseconds);
  }

  if (Array.isArray(obj)) return obj.map(convertBigInts);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = convertBigInts(obj[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Creates a DuckDB database adapter
 *
 * @param options - DuckDB connection options
 * @returns Database interface for DuckDB
 */
export async function getDatabase(
  options: DuckDBOptions = {},
): Promise<DatabaseInterface> {
  const connection = await createDuckDBConnection(options);
  const writeStrategy = options.writeStrategy || 'none';
  const dataDir = options.dataDir || './data';
  // Use resolved URL to reflect actual database location
  const url = resolveDuckDBUrl(options.url || ':memory:');

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
    const records = Array.isArray(data) ? data : [data];

    if (records.length === 0) {
      return { operation: 'insert', affected: 0 };
    }

    const keys = Object.keys(records[0]);
    const values: any[] = [];
    let paramIdx = 1;

    // Build placeholders with proper type casting for DuckDB
    const placeholders = records
      .map((record) => {
        const rowPlaceholders = keys.map((key) => {
          const value = record[key];

          if (value === null || value === undefined) {
            return 'NULL';
          } else if (value === '' && typeof value === 'string') {
            // CAST empty strings to TEXT to prevent DuckDB ANY type inference
            values.push(value);
            return `CAST($${paramIdx++} AS TEXT)`;
          } else if (value instanceof Date) {
            // Convert Date objects to ISO strings for DuckDB
            values.push(value.toISOString());
            return `$${paramIdx++}`;
          } else if (Array.isArray(value)) {
            // CAST arrays to JSON to prevent DuckDB ANY type inference
            values.push(JSON.stringify(value));
            return `CAST($${paramIdx++} AS JSON)`;
          } else if (
            typeof value === 'object' &&
            value !== null &&
            Object.getPrototypeOf(value) === Object.prototype
          ) {
            // CAST plain objects to JSON to prevent DuckDB ANY type inference
            values.push(JSON.stringify(value));
            return `CAST($${paramIdx++} AS JSON)`;
          } else {
            // Direct parameter binding for other values
            values.push(value);
            return `$${paramIdx++}`;
          }
        });
        return `(${rowPlaceholders.join(', ')})`;
      })
      .join(', ');

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;

    try {
      await connection.run(sql, values);
      const affected = records.length;

      // Handle write-back strategy
      if (writeStrategy === 'immediate') {
        await exportTableToJSON(connection, table, dataDir);
      }

      return { operation: 'insert', affected };
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
    const { sql: whereClause, values } = buildWhere(where, 1);
    const sql = `SELECT * FROM ${table} ${whereClause} LIMIT 1`;

    try {
      const reader = await connection.runAndReadAll(sql, values);
      const rows = reader.getRowObjects();
      return rows.length > 0 ? convertBigInts(rows[0]) : null;
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
    const { sql: whereClause, values } = buildWhere(where, 1);
    const sql = `SELECT * FROM ${table} ${whereClause}`;

    try {
      const reader = await connection.runAndReadAll(sql, values);
      return convertBigInts(reader.getRowObjects());
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
    const keys = Object.keys(data);
    const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    const { sql: whereClause, values: whereValues } = buildWhere(
      where,
      keys.length + 1,
    );

    const sql = `UPDATE ${table} SET ${setClause} ${whereClause}`;
    const values = [...Object.values(data), ...whereValues];

    try {
      await connection.run(sql, values);

      // Handle write-back strategy
      if (writeStrategy === 'immediate') {
        await exportTableToJSON(connection, table, dataDir);
      }

      // DuckDB doesn't return rowsAffected in the same way, estimate from where clause
      return { operation: 'update', affected: 1 };
    } catch (e) {
      throw new DatabaseError('Failed to update records in table', {
        table,
        sql,
        values,
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
  ): Promise<QueryResult> => {
    // Validate that all conflict columns are present in the data
    const missingColumns = conflictColumns.filter((col) => !(col in data));

    if (missingColumns.length > 0) {
      throw new DatabaseError('Conflict columns missing from data', {
        table,
        conflictColumns,
        missingColumns,
        availableColumns: Object.keys(data),
        hint: 'All columns specified in ON CONFLICT must be present in the data being inserted. Undefined values should be replaced with null or an appropriate default.',
      });
    }

    const keys = Object.keys(data);
    const dataValues = Object.values(data);

    // Build placeholders and values with proper type handling for DuckDB
    // DuckDB cannot infer types from empty strings or certain values, so we need explicit CAST
    const placeholders: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const value of dataValues) {
      if (value === null || value === undefined) {
        // DuckDB requires explicit NULL for null/undefined values
        placeholders.push('NULL');
      } else if (value === '' && typeof value === 'string') {
        // CAST empty strings to TEXT to prevent DuckDB ANY type inference
        placeholders.push(`CAST($${paramIdx} AS TEXT)`);
        values.push(value);
        paramIdx++;
      } else if (value instanceof Date) {
        // Convert Date objects to ISO strings for DuckDB
        placeholders.push(`$${paramIdx}`);
        values.push(value.toISOString());
        paramIdx++;
      } else if (Array.isArray(value)) {
        // CAST arrays to JSON to prevent DuckDB ANY type inference
        // DuckDB cannot infer array element types from empty arrays or mixed types
        placeholders.push(`CAST($${paramIdx} AS JSON)`);
        values.push(JSON.stringify(value));
        paramIdx++;
      } else if (
        typeof value === 'object' &&
        value !== null &&
        Object.getPrototypeOf(value) === Object.prototype
      ) {
        // CAST plain objects to JSON to prevent DuckDB ANY type inference
        // Only applies to plain objects (not class instances)
        placeholders.push(`CAST($${paramIdx} AS JSON)`);
        values.push(JSON.stringify(value));
        paramIdx++;
      } else {
        // Direct parameter binding for other values
        placeholders.push(`$${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    }

    // Build UPDATE SET clause with same type handling
    // DO NOT reset paramIdx - parameters must be unique across entire query
    const updateSetParts: string[] = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = dataValues[i];

      if (value === null || value === undefined) {
        // DuckDB requires explicit NULL for null/undefined values
        updateSetParts.push(`${key} = NULL`);
      } else if (value === '' && typeof value === 'string') {
        updateSetParts.push(`${key} = CAST($${paramIdx} AS TEXT)`);
        values.push(value);
        paramIdx++;
      } else if (value instanceof Date) {
        updateSetParts.push(`${key} = $${paramIdx}`);
        values.push(value.toISOString());
        paramIdx++;
      } else if (Array.isArray(value)) {
        // CAST arrays to JSON to prevent DuckDB ANY type inference
        updateSetParts.push(`${key} = CAST($${paramIdx} AS JSON)`);
        values.push(JSON.stringify(value));
        paramIdx++;
      } else if (
        typeof value === 'object' &&
        value !== null &&
        Object.getPrototypeOf(value) === Object.prototype
      ) {
        // CAST plain objects to JSON to prevent DuckDB ANY type inference
        updateSetParts.push(`${key} = CAST($${paramIdx} AS JSON)`);
        values.push(JSON.stringify(value));
        paramIdx++;
      } else {
        updateSetParts.push(`${key} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    }

    // Quote ALL column names to match DuckDB's schema generation
    // SchemaGenerator always quotes column names, so UPSERT must match
    const conflict = conflictColumns.map((col) => `"${col}"`).join(', ');
    const quotedKeys = keys.map((key) => `"${key}"`).join(', ');

    // Quote column names in UPDATE SET clause to match schema and ON CONFLICT
    // Extract the value expression from each updateSetPart (everything after '=')
    const quotedUpdateSetParts = keys.map((key, i) => {
      const part = updateSetParts[i];
      const valueExpr = part.substring(part.indexOf('=') + 1).trim();
      return `"${key}" = ${valueExpr}`;
    });

    const sql = `INSERT INTO ${table} (${quotedKeys}) VALUES (${placeholders.join(', ')}) ON CONFLICT(${conflict}) DO UPDATE SET ${quotedUpdateSetParts.join(', ')}`;

    try {
      await connection.run(sql, values);

      // Handle write-back strategy
      if (writeStrategy === 'immediate') {
        await exportTableToJSON(connection, table, dataDir);
      }

      return { operation: 'upsert', affected: 1 };
    } catch (e) {
      throw new DatabaseError('Failed to upsert record into table', {
        table,
        sql,
        values,
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
   * @throws Error if the operation fails
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

    const { sql: whereClause, values } = buildWhere(where, 1);
    const sql = `DELETE FROM ${table} ${whereClause}`;

    try {
      await connection.run(sql, values);

      // Handle write-back strategy
      if (writeStrategy === 'immediate') {
        await exportTableToJSON(connection, table, dataDir);
      }

      return { operation: 'delete', affected: 1 };
    } catch (e) {
      throw new DatabaseError('Failed to delete records from table', {
        table,
        sql,
        values,
        originalError: formatDbError(e),
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
        const result = await connection.runAndReadAll(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        const rows = result.getRowObjects();
        return Number(rows[0]?.count) || 0;
      }

      // Count with conditions
      const { sql: whereClause, values } = buildWhere(where, 1);
      const sql = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;

      const result = await connection.runAndReadAll(sql, values);
      const rows = result.getRowObjects();

      return Number(rows[0]?.count) || 0;
    } catch (e) {
      throw new DatabaseError('Failed to count records in table', {
        table,
        where,
        originalError: formatDbError(e),
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
    try {
      // Try to query the table - simpler and works for both tables and views
      await connection.runAndReadAll(`SELECT * FROM ${tableName} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Exports a table to a JSON file (for write-back strategies)
   *
   * @param connection - DuckDB connection
   * @param table - Table name
   * @param dataDir - Directory to write JSON file
   */
  const exportTableToJSON = async (
    connection: any,
    table: string,
    dataDir: string,
  ): Promise<void> => {
    const filePath = join(dataDir, `${table}.json`);
    await connection.run(
      `COPY (SELECT * FROM ${table}) TO '${filePath}' (FORMAT JSON, ARRAY true)`,
    );
  };

  /**
   * Manual export method for 'manual' write strategy
   *
   * @param table - Table name to export
   * @returns Promise that resolves when export completes
   */
  const exportTable = async (table: string): Promise<void> => {
    if (writeStrategy === 'none') {
      throw new DatabaseError(
        'Cannot export table: write strategy is set to none',
        { table, writeStrategy },
      );
    }
    await exportTableToJSON(connection, table, dataDir);
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
      sql += `$${i + 1}${strings[i + 1]}`;
    }
    return { sql, values };
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
      const reader = await connection.runAndReadAll(sql, values);
      return convertBigInts(reader.getRowObjects());
    } catch (e) {
      throw new DatabaseError('Failed to execute many query', {
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
      const reader = await connection.runAndReadAll(sql, values);
      const rows = reader.getRowObjects();
      return rows[0] ? convertBigInts(rows[0]) : null;
    } catch (e) {
      throw new DatabaseError('Failed to execute single query', {
        sql,
        values,
        originalError: formatDbError(e),
      });
    }
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
      const reader = await connection.runAndReadAll(sql, values);
      const rows = reader.getRowObjects();
      if (rows.length === 0) return null;
      const firstRow = rows[0];
      const firstKey = Object.keys(firstRow)[0];
      return convertBigInts(firstRow[firstKey]);
    } catch (e) {
      throw new DatabaseError('Failed to execute pluck query', {
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
      await connection.run(sql, values);
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
      const reader = await connection.runAndReadAll(sql, args);
      const rows = convertBigInts(reader.getRowObjects());

      return {
        command: sql.split(' ')[0].toUpperCase(),
        rowCount: rows.length,
        oid: null,
        fields:
          rows.length > 0
            ? Object.keys(rows[0]).map((name) => ({
                name,
                tableID: 0,
                columnID: 0,
                dataTypeID: 0,
                dataTypeSize: -1,
                dataTypeModifier: -1,
                format: 'text',
              }))
            : [],
        rows,
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
  const xx = execute; // e(x)ecute-e(x)ecute: executes without returning

  /**
   * Synchronizes database schema with provided SQL DDL
   *
   * DuckDB requires UNIQUE constraints to be defined **inline** in CREATE TABLE
   * statements for ON CONFLICT clauses to work. This method automatically
   * transforms UNIQUE indexes to inline constraints before executing the schema.
   *
   * @param schema - SQL schema definition with CREATE TABLE and CREATE INDEX statements
   * @returns Promise that resolves when schema is synchronized
   */
  const syncSchema = async (schema: string): Promise<void> => {
    const statements = schema
      .trim()
      .split(';')
      .filter((stmt) => stmt.trim() !== '');

    const createTableStatements: string[] = [];
    const indexStatements: string[] = [];

    // Separate CREATE TABLE from CREATE INDEX statements
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      if (
        trimmed.startsWith('CREATE INDEX') ||
        trimmed.startsWith('CREATE UNIQUE INDEX')
      ) {
        indexStatements.push(trimmed);
      } else if (trimmed.startsWith('CREATE TABLE')) {
        createTableStatements.push(trimmed);
      }
    }

    // Process each CREATE TABLE statement
    for (const ddl of createTableStatements) {
      // Transform UNIQUE indexes to inline constraints for DuckDB compatibility
      const { ddl: transformedDDL, indexes: remainingIndexes } =
        convertUniqueIndexesToInlineConstraints(ddl, indexStatements);

      // Execute transformed DDL
      try {
        await connection.run(transformedDDL);
      } catch (e) {
        console.error('Schema sync error (CREATE TABLE):', e);
      }

      // Execute remaining (non-UNIQUE) indexes for this table
      for (const indexSQL of remainingIndexes) {
        try {
          await connection.run(indexSQL);
        } catch (e) {
          console.error('Schema sync error (CREATE INDEX):', e);
        }
      }
    }
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
      client: connection,
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

      // Get column information from information_schema
      const columnRows = await many`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = ${table}
        ORDER BY ordinal_position
      `;

      // Get primary key columns from DuckDB system tables
      const pkRows = await many`
        SELECT column_name
        FROM duckdb_constraints() con
        JOIN duckdb_columns() cols
          ON con.table_oid = cols.table_oid
        WHERE con.table_name = ${table}
          AND con.constraint_type = 'PRIMARY KEY'
          AND cols.column_name = ANY(con.constraint_column_names)
      `;

      const pkColumns = new Set(pkRows.map((row) => row.column_name));

      const columns: Record<string, ColumnDefinition> = {};
      for (const row of columnRows) {
        const colName = row.column_name as string;
        columns[colName] = {
          type: row.data_type as string,
          primaryKey: pkColumns.has(colName),
          notNull: row.is_nullable === 'NO',
          defaultValue: row.column_default,
        };
      }

      // Get index information from duckdb_indexes()
      const indexRows = await many`
        SELECT
          index_name,
          sql
        FROM duckdb_indexes()
        WHERE table_name = ${table}
          AND NOT is_primary
      `;

      const indexes: IndexDefinition[] = [];
      for (const row of indexRows) {
        const indexName = row.index_name as string;
        const indexDef = (row.sql as string) || '';

        // Parse column names from index definition
        const colMatch = indexDef.match(/\(([^)]+)\)/);
        const indexColumns = colMatch
          ? colMatch[1].split(',').map((col) => col.trim())
          : [];

        const isUnique = indexDef.toUpperCase().includes('UNIQUE');

        indexes.push({
          name: indexName,
          columns: indexColumns,
          unique: isUnique,
        });
      }

      // Get foreign key information
      const fkRows = await many`
        SELECT
          constraint_column_names,
          constraint_column_indexes,
          constraint_text
        FROM duckdb_constraints()
        WHERE table_name = ${table}
          AND constraint_type = 'FOREIGN KEY'
      `;

      const foreignKeys: Array<{
        column: string;
        referencesTable: string;
        referencesColumn: string;
        onDelete?: string;
        onUpdate?: string;
      }> = [];

      for (const fkRow of fkRows) {
        // Parse foreign key constraint text to extract referenced table and column
        const fkText = (fkRow.constraint_text as string) || '';
        const referencesMatch = fkText.match(
          /REFERENCES\s+(\w+)\s*\(([^)]+)\)/i,
        );

        if (
          referencesMatch &&
          Array.isArray(fkRow.constraint_column_names) &&
          fkRow.constraint_column_names.length > 0
        ) {
          const columnName = fkRow.constraint_column_names[0];
          const referencedTable = referencesMatch[1];
          const referencedColumn = referencesMatch[2].trim();

          const onDeleteMatch = fkText.match(/ON DELETE\s+(\w+)/i);
          const onUpdateMatch = fkText.match(/ON UPDATE\s+(\w+)/i);

          foreignKeys.push({
            column: columnName,
            referencesTable: referencedTable,
            referencesColumn: referencedColumn,
            onDelete: onDeleteMatch ? onDeleteMatch[1] : undefined,
            onUpdate: onUpdateMatch ? onUpdateMatch[1] : undefined,
          });
        }
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
        const sql = generateAddColumnStatement(table, column, 'duckdb');
        await connection.run(sql);
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
    addIndex: async (table: string, index: IndexDefinition): Promise<void> => {
      validateTableName(table);
      validateIndexName(index.name);

      for (const col of index.columns) {
        validateColumnName(col);
      }

      try {
        const sql = generateCreateIndexStatement(table, index);
        await connection.run(sql);
      } catch (e) {
        throw new DatabaseError('Failed to create index on table', {
          table,
          index: index.name,
          originalError: formatDbError(e),
        });
      }
    },
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
    try {
      await connection.run('BEGIN TRANSACTION');

      // Create a transaction-scoped database interface
      const txDb: DatabaseInterface = {
        url,
        client: connection,
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
        transaction,
      };

      const result = await callback(txDb);
      await connection.run('COMMIT');
      return result;
    } catch (error) {
      await connection.run('ROLLBACK');
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
    await connection.run('BEGIN TRANSACTION');

    let active = true;

    const commit = async (): Promise<void> => {
      if (!active) {
        throw new DatabaseError('Transaction already ended', {});
      }
      await connection.run('COMMIT');
      active = false;
    };

    const rollback = async (): Promise<void> => {
      if (!active) {
        throw new DatabaseError('Transaction already ended', {});
      }
      await connection.run('ROLLBACK');
      active = false;
    };

    const isActive = (): boolean => active;

    // Create a transaction-scoped database interface with commit/rollback
    const txHandle: TransactionHandle = {
      url,
      client: connection,
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
      transaction,
      commit,
      rollback,
      isActive,
    };

    return txHandle;
  };

  return {
    url,
    client: connection,
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
    // DuckDB-specific export method
    exportTable,
  } as DatabaseInterface & { exportTable: (table: string) => Promise<void> };
}
