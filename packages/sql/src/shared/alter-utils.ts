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
  dialect: DatabaseDialect,
): string {
  const parts: string[] = [
    renderSchemaIdentifier(column.name, dialect, { quoteIdentifiers: true }),
    column.type,
  ];

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
    const fkParts = [
      `REFERENCES ${renderSchemaIdentifier(fk.table, dialect, { quoteIdentifiers: true })}(${renderIdentifierList(fk.column, dialect, { quoteIdentifiers: true })})`,
    ];

    if (fk.onDelete) {
      fkParts.push(`ON DELETE ${fk.onDelete}`);
    }

    if (fk.onUpdate) {
      fkParts.push(`ON UPDATE ${fk.onUpdate}`);
    }

    parts.push(fkParts.join(' '));
  }

  const columnDef = parts.join(' ');
  return `ALTER TABLE ${renderSchemaIdentifier(table, dialect, { quoteIdentifiers: true })} ADD COLUMN ${columnDef}`;
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
  dialect?: DatabaseDialect,
): string {
  const parts: string[] = ['CREATE'];

  // UNIQUE modifier
  if (index.unique) {
    parts.push('UNIQUE');
  }

  parts.push('INDEX');

  // Index name
  parts.push(
    renderSchemaIdentifier(index.name, dialect, { quoteIdentifiers: true }),
  );

  // ON table
  parts.push(
    `ON ${renderSchemaIdentifier(table, dialect, { quoteIdentifiers: true })}`,
  );

  // Column list
  const columns = index.columns
    .map((column) =>
      renderIndexTerm(column, dialect, { quoteIdentifiers: true }),
    )
    .join(', ');
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
 * The argument must be a primitive string. `RegExp.prototype.test` coerces its
 * argument with `toString`, so an object whose `toString` returns a valid name
 * on the call the validator makes and a different one on the call the caller's
 * `${table}` interpolation makes would pass here and then reach SQL. Rejecting
 * non-strings up front closes that gap: the value validated is the value
 * interpolated, because a primitive string cannot observe how many times it is
 * read.
 *
 * @param tableName - Table name to validate
 * @throws Error if the value is not a string or contains invalid characters
 */
export function validateTableName(tableName: string): void {
  if (
    typeof tableName !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)
  ) {
    throw new Error(
      `Invalid table name: ${tableName}. Table names must be a string that starts with a letter or underscore and contains only alphanumeric characters and underscores.`,
    );
  }
}

/**
 * Validates a column name to prevent SQL injection
 *
 * Rejects non-strings for the same reason as {@link validateTableName}: a value
 * whose `toString` differs between the validation read and the interpolation
 * read would otherwise slip a different identifier into SQL than the one
 * checked here.
 *
 * @param columnName - Column name to validate
 * @throws Error if the value is not a string or contains invalid characters
 */
export function validateColumnName(columnName: string): void {
  if (typeof columnName !== 'string' || !isColumnIdentifier(columnName)) {
    throw new Error(
      `Invalid column name: ${columnName}. Column names must be a plain identifier starting with a letter or underscore, or an explicitly double-quoted identifier.`,
    );
  }
}

/**
 * Validates every identifier in a column list to prevent SQL injection
 *
 * Column names reaching the CRUD methods come from `Object.keys(data)` and the
 * caller's `conflictColumns`, both of which are interpolated into SQL. The
 * accepted shape has no character that can end an identifier. Adapters may
 * render a validated name bare, or quote it under an adapter-specific contract.
 * PostgreSQL upsert uses {@link quotePostgresColumnName}, which canonicalizes
 * the name before quoting so its established unquoted case-folding semantics
 * do not change.
 *
 * @param columnNames - Column names to validate
 * @throws Error if any column name contains invalid characters
 */
export function validateColumnNames(columnNames: string[]): void {
  for (const columnName of columnNames) {
    validateColumnName(columnName);
  }
}

/**
 * Quotes a validated column name using PostgreSQL's historic case semantics.
 *
 * PostgreSQL folds every unquoted identifier to lowercase. The CRUD API has
 * always accepted mixed-case inputs while rendering them unquoted, so quoting
 * the caller's spelling directly would silently change which physical column
 * is addressed. Validate the existing plain-identifier contract first, then
 * lowercase before quoting: `mixedCase` still addresses `mixedcase`, while a
 * reserved word such as `end` is no longer parsed as SQL syntax.
 *
 * Explicit double-delimited input preserves its physical spelling.
 *
 * @param columnName - Plain or explicitly delimited column name for PostgreSQL
 * @returns A double-quoted identifier, folding only undelimited input
 * @throws Error if the column name is outside the CRUD identifier contract
 */
export function quotePostgresColumnName(columnName: string): string {
  validateColumnName(columnName);
  return renderIdentifier(columnName, 'postgres', { quoteIdentifiers: true });
}

/**
 * Escapes an identifier for interpolation inside double quotes
 *
 * For the positions that already quote the identifier — the DuckDB and JSON
 * upsert statements, which quote to match their schema generator — quoting is
 * what makes the identifier safe, so the only thing that has to be handled is
 * a quote character inside the name. Doubling it is the SQL escape.
 *
 * This is deliberately more permissive than {@link validateColumnName}: those
 * adapters accept column names that are not plain identifiers (`Full Name`,
 * `user-id`, `2024_total`), which matters most for the JSON adapter, whose
 * columns come straight from the keys of whatever JSON it was pointed at.
 * Rejecting them would break working code to fix an injection that quoting
 * already prevents.
 *
 * @param identifier - Identifier to place inside SQL identifier quotes
 * @param quote - Identifier delimiter (double quote, or SQLite backtick)
 * @returns The identifier with embedded delimiter characters doubled
 * @throws Error if the identifier is empty or contains a NUL byte
 */
export function escapeQuotedIdentifier(
  identifier: string,
  quote: '"' | '`' = '"',
): string {
  // Coerce to a primitive string first. The escape's safety rests on
  // `replaceAll`/`includes` being the real `String` methods, but a crafted
  // object could supply its own that return unescaped SQL while its `toString`
  // reads as a benign name elsewhere. Coercing once runs its `toString` here
  // and pins an immutable primitive for the length check and the escape, so the
  // value escaped is the value returned.
  const value = String(identifier);
  if (value.length === 0 || value.includes('\0')) {
    throw new Error(
      `Invalid column name: ${JSON.stringify(value)}. Column names must be non-empty and must not contain a NUL byte.`,
    );
  }
  return value.replaceAll(quote, quote + quote);
}

/**
 * Escapes a value for interpolation inside a single-quoted SQL string literal
 *
 * The DuckDB-backed adapters read JSON through `read_json_auto('<path>')`, and
 * a file path is not something an identifier validator can check — paths
 * legitimately contain spaces, dots and, on Linux and macOS, quotes. Doubling
 * the quote is the SQL escape, and it is what keeps a file named `x'.json`
 * from ending the literal and starting a statement.
 *
 * @param value - Value to place inside single quotes
 * @returns The value with embedded single quotes doubled
 * @throws Error if the value contains a NUL byte
 */
export function escapeStringLiteral(value: string): string {
  // Coerce to a primitive string first, for the same reason as
  // {@link escapeQuotedIdentifier}: the escape must run on an immutable
  // primitive, not on an object that could supply its own `replaceAll`.
  const text = String(value);
  if (text.includes('\0')) {
    throw new Error(
      `Invalid SQL string literal: ${JSON.stringify(text)}. Values must not contain a NUL byte.`,
    );
  }
  return text.replaceAll("'", "''");
}

/**
 * Validates an index name to prevent SQL injection
 *
 * @param indexName - Index name to validate
 * @throws Error if index name contains invalid characters
 */
export function validateIndexName(indexName: string): void {
  if (
    typeof indexName !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(indexName)
  ) {
    throw new Error(
      `Invalid index name: ${indexName}. Index names must be a string that starts with a letter or underscore and contains only alphanumeric characters and underscores.`,
    );
  }
}

/** Numeric SQL tokens accepted by the original WHERE/aggregate character grammar.
 * This is a bounded compatibility exception, never a general expression channel.
 */
export function isLegacyNumericSqlToken(value: string): boolean {
  return (
    typeof value === 'string' &&
    /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][0-9][0-9_]*)?)$/.test(
      value,
    )
  );
}

/** Additive policy for standalone builders; adapters always request quote-all. */
export interface IdentifierOptions {
  quoteIdentifiers?: boolean;
}

/** Parse identifiers, never SQL. Dots outside double quotes delimit qualifiers. */
export function identifierParts(
  identifier: string,
): Array<{ name: string; exact: boolean }> {
  if (
    typeof identifier !== 'string' ||
    !identifier ||
    identifier.includes('\0')
  ) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  const parts: Array<{ name: string; exact: boolean }> = [];
  let position = 0;
  while (position < identifier.length) {
    const rest = identifier.slice(position);
    const match = rest.startsWith('"')
      ? /^"((?:[^"]|"")+)"(?=\.|$)/.exec(rest)
      : /^([A-Za-z0-9_]+)(?=\.|$)/.exec(rest);
    if (!match) throw new Error(`Invalid SQL identifier: ${identifier}`);
    const exact = rest.startsWith('"');
    parts.push({
      name: exact ? match[1].replaceAll('""', '"') : match[1],
      exact,
    });
    position += match[0].length;
    if (position < identifier.length) {
      position += 1;
      if (position === identifier.length)
        throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
  }
  return parts;
}

function isColumnIdentifier(identifier: string): boolean {
  try {
    const parts = identifierParts(identifier);
    return (
      parts.length === 1 &&
      (parts[0].exact || /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier))
    );
  } catch {
    return false;
  }
}

/** Quote a physical name without interpreting delimiters or dots. */
export function quoteLiteralIdentifier(identifier: string): string {
  return quotePhysicalIdentifier(identifier, '"');
}

/** SQLite identifiers must not fall back to double-quoted string literals. */
export function quoteSqliteLiteralIdentifier(identifier: string): string {
  return quotePhysicalIdentifier(identifier, '`');
}

function quotePhysicalIdentifier(identifier: string, quote: '"' | '`'): string {
  if (typeof identifier !== 'string')
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  return `${quote}${escapeQuotedIdentifier(identifier, quote)}${quote}`;
}

/** SQLite CRUD column (one validated identifier). */
export function quoteSqliteColumnName(column: string): string {
  validateColumnName(column);
  return renderIdentifier(column, 'sqlite', { quoteIdentifiers: true });
}

/** DuckDB/JSON CRUD column, or an already-resolved literal physical name. */
export function quoteDuckDBColumnName(column: string, literal = false): string {
  if (literal) return quoteLiteralIdentifier(column);
  validateColumnName(column);
  return renderIdentifier(column, 'duckdb', { quoteIdentifiers: true });
}

/** Shared rendering for qualified WHERE/aggregate identifiers. */
export function renderIdentifier(
  identifier: string,
  dialect?: 'sqlite' | 'postgres' | 'duckdb' | 'json',
  options: IdentifierOptions = {},
): string {
  return identifierParts(identifier)
    .map(({ name, exact }) => {
      if (
        !options.quoteIdentifiers &&
        !exact &&
        !IDENTIFIER_KEYWORDS.has(name.toLowerCase())
      )
        return name;
      const physical =
        dialect === 'postgres' && !exact ? name.toLowerCase() : name;
      return dialect === 'sqlite'
        ? quoteSqliteLiteralIdentifier(physical)
        : quoteLiteralIdentifier(physical);
    })
    .join('.');
}

/** Previously raw index terms may be expressions or ordered SQL, not just names. */
export function renderIndexTerm(
  term: string,
  dialect?: DatabaseDialect,
  options: IdentifierOptions = {},
): string {
  // Classify syntax before rendering: do not hide errors thrown by the renderer.
  const component = '(?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+")';
  const plain = new RegExp(`^${component}(?:\\.${component})*$`);
  return typeof term === 'string' && plain.test(term)
    ? renderIdentifier(term, dialect, options)
    : term;
}

/** DDL names historically accepted SQLite's alternate identifier delimiters.
 * Normalize names only here; strict CRUD/WHERE keep their existing input syntax.
 */
export function renderSchemaIdentifier(
  identifier: string,
  dialect?: DatabaseDialect,
  options: IdentifierOptions = {},
): string {
  if (typeof identifier !== 'string')
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  const parts: string[] = [];
  let position = 0;
  while (position < identifier.length) {
    const match =
      /^(?:([A-Za-z0-9_]+)|"((?:[^"]|"")+)"|`((?:[^`]|``)+)`|\[([^\]]+)\]|'((?:[^']|'')+)')(?=\.|$)/.exec(
        identifier.slice(position),
      );
    if (!match) throw new Error(`Invalid SQL identifier: ${identifier}`);
    if (match[1] !== undefined) parts.push(match[1]);
    else {
      const name =
        match[2] !== undefined
          ? match[2].replaceAll('""', '"')
          : match[3] !== undefined
            ? match[3].replaceAll('``', '`')
            : match[4] !== undefined
              ? match[4]
              : match[5].replaceAll("''", "'");
      parts.push(quoteLiteralIdentifier(name));
    }
    position += match[0].length;
    if (position < identifier.length) {
      position += 1;
      if (position === identifier.length)
        throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
  }
  return renderIdentifier(parts.join('.'), dialect, options);
}

/** FK lists contain identifiers, with commas outside explicit quotes only. */
export function renderIdentifierList(
  list: string,
  dialect?: DatabaseDialect,
  options: IdentifierOptions = {},
): string {
  if (typeof list !== 'string')
    throw new Error(`Invalid SQL identifier list: ${list}`);
  const parts: string[] = [];
  let closingQuote: string | undefined;
  let start = 0;
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index];
    if (closingQuote) {
      if (char === closingQuote) {
        if (closingQuote !== ']' && list[index + 1] === closingQuote)
          index += 1;
        else closingQuote = undefined;
      }
    } else if (char === '"' || char === "'" || char === '`' || char === '[') {
      closingQuote = char === '[' ? ']' : char;
    } else if (char === ',') {
      parts.push(list.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(list.slice(start));
  return parts
    .map((part) => {
      const name = part.trim();
      const offset = part.indexOf(name);
      return (
        part.slice(0, offset) +
        renderSchemaIdentifier(name, dialect, options) +
        part.slice(offset + name.length)
      );
    })
    .join(',');
}

// SQLite official 147-keyword list (sqlite.org/lang_keywords.html), plus reserved
// pg_get_keywords() (PGlite 0.5.8) and duckdb_keywords() (DuckDB 1.4.3).
const IDENTIFIER_KEYWORDS = new Set(
  'abort action add after all alter always analyse analyze and any array as asc asymmetric attach autoincrement before begin between both by cascade case cast check collate column commit conflict constraint create cross current current_catalog current_date current_role current_time current_timestamp current_user database default deferrable deferred delete desc describe detach distinct do drop each else end escape except exclude exclusive exists explain fail false fetch filter first following for foreign from full generated glob grant group groups having if ignore immediate in index indexed initially inner insert instead intersect into is isnull join key lambda last lateral leading left like limit localtime localtimestamp match materialized natural no not nothing notnull null nulls of offset on only or order others outer over partition pivot pivot_longer pivot_wider placing plan pragma preceding primary qualify query raise range recursive references regexp reindex release rename replace restrict returning right rollback row rows savepoint select session_user set show some summarize symmetric system_user table temp temporary then ties to trailing transaction trigger true unbounded union unique unpivot update user using vacuum values variadic view virtual when where window with without'.split(
    ' ',
  ),
);
