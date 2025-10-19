/**
 * Shared utilities for ALTER TABLE operations
 *
 * Provides database-agnostic utilities for generating ALTER TABLE statements,
 * handling column definitions, and creating indexes.
 */

import type { ColumnDefinitionWithName, IndexDefinition } from './types.js';

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
export function generateAddColumnStatement(
  table: string,
  column: ColumnDefinitionWithName,
  _dialect: DatabaseDialect,
): string {
  const parts: string[] = [column.name, column.type];

  // Primary key
  if (column.primaryKey) {
    parts.push('PRIMARY KEY');
  }

  // NOT NULL constraint
  if (column.notNull) {
    parts.push('NOT NULL');
  }

  // UNIQUE constraint
  if (column.unique) {
    parts.push('UNIQUE');
  }

  // DEFAULT clause
  if (column.defaultValue !== undefined) {
    const defaultClause = generateDefaultClause(
      column.type,
      column.defaultValue,
    );
    parts.push(`DEFAULT ${defaultClause}`);
  }

  // CHECK constraint
  if (column.check) {
    parts.push(`CHECK (${column.check})`);
  }

  // Foreign key (inline for some databases)
  if (column.foreignKey) {
    const fk = column.foreignKey;
    const fkParts = [`REFERENCES ${fk.table}(${fk.column})`];

    if (fk.onDelete) {
      fkParts.push(`ON DELETE ${fk.onDelete}`);
    }

    if (fk.onUpdate) {
      fkParts.push(`ON UPDATE ${fk.onUpdate}`);
    }

    parts.push(fkParts.join(' '));
  }

  const columnDef = parts.join(' ');
  return `ALTER TABLE ${table} ADD COLUMN ${columnDef}`;
}

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
export function generateDefaultClause(
  columnType: string,
  defaultValue: any,
): string {
  if (defaultValue === null) {
    return 'NULL';
  }

  const typeUpper = columnType.toUpperCase();

  // String types - need quotes
  if (
    typeUpper.includes('TEXT') ||
    typeUpper.includes('CHAR') ||
    typeUpper.includes('VARCHAR') ||
    typeUpper.includes('STRING')
  ) {
    // Handle empty strings
    if (defaultValue === '') {
      return "''";
    }
    // Escape single quotes
    const escaped = String(defaultValue).replace(/'/g, "''");
    return `'${escaped}'`;
  }

  // Boolean types
  if (typeUpper.includes('BOOL')) {
    return defaultValue ? 'true' : 'false';
  }

  // Numeric types - no quotes
  if (
    typeUpper.includes('INT') ||
    typeUpper.includes('REAL') ||
    typeUpper.includes('FLOAT') ||
    typeUpper.includes('DOUBLE') ||
    typeUpper.includes('NUMERIC') ||
    typeUpper.includes('DECIMAL')
  ) {
    return String(defaultValue);
  }

  // JSON types
  if (typeUpper.includes('JSON')) {
    if (typeof defaultValue === 'string') {
      return `'${defaultValue.replace(/'/g, "''")}'`;
    }
    return `'${JSON.stringify(defaultValue).replace(/'/g, "''")}'`;
  }

  // Date/timestamp types
  if (
    typeUpper.includes('DATE') ||
    typeUpper.includes('TIME') ||
    typeUpper.includes('TIMESTAMP')
  ) {
    if (defaultValue instanceof Date) {
      return `'${defaultValue.toISOString()}'`;
    }
    return `'${String(defaultValue).replace(/'/g, "''")}'`;
  }

  // Default: treat as string
  if (typeof defaultValue === 'string') {
    return `'${defaultValue.replace(/'/g, "''")}'`;
  }

  return String(defaultValue);
}

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
export function generateCreateIndexStatement(
  table: string,
  index: IndexDefinition,
): string {
  const parts: string[] = ['CREATE'];

  // UNIQUE modifier
  if (index.unique) {
    parts.push('UNIQUE');
  }

  parts.push('INDEX');

  // Index name
  parts.push(index.name);

  // ON table
  parts.push(`ON ${table}`);

  // Column list
  const columns = index.columns.join(', ');
  parts.push(`(${columns})`);

  // WHERE clause (partial index)
  if (index.where) {
    parts.push(`WHERE ${index.where}`);
  }

  return parts.join(' ');
}

/**
 * Validates a table name to prevent SQL injection
 *
 * @param tableName - Table name to validate
 * @throws Error if table name contains invalid characters
 */
export function validateTableName(tableName: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(
      `Invalid table name: ${tableName}. Table names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
    );
  }
}

/**
 * Validates a column name to prevent SQL injection
 *
 * @param columnName - Column name to validate
 * @throws Error if column name contains invalid characters
 */
export function validateColumnName(columnName: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
    throw new Error(
      `Invalid column name: ${columnName}. Column names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
    );
  }
}

/**
 * Validates an index name to prevent SQL injection
 *
 * @param indexName - Index name to validate
 * @throws Error if index name contains invalid characters
 */
export function validateIndexName(indexName: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(indexName)) {
    throw new Error(
      `Invalid index name: ${indexName}. Index names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
    );
  }
}
