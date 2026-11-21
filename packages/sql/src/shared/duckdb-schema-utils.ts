import { DatabaseError } from '@happyvertical/utils';
import {
  assertIntrospectionTableName,
  quoteLiteralIdentifier,
} from './alter-utils.js';
import type {
  GetTableSchemaOptions,
  IndexDefinition,
  TableColumnInfo,
  TableSchemaInfo,
} from './types.js';
import { formatDbError } from './utils.js';

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
  // Support both quoted and unquoted identifiers: table, "table", columns, "columns"
  const match = trimmed.match(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(?:"?\w+"?)\s*\(([^)]+)\)/i,
  );

  if (!match) {
    return null;
  }

  const [, uniqueKeyword, name, columnsStr] = match;

  // Remove quotes from column names
  const columns = columnsStr
    .split(',')
    .map((col) => col.trim().replace(/^"|"$/g, ''));

  return {
    name,
    columns,
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

  // Build inline UNIQUE constraints with quoted column names
  const uniqueConstraints = uniqueIndexes.map((idx) => {
    const columns = idx.columns.map(quoteLiteralIdentifier).join(', ');
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

/**
 * Returns the names of the generated columns in a DuckDB `CREATE TABLE`
 * statement.
 *
 * DuckDB's catalogs (`information_schema.columns`, `duckdb_columns()`) do not
 * say whether a column is generated, and report its expression as the column
 * default. The statement text from `duckdb_tables().sql` does keep the
 * `GENERATED ALWAYS AS` clause, so the definitions are split at top-level
 * commas and each is checked for it. Quoted identifiers and string literals
 * are skipped so neither a column named `generated` nor a default of
 * `'generated always as'` is misread.
 */
export function parseGeneratedColumns(createSql: string): Set<string> {
  const generated = new Set<string>();
  const open = createSql.indexOf('(');
  const close = createSql.lastIndexOf(')');
  if (open === -1 || close <= open) return generated;
  const body = createSql.slice(open + 1, close);

  const definitions: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === quote) {
        if (body[i + 1] === quote) i++;
        else quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      definitions.push(body.slice(start, i));
      start = i + 1;
    }
  }
  definitions.push(body.slice(start));

  for (const definition of definitions) {
    const trimmed = definition.trim();
    const name = /^"((?:[^"]|"")*)"|^([A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
    if (!name) continue;
    const rest = trimmed
      .slice(name[0].length)
      .replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, "''");
    if (/\bGENERATED\s+ALWAYS\s+AS\b/i.test(rest)) {
      generated.add(
        name[1] !== undefined ? name[1].replace(/""/g, '"') : name[2],
      );
    }
  }
  return generated;
}

/**
 * The adapter primitives {@link describeDuckDBTable} reads the catalogs with.
 */
export interface DuckDBCatalogReader {
  tableExists: (table: string) => Promise<boolean>;
  many: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any>[]>;
}

/**
 * Describes a table on a DuckDB connection: the `getTableSchema()` of both the
 * native DuckDB adapter and the JSON adapter, which share the engine, so the
 * two report the same shape for the same DDL.
 *
 * @param reader - The adapter's `tableExists` and `many`
 * @param table - Table name
 * @param schemaOptions - Opt-in introspection flags
 * @returns The table schema, or null if the table doesn't exist
 * @throws DatabaseError if a catalog query fails
 */
export async function describeDuckDBTable(
  { tableExists, many }: DuckDBCatalogReader,
  table: string,
  schemaOptions?: GetTableSchemaOptions,
): Promise<TableSchemaInfo | null> {
  // The name is only ever a bound parameter or a quoted identifier below.
  assertIntrospectionTableName(table);
  const optedIn =
    !!schemaOptions?.includeGenerated || !!schemaOptions?.includeHidden;

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

    // The catalogs do not flag generated columns; read the CREATE statement,
    // but only for a caller that asked for the flags.
    let generatedColumns = new Set<string>();
    if (optedIn) {
      const createRows = await many`
        SELECT sql FROM duckdb_tables() WHERE table_name = ${table}
      `;
      generatedColumns = parseGeneratedColumns(
        (createRows[0]?.sql as string | undefined) ?? '',
      );
    }

    const columns: Record<string, TableColumnInfo> = {};
    for (const row of columnRows) {
      const colName = row.column_name as string;
      columns[colName] = {
        type: row.data_type as string,
        primaryKey: pkColumns.has(colName),
        notNull: row.is_nullable === 'NO',
        defaultValue: row.column_default,
        ...(optedIn
          ? { generated: generatedColumns.has(colName), hidden: false }
          : {}),
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

    const foreignKeys: TableSchemaInfo['foreignKeys'] = [];

    for (const fkRow of fkRows) {
      // Parse foreign key constraint text to extract referenced table and column
      const fkText = (fkRow.constraint_text as string) || '';
      const referencesMatch = fkText.match(/REFERENCES\s+(\w+)\s*\(([^)]+)\)/i);

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
}
