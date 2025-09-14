/**
 * Browser entry point for @have/sql
 * Exports types and universal utilities - database operations require Node.js
 */

export * from './shared/types.js';
export { buildWhere } from './shared/utils.js';

/**
 * Browser-safe getDatabase function that throws an informative error
 */
export function getDatabase(): never {
  throw new Error(
    'Database operations are not available in browser environments. Use @have/sql/node in Node.js applications.'
  );
}

export const syncSchema = () => {
  throw new Error('Database operations require Node.js environment');
};

export const tableExists = () => {
  throw new Error('Database operations require Node.js environment');
};

export function escapeSqlValue(): never {
  throw new Error('SQL value escaping requires Node.js environment');
}

export function validateColumnName(): never {
  throw new Error('Column validation requires Node.js environment');
}