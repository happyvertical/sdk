/**
 * Shared SQL utilities that work in both browser and Node.js environments
 */

import type { WhereClause } from './types.js';

/**
 * Formats a database error to include all relevant details
 *
 * Database drivers often include additional properties beyond just `message`:
 * - PostgreSQL: code, detail, hint, severity
 * - DuckDB: may include additional context
 * - SQLite/LibSQL: may include errno, code
 *
 * This function extracts all available error properties to provide
 * better debugging information.
 *
 * @param error - The caught error object
 * @returns Formatted error string with all available error details
 */
export function formatDbError(error: unknown): string {
  const dbError = error as {
    message?: string;
    code?: string;
    detail?: string;
    hint?: string;
    severity?: string;
    errno?: number;
    cause?: unknown;
  };

  const parts: string[] = [];

  if (dbError.message) parts.push(dbError.message);
  if (dbError.code) parts.push(`code=${dbError.code}`);
  if (dbError.detail) parts.push(`detail=${dbError.detail}`);
  if (dbError.hint) parts.push(`hint=${dbError.hint}`);
  if (dbError.severity) parts.push(`severity=${dbError.severity}`);
  if (dbError.errno !== undefined) parts.push(`errno=${dbError.errno}`);

  return parts.length > 0 ? parts.join(', ') : String(error);
}

/**
 * Map of valid SQL operators for use in WHERE clauses
 */
const VALID_OPERATORS = {
  '=': '=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  '!=': '!=',
  like: 'LIKE',
  in: 'IN',
} as const;

/**
 * SQL adapter type for adapter-specific query generation
 */
export type SqlAdapterType = 'sqlite' | 'postgres' | 'duckdb' | 'json';

/**
 * Builds a single condition for a WHERE clause
 * @internal
 */
const buildCondition = (
  fullKey: string,
  value: any,
  currIndex: { value: number },
  adapterType?: SqlAdapterType,
): { sql: string; values: any[] } => {
  const [field, operator = '='] = fullKey.split(' ');
  const sqlOperator =
    VALID_OPERATORS[operator as keyof typeof VALID_OPERATORS] || '=';
  const values: any[] = [];

  let sql: string;

  if (value === null) {
    sql = `${field} IS ${sqlOperator === '=' ? 'NULL' : 'NOT NULL'}`;
  } else if (sqlOperator === 'IN' && Array.isArray(value)) {
    const placeholders = value.map(() => `$${currIndex.value++}`).join(', ');
    sql = `${field} IN (${placeholders})`;
    values.push(...value);
  } else if (value instanceof Date) {
    // DuckDB/JSON need CAST to TIMESTAMP to prevent ANY type inference (issue #540)
    // SQLite/PostgreSQL handle ISO strings natively without CAST
    const needsCast = adapterType === 'duckdb' || adapterType === 'json';
    if (needsCast) {
      sql = `${field} ${sqlOperator} CAST($${currIndex.value++} AS TIMESTAMP)`;
    } else {
      sql = `${field} ${sqlOperator} $${currIndex.value++}`;
    }
    values.push(value.toISOString());
  } else {
    sql = `${field} ${sqlOperator} $${currIndex.value++}`;
    values.push(value);
  }

  return { sql, values };
};

/**
 * Builds a SQL WHERE clause with parameterized values and flexible operators
 *
 * @param where - Conditions as object (AND-only) or 2D array (OR/AND compound)
 * @param startIndex - Starting index for parameter numbering (default: 1)
 * @returns Object containing the SQL clause and array of values
 *
 * @example Basic Usage (Object format - AND-only):
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
 * @example 2D Array Format (OR/AND compound logic):
 * ```typescript
 * // WHERE (status = 'active' AND price > 100) OR (status = 'pending' AND priority = 'high')
 * buildWhere([
 *   [{ status: 'active' }, { 'price >': 100 }],
 *   [{ status: 'pending' }, { priority: 'high' }]
 * ]);
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
 * - Object format: Multiple conditions combined with AND
 * - 2D array format: Inner arrays ANDed, outer array ORed
 */
export const buildWhere = (
  where: WhereClause,
  startIndex = 1,
  adapterType?: SqlAdapterType,
) => {
  let sql = '';
  const values: any[] = [];
  const currIndex = { value: startIndex };

  // Handle 2D array format for OR/AND compound logic
  if (Array.isArray(where)) {
    if (where.length === 0) {
      return { sql: '', values: [] };
    }

    const orGroups: string[] = [];

    for (const andGroup of where) {
      if (!Array.isArray(andGroup) || andGroup.length === 0) {
        continue;
      }

      const andConditions: string[] = [];

      for (const conditionObj of andGroup) {
        for (const [fullKey, value] of Object.entries(conditionObj)) {
          const result = buildCondition(fullKey, value, currIndex, adapterType);
          andConditions.push(result.sql);
          values.push(...result.values);
        }
      }

      if (andConditions.length > 0) {
        // Wrap AND group in parentheses
        orGroups.push(`(${andConditions.join(' AND ')})`);
      }
    }

    if (orGroups.length > 0) {
      sql = `WHERE ${orGroups.join(' OR ')}`;
    }

    return { sql, values };
  }

  // Handle object format (original behavior - AND-only)
  if (where && Object.keys(where).length > 0) {
    sql = 'WHERE ';
    for (const [fullKey, value] of Object.entries(where)) {
      const result = buildCondition(fullKey, value, currIndex, adapterType);

      if (sql !== 'WHERE ') {
        sql += ' AND ';
      }

      sql += result.sql;
      values.push(...result.values);
    }
  }

  return { sql, values };
};
