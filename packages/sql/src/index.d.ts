import type { DatabaseInterface } from "./types.js";
import type { PostgresOptions } from "./postgres.js";
import type { SqliteOptions } from "./sqlite.js";
/**
 * Union type of options for creating different database types
 */
type GetDatabaseOptions = (PostgresOptions & {
    type?: "postgres";
}) | (SqliteOptions & {
    type?: "sqlite";
});
/**
 * Creates a database connection based on the provided options
 *
 * @param options - Configuration options for the database connection
 * @returns Promise resolving to a DatabaseInterface implementation
 * @throws Error if the database type is invalid
 */
export declare function getDatabase(options?: GetDatabaseOptions): Promise<DatabaseInterface>;
/**
 * Synchronizes a SQL schema definition with a database
 * Creates tables if they don't exist and adds missing columns to existing tables
 *
 * @param options - Object containing database and schema
 * @param options.db - Database interface to use
 * @param options.schema - SQL schema definition
 * @throws Error if db or schema are missing or if table name is invalid
 */
export declare function syncSchema(options: {
    db: DatabaseInterface;
    schema: string;
}): Promise<void>;
/**
 * Checks if a table exists in the database
 *
 * @param db - Database interface to use
 * @param tableName - Name of the table to check
 * @returns Promise resolving to boolean indicating if the table exists
 */
export declare function tableExists(db: DatabaseInterface, tableName: string): Promise<boolean>;
/**
 * Escapes and formats a value for use in SQL queries
 *
 * @param value - Value to escape
 * @returns String representation of the value safe for SQL use
 */
export declare function escapeSqlValue(value: any): string;
/**
 * Validates a column name for use in SQL queries
 *
 * @param column - Column name to validate
 * @returns The validated column name
 * @throws Error if the column name contains invalid characters
 */
export declare function validateColumnName(column: string): string;
/**
 * Builds a SQL WHERE clause with parameterized values and flexible operators
 *
 * @param where - Record of conditions with optional operators in keys
 * @param startIndex - Starting index for parameter numbering (default: 1)
 * @returns Object containing the SQL clause and array of values
 *
 * @example Basic Usage:
 * ```typescript
 * buildWhere({
 *   'status': 'active',           // equals operator is default
 *   'price >': 100,              // greater than
 *   'stock <=': 5,               // less than or equal
 *   'category in': ['A', 'B'],   // IN clause for arrays
 *   'name like': '%shirt%'       // LIKE for pattern matching
 * });
 * ```
 *
 * @example NULL Handling:
 * ```typescript
 * buildWhere({
 *   'deleted_at': null,          // becomes "deleted_at IS NULL"
 *   'updated_at !=': null,       // becomes "updated_at IS NOT NULL"
 *   'status': 'active'           // regular comparison
 * });
 * ```
 *
 * @example Common Patterns:
 * ```typescript
 * // Price range
 * buildWhere({
 *   'price >=': 10,
 *   'price <': 100
 * });
 *
 * // Date filtering
 * buildWhere({
 *   'created_at >': startDate,
 *   'created_at <=': endDate,
 *   'deleted_at': null
 * });
 *
 * // Search with LIKE
 * buildWhere({
 *   'title like': '%search%',
 *   'description like': '%search%',
 *   'status': 'published'
 * });
 *
 * // Multiple values with IN
 * buildWhere({
 *   'role in': ['admin', 'editor'],
 *   'active': true,
 *   'last_login !=': null
 * });
 * ```
 *
 * The function handles:
 * - Standard comparisons (=, >, >=, <, <=, !=)
 * - NULL checks (IS NULL, IS NOT NULL)
 * - IN clauses for arrays
 * - LIKE for pattern matching
 * - Multiple conditions combined with AND
 */
export declare const buildWhere: (where: Record<string, any>, startIndex?: number) => {
    sql: string;
    values: any[];
};
export * from "./types.js";
declare const _default: {
    getDatabase: typeof getDatabase;
    syncSchema: typeof syncSchema;
    tableExists: typeof tableExists;
    buildWhere: (where: Record<string, any>, startIndex?: number) => {
        sql: string;
        values: any[];
    };
};
export default _default;
//# sourceMappingURL=index.d.ts.map