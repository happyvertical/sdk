/**
 * DuckDB-specific schema transformation utilities
 *
 * DuckDB has a known limitation (issue #12684) where ON CONFLICT clauses
 * fail with UNIQUE INDEX but work with inline UNIQUE constraints.
 *
 * This module provides utilities to transform SMRT-generated schemas
 * (which use separate CREATE UNIQUE INDEX statements) into DuckDB-compatible
 * schemas (which use inline UNIQUE constraints).
 */

/**
 * Index definition extracted from CREATE INDEX statement
 */
interface ParsedIndex {
  name: string;
  columns: string[];
  unique: boolean;
  sql: string;
}

/**
 * Parses a CREATE INDEX statement to extract index details
 *
 * @param indexSQL - CREATE INDEX statement
 * @returns Parsed index definition or null if parsing fails
 *
 * @example
 * ```typescript
 * const index = parseIndexStatement(
 *   'CREATE UNIQUE INDEX ds_slug_context_idx ON ds (slug, context)'
 * );
 * // Returns: {
 * //   name: 'ds_slug_context_idx',
 * //   columns: ['slug', 'context'],
 * //   unique: true,
 * //   sql: '...'
 * // }
 * ```
 */
export function parseIndexStatement(indexSQL: string): ParsedIndex | null {
  const trimmed = indexSQL.trim();

  // Match: CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (columns)
  const match = trimmed.match(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+\w+\s*\(([^)]+)\)/i,
  );

  if (!match) {
    return null;
  }

  const [, uniqueKeyword, name, columnsStr] = match;

  return {
    name,
    columns: columnsStr.split(',').map((col) => col.trim()),
    unique: Boolean(uniqueKeyword),
    sql: trimmed,
  };
}

/**
 * Converts UNIQUE INDEX statements to inline UNIQUE constraints for DuckDB compatibility
 *
 * DuckDB's ON CONFLICT clause requires inline UNIQUE constraints, not separate indexes.
 * This function transforms SMRT-generated schemas to work with DuckDB's limitations.
 *
 * @param ddl - CREATE TABLE DDL statement
 * @param indexes - Array of CREATE INDEX statements (optional)
 * @returns Transformed DDL with inline UNIQUE constraints and filtered index list
 *
 * @example
 * ```typescript
 * const ddl = `
 *   CREATE TABLE ds (
 *     id TEXT PRIMARY KEY,
 *     slug TEXT NOT NULL,
 *     context TEXT NOT NULL
 *   )
 * `;
 * const indexes = [
 *   'CREATE UNIQUE INDEX ds_slug_context_idx ON ds (slug, context)'
 * ];
 *
 * const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);
 * // result.ddl:
 * //   CREATE TABLE ds (
 * //     id TEXT PRIMARY KEY,
 * //     slug TEXT NOT NULL,
 * //     context TEXT NOT NULL,
 * //     UNIQUE(slug, context)
 * //   )
 * // result.indexes: []  (UNIQUE index removed, non-UNIQUE indexes preserved)
 * ```
 */
export function convertUniqueIndexesToInlineConstraints(
  ddl: string,
  indexes?: string[],
): {
  ddl: string;
  indexes: string[];
} {
  if (!indexes || indexes.length === 0) {
    return { ddl, indexes: [] };
  }

  // Parse all indexes
  const parsedIndexes = indexes
    .map(parseIndexStatement)
    .filter((idx): idx is ParsedIndex => idx !== null);

  // Separate UNIQUE indexes from regular indexes
  const uniqueIndexes = parsedIndexes.filter((idx) => idx.unique);
  const regularIndexes = parsedIndexes.filter((idx) => !idx.unique);

  // If no UNIQUE indexes, return unchanged
  if (uniqueIndexes.length === 0) {
    return { ddl, indexes };
  }

  // Find the closing parenthesis of the CREATE TABLE statement
  const lines = ddl.split('\n');
  let closingParenIndex = -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed === ')' || trimmed.startsWith(');')) {
      closingParenIndex = i;
      break;
    }
  }

  if (closingParenIndex === -1) {
    // Can't find closing paren - return unchanged
    console.warn(
      '[duckdb-schema-utils] Could not find closing parenthesis in CREATE TABLE statement',
    );
    return { ddl, indexes };
  }

  // Build inline UNIQUE constraints
  const uniqueConstraints = uniqueIndexes.map((idx) => {
    const columns = idx.columns.join(', ');
    return `  UNIQUE(${columns})`;
  });

  // Insert UNIQUE constraints before closing parenthesis
  const modifiedLines = [...lines];
  const closingLine = modifiedLines[closingParenIndex].trim();

  // Add comma to previous line if it doesn't have one
  if (closingParenIndex > 0) {
    const prevLine = modifiedLines[closingParenIndex - 1].trim();
    if (!prevLine.endsWith(',')) {
      modifiedLines[closingParenIndex - 1] = modifiedLines[
        closingParenIndex - 1
      ].replace(/\s*$/, ',');
    }
  }

  // Insert UNIQUE constraints
  const constraintLines = uniqueConstraints.map((constraint, idx) => {
    // Add comma after all but the last constraint
    return idx < uniqueConstraints.length - 1 ? `${constraint},` : constraint;
  });

  modifiedLines.splice(closingParenIndex, 0, ...constraintLines);

  const transformedDDL = modifiedLines.join('\n');

  // Return regular (non-UNIQUE) indexes only
  const remainingIndexes = regularIndexes.map((idx) => idx.sql);

  return {
    ddl: transformedDDL,
    indexes: remainingIndexes,
  };
}

/**
 * Checks if a schema definition contains UNIQUE indexes that need conversion
 *
 * @param indexes - Array of CREATE INDEX statements
 * @returns True if any UNIQUE indexes are present
 */
export function hasUniqueIndexes(indexes?: string[]): boolean {
  if (!indexes || indexes.length === 0) {
    return false;
  }

  return indexes.some((indexSQL) => {
    const parsed = parseIndexStatement(indexSQL);
    return parsed?.unique === true;
  });
}
