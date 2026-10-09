/**
 * Browser-safe entry for the driver-independent query helpers.
 *
 * Everything here is pure SQL-fragment construction or operates on an
 * already-open `DatabaseInterface`. Nothing on this import graph reaches `pg`,
 * the libsql or DuckDB adapters, or any `node:` built-in, so browser-bundled
 * packages can import it instead of the package root. The root entry
 * re-exports all of it.
 *
 * @example
 * ```typescript
 * import { buildWhere, validateColumnName } from '@happyvertical/sql/query';
 * ```
 *
 * @packageDocumentation
 */

import type { DatabaseInterface } from './shared/types.js';

/**
 * Checks if a table exists in the database
 *
 * @param db - Database interface to use
 * @param tableName - Name of the table to check
 * @returns Promise resolving to boolean indicating if the table exists
 */
export async function tableExists(db: DatabaseInterface, tableName: string) {
  return db.tableExists(tableName);
}

/**
 * Escapes and formats a value for use in SQL queries
 *
 * @param value - Value to escape
 * @returns String representation of the value safe for SQL use
 */
export function escapeSqlValue(value: any): string {
  if (value === null) {
    return 'NULL';
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  // Escape single quotes and wrap in quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Validates a column name for use in SQL queries
 *
 * @param column - Column name to validate
 * @returns The validated column name
 * @throws Error if the column name contains invalid characters
 */
export function validateColumnName(column: string): string {
  // Reject non-strings before the regex. `test` coerces via `toString`, so an
  // object whose `toString` differs between this read and a later interpolation
  // read would pass validation and then reach SQL as a different identifier.
  // Only allow alphanumeric characters, underscores, and dots (for table.column notation)
  if (typeof column !== 'string' || !/^[a-zA-Z0-9_.]+$/.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  return column;
}

/**
 * Synchronizes a SQL schema definition with a database
 * Creates tables if they don't exist and adds missing columns to existing tables
 *
 * @param options - Object containing database and schema
 * @param options.db - Database interface to use
 * @param options.schema - SQL schema definition
 * @throws Error if db or schema are missing or if the database doesn't support syncSchema
 */
export async function syncSchema(options: {
  db: DatabaseInterface;
  schema: string;
}) {
  const { db, schema } = options;
  if (!db || !schema) {
    throw new Error('db and schema are required');
  }

  // Delegate to the database adapter's syncSchema implementation
  if (db.syncSchema) {
    await db.syncSchema(schema);
  } else {
    throw new Error('Database adapter does not support schema synchronization');
  }
}

export {
  type AggregateBuildResult,
  type AggregateFunction,
  type AggregateSelectExpr,
  type AggregateSpec,
  type AggregateTimeBucketUnit,
  bucketExpr,
  buildAggregate,
} from './aggregate.js';
export type { SchemaInitializationResult } from './schema-manager.js';
export { DatabaseSchemaManager } from './schema-manager.js';
export { convertUniqueIndexesToInlineConstraints } from './shared/duckdb-schema-utils.js';
export * from './shared/types.js';
export type { RawSqlKey, SqlAdapterType } from './shared/utils.js';
export { buildWhere, formatDbError, raw } from './shared/utils.js';
