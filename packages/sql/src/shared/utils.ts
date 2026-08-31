/**
 * Shared SQL utilities that work in both browser and Node.js environments
 */

import { DatabaseError } from '@happyvertical/utils';
import type { WhereClause } from './types.js';

/**
 * Formats a database error to include its useful non-secret details.
 *
 * Database drivers often include additional properties beyond just `message`:
 * - PostgreSQL: code, detail, hint, severity
 * - DuckDB: may include additional context
 * - SQLite/LibSQL: may include errno, code
 *
 * This function extracts an allowlist of driver properties and redacts
 * credential-shaped text. When parameter values are available, prefer
 * {@link wrapDatabaseError}; it also redacts values echoed by the driver.
 *
 * @param error - The caught error object
 * @returns Formatted error string with all available error details
 */
export function formatDbError(error: unknown): string {
  return formatDbErrorWithSecrets(error, []);
}

type DriverError = {
  name?: string;
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
  severity?: string;
  errno?: number;
};

const DRIVER_ERROR_FIELDS = [
  'code',
  'detail',
  'hint',
  'severity',
  'errno',
] as const;

const SENSITIVE_CONTEXT_KEY =
  /^(?:args?|parameters?|params?|queries|query|sql|values?)$/i;
const CREDENTIAL_KEY_PART =
  /^(?:credential|credentials|passphrase|password|pwd|secret|token)$/i;
const CREDENTIAL_KEY_QUALIFIER =
  /^(?:access|api|auth|client|private|refresh|service|signing)$/i;
const DATABASE_USER_KEY =
  /^(?:user(?:name)?|(?:database|db|pg|postgres|postgresql)[._-]?user(?:name)?)$/i;
const DATABASE_URL_USERINFO =
  /\b((?:https?|libsql|postgres|postgresql):\/\/)[^\s/@]+@/giu;
const DATABASE_URL =
  /\b(?:https?|libsql|postgres|postgresql):\/\/[^\s"'`<>()]+/giu;
const CREDENTIAL_ASSIGNMENT =
  /(?<![\p{L}\p{N}_-])(["']?)([\p{L}\p{N}_.-]+(?: key)?)\1(\s*[:=]\s*)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s,;}\]]+)/giu;
const BEARER_CREDENTIAL = /\bbearer\s+[^\s,;]+/giu;
const SQL_NUMERIC_LITERAL =
  /(?<![\p{L}\p{N}_$])[-+]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:e[-+]?\d(?:_?\d)*)?(?![\p{L}\p{N}_$])/giu;
const POSTGRES_KEY_VALUE =
  /(\bKey\s*\([^\r\n)]*\)\s*=\s*\()([\s\S]*?)(\)\s*(?:already exists|is duplicated)\b)/giu;
const POSTGRES_FAILING_ROW =
  /(\bFailing row contains\s*\()([\s\S]*)(\)(?:\.|$))/giu;
const CAST_INPUT_VALUE =
  /(\bwith value\s+)([\s\S]*?)(\s+(?:can't|cannot)\s+be cast\b)/giu;

function isCredentialKey(key: string): boolean {
  if (DATABASE_USER_KEY.test(key)) return true;

  const parts = key
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (parts.length === 1 && /^(?:auth|credential|key|pass)$/i.test(parts[0])) {
    return true;
  }
  if (parts.some((part) => CREDENTIAL_KEY_PART.test(part))) return true;

  return parts.some(
    (part, index) =>
      /^(?:key|auth)$/i.test(part) &&
      index > 0 &&
      CREDENTIAL_KEY_QUALIFIER.test(parts[index - 1]),
  );
}

function toDriverError(error: unknown): DriverError {
  return error && (typeof error === 'object' || typeof error === 'function')
    ? (error as DriverError)
    : {};
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = '[redacted]';
    if (url.password) url.password = '[redacted]';
    for (const key of url.searchParams.keys()) {
      if (isCredentialKey(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    if (url.hash) url.hash = '[redacted]';
    return url.toString();
  } catch {
    return value.replace(/\/\/[^/@\s]+@/u, '//[redacted]@');
  }
}

function redactKnownValue(input: string, value: string): string {
  if (!value || !input.includes(value)) return input;
  if (!/^[\p{L}\p{N}_-]+$/u.test(value)) {
    return input.split(value).join('[redacted]');
  }

  const identifierCharacter = /^[\p{L}\p{N}_-]$/u;
  let cursor = 0;
  let redacted = '';
  let match = input.indexOf(value);
  while (match !== -1) {
    const end = match + value.length;
    const before = [...input.slice(Math.max(0, match - 2), match)].at(-1);
    const afterCodePoint = input.codePointAt(end);
    const after =
      afterCodePoint === undefined
        ? undefined
        : String.fromCodePoint(afterCodePoint);
    const bounded =
      (!before || !identifierCharacter.test(before)) &&
      (!after || !identifierCharacter.test(after));

    redacted += input.slice(cursor, match);
    redacted += bounded ? '[redacted]' : value;
    cursor = end;
    match = input.indexOf(value, cursor);
  }

  return redacted + input.slice(cursor);
}

function redactDatabaseErrorText(
  value: string,
  knownSecrets: readonly string[],
): string {
  let redacted = value
    .replace(DATABASE_URL_USERINFO, '$1[redacted]@')
    .replace(DATABASE_URL, redactUrl)
    .replace(
      CREDENTIAL_ASSIGNMENT,
      (assignment, quote: string, key: string, delimiter: string) =>
        isCredentialKey(key)
          ? `${quote}${key}${quote}${delimiter}[redacted]`
          : assignment,
    )
    .replace(BEARER_CREDENTIAL, 'Bearer [redacted]')
    .replace(
      POSTGRES_KEY_VALUE,
      (_match, prefix: string, _value: string, suffix: string) =>
        `${prefix}[redacted]${suffix}`,
    )
    .replace(
      POSTGRES_FAILING_ROW,
      (_match, prefix: string, _value: string, suffix: string) =>
        `${prefix}[redacted]${suffix}`,
    )
    .replace(
      CAST_INPUT_VALUE,
      (_match, prefix: string, _value: string, suffix: string) =>
        `${prefix}[redacted]${suffix}`,
    );

  for (const secret of [...new Set(knownSecrets)].sort(
    (left, right) => right.length - left.length,
  )) {
    redacted = redactKnownValue(redacted, secret);
  }

  return redacted;
}

function collectSensitiveValues(
  value: unknown,
  output: Set<string>,
  seen: Set<object>,
): void {
  if (typeof value === 'string') {
    if (value) output.add(value);
    return;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    output.add(String(value));
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  try {
    if (value instanceof Date) {
      output.add(value.toISOString());
      return;
    }

    if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(
        value.buffer,
        value.byteOffset,
        value.byteLength,
      );
      if (bytes.length > 0) {
        const hex = [...bytes]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
        output.add([...bytes].join(','));
        output.add(hex);
        output.add(`\\x${hex}`);
        output.add(`\\x${hex.toUpperCase()}`);
        output.add(
          `<Buffer ${[...bytes]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ')}>`,
        );
        if (typeof Buffer !== 'undefined') {
          output.add(Buffer.from(bytes).toString('base64'));
        }
      }
      return;
    }
  } catch {
    return;
  }

  try {
    const serialized = JSON.stringify(value);
    if (serialized && serialized !== '{}' && serialized !== '[]') {
      output.add(serialized);
    }
  } catch {
    // Cyclic bind values are still traversed below.
  }

  let descriptors: Record<string, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    // A proxy trap must not replace the database failure being reported.
    return;
  }

  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key !== 'length' && 'value' in descriptor) {
      collectSensitiveValues(descriptor.value, output, seen);
    }
  }
}

function collectSqlLiterals(sql: string, output: Set<string>): void {
  // Some drivers include the complete statement in their diagnostics. Treat
  // an exact echo as sensitive even when it contains no parseable literals.
  if (sql) output.add(sql);

  for (const match of sql.matchAll(/'((?:''|[^'])*)'/gu)) {
    const literal = match[1].replaceAll("''", "'");
    if (literal) output.add(literal);
  }

  for (const match of sql.matchAll(/\$\$([\s\S]*?)\$\$/gu)) {
    if (match[1]) output.add(match[1]);
  }

  for (const match of sql.matchAll(
    /\$([A-Za-z_][A-Za-z0-9_]*)\$([\s\S]*?)\$\1\$/gu,
  )) {
    if (match[2]) output.add(match[2]);
  }

  for (const match of sql.matchAll(SQL_NUMERIC_LITERAL)) {
    output.add(match[0]);
    output.add(match[0].replaceAll('_', ''));
  }
}

function contextSecrets(context: Record<string, unknown>): string[] {
  const output = new Set<string>();
  for (const [key, value] of Object.entries(context)) {
    if (/^(?:args?|parameters?|params?|values?)$/i.test(key)) {
      collectSensitiveValues(value, output, new Set());
    } else if (
      /^(?:queries|query|sql)$/i.test(key) &&
      typeof value === 'string'
    ) {
      collectSqlLiterals(value, output);
    }
  }
  return [...output];
}

function sanitizeContextValue(
  value: unknown,
  knownSecrets: readonly string[],
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return redactDatabaseErrorText(value, knownSecrets);
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) =>
      sanitizeContextValue(entry, knownSecrets, seen),
    );
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isCredentialKey(key)
        ? '[redacted]'
        : sanitizeContextValue(entry, knownSecrets, seen),
    ]),
  );
}

function sanitizeDatabaseErrorContext(
  context: Record<string, unknown>,
  knownSecrets: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      SENSITIVE_CONTEXT_KEY.test(key) || isCredentialKey(key)
        ? '[redacted]'
        : sanitizeContextValue(value, knownSecrets, new WeakSet()),
    ]),
  );
}

function formatDbErrorWithSecrets(
  error: unknown,
  knownSecrets: readonly string[],
): string {
  const dbError = toDriverError(error);

  const parts: string[] = [];

  if (dbError.message) {
    parts.push(redactDatabaseErrorText(dbError.message, knownSecrets));
  }
  if (dbError.code) {
    parts.push(`code=${redactDatabaseErrorText(dbError.code, knownSecrets)}`);
  }
  if (dbError.detail) {
    parts.push(
      `detail=${redactDatabaseErrorText(dbError.detail, knownSecrets)}`,
    );
  }
  if (dbError.hint) {
    parts.push(`hint=${redactDatabaseErrorText(dbError.hint, knownSecrets)}`);
  }
  if (dbError.severity) {
    parts.push(
      `severity=${redactDatabaseErrorText(dbError.severity, knownSecrets)}`,
    );
  }
  if (dbError.errno !== undefined) parts.push(`errno=${dbError.errno}`);

  return parts.length > 0
    ? parts.join(', ')
    : redactDatabaseErrorText(String(error), knownSecrets);
}

function safeDatabaseCause(
  error: unknown,
  knownSecrets: readonly string[],
): Error {
  const dbError = toDriverError(error);
  const message = dbError.message
    ? redactDatabaseErrorText(dbError.message, knownSecrets)
    : formatDbErrorWithSecrets(error, knownSecrets);
  const cause = new Error(message);
  cause.name = dbError.name
    ? redactDatabaseErrorText(dbError.name, knownSecrets)
    : 'DatabaseDriverError';

  for (const field of DRIVER_ERROR_FIELDS) {
    const value = dbError[field];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      Object.defineProperty(cause, field, {
        configurable: true,
        enumerable: true,
        value:
          typeof value === 'string'
            ? redactDatabaseErrorText(value, knownSecrets)
            : value,
        writable: true,
      });
    }
  }

  return cause;
}

/**
 * Wraps an engine failure in a serializable, secret-safe DatabaseError.
 *
 * Raw SQL and parameter values are replaced in context. The native `cause` is
 * a sanitized driver-error snapshot rather than the original object so normal
 * Error inspection cannot bypass the same redaction applied to messages and
 * JSON serialization.
 */
export function wrapDatabaseError(
  message: string,
  error: unknown,
  context: Record<string, unknown> = {},
): DatabaseError {
  const knownSecrets = contextSecrets(context);
  const originalError = formatDbErrorWithSecrets(error, knownSecrets);
  return new DatabaseError(
    `${message}: ${originalError}`,
    {
      ...sanitizeDatabaseErrorContext(context, knownSecrets),
      originalError,
    },
    safeDatabaseCause(error, knownSecrets),
  );
}

/**
 * Resolves the column list for a multi-row INSERT and rejects batches whose
 * records disagree on it.
 *
 * A batch INSERT emits one column list for the whole statement, so it can only
 * come from the first record. That leaves two ways for a later record to be
 * written wrongly, both of them silent:
 *
 * - Its keys are the same but in a different insertion order. Callers that
 *   bound values with `Object.values(record)` bound them by position, so the
 *   values cross-assigned into each other's columns. Projecting each record
 *   through the returned column list — `keys.map((key) => record[key])` — is
 *   what makes key order irrelevant, and every caller must do it.
 * - Its key set genuinely differs. An extra key has no column to go to and a
 *   missing one has no value, so the record cannot be expressed by this
 *   statement at all. Guessing (dropping the extra, writing NULL for the
 *   missing) is what makes the failure invisible, so this throws instead.
 *
 * A key whose value is `undefined` counts as absent. Adapters that serialize
 * records first drop such keys before this point while the rest pass them
 * through, so comparing raw key lists would make the same batch throw on some
 * adapters and silently write NULL on others. Only the comparison ignores them;
 * the returned column list is untouched, so each adapter keeps its own
 * single-record handling of `undefined`.
 *
 * @param table - Table being inserted into, for error context
 * @param records - Non-empty batch, as the adapter will bind it
 * @returns Column list taken from the first record
 * @throws DatabaseError if any later record's key set differs from the first's
 */
export function resolveInsertColumns(
  table: string,
  records: Record<string, any>[],
): string[] {
  const definedKeys = (record: Record<string, any>) =>
    new Set(Object.keys(record).filter((key) => record[key] !== undefined));

  const keys = Object.keys(records[0]);
  const expected = definedKeys(records[0]);

  for (let index = 1; index < records.length; index++) {
    const recordKeys = definedKeys(records[index]);
    const missing = [...expected].filter((key) => !recordKeys.has(key));
    const extra = [...recordKeys].filter((key) => !expected.has(key));

    if (missing.length === 0 && extra.length === 0) {
      continue;
    }

    const problems = [
      missing.length > 0 ? `missing ${missing.join(', ')}` : '',
      extra.length > 0 ? `unexpected ${extra.join(', ')}` : '',
    ].filter(Boolean);

    throw new DatabaseError(
      `Batch insert records must all have the same keys; record ${index} has ${problems.join(
        ' and ',
      )} relative to record 0 (${[...expected].join(', ')})`,
      {
        table,
        recordIndex: index,
        expectedKeys: keys,
        recordKeys: [...recordKeys],
        missing,
        extra,
        hint: 'A batch INSERT writes one column list for every row, taken from the first record, so record 0 defines the columns even when it is the one that looks wrong. A key whose value is undefined counts as absent. Split records with differing keys into separate insert() calls, or fill the gaps explicitly with null.',
      },
    );
  }

  return keys;
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
  'not in': 'NOT IN',
} as const;

function isSimpleSqlIdentifier(field: string): boolean {
  return /^[a-zA-Z0-9_.]+$/.test(field);
}

declare const rawSqlKeyBrand: unique symbol;

/**
 * A WHERE-clause key produced by {@link raw}: SQL text the caller vouches for,
 * exempt from the identifier validation `buildWhere` applies to every other key.
 */
export type RawSqlKey = string & { readonly [rawSqlKeyBrand]: true };

/**
 * Marks a condition key as caller-authored SQL text.
 *
 * A fixed, non-secret sentinel rather than a random per-process token. A random
 * token has to travel inside the key, which means it reaches every place a key
 * is echoed — error messages, logs, each adapter's `DatabaseError` context — and
 * one disclosure would let a caller mint raw keys for the life of the process.
 * A registry of minted expressions avoids that but is not referentially
 * transparent: it would make `raw('revenue >')` in one query change what the
 * plain key `'revenue >'` means in every other one.
 *
 * The NUL delimiters cannot appear in an identifier or in SQL a developer would
 * write, so the marker never collides with a legitimate key.
 */
const RAW_KEY_PREFIX = '\u0000hv-sql-raw\u0000';

/**
 * Marks a WHERE-clause key as SQL expression text rather than an identifier.
 *
 * {@link buildWhere} validates every condition key as a plain identifier. Wrap a
 * key in `raw()` to opt one condition out of that check:
 *
 * ```typescript
 * buildWhere({
 *   status: 'paid',                 // validated as an identifier
 *   [raw('SUM(total) >')]: 100,     // caller-authored SQL, not validated
 * });
 * ```
 *
 * Never build the argument from end-user input. `raw()` is an assertion that
 * the caller, not the request, authored this SQL.
 *
 * The returned key carries a marker, so it is a distinct string from the bare
 * expression: minting `raw('revenue >')` never changes what the plain key
 * `'revenue >'` means anywhere else.
 *
 * The marker is a fixed sentinel, not a secret. It stops an expression key being
 * used by accident — the shape of the key no longer grants raw access, a call to
 * `raw()` does — but a caller that controls a whole key string verbatim,
 * including the NUL-delimited marker, can still reproduce it. Validate at your
 * own trust boundary; do not rely on this as the only barrier against hostile
 * input.
 *
 * Enforcement is at runtime: `WhereClause` keys are plain `string`, so a
 * computed key widens and TypeScript will not reject an unmarked expression key
 * at the call site.
 *
 * A trailing operator is recognised only if it is one of `=`, `!=`, `>`, `>=`,
 * `<`, `<=`, `like`, `in`, `not in`. Any other trailing token is treated as part
 * of the expression and `=` is appended, so `raw('name ILIKE')` silently emits
 * `name ILIKE = $1`, which the database then rejects. Fold an unsupported
 * operator into the expression instead: `raw('LOWER(name) like')`.
 *
 * @param expression - SQL field or expression text, optionally ending in a
 *   supported operator (for example `SUM(total) >`)
 * @returns A branded key for use in a {@link WhereClause}
 * @throws If the expression is empty
 */
export function raw(expression: string): RawSqlKey {
  // Unwrap first so raw(raw(x)) === raw(x) and a marker can never nest into the
  // emitted SQL.
  const trimmed = unwrapRawKey(expression).key.trim();
  if (!trimmed) {
    throw new Error('raw() requires a non-empty SQL expression');
  }
  return `${RAW_KEY_PREFIX}${trimmed}` as RawSqlKey;
}

/**
 * Splits the raw marker off a condition key.
 * @internal
 */
export function unwrapRawKey(fullKey: string): {
  key: string;
  isRaw: boolean;
} {
  return fullKey.startsWith(RAW_KEY_PREFIX)
    ? { key: fullKey.slice(RAW_KEY_PREFIX.length), isRaw: true }
    : { key: fullKey, isRaw: false };
}

export function parseConditionKey(fullKey: string): {
  field: string;
  operator: string;
} {
  const trimmed = fullKey.trim();
  const lower = trimmed.toLowerCase();
  const operators = ['not in', 'like', 'in', '!=', '>=', '<=', '>', '<', '='];

  for (const operator of operators) {
    if (lower.endsWith(` ${operator}`)) {
      return {
        field: trimmed.slice(0, -(operator.length + 1)).trim(),
        operator,
      };
    }
  }

  // Deliberately no `explicitOperator` flag: "key ends in an operator" was the
  // condition that used to suppress identifier validation, and that was the
  // vulnerability. Nothing should gate trust on the shape of the key again.
  return { field: trimmed, operator: '=' };
}

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
  const { key, isRaw } = unwrapRawKey(fullKey);
  const { field, operator } = parseConditionKey(key);
  if (!isRaw && !isSimpleSqlIdentifier(field)) {
    throw new Error(
      `Invalid SQL identifier: ${field}. Condition keys must be plain ` +
        'identifiers; wrap developer-authored SQL expressions in raw().',
    );
  }
  const sqlOperator =
    VALID_OPERATORS[operator as keyof typeof VALID_OPERATORS] || '=';
  const values: any[] = [];

  let sql: string;

  if (value === null) {
    sql = `${field} IS ${sqlOperator === '=' ? 'NULL' : 'NOT NULL'}`;
  } else if (
    (sqlOperator === 'IN' || sqlOperator === 'NOT IN') &&
    Array.isArray(value)
  ) {
    if (value.length === 0) {
      throw new Error(`${sqlOperator} requires at least one value`);
    }
    const placeholders = value.map(() => `$${currIndex.value++}`).join(', ');
    sql = `${field} ${sqlOperator} (${placeholders})`;
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
 * @param adapterType - Database adapter type. Controls Date handling:
 *   - `'duckdb'` / `'json'`: Wraps Date values in `CAST($N AS TIMESTAMP)` to
 *     prevent DuckDB ANY-type inference issues.
 *   - `'sqlite'` / `'postgres'` / `undefined`: Passes ISO strings directly
 *     (these adapters handle ISO timestamp strings natively).
 *
 * Every condition key is validated as a plain SQL identifier, with or without
 * an operator suffix. To use expression text as a key, wrap it in {@link raw}:
 *
 * ```typescript
 * buildWhere({ [raw('LOWER(status) =')]: 'paid' });
 * ```
 *
 * `raw()` is the only way to reach expression text, so mapping untrusted input
 * into a condition key throws rather than emitting attacker-controlled SQL.
 *
 * @returns Object containing the SQL clause and array of values
 * @throws If a key that is not wrapped in {@link raw} is not a plain identifier
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
