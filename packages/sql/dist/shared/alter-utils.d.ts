import { ColumnDefinitionWithName, IndexDefinition } from './types.js';
/**
 * Database dialect type for SQL generation
 */
export type DatabaseDialect = 'sqlite' | 'postgres' | 'duckdb';
/**
 * Generates an ALTER TABLE ADD COLUMN statement
 *
 * @param table - Table name
 * @param column - Column definition with name
 * @param dialect - Database dialect
 * @returns SQL statement string
 *
 * @example
 * ```typescript
 * const sql = generateAddColumnStatement('users', {
 *   name: 'email',
 *   type: 'TEXT',
 *   unique: true,
 *   notNull: false
 * }, 'sqlite');
 * // Returns: "ALTER TABLE users ADD COLUMN email TEXT UNIQUE"
 * ```
 */
export declare function generateAddColumnStatement(table: string, column: ColumnDefinitionWithName, _dialect: DatabaseDialect): string;
/**
 * Generates a DEFAULT clause for a column definition
 *
 * Handles proper formatting and escaping of default values based on column type.
 *
 * @param columnType - SQL column type (TEXT, INTEGER, BOOLEAN, etc.)
 * @param defaultValue - Default value to format
 * @returns Formatted default value string
 *
 * @example
 * ```typescript
 * generateDefaultClause('TEXT', 'hello'); // Returns: "'hello'"
 * generateDefaultClause('INTEGER', 42);   // Returns: "42"
 * generateDefaultClause('BOOLEAN', true); // Returns: "true"
 * generateDefaultClause('TEXT', null);    // Returns: "NULL"
 * ```
 */
export declare function generateDefaultClause(columnType: string, defaultValue: any): string;
/**
 * Generates a CREATE INDEX statement
 *
 * @param table - Table name
 * @param index - Index definition
 * @returns SQL CREATE INDEX statement
 *
 * @example
 * ```typescript
 * const sql = generateCreateIndexStatement('users', {
 *   name: 'idx_users_email',
 *   columns: ['email'],
 *   unique: true
 * });
 * // Returns: "CREATE UNIQUE INDEX idx_users_email ON users (email)"
 * ```
 */
export declare function generateCreateIndexStatement(table: string, index: IndexDefinition): string;
/**
 * Validates a table name to prevent SQL injection
 *
 * @param tableName - Table name to validate
 * @throws Error if table name contains invalid characters
 */
export declare function validateTableName(tableName: string): void;
/**
 * Validates a column name to prevent SQL injection
 *
 * @param columnName - Column name to validate
 * @throws Error if column name contains invalid characters
 */
export declare function validateColumnName(columnName: string): void;
/**
 * Validates an index name to prevent SQL injection
 *
 * @param indexName - Index name to validate
 * @throws Error if index name contains invalid characters
 */
export declare function validateIndexName(indexName: string): void;
//# sourceMappingURL=alter-utils.d.ts.map