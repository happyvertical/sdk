import type { PostgresOptions } from './postgres';
import type { DatabaseInterface } from './shared/types';
import type { SqliteOptions } from './sqlite';
/**
 * Union type of options for creating different database types
 */
type GetDatabaseOptions = (PostgresOptions & {
    type?: 'postgres';
}) | (SqliteOptions & {
    type?: 'sqlite';
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
 * @throws Error if db or schema are missing or if the database doesn't support syncSchema
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
import { buildWhere } from './shared/utils';
export { buildWhere };
export * from './shared/types';
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
