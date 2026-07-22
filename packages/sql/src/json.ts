import { mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { DatabaseError } from '@happyvertical/utils';
import { DatabaseSchemaManager } from './schema-manager';
import {
  escapeQuotedIdentifier,
  escapeStringLiteral,
  validateColumnNames,
} from './shared/alter-utils';
import { convertUniqueIndexesToInlineConstraints } from './shared/duckdb-schema-utils';
import { createTransactionLock } from './shared/transaction-lock';
import type {
  DatabaseInterface,
  JSONOptions,
  QueryResult,
  SchemaInitializationOptions,
  TableInterface,
  TransactionHandle,
  UpsertOptions,
} from './shared/types';
import { NestedTransactionError, resolveSchemas } from './shared/types';
import {
  buildWhere,
  formatDbError,
  resolveInsertColumns,
} from './shared/utils';

/**
 * Extend globalThis to include our connection cache properties.
 * Using globalThis ensures all module instances share the same cache,
 * which is critical in monorepos where the same package can be loaded
 * from different paths (e.g., pnpm store vs workspace symlink).
 *
 * @see https://github.com/happyvertical/sdk/issues/678
 */
declare global {
  // eslint-disable-next-line no-var
  var __haveSqlMemoryConnectionCache:
    | Map<string, DatabaseInterface>
    | undefined;
  // eslint-disable-next-line no-var
  var __haveSqlPendingConnections:
    | Map<string, Promise<DatabaseInterface>>
    | undefined;
}

/**
 * Connection cache for in-memory DuckDB instances keyed by data directory URL
 * Enables sharing of in-memory databases across multiple getDatabase() calls
 * with the same data directory.
 *
 * Uses globalThis to ensure cache is shared across all module instances,
 * fixing the lost update bug in monorepos with workspace symlinks.
 *
 * @see https://github.com/happyvertical/sdk/issues/678
 */
globalThis.__haveSqlMemoryConnectionCache ??= new Map<
  string,
  DatabaseInterface
>();
const memoryConnectionCache = globalThis.__haveSqlMemoryConnectionCache;

/**
 * Pending connection promises to handle concurrent getDatabase() calls
 * Prevents creating duplicate connections when parallel calls happen.
 *
 * Uses globalThis to ensure cache is shared across all module instances.
 *
 * @see https://github.com/happyvertical/sdk/issues/678
 */
globalThis.__haveSqlPendingConnections ??= new Map<
  string,
  Promise<DatabaseInterface>
>();
const pendingConnections = globalThis.__haveSqlPendingConnections;

/**
 * Clears all cached connections
 * Useful for testing to ensure test isolation
 */
export function clearConnectionCache(): void {
  memoryConnectionCache.clear();
  pendingConnections.clear();
}

/**
 * Creates a JSON database connection using DuckDB in-memory engine
 *
 * This adapter uses DuckDB as a query engine for JSON files, storing everything
 * in-memory and writing changes back to JSON files. No WAL files or persistent
 * database files are created.
 *
 * @param options - JSON database options
 * @returns Promise resolving to a DuckDB connection
 */
async function createJSONConnection(options: JSONOptions) {
  const { url, autoRegister = true, eagerLoadTables = true } = options;
  const schemas = resolveSchemas(options.schemas) ?? {};

  if (!url) {
    throw new DatabaseError('url is required for JSON adapter', {
      options,
    });
  }

  // Track JSON files pending deferred loading (tableName → filePath)
  const pendingJSONFiles = new Map<string, string>();

  // Track tables created with inferred schemas (need DROP before syncSchema())
  const inferredSchemaTables = new Set<string>();

  try {
    // Dynamic import to avoid bundling
    const duckdbModule = '@duckdb/node-api';
    const { DuckDBInstance } = await import(/* @vite-ignore */ duckdbModule);

    // Always use in-memory database - no persistent files
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();

    // Ensure data directory exists
    try {
      await mkdir(url, { recursive: true });
    } catch (_error) {
      // Directory might already exist, that's okay
    }

    // Scan JSON files - tables with schemas are created now, others are deferred
    if (autoRegister) {
      await loadJSONTables(
        connection,
        url,
        schemas,
        pendingJSONFiles,
        eagerLoadTables,
        inferredSchemaTables,
      );
    }

    return { connection, pendingJSONFiles, inferredSchemaTables };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new DatabaseError(
      `Failed to create JSON database connection: ${errorMessage}`,
      {
        url,
        originalError: errorMessage,
      },
    );
  }
}

/**
 * Loads JSON data into an existing table
 *
 * This function only loads data - it assumes the table already exists with proper schema.
 * Used after DDL creates the table to load persisted JSON data.
 *
 * An unreadable or malformed file is tolerated with a warning - the table
 * structure is what matters and there is no data to lose.
 *
 * A failure to insert records that DID parse is logged loudly rather than
 * swallowed with the old dismissive "that's okay" warning: the resulting empty
 * table is a real surprise the caller should see (issue #1132). It is logged
 * rather than thrown so that one unloadable table cannot abort the load of every
 * other table sharing the same data directory or syncSchema() call - both of
 * those paths already load each table independently.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to load data into
 * @param filePath - Path to the JSON file
 */
async function loadJSONData(
  connection: any,
  tableName: string,
  filePath: string,
): Promise<void> {
  let records: unknown;

  try {
    const { readFile } = await import('node:fs/promises');
    const jsonContent = await readFile(filePath, 'utf-8');
    records = JSON.parse(jsonContent);
  } catch (error) {
    // Missing, empty, or malformed file - table structure is what matters
    console.warn(
      `[json-adapter] Could not read data for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  if (!Array.isArray(records) || records.length === 0) {
    return;
  }

  try {
    const inserted = await insertRecordsWithCast(
      connection,
      tableName,
      records,
    );
    if (inserted > 0) {
      console.log(
        `[json-adapter] Loaded ${inserted} records into ${tableName} from JSON`,
      );
    }
  } catch (error) {
    // Pass the raw error as a second argument so its context (the underlying
    // DuckDB cause, e.g. a NOT NULL violation) is rendered, not just the wrapper
    // message - diagnosability is the point of surfacing this (issue #1132)
    console.error(
      `[json-adapter] Failed to load data for ${tableName}; the table will be empty:`,
      error,
    );
  }
}

/**
 * Scans the data directory and registers JSON files for deferred loading
 *
 * Unlike the DuckDB adapter which creates views, this creates actual tables
 * so that indexes can be added.
 *
 * Schema resolution priority:
 * 1. Explicit schemas provided via options.schemas - table created immediately
 * 2. Schema file (.schema.sql) in data directory - table created with schema
 * 3. All other tables - DEFERRED until syncSchema() provides DDL
 *
 * IMPORTANT: Tables without explicit schemas are NOT auto-created from JSON.
 * This ensures UNIQUE constraints from syncSchema() are in place before data
 * is loaded, which is required for UPSERT operations to work correctly.
 *
 * For users who want auto-inference, use the inferSchemaFromJSON() method
 * after database creation.
 *
 * @param connection - DuckDB connection
 * @param dataDir - Directory containing JSON files
 * @param providedSchemas - Explicit schema definitions provided by caller (optional)
 * @param pendingJSONFiles - Map to store JSON files pending deferred loading
 * @param eagerLoadTables - Whether to eagerly create tables with inferred schemas
 * @param inferredSchemaTables - Set to track tables created with inferred schemas
 */
async function loadJSONTables(
  connection: any,
  dataDir: string,
  providedSchemas: Record<string, import('./shared/types').SchemaProvider> = {},
  pendingJSONFiles: Map<string, string> = new Map(),
  eagerLoadTables: boolean = true,
  inferredSchemaTables: Set<string> = new Set(),
) {
  try {
    const files = await readdir(dataDir);
    const jsonFiles = files.filter(
      (file) => extname(file).toLowerCase() === '.json',
    );

    for (const file of jsonFiles) {
      const filePath = join(dataDir, file);
      const tableName = basename(file, '.json');

      // Check for explicitly provided schema
      const schema = providedSchemas[tableName];

      if (schema) {
        // Create table with provided schema (proper typing)
        console.log(
          `[json-adapter] Creating ${tableName} with provided schema definition`,
        );
        await createTableFromSchema(connection, tableName, schema);

        // Load JSON data into properly-typed table
        await loadJSONData(connection, tableName, filePath);
      } else {
        // Check for schema file first (preserves constraints like PRIMARY KEY, UNIQUE, etc.)
        const schemaPath = join(dataDir, `${tableName}.schema.sql`);
        const { readFile, access } = await import('node:fs/promises');
        const { constants } = await import('node:fs');

        let schemaExists = false;
        try {
          await access(schemaPath, constants.F_OK);
          schemaExists = true;
        } catch {
          schemaExists = false;
        }

        if (schemaExists) {
          // Schema file exists - create table and load data now
          try {
            const schemaDDL = await readFile(schemaPath, 'utf-8');
            await connection.run(schemaDDL);
            await loadJSONData(connection, tableName, filePath);
          } catch (error) {
            console.warn(
              `[json-adapter] Could not load ${tableName} with schema file: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          // No schema file - either eager load with inferred schema or defer
          if (eagerLoadTables) {
            // Eager load: create table with inferred schema from JSON
            // This enables cross-table queries before syncSchema() is called
            // Note: Inferred schemas don't have UNIQUE constraints, so UPSERT won't work
            // until syncSchema() is called to upgrade the schema
            try {
              await connection.run(
                `CREATE TABLE IF NOT EXISTS "${escapeQuotedIdentifier(tableName)}" AS SELECT * FROM read_json_auto('${escapeStringLiteral(filePath)}')`,
              );
              inferredSchemaTables.add(tableName);
              console.log(
                `[json-adapter] Eagerly created ${tableName} with inferred schema (no UNIQUE constraints)`,
              );
            } catch (error) {
              console.warn(
                `[json-adapter] Could not eagerly load ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          } else {
            console.log(
              `[json-adapter] Deferring ${tableName} - will load after syncSchema() creates table`,
            );
          }
          // Always track for later schema upgrade and data reload
          pendingJSONFiles.set(tableName, filePath);
        }
      }
    }
  } catch (error) {
    // If directory doesn't exist or is empty, that's okay
    if ((error as any).code !== 'ENOENT') {
      // Log the error for debugging
      console.error('[json-adapter] Error loading JSON tables:', error);
      throw new DatabaseError(`Failed to load JSON tables from ${dataDir}`, {
        dataDir,
        originalError: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }
}

/**
 * Converts DuckDB-specific type representations to JavaScript types
 *
 * Handles three cases:
 * 1. JavaScript BigInt values → converted to numbers
 * 2. DuckDB hugeint objects ({ hugeint: number }) → converted to strings
 * 3. DuckDB timestamp objects ({ micros: number }) → converted to Date objects
 *
 * DuckDB represents HUGEINT (128-bit integers) as objects with a single
 * property called 'hugeint'. When UUID strings (stored as TEXT) are
 * exported to JSON via COPY TO, DuckDB sometimes converts them to hugeint
 * representation. This function converts them back to strings.
 *
 * DuckDB represents TIMESTAMP values as objects with a single property
 * called 'micros' containing microseconds since Unix epoch. This function
 * converts them to JavaScript Date objects for proper round-trip serialization.
 *
 * @param obj - Object that may contain BigInt, hugeint, or timestamp values
 * @returns Object with DuckDB types converted to JavaScript types
 */
function convertBigInts(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);

  // Handle DuckDB hugeint objects: { hugeint: number }
  // Convert to string to preserve UUID/TEXT values
  if (
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    'hugeint' in obj &&
    Object.keys(obj).length === 1
  ) {
    // Convert hugeint to string representation
    // For UUIDs and other TEXT values that DuckDB converted
    return String(obj.hugeint);
  }

  // Handle DuckDB timestamp objects: { micros: number | bigint }
  // Convert to JavaScript Date for proper round-trip serialization
  // Fixes issue #319: JSON adapter fails to serialize Date fields during UPSERT
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
 * Creates a table from a schema definition with proper typing
 *
 * DuckDB has issues with type inference when DEFAULT values are empty strings.
 * This function explicitly casts all DEFAULT values to their column types to
 * prevent DuckDB from inferring ANY type.
 *
 * Additionally, DuckDB has a known limitation (issue #12684) where ON CONFLICT
 * clauses fail with UNIQUE INDEX but work with inline UNIQUE constraints.
 * This function converts UNIQUE indexes to inline constraints for compatibility.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to create
 * @param schema - Schema definition with DDL and indexes
 */
async function createTableFromSchema(
  connection: any,
  tableName: string,
  schema: import('./shared/types').SchemaProvider,
): Promise<void> {
  // Extract CREATE TABLE statement (without triggers which aren't supported)
  const ddlLines = schema.ddl.split('\n');
  const createTableEnd = ddlLines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed === ')' || trimmed.startsWith(');');
  });

  if (createTableEnd === -1) {
    throw new DatabaseError('Invalid schema DDL - no closing parenthesis', {
      tableName,
      ddl: schema.ddl,
    });
  }

  // Get CREATE TABLE statement
  let createTableSQL = ddlLines.slice(0, createTableEnd + 1).join('\n');

  // Fix DEFAULT values for DuckDB type inference
  // DuckDB infers ANY type when DEFAULT is an empty string without explicit cast
  // Replace patterns like: DEFAULT '' with DEFAULT CAST('' AS TEXT)
  createTableSQL = createTableSQL.replace(
    /\b(\w+)\s+(TEXT|VARCHAR)\s+DEFAULT\s+''/g,
    "$1 $2 DEFAULT CAST('' AS $2)",
  );

  // Also handle DEFAULT NULL cases to ensure proper typing
  createTableSQL = createTableSQL.replace(
    /\b(\w+)\s+(TEXT|VARCHAR)\s+DEFAULT\s+NULL/g,
    '$1 $2 DEFAULT CAST(NULL AS $2)',
  );

  // Convert UNIQUE indexes to inline UNIQUE constraints for DuckDB compatibility
  // DuckDB's ON CONFLICT requires inline constraints, not separate indexes
  const transformed = convertUniqueIndexesToInlineConstraints(
    createTableSQL,
    schema.indexes,
  );
  createTableSQL = transformed.ddl;
  const indexesToCreate = transformed.indexes;

  try {
    await connection.run(createTableSQL);

    // Get actual columns after table creation
    let existingColumns: Set<string> = new Set();
    try {
      const schemaInfo = await connection.runAndReadAll(
        `DESCRIBE ${tableName}`,
      );
      const columns = schemaInfo.getRowObjects();
      existingColumns = new Set(
        columns.map((col: any) => col.column_name.toLowerCase()),
      );

      console.log(`[json-adapter] Created ${tableName} with schema:`, {
        columns: columns.map((col: any) => ({
          name: col.column_name,
          type: col.column_type,
          null: col.null,
        })),
      });
    } catch (error) {
      // Schema verification failed, but table was created - log warning and continue
      console.warn(
        `[json-adapter] Could not verify schema for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Add columns from fields that aren't in the DDL (important for STI subclass fields)
    if (schema.fields && existingColumns.size > 0) {
      // Handle both Map and Record formats
      const fieldEntries =
        schema.fields instanceof Map
          ? Array.from(schema.fields.entries())
          : Object.entries(schema.fields);

      for (const [fieldName, fieldDef] of fieldEntries) {
        const columnName = fieldName.toLowerCase();
        if (!existingColumns.has(columnName)) {
          // Determine SQL type from field definition
          const sqlType = fieldDef?.type || 'TEXT';
          try {
            await connection.run(
              `ALTER TABLE ${tableName} ADD COLUMN "${fieldName}" ${sqlType}`,
            );
            console.log(
              `[json-adapter] Added missing column '${fieldName}' (${sqlType}) to ${tableName}`,
            );
          } catch (alterError) {
            console.warn(
              `[json-adapter] Could not add column '${fieldName}' to ${tableName}: ${alterError instanceof Error ? alterError.message : String(alterError)}`,
            );
          }
        }
      }
    }

    // Create remaining indexes (non-UNIQUE indexes only)
    // UNIQUE indexes have been converted to inline constraints
    if (indexesToCreate && indexesToCreate.length > 0) {
      for (const indexSQL of indexesToCreate) {
        try {
          await connection.run(indexSQL);
        } catch (error) {
          // Index creation might fail if column doesn't exist or syntax incompatibility
          console.warn(
            `[json-adapter] Failed to create index: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  } catch (error) {
    throw new DatabaseError('Failed to create table from schema', {
      tableName,
      sql: createTableSQL,
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Reads the column names of an existing table, keyed by lowercase name
 *
 * The table-name predicate is case-insensitive: DuckDB resolves identifiers
 * case-insensitively, so a data file named `Items.json` can back a table
 * created as `items`. Matching table_name exactly would find no columns and
 * make the loader wrongly report that every field is unmatched (issue #1132).
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to describe
 * @returns Map of lowercase column name to the column's declared name
 */
async function getTableColumns(
  connection: any,
  tableName: string,
): Promise<Map<string, string>> {
  const reader = await connection.runAndReadAll(
    'SELECT column_name FROM information_schema.columns WHERE LOWER(table_name) = LOWER($1) ORDER BY ordinal_position',
    [tableName],
  );

  return new Map(
    reader
      .getRowObjects()
      .map((row: any) => [
        String(row.column_name).toLowerCase(),
        String(row.column_name),
      ]),
  );
}

/**
 * Inserts records with proper CAST handling for empty strings
 *
 * This helper avoids using read_json() with auto_detect, which causes DuckDB
 * to re-infer column types from data (causing ANY type for empty strings).
 * Instead, it uses parameterized INSERT with CAST to maintain table schema.
 *
 * Used only for loading a JSON data file, where records having different key
 * sets is normal input rather than a caller error: a document with an optional
 * field omits that key entirely on the records that lack it. Columns are
 * therefore unioned across ALL records and any record missing a key binds NULL.
 * Deriving them from the first record alone bound `undefined` for a missing key
 * (which DuckDB rejects, losing every row) and dropped keys the first record
 * did not have (losing the column silently). See issue #1132.
 *
 * The caller-facing insert() API is a separate implementation (it resolves
 * columns through `resolveInsertColumns`) and is not affected by this
 * file-loading tolerance.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to insert into
 * @param records - Array of records to insert
 * @returns Number of records inserted (0 if there was nothing loadable)
 * @throws DatabaseError if the resolved records cannot be inserted
 */
async function insertRecordsWithCast(
  connection: any,
  tableName: string,
  records: unknown[],
): Promise<number> {
  if (records.length === 0) return 0;

  // Only object records contribute columns AND rows. A non-object element
  // (e.g. a `null` hole in the array) must be skipped entirely - iterating it
  // for values would emit a phantom all-NULL row.
  const objectRecords = records.filter(
    (record): record is Record<string, any> =>
      record != null && typeof record === 'object' && !Array.isArray(record),
  );

  if (objectRecords.length === 0) {
    return 0;
  }

  // Union keys across every record, preserving first-appearance order
  const unionedKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const record of objectRecords) {
    for (const key of Object.keys(record)) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        unionedKeys.push(key);
      }
    }
  }

  if (unionedKeys.length === 0) {
    console.warn(
      `[json-adapter] Skipping data load for ${tableName}: records have no fields`,
    );
    return 0;
  }

  // Resolve keys against the table's real columns. A JSON field with no
  // matching column cannot be inserted; report it instead of failing the whole
  // load, so one stray field does not cost every row. Column matching is
  // case-insensitive (DuckDB folds identifier case), so track which columns are
  // already claimed - two case-variant keys (`id` and `ID`) must not both emit
  // the same column, which would produce a duplicate-column INSERT.
  const tableColumns = await getTableColumns(connection, tableName);
  const keys: string[] = [];
  const columnNames: string[] = [];
  const unmatchedKeys: string[] = [];
  const claimedColumns = new Set<string>();

  for (const key of unionedKeys) {
    const column = tableColumns.get(key.toLowerCase());
    if (column === undefined || claimedColumns.has(column.toLowerCase())) {
      // No matching column, or a differently-cased key already claimed it
      unmatchedKeys.push(key);
    } else {
      claimedColumns.add(column.toLowerCase());
      keys.push(key);
      columnNames.push(column);
    }
  }

  if (unmatchedKeys.length > 0) {
    console.warn(
      `[json-adapter] Ignoring ${unmatchedKeys.length} field(s) in ${tableName} data with no matching column: ${unmatchedKeys.join(', ')}`,
    );
  }

  if (keys.length === 0) {
    throw new DatabaseError(
      `No fields in the ${tableName} data file match a column on the table`,
      {
        tableName,
        fields: unionedKeys,
        columns: [...tableColumns.values()],
      },
    );
  }

  // A record that carries none of the matched keys would insert a row of all
  // NULLs - which is not data the file meant to provide and can violate a NOT
  // NULL / PRIMARY KEY column, failing the whole batch. Skip such records so a
  // stray record, like a stray field, does not cost the rest of the load.
  // (keys is non-empty here, and every key came from some record, so at least
  // that record survives - insertableRecords cannot be empty.)
  const insertableRecords = objectRecords.filter((record) =>
    keys.some((key) => key in record),
  );

  // Build placeholders - schema has NOT NULL DEFAULT '' to prevent ANY type
  const values: any[] = [];
  let paramIdx = 1;

  const placeholders = insertableRecords
    .map((record) => {
      const rowPlaceholders = keys.map((key) => {
        const value = record[key];

        // `undefined` covers a key this record omits; binding it directly makes
        // DuckDB reject the whole INSERT ("Cannot create values of type ANY"),
        // so bind NULL for the missing field, exactly as duckdb.ts does.
        if (value === null || value === undefined) {
          return 'NULL';
        } else if (value === '' && typeof value === 'string') {
          // CAST empty strings to TEXT to prevent DuckDB ANY type inference on parameters
          values.push(value);
          return `CAST($${paramIdx++} AS TEXT)`;
        } else if (value instanceof Date) {
          // Convert Date objects to ISO strings for DuckDB
          // CAST to TIMESTAMP to prevent DuckDB ANY type inference (issue #540)
          values.push(value.toISOString());
          return `CAST($${paramIdx++} AS TIMESTAMP)`;
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

  // Use the table's own column names - they came from information_schema, so
  // no JSON-supplied identifier reaches the statement
  const columnList = columnNames.map((name) => `"${name}"`).join(', ');
  const sql = `INSERT INTO "${tableName}" (${columnList}) VALUES ${placeholders}`;

  try {
    await connection.run(sql, values);
  } catch (e) {
    throw new DatabaseError('Failed to load records into table', {
      tableName,
      recordCount: insertableRecords.length,
      columns: columnNames,
      originalError: formatDbError(e),
    });
  }

  return insertableRecords.length;
}

/**
 * Validates that a table name is valid (alphanumeric + underscores only)
 *
 * @param table - Table name to validate
 * @throws DatabaseError if table name is invalid
 */
function validateTableName(table: string): void {
  // Reject non-strings before the regex: `test` coerces via `toString`, so an
  // object with a stateful `toString` could pass here and interpolate a
  // different name into SQL. See shared/alter-utils.ts:validateTableName.
  if (typeof table !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new DatabaseError(`Invalid table name: ${table}`, { table });
  }
}

/**
 * Creates a JSON database adapter using DuckDB in-memory engine
 *
 * This adapter provides SQL query capabilities over JSON files without creating
 * persistent database files or WAL files. All data is stored in-memory during
 * runtime and written back to JSON files based on the write strategy.
 *
 * @param options - JSON database options
 * @returns Database interface for JSON files
 */
export async function getDatabase(
  options: JSONOptions,
): Promise<DatabaseInterface> {
  // Generate cache key from URL and options that affect database behavior
  // FIX for issues #533/#534: Auto-generate dbid from URL when schemas provided
  // This ensures connection caching ALWAYS happens for the same URL, preventing
  // the lost update bug where multiple connections overwrite each other's data.
  //
  // Priority:
  // 1. Explicit dbid from caller
  // 2. Auto-generated from URL + writeStrategy (ensures caching)
  const cacheKey =
    options.dbid ||
    `json:${options.url}:${options.writeStrategy || 'immediate'}:${options.autoRegister !== false}`;

  // If clearCache option is true, clear any cached connection for this key
  if (options.clearCache) {
    memoryConnectionCache.delete(cacheKey);
    pendingConnections.delete(cacheKey);
  }

  // Check if we have a cached connection for this cache key
  const cached = memoryConnectionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Check if there's a pending connection for this cache key
  const pending = pendingConnections.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Create a new connection promise
  const connectionPromise = (async () => {
    const { connection, pendingJSONFiles, inferredSchemaTables } =
      await createJSONConnection(options);
    const writeStrategy = options.writeStrategy || 'immediate';
    const { url } = options;

    // One lock per connection. `getDatabase` hands cached callers this same
    // closure, so "created here" and "per connection" are the same scope —
    // including across duplicated module copies, since the connection cache
    // itself lives on globalThis.
    const connectionLock = createTransactionLock(
      'json',
      options.transactionQueueTimeout,
    );

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

      // Enforce read-only mode
      if (writeStrategy === 'none') {
        throw new DatabaseError(
          'Cannot insert: write strategy is set to none (read-only mode)',
          { table, writeStrategy },
        );
      }

      const records = Array.isArray(data) ? data : [data];

      if (records.length === 0) {
        return { operation: 'insert', affected: 0 };
      }

      const keys = resolveInsertColumns(table, records);
      validateColumnNames(keys);

      // Build placeholders with CAST for empty strings
      const values: any[] = [];
      let paramIdx = 1;

      const placeholders = records
        .map((record) => {
          const rowPlaceholders = keys.map((key) => {
            const value = record[key];

            // DuckDB cannot bind `undefined`, so map it to NULL as duckdb.ts
            // does rather than failing the insert.
            if (value === null || value === undefined) {
              return 'NULL';
            } else if (value === '' && typeof value === 'string') {
              // CAST empty strings to TEXT to prevent DuckDB ANY type inference
              values.push(value);
              return `CAST($${paramIdx++} AS TEXT)`;
            } else if (value instanceof Date) {
              // Convert Date objects to ISO strings for DuckDB (issue #319)
              // CAST to TIMESTAMP to prevent DuckDB ANY type inference (issue #540)
              values.push(value.toISOString());
              return `CAST($${paramIdx++} AS TIMESTAMP)`;
            } else if (Array.isArray(value)) {
              // CAST arrays to JSON to prevent DuckDB ANY type inference
              // DuckDB cannot infer array element types from empty arrays or mixed types
              values.push(JSON.stringify(value));
              return `CAST($${paramIdx++} AS JSON)`;
            } else if (
              typeof value === 'object' &&
              value !== null &&
              Object.getPrototypeOf(value) === Object.prototype
            ) {
              // CAST plain objects to JSON to prevent DuckDB ANY type inference
              // Only applies to plain objects (not class instances)
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

      const sql = `INSERT INTO "${table}" (${keys.join(', ')}) VALUES ${placeholders}`;

      try {
        await connection.run(sql, values);
        const affected = records.length;

        // Handle write-back strategy
        if (writeStrategy === 'immediate') {
          await exportTableToJSON(connection, table, url);
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
      validateTableName(table);

      const { sql: whereClause, values } = buildWhere(where, 1, 'json');
      const sql = `SELECT * FROM "${table}" ${whereClause} LIMIT 1`;

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
      validateTableName(table);

      const { sql: whereClause, values } = buildWhere(where, 1, 'json');
      const sql = `SELECT * FROM "${table}" ${whereClause}`;

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
      validateTableName(table);

      // Enforce read-only mode
      if (writeStrategy === 'none') {
        throw new DatabaseError(
          'Cannot update: write strategy is set to none (read-only mode)',
          { table, writeStrategy },
        );
      }

      const keys = Object.keys(data);
      validateColumnNames(keys);
      const setClause = keys
        .map((key, idx) => `${key} = $${idx + 1}`)
        .join(', ');
      const { sql: whereClause, values: whereValues } = buildWhere(
        where,
        keys.length + 1,
        'json',
      );

      // Read values through the validated key list rather than a second
      // enumeration of `data`. `Object.values` on a hostile Proxy could return
      // values in a different order (or for different keys) than the `keys`
      // that drive `setClause`, binding each value to the wrong column.
      // Convert Date objects to ISO strings for DuckDB (issue #319)
      const dataValues = keys.map((key) => {
        const value = data[key];
        return value instanceof Date ? value.toISOString() : value;
      });

      const sql = `UPDATE "${table}" SET ${setClause} ${whereClause}`;
      const values = [...dataValues, ...whereValues];

      try {
        await connection.run(sql, values);

        // Handle write-back strategy
        if (writeStrategy === 'immediate') {
          await exportTableToJSON(connection, table, url);
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

    const buildJSONValueExpression = (
      value: any,
      values: any[],
      paramIdx: { value: number },
    ): string => {
      if (value === null) {
        return 'NULL';
      }
      if (value === '' && typeof value === 'string') {
        values.push(value);
        return `CAST($${paramIdx.value++} AS TEXT)`;
      }
      if (value instanceof Date) {
        values.push(value.toISOString());
        return `CAST($${paramIdx.value++} AS TIMESTAMP)`;
      }
      if (Array.isArray(value)) {
        values.push(JSON.stringify(value));
        return `CAST($${paramIdx.value++} AS JSON)`;
      }
      if (
        typeof value === 'object' &&
        value !== null &&
        Object.getPrototypeOf(value) === Object.prototype
      ) {
        values.push(JSON.stringify(value));
        return `CAST($${paramIdx.value++} AS JSON)`;
      }

      values.push(value);
      return `$${paramIdx.value++}`;
    };

    const executeNullAwareJSONUpsert = async (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
    ): Promise<QueryResult> => {
      const conflictWhere = Object.fromEntries(
        conflictColumns.map((col) => [col, data[col]]),
      );
      const existing = await get(table, conflictWhere);

      if (!existing) {
        return insert(table, data);
      }

      const keys = Object.keys(data);
      const values: any[] = [];
      const paramIdx = { value: 1 };
      const assignments = keys.map((key) => {
        const valueExpr = buildJSONValueExpression(data[key], values, paramIdx);
        return `"${escapeQuotedIdentifier(key)}" = ${valueExpr}`;
      });
      const { sql: whereClause, values: whereValues } = buildWhere(
        conflictWhere,
        paramIdx.value,
        'json',
      );
      const sql = `UPDATE "${table}" SET ${assignments.join(', ')} ${whereClause}`;

      try {
        await connection.run(sql, [...values, ...whereValues]);

        if (writeStrategy === 'immediate') {
          await exportTableToJSON(connection, table, url);
        }

        return { operation: 'upsert', affected: 1 };
      } catch (e) {
        throw new DatabaseError('Failed to upsert record into table', {
          table,
          sql,
          values: [...values, ...whereValues],
          conflictColumns,
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
      validateTableName(table);

      // Enforce read-only mode
      if (writeStrategy === 'none') {
        throw new DatabaseError(
          'Cannot upsert: write strategy is set to none (read-only mode)',
          { table, writeStrategy },
        );
      }

      // Snapshot the record once. Every read below — the presence check, the
      // column list, the value list, and the null-aware branch — must see the
      // same keys and values, or a hostile object could present one shape to
      // the checks and another to the interpolated `keys`. A plain-object copy
      // cannot observe how many times it is read.
      const record = { ...data };
      // Conflict columns reach two very different positions. In the plain
      // `ON CONFLICT(...)` path below they are quoted, so a name that needs
      // quotes — `Full Name`, `user-id`, whatever the source JSON called its
      // keys — is ordinary and has always worked; escaping keeps it working
      // while making it impossible to leave the quotes. In the null-aware path
      // they become `buildWhere` keys instead, which requires a plain
      // identifier and rejects them there, as it did before this change.
      // Validate that all conflict columns are present in the data
      const missingColumns = conflictColumns.filter((col) => !(col in record));

      if (missingColumns.length > 0) {
        throw new DatabaseError('Conflict columns missing from data', {
          table,
          conflictColumns,
          missingColumns,
          availableColumns: Object.keys(record),
          hint: 'All columns specified in ON CONFLICT must be present in the data being inserted. Undefined values should be replaced with null or an appropriate default.',
        });
      }

      if (
        !options?.nullsDistinct &&
        conflictColumns.some((col) => record[col] === null)
      ) {
        return executeNullAwareJSONUpsert(table, conflictColumns, record);
      }

      const keys = Object.keys(record);
      const dataValues = Object.values(record);

      // Build placeholders - schema has NOT NULL DEFAULT '' to prevent ANY type
      const placeholders: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const value of dataValues) {
        if (value === null) {
          placeholders.push('NULL');
        } else if (value === '' && typeof value === 'string') {
          // CAST empty strings to TEXT to prevent DuckDB ANY type inference on parameters
          placeholders.push(`CAST($${paramIdx} AS TEXT)`);
          values.push(value);
          paramIdx++;
        } else if (value instanceof Date) {
          // Convert Date objects to ISO strings for DuckDB
          // CAST to TIMESTAMP to prevent DuckDB ANY type inference (issue #540)
          placeholders.push(`CAST($${paramIdx} AS TIMESTAMP)`);
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

      // Build UPDATE SET clause with same approach
      // DO NOT reset paramIdx - parameters must be unique across entire query
      const updateSetParts: string[] = [];

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = dataValues[i];

        if (value === null) {
          updateSetParts.push(`${key} = NULL`);
        } else if (value === '' && typeof value === 'string') {
          // CAST empty strings to TEXT to prevent DuckDB ANY type inference on parameters
          updateSetParts.push(`${key} = CAST($${paramIdx} AS TEXT)`);
          values.push(value);
          paramIdx++;
        } else if (value instanceof Date) {
          // Convert Date objects to ISO strings for DuckDB
          // CAST to TIMESTAMP to prevent DuckDB ANY type inference (issue #540)
          updateSetParts.push(`${key} = CAST($${paramIdx} AS TIMESTAMP)`);
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
          // Direct parameter binding for other values
          updateSetParts.push(`${key} = $${paramIdx}`);
          values.push(value);
          paramIdx++;
        }
      }

      // Quote ALL column names to match DuckDB's schema generation
      // SchemaGenerator always quotes column names, so UPSERT must match
      const conflict = conflictColumns
        .map((col) => `"${escapeQuotedIdentifier(col)}"`)
        .join(', ');
      const quotedKeys = keys
        .map((key) => `"${escapeQuotedIdentifier(key)}"`)
        .join(', ');

      // Quote column names in UPDATE SET clause to match schema and ON CONFLICT
      // Extract the value expression from each updateSetPart (everything after '=')
      const quotedUpdateSetParts = keys.map((key, i) => {
        const part = updateSetParts[i];
        const valueExpr = part.substring(part.indexOf('=') + 1).trim();
        return `"${escapeQuotedIdentifier(key)}" = ${valueExpr}`;
      });

      const sql = `INSERT INTO "${table}" (${quotedKeys}) VALUES (${placeholders.join(', ')}) ON CONFLICT(${conflict}) DO UPDATE SET ${quotedUpdateSetParts.join(', ')}`;

      try {
        await connection.run(sql, values);

        // Handle write-back strategy
        if (writeStrategy === 'immediate') {
          await exportTableToJSON(connection, table, url);
        }

        return { operation: 'upsert', affected: 1 };
      } catch (e) {
        // Log detailed error information for debugging
        console.error('UPSERT failed:', {
          table,
          sql,
          values,
          valueTypes: values.map((v) => `${typeof v} (${v})`),
          conflictColumns,
          error: formatDbError(e),
        });
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

      // Enforce read-only mode
      if (writeStrategy === 'none') {
        throw new DatabaseError(
          'Cannot delete: write strategy is set to none (read-only mode)',
          { table, writeStrategy },
        );
      }

      const keys = Object.keys(where);
      if (keys.length === 0) {
        throw new DatabaseError(
          'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
          { table },
        );
      }

      const { sql: whereClause, values } = buildWhere(where, 1, 'json');
      const sql = `DELETE FROM "${table}" ${whereClause}`;

      try {
        await connection.run(sql, values);

        // Handle write-back strategy
        if (writeStrategy === 'immediate') {
          await exportTableToJSON(connection, table, url);
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
            `SELECT COUNT(*) as count FROM "${table}"`,
          );
          const rows = result.getRowObjects();
          return Number(rows[0]?.count) || 0;
        }

        // Count with conditions
        const { sql: whereClause, values } = buildWhere(where, 1, 'json');
        const sql = `SELECT COUNT(*) as count FROM "${table}" ${whereClause}`;

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
      // The name is interpolated into a statement, and this engine executes
      // every statement in the string it is given, so an unvalidated name here
      // is a DDL/DML sink rather than a read oracle — the `catch` below
      // swallows the error, not the execution. Validation runs outside the try
      // for that reason: a rejected identifier must be reported, not reported
      // as `false`.
      validateTableName(tableName);
      try {
        // Try to query the table
        await connection.runAndReadAll(`SELECT * FROM ${tableName} LIMIT 1`);
        return true;
      } catch {
        return false;
      }
    };

    /**
     * Exports a table to JSON and schema files
     *
     * Exports two files:
     * 1. {table}.json - Table data with columns cast appropriately
     * 2. {table}.schema.sql - CREATE TABLE statement to preserve constraints
     *
     * Note: JSON columns are NOT cast to TEXT to preserve object structure.
     * Other columns are cast to TEXT to prevent DuckDB from converting UUIDs
     * and other TEXT values to hugeint representation in JSON output.
     *
     * @param connection - DuckDB connection
     * @param table - Table name
     * @param dataDir - Directory to write files
     */
    const exportTableToJSON = async (
      connection: any,
      table: string,
      dataDir: string,
    ): Promise<void> => {
      // Every caller-facing path into this function takes a table name, and it
      // is interpolated into a COPY statement's identifier and into the target
      // file path. Unvalidated, `exportTable('t") TO $$/etc/x$$; DROP ...; --')`
      // both writes a file outside the data directory and runs the trailing
      // statements. Validate at this choke point so the internal callers that
      // pass catalog-derived names are covered too.
      validateTableName(table);

      const filePath = join(dataDir, `${table}.json`);
      const schemaPath = join(dataDir, `${table}.schema.sql`);

      // Export schema first using SHOW CREATE TABLE
      try {
        const schemaResult = await connection.runAndReadAll(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`,
        );
        const rows = schemaResult.getRowObjects();
        if (rows.length > 0 && rows[0].sql) {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(schemaPath, rows[0].sql, 'utf-8');
        }
      } catch (error) {
        console.warn(
          `[json-adapter] Could not export schema for ${table}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Get column names and types to handle JSON columns specially
      // JSON columns should NOT be cast to TEXT to preserve object structure (fixes #542)
      const columnsResult = await connection.runAndReadAll(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`,
      );
      const columnInfo = columnsResult.getRowObjects() as {
        column_name: string;
        data_type: string;
      }[];

      if (columnInfo.length === 0) {
        // Fallback to SELECT * if we can't get column names
        await connection.run(
          `COPY (SELECT * FROM "${table}") TO '${filePath}' (FORMAT JSON, ARRAY true)`,
        );
        return;
      }

      // Preserve type-appropriate columns, only cast text-based columns to TEXT
      // - JSON/STRUCT: preserve as-is for object structure (fixes #542)
      // - Numeric types: preserve as-is so numbers export as numbers (fixes #694)
      // - Boolean: preserve as-is
      // - Text-based: cast to TEXT to prevent DuckDB hugeint conversion for UUIDs
      const selectList = columnInfo
        .map(({ column_name, data_type }) => {
          const upperType = data_type.toUpperCase();
          // Preserve JSON/STRUCT as-is for object structure
          if (upperType === 'JSON' || upperType.startsWith('STRUCT')) {
            return `"${column_name}"`;
          }
          // Preserve numeric types as-is so they export as numbers, not strings
          if (
            [
              'DOUBLE',
              'REAL',
              'FLOAT',
              'INTEGER',
              'BIGINT',
              'SMALLINT',
              'TINYINT',
              'DECIMAL',
              'NUMERIC',
              'HUGEINT',
              'UBIGINT',
              'UINTEGER',
              'USMALLINT',
              'UTINYINT',
            ].some((t) => upperType.includes(t))
          ) {
            return `"${column_name}"`;
          }
          // Preserve boolean types as-is
          if (upperType === 'BOOLEAN' || upperType === 'BOOL') {
            return `"${column_name}"`;
          }
          // Cast text-based columns to TEXT to prevent hugeint conversion for UUIDs
          return `CAST("${column_name}" AS TEXT) AS "${column_name}"`;
        })
        .join(', ');
      const sql = `COPY (SELECT ${selectList} FROM "${table}") TO '${filePath}' (FORMAT JSON, ARRAY true)`;

      await connection.run(sql);
    };

    /**
     * Manual export method for 'manual' write strategy
     *
     * Allows explicit control over when tables are written back to JSON files.
     *
     * @param table - Table name to export
     * @returns Promise that resolves when export completes
     */
    const exportTable = async (table: string): Promise<void> => {
      if (writeStrategy === 'none') {
        throw new DatabaseError(
          'Cannot export table: write strategy is set to none (read-only mode)',
          { table, writeStrategy },
        );
      }
      await exportTableToJSON(connection, table, url);
    };

    /**
     * Creates a table by inferring schema from a JSON file
     *
     * This utility is for users who want automatic schema inference from JSON.
     * Note: Inferred schemas do NOT include UNIQUE constraints, so UPSERT
     * operations will fail. Use syncSchema() with explicit DDL for UPSERT support.
     *
     * @param tableName - Name of the table to create
     * @param jsonPath - Optional path to JSON file (defaults to {dataDir}/{tableName}.json)
     * @returns Promise that resolves when table is created
     * @throws Error if JSON file doesn't exist or table creation fails
     */
    const inferSchemaFromJSON = async (
      tableName: string,
      jsonPath?: string,
    ): Promise<void> => {
      validateTableName(tableName);

      const filePath = jsonPath || join(url, `${tableName}.json`);

      try {
        // Check if file exists
        const { access } = await import('node:fs/promises');
        const { constants } = await import('node:fs');
        await access(filePath, constants.F_OK);

        // Use DuckDB's read_json_auto to infer types and create table
        console.log(
          `[json-adapter] Inferring schema for ${tableName} from JSON file`,
        );
        await connection.run(
          `CREATE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${escapeStringLiteral(filePath)}')`,
        );

        // Remove from pending files if it was deferred
        pendingJSONFiles.delete(tableName);

        console.log(
          `[json-adapter] Created ${tableName} with inferred schema (no UNIQUE constraints)`,
        );
      } catch (error) {
        throw new DatabaseError(
          `Failed to infer schema from JSON for table ${tableName}`,
          {
            tableName,
            jsonPath: filePath,
            originalError:
              error instanceof Error ? error.message : String(error),
          },
        );
      }
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

        // Detect CREATE TABLE statements
        const createTableMatch = sql.match(
          /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i,
        );
        if (createTableMatch) {
          const tableName = createTableMatch[1];

          // Check if there's pending JSON data for this table (deferred loading)
          const pendingFile = pendingJSONFiles.get(tableName);
          if (pendingFile) {
            // Table was just created by DDL - now load the JSON data
            await loadJSONData(connection, tableName, pendingFile);
            pendingJSONFiles.delete(tableName);
          } else if (writeStrategy !== 'none') {
            // No pending data - export empty table (preserves SMRT system tables)
            try {
              const { access } = await import('node:fs/promises');
              const jsonFilePath = join(url, `${tableName}.json`);
              try {
                await access(jsonFilePath);
                // File exists, don't overwrite
              } catch {
                // File doesn't exist, export empty table
                await exportTableToJSON(connection, tableName, url);
              }
            } catch (error) {
              console.warn(
                `[json-adapter] Could not export newly created table ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        }
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
     * Filters out CREATE TRIGGER statements since triggers are not supported
     * in the JSON adapter (timestamps managed at application level).
     *
     * @param schema - SQL schema definition with CREATE TABLE statements
     * @returns Promise that resolves when schema is synchronized
     */
    const syncSchema = async (schema: string): Promise<void> => {
      const statements = schema
        .trim()
        .split(';')
        .filter((stmt) => stmt.trim() !== '');

      const createTableStatements: string[] = [];
      const indexStatements: string[] = [];
      const otherStatements: string[] = [];

      // Separate CREATE TABLE, CREATE INDEX, and other statements
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;

        const upperTrimmed = trimmed.toUpperCase();

        // Skip trigger creation - not supported in JSON adapter
        if (upperTrimmed.startsWith('CREATE TRIGGER')) {
          console.warn(
            '[json-adapter] Skipping trigger creation - timestamps managed at application level',
          );
          continue;
        }

        if (
          upperTrimmed.startsWith('CREATE INDEX') ||
          upperTrimmed.startsWith('CREATE UNIQUE INDEX')
        ) {
          indexStatements.push(trimmed);
        } else if (upperTrimmed.startsWith('CREATE TABLE')) {
          createTableStatements.push(trimmed);
        } else {
          otherStatements.push(trimmed);
        }
      }

      // Process each CREATE TABLE statement
      for (const ddl of createTableStatements) {
        // Transform UNIQUE indexes to inline constraints for DuckDB compatibility
        const { ddl: transformedDDL, indexes: remainingIndexes } =
          convertUniqueIndexesToInlineConstraints(ddl, indexStatements);

        // Extract table name from DDL before executing
        const createTableMatch = transformedDDL.match(
          /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i,
        );
        const tableName = createTableMatch ? createTableMatch[1] : null;

        // If table was created with inferred schema, drop it first
        // (proper schema with UNIQUE constraints takes precedence)
        if (tableName && inferredSchemaTables.has(tableName)) {
          try {
            await connection.run(`DROP TABLE IF EXISTS "${tableName}"`);
            inferredSchemaTables.delete(tableName);
            console.log(
              `[json-adapter] Dropped inferred-schema table ${tableName} for schema upgrade`,
            );
          } catch (error) {
            console.warn(
              `[json-adapter] Could not drop inferred-schema table ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Execute transformed DDL
        try {
          await connection.run(transformedDDL);

          if (tableName) {
            // Check if there's pending JSON data for this table (deferred loading)
            const pendingFile = pendingJSONFiles.get(tableName);
            if (pendingFile) {
              // Table was just created by DDL - now load the JSON data.
              // loadJSONData logs an unloadable file rather than throwing, so a
              // single bad table does not abort the rest of this schema sync
              await loadJSONData(connection, tableName, pendingFile);
              pendingJSONFiles.delete(tableName);
            } else if (writeStrategy !== 'none') {
              // No pending data - export empty table (preserves SMRT system tables)
              try {
                // Only export if JSON file doesn't already exist
                // This prevents overwriting existing data when tables are manually created
                const { access } = await import('node:fs/promises');
                const jsonFilePath = join(url, `${tableName}.json`);
                try {
                  await access(jsonFilePath);
                  // File exists, don't overwrite
                } catch {
                  // File doesn't exist, export empty table
                  await exportTableToJSON(connection, tableName, url);
                }
              } catch (error) {
                console.warn(
                  `[json-adapter] Could not export newly created table ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }
          }
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

      // Execute other statements
      for (const stmt of otherStatements) {
        try {
          await connection.run(stmt);
        } catch (e) {
          console.error('Schema sync error:', e);
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
      // its catch ran ROLLBACK, and that rollback ended the *first* transaction
      // — half of its writes durable, half lost, and its promise rejected, so
      // the caller was told nothing had happened.
      connectionLock.run(async () => {
        try {
          await connection.run('BEGIN TRANSACTION');

          const result = await callback(createTransactionScope());
          await connection.run('COMMIT');
          return result;
        } catch (error) {
          // A failing ROLLBACK must not replace the caller's error: DuckDB reports
          // "cannot rollback - no transaction is active" whenever the transaction
          // is already gone, which says nothing about what actually failed.
          try {
            await connection.run('ROLLBACK');
          } catch {
            // Nothing left to roll back.
          }
          throw error;
        }
      });

    /**
     * Builds the transaction-scoped interface handed to a transaction callback.
     *
     * The only difference from the top-level interface is `transaction`, which
     * refuses to nest. DuckDB has no SAVEPOINT, so there is no way to re-enter
     * the transaction already in progress; re-exposing the top-level
     * `transaction` (the previous behaviour) sent the nested call into a second
     * BEGIN on the same connection, which throws and then rolls back the
     * *enclosing* transaction, silently discarding its work.
     */
    const createTransactionScope = (): DatabaseInterface => {
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
        transaction: async () => {
          throw new NestedTransactionError(
            'Nested transactions are not supported by this adapter because its engine has no SAVEPOINT. Pass the existing transaction to the callee instead of opening a new one.',
            { adapter: 'json' },
          );
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
      // The handle owns the connection until the caller ends it, so the lock is
      // held across the gap rather than around a single call. A handle that is
      // never committed or rolled back therefore blocks every later transaction
      // until the queue timeout reports it.
      const releaseConnection = await connectionLock.acquire();
      try {
        await connection.run('BEGIN TRANSACTION');
      } catch (error) {
        // No transaction was opened, so there is no handle to end it and nothing
        // left to release the connection.
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
          await connection.run(command);
        } catch (error) {
          // COMMIT can fail and leave the transaction *open* — SQLite documents
          // exactly that for SQLITE_BUSY. Releasing the connection then would hand
          // the next queued caller a connection still inside a transaction: its
          // BEGIN would throw, and its catch would ROLLBACK, discarding this
          // transaction's work. So normalize before releasing, the way the pooled
          // adapter's discardTxClient does.
          try {
            await connection.run('ROLLBACK');
          } catch {
            // Already gone; nothing left to normalize.
          }
          throw error;
        } finally {
          active = false;
          releaseConnection();
        }
      };

      const commit = (): Promise<void> => end('COMMIT');

      const rollback = (): Promise<void> => end('ROLLBACK');

      const isActive = (): boolean => active;

      // Create a transaction-scoped database interface with commit/rollback.
      // The handle is inside a transaction for the same reason a callback
      // scope is, so it gets the same non-nesting `transaction`.
      const txHandle: TransactionHandle = {
        ...createTransactionScope(),
        commit,
        rollback,
        isActive,
      };

      return txHandle;
    };

    return {
      url,
      requiresSchemaCheck: true,
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
      // JSON-specific methods
      exportTable,
      inferSchemaFromJSON,
    } as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
      inferSchemaFromJSON: (
        tableName: string,
        jsonPath?: string,
      ) => Promise<void>;
    };
  })();

  // Store the pending connection promise for concurrent requests
  pendingConnections.set(cacheKey, connectionPromise);

  try {
    // Wait for the connection to be established
    const db = await connectionPromise;

    // Cache the connection for reuse
    memoryConnectionCache.set(cacheKey, db);

    return db;
  } finally {
    // Clean up pending connection promise
    pendingConnections.delete(cacheKey);
  }
}
