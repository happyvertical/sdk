// biome-ignore-all lint/suspicious/noThenProperty: CASE nodes are closed data, not thenable functions.
import type { SqlAdapterType } from './shared/utils.js';

/**
 * Closed, structured expression nodes for {@link buildAggregate}.
 *
 * An expression is data, never SQL text: every node is checked against a fixed
 * set of operators, column references are validated identifiers, and literals
 * are either inlined after validation (finite numbers, booleans, null) or
 * bound as parameters (strings, dates). There is no raw-SQL escape hatch.
 */

/** A scalar a node may hold. Strings and dates are bound; the rest are inlined. */
export type AggregateLiteral =
  | string
  | number
  | boolean
  | Date
  | TypedDateLiteral
  | null;

export type AggregateArithmeticOp = 'add' | 'sub' | 'mul' | 'div';
export type AggregateComparisonOp = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';

export type AggregateOperand =
  /** A column, bare (`qty`) or qualified by a table alias (`wo.estimated_hours`). */
  | { col: string }
  /** A literal value. */
  | { value: AggregateLiteral }
  | AggregateExpression;

/** JSON-safe calendar date or UTC datetime (offsets are canonicalized to UTC). */
export interface TypedDateLiteral {
  kind: 'date' | 'datetime';
  iso: string;
}

export type PortableExpression =
  | {
      op: 'case';
      branches: { when: AggregateOperand; then: AggregateOperand }[];
      else: AggregateOperand;
    }
  | {
      op: 'if';
      condition: AggregateOperand;
      then: AggregateOperand;
      else: AggregateOperand;
    }
  | { op: 'round'; value: AggregateOperand; digits: AggregateOperand }
  | {
      op:
        | 'abs'
        | 'floor'
        | 'ceil'
        | 'lower'
        | 'upper'
        | 'trim'
        | 'length'
        | 'year'
        | 'month'
        | 'day';
      value: AggregateOperand;
    }
  | { op: 'least' | 'greatest' | 'concat'; operands: AggregateOperand[] }
  | { op: 'mod'; left: AggregateOperand; right: AggregateOperand }
  | {
      op: 'substring';
      value: AggregateOperand;
      start: AggregateOperand;
      length: AggregateOperand;
    }
  | { op: 'daysBetween'; later: AggregateOperand; earlier: AggregateOperand }
  | { op: 'addDays'; value: AggregateOperand; days: AggregateOperand };

export type AggregateExpression =
  | PortableExpression
  /**
   * `left op right`. `div` yields a fractional result on every dialect (integer
   * operands are not truncated) and NULL, not an error, for a zero divisor.
   */
  | {
      op: AggregateArithmeticOp;
      left: AggregateOperand;
      right: AggregateOperand;
    }
  /**
   * Seconds from `earlier` to `later`, both timestamps; fractional, NULL if
   * either is NULL. Positive when `later` is after `earlier`.
   */
  | { op: 'secondsBetween'; later: AggregateOperand; earlier: AggregateOperand }
  /**
   * A comparison. `eq`/`ne` against a NULL literal compare with IS [NOT] NULL;
   * any other comparison involving NULL is NULL (not true), as in SQL.
   */
  | {
      op: AggregateComparisonOp;
      left: AggregateOperand;
      right: AggregateOperand;
    }
  | { op: 'and' | 'or'; operands: AggregateOperand[] }
  | { op: 'not'; operand: AggregateOperand }
  | { op: 'isNull' | 'isNotNull'; operand: AggregateOperand }
  /** The first operand that is not NULL. */
  | { op: 'coalesce'; operands: AggregateOperand[] }
  /**
   * The operand as text (`CAST(x AS TEXT)`; `VARCHAR` on DuckDB/JSON), NULL
   * stays NULL. Lets a join compare keys of different types, such as a text
   * reference with a uuid id, without an error for a value that is not a uuid.
   * Comparing a cast column cannot use that column's index.
   */
  | { op: 'asText'; operand: AggregateOperand };

/** A table joined to the aggregate's `from`. */
export interface AggregateJoin {
  /** The joined table. */
  table: string;
  /** Its alias in the query; referenced as `alias.column`. Unique, no dots. */
  alias: string;
  /** `inner` (default) or `left`. */
  type?: 'inner' | 'left';
  /**
   * The join condition. Callers put a tenant equality here (for example
   * `eq(a.tenant_id, b.tenant_id)`) so ids that collide across tenants never
   * match; the builder does not know what a tenant is.
   */
  on: AggregateExpression;
}

const MAX_DEPTH = 24;
/** Node budget for a whole spec (every select item, join, filter and predicate together). */
const MAX_NODES = 1024;

const ARITHMETIC: Record<AggregateArithmeticOp, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
};
const COMPARISON: Record<AggregateComparisonOp, string> = {
  eq: '=',
  ne: '<>',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
};

/** Where an expression renders: its identifier checks and its parameter numbering. */
export interface ExpressionContext {
  adapterType: SqlAdapterType | undefined;
  /** The parameter index the next bound value takes. Advanced as values are bound. */
  nextIndex: number;
  /** Values bound so far, in index order. */
  values: unknown[];
  /** Validates (and returns) an identifier; throws on anything unsafe. */
  identifier: (identifier: string) => string;
  /** Called with each column reference so the caller can check its table alias. */
  onColumn?: (column: string) => void;
  /** Nodes rendered so far across every expression of one build; capped at {@link MAX_NODES}. */
  nodeCount?: number;
  /** Public rendering policy; omitted by the aggregate builder for compatibility. */
  mode?: 'ddl' | 'query';
  columnType?: (column: string) => ExpressionResultType;
  /** Cumulative rendering work, including SQL duplicated by portable guards. */
  sqlWork?: number;
}

interface RenderState {
  ctx: ExpressionContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literal(value: unknown, state: RenderState): string {
  const { ctx } = state;
  if (isRecord(value) && 'kind' in value) return typedDate(value, state);
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ExpressionError(
        'INVALID_EXPRESSION',
        'Aggregate expression numbers must be finite',
      );
    }
    // Inlined: a finite number cannot carry SQL, and an inlined number avoids
    // an untyped parameter (`$1 + $2`) that Postgres cannot infer.
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ExpressionError(
        'INVALID_EXPRESSION',
        'Aggregate expression dates must be valid',
      );
    }
    if (ctx.mode === 'ddl')
      fail(
        'NON_IMMUTABLE',
        'Legacy Date literals are not immutable; use a typed date literal',
      );
    const placeholder = `$${ctx.nextIndex++}`;
    ctx.values.push(value.toISOString());
    // DuckDB/JSON cannot infer a timestamp from a bound string (issue #540),
    // and Postgres cannot type two bare parameters (`$1 - $2`).
    if (ctx.adapterType === 'duckdb' || ctx.adapterType === 'json') {
      return `CAST(${placeholder} AS TIMESTAMP)`;
    }
    if (ctx.adapterType === 'postgres') {
      return `CAST(${placeholder} AS TIMESTAMPTZ)`;
    }
    return placeholder;
  }
  if (typeof value === 'string') {
    if (ctx.mode && value.includes('\0'))
      fail('INVALID_EXPRESSION', 'NUL is not a portable SQL string');
    if (ctx.mode === 'ddl')
      return quoteString(value, ctx.adapterType === 'postgres');
    const placeholder = `$${ctx.nextIndex++}`;
    ctx.values.push(value);
    return placeholder;
  }
  throw new ExpressionError(
    'INVALID_EXPRESSION',
    'Aggregate expression literal must be a string, number, boolean, Date or null',
  );
}

function secondsBetween(
  adapterType: SqlAdapterType | undefined,
  later: string,
  earlier: string,
): string {
  if (adapterType === 'postgres') {
    // A float like the other dialects: EXTRACT returns numeric, which drivers hand back as a string.
    return `CAST(EXTRACT(EPOCH FROM (${later} - ${earlier})) AS DOUBLE PRECISION)`;
  }
  if (adapterType === 'duckdb' || adapterType === 'json') {
    return `epoch(${later}) - epoch(${earlier})`;
  }
  // SQLite stores timestamps as ISO text; julianday reads that and the
  // difference is in days.
  return `((julianday(${later}) - julianday(${earlier})) * 86400.0)`;
}

function renderOperandUnchecked(
  node: unknown,
  state: RenderState,
  depth: number,
): string {
  if (depth > MAX_DEPTH) {
    throw new ExpressionError(
      'EXPRESSION_LIMIT',
      `Aggregate expression is nested deeper than ${MAX_DEPTH}`,
    );
  }
  state.ctx.nodeCount = (state.ctx.nodeCount ?? 0) + 1;
  if (state.ctx.nodeCount > MAX_NODES) {
    throw new ExpressionError(
      'EXPRESSION_LIMIT',
      `Aggregate expression has more than ${MAX_NODES} nodes`,
    );
  }
  if (!isRecord(node)) {
    throw new ExpressionError(
      'INVALID_EXPRESSION',
      'Aggregate expression node must be an object',
    );
  }
  const { ctx } = state;
  if (
    ctx.mode ||
    (typeof node.op === 'string' && Object.hasOwn(PORTABLE_FIELDS, node.op))
  )
    validateShape(node);

  if ('col' in node) {
    const column = ctx.identifier(node.col as string);
    ctx.onColumn?.(column);
    return column;
  }
  if ('value' in node && !('op' in node)) {
    return literal(node.value, state);
  }

  const op = node.op;
  const child = (value: unknown) => renderOperand(value, state, depth + 1);

  if (typeof op === 'string' && Object.hasOwn(ARITHMETIC, op)) {
    const arithmetic = op as AggregateArithmeticOp;
    const left = child(node.left);
    const right = child(node.right);
    if (arithmetic === 'div') {
      // `* 1.0` keeps integer operands fractional (SQLite and Postgres truncate
      // integer division); NULLIF turns a zero divisor into NULL.
      const quotient = `((${left} * 1.0) / NULLIF(${right}, 0))`;
      // A float on every dialect: Postgres would otherwise return numeric,
      // which drivers hand back as a string.
      if (ctx.adapterType === 'postgres') {
        return `CAST(${quotient} AS DOUBLE PRECISION)`;
      }
      if (ctx.adapterType === 'duckdb' || ctx.adapterType === 'json') {
        return `CAST(${quotient} AS DOUBLE)`;
      }
      return quotient;
    }
    return `(${left} ${ARITHMETIC[arithmetic]} ${right})`;
  }
  if (op === 'secondsBetween') {
    if (ctx.mode === 'ddl') {
      requireTemporal(node.later, state);
      requireTemporal(node.earlier, state);
    }
    return secondsBetween(
      ctx.adapterType,
      temporalSeconds(node.later, child(node.later), ctx),
      temporalSeconds(node.earlier, child(node.earlier), ctx),
    );
  }
  if (typeof op === 'string' && Object.hasOwn(COMPARISON, op)) {
    const comparison = op as AggregateComparisonOp;
    const against = (side: unknown): boolean =>
      isRecord(side) && 'value' in side && side.value === null;
    if ((comparison === 'eq' || comparison === 'ne') && against(node.right)) {
      return `(${child(node.left)} IS ${comparison === 'eq' ? 'NULL' : 'NOT NULL'})`;
    }
    if ((comparison === 'eq' || comparison === 'ne') && against(node.left)) {
      return `(${child(node.right)} IS ${comparison === 'eq' ? 'NULL' : 'NOT NULL'})`;
    }
    return `(${child(node.left)} ${COMPARISON[comparison]} ${child(node.right)})`;
  }
  if (op === 'and' || op === 'or') {
    const operands = node.operands;
    if (!Array.isArray(operands) || operands.length === 0) {
      throw new ExpressionError(
        'INVALID_EXPRESSION',
        `Aggregate expression ${op} requires at least one operand`,
      );
    }
    return `(${operands.map(child).join(op === 'and' ? ' AND ' : ' OR ')})`;
  }
  if (op === 'not') {
    return `(NOT ${child(node.operand)})`;
  }
  if (op === 'isNull' || op === 'isNotNull') {
    return `(${child(node.operand)} IS ${op === 'isNull' ? 'NULL' : 'NOT NULL'})`;
  }
  if (op === 'coalesce') {
    const operands = node.operands;
    if (!Array.isArray(operands) || operands.length === 0) {
      throw new ExpressionError(
        'INVALID_EXPRESSION',
        'Aggregate expression coalesce requires at least one operand',
      );
    }
    return `COALESCE(${operands.map(child).join(', ')})`;
  }
  if (op === 'asText') {
    if (
      ctx.mode === 'ddl' &&
      !['number', 'text', 'boolean', 'null'].includes(
        resultType(node.operand, ctx),
      )
    ) {
      fail(
        'NON_IMMUTABLE',
        'Generated asText requires known number/text/boolean input; date output depends on session settings',
      );
    }
    const type =
      ctx.adapterType === 'duckdb' || ctx.adapterType === 'json'
        ? 'VARCHAR'
        : 'TEXT';
    return `CAST(${child(node.operand)} AS ${type})`;
  }
  const portable = renderPortable(node, state, child);
  if (portable !== undefined) return portable;
  throw new ExpressionError(
    'INVALID_EXPRESSION',
    `Unsupported aggregate expression operator: ${String(op)}`,
  );
}

/**
 * Render an expression node to SQL, binding its string and date literals into
 * `ctx` as numbered parameters. Throws on any unknown operator, unsafe
 * identifier, non-finite number, or an expression too large to be legitimate.
 */
export function renderAggregateExpression(
  node: AggregateOperand,
  ctx: ExpressionContext,
): string {
  let sql = renderOperand(node, { ctx }, 0);
  // Keep dates native inside the expression tree, then expose canonical ISO
  // text at its boundary. PostgreSQL date_out depends on DateStyle.
  if (resultType(node, ctx) === 'date' && isRecord(node) && 'op' in node) {
    if (ctx.adapterType === 'postgres') sql = postgresDateISO(sql);
    else if (ctx.adapterType === 'duckdb' || ctx.adapterType === 'json')
      sql = `CAST(${sql} AS VARCHAR)`;
    ctx.sqlWork = (ctx.sqlWork ?? 0) + sql.length;
    if (ctx.sqlWork > MAX_SQL_WORK)
      fail('EXPRESSION_LIMIT', 'Expression date output exceeds SQL limit');
  }
  return sql;
}

export type ExpressionResultType =
  | 'number'
  | 'text'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'null'
  | 'unknown';
export type ExpressionErrorCode =
  | 'INVALID_EXPRESSION'
  | 'NON_IMMUTABLE'
  | 'EXPRESSION_LIMIT';

/** Coded validation failures suitable for persisted/untrusted expression data. */
export class ExpressionError extends Error {
  constructor(
    public readonly code: ExpressionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExpressionError';
  }
}

function fail(code: ExpressionErrorCode, message: string): never {
  throw new ExpressionError(code, message);
}

// Check every intermediate fragment before its parent can duplicate it. A depth
// bound alone permits exponential growth in SQL emitted for NULL guards.
const MAX_SQL_WORK = 262_144;
function renderOperand(
  node: unknown,
  state: RenderState,
  depth: number,
): string {
  const sql = renderOperandUnchecked(node, state, depth);
  state.ctx.sqlWork = (state.ctx.sqlWork ?? 0) + sql.length;
  if (state.ctx.sqlWork > MAX_SQL_WORK) {
    fail(
      'EXPRESSION_LIMIT',
      `Expression SQL exceeds ${MAX_SQL_WORK} characters of rendering work`,
    );
  }
  return sql;
}

function quoteString(value: string, postgres = false): string {
  if (postgres)
    return `(E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}' COLLATE "C")`;
  return `'${value.replace(/'/g, "''")}'`;
}

function typedDate(value: Record<string, unknown>, state: RenderState): string {
  const { kind, iso } = value;
  if (
    (kind !== 'date' && kind !== 'datetime') ||
    typeof iso !== 'string' ||
    Object.keys(value).some((key) => key !== 'kind' && key !== 'iso')
  ) {
    fail('INVALID_EXPRESSION', 'Expected typed date {kind, iso}');
  }
  // Date.parse normalizes invalid days, so validate the calendar separately.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match || Number(match[1]) < 1)
    fail('INVALID_EXPRESSION', 'Invalid ISO calendar date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    fail('INVALID_EXPRESSION', 'Invalid ISO calendar date');
  }
  let canonical = iso;
  if (kind === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso))
      fail('INVALID_EXPRESSION', 'Date requires YYYY-MM-DD');
  } else {
    if (
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
        iso,
      )
    ) {
      fail(
        'INVALID_EXPRESSION',
        'Datetime requires ISO seconds and an explicit UTC offset',
      );
    }
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime()))
      fail('INVALID_EXPRESSION', 'Invalid ISO datetime');
    canonical = date.toISOString();
    if (!/^\d{4}-/.test(canonical) || canonical.startsWith('0000'))
      fail('INVALID_EXPRESSION', 'Datetime outside years 0001..9999');
  }
  const { ctx } = state;
  let sql: string;
  if (ctx.mode === 'ddl')
    sql = quoteString(canonical, ctx.adapterType === 'postgres');
  else {
    sql = `$${ctx.nextIndex++}`;
    ctx.values.push(canonical);
  }
  if (
    ctx.adapterType === 'postgres' ||
    ctx.adapterType === 'duckdb' ||
    ctx.adapterType === 'json'
  ) {
    // A timestamp WITHOUT time zone contains canonical UTC wall-clock fields.
    // Never cast via timestamptz (whose date extraction depends on TimeZone).
    if (kind === 'datetime') {
      const utc = canonical.slice(0, -1).replace('T', ' ');
      if (ctx.mode === 'ddl')
        sql = quoteString(utc, ctx.adapterType === 'postgres');
      else ctx.values[ctx.values.length - 1] = utc;
    }
    return `CAST(${sql} AS ${kind === 'date' ? 'DATE' : 'TIMESTAMP'})`;
  }
  return sql;
}

function resultType(
  node: unknown,
  ctx: ExpressionContext,
  depth = 0,
  budget = { nodes: 0 },
): ExpressionResultType {
  if (depth > MAX_DEPTH || ++budget.nodes > MAX_NODES)
    fail(
      'EXPRESSION_LIMIT',
      'Expression type analysis exceeds depth/node limit',
    );
  if (!isRecord(node)) return 'unknown';
  if ('col' in node) return ctx.columnType?.(node.col as string) ?? 'unknown';
  if (!('op' in node) && 'value' in node) {
    const value = node.value;
    if (value === null) return 'null';
    if (value instanceof Date) return 'unknown';
    if (isRecord(value) && (value.kind === 'date' || value.kind === 'datetime'))
      return value.kind;
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') return 'text';
  }
  const op = node.op;
  if (
    typeof op === 'string' &&
    (Object.hasOwn(ARITHMETIC, op) || Object.hasOwn(COMPARISON, op))
  ) {
    return Object.hasOwn(ARITHMETIC, op) ? 'number' : 'boolean';
  }
  if (['and', 'or', 'not', 'isNull', 'isNotNull'].includes(op as string))
    return 'boolean';
  if (
    [
      'round',
      'abs',
      'floor',
      'ceil',
      'least',
      'greatest',
      'mod',
      'length',
      'year',
      'month',
      'day',
      'daysBetween',
      'secondsBetween',
    ].includes(op as string)
  )
    return 'number';
  if (
    ['concat', 'lower', 'upper', 'trim', 'substring', 'asText'].includes(
      op as string,
    )
  )
    return 'text';
  if (op === 'addDays') return 'date';
  const merge = (nodes: unknown[]) => {
    const types = nodes
      .map((n) => resultType(n, ctx, depth + 1, budget))
      .filter((t) => t !== 'null');
    return !types.length
      ? 'null'
      : types.every((t) => t === types[0])
        ? types[0]
        : 'unknown';
  };
  if (op === 'if') return merge([node.then, node.else]);
  if (op === 'case' && Array.isArray(node.branches))
    return merge([
      ...node.branches.map((b) => (isRecord(b) ? b.then : undefined)),
      node.else,
    ]);
  if (op === 'coalesce' && Array.isArray(node.operands))
    return merge(node.operands);
  return 'unknown';
}

function requireTemporal(node: unknown, state: RenderState): void {
  const type = resultType(node, state.ctx);
  if (type !== 'date' && type !== 'datetime' && type !== 'null') {
    fail(
      'NON_IMMUTABLE',
      'Generated date operations require typed date/datetime operands (timezone-free UTC); unknown or timestamptz columns are unsafe',
    );
  }
}

/** Guard portable integer arguments; dynamic out-of-range inputs yield NULL. */
function integerArg(
  node: unknown,
  sql: string,
  min: number,
  max: number,
): string {
  if (
    isRecord(node) &&
    !('op' in node) &&
    'value' in node &&
    node.value !== null
  ) {
    if (
      typeof node.value !== 'number' ||
      !Number.isInteger(node.value) ||
      node.value < min ||
      node.value > max
    ) {
      fail('INVALID_EXPRESSION', `Expected integer argument in ${min}..${max}`);
    }
  }
  return `CASE WHEN ${sql} BETWEEN ${min} AND ${max} THEN CASE WHEN ${sql} = CAST(${sql} AS INTEGER) THEN CAST(${sql} AS INTEGER) ELSE NULL END ELSE NULL END`;
}

function renderPortable(
  node: Record<string, unknown>,
  state: RenderState,
  child: (node: unknown) => string,
): string | undefined {
  const { op } = node;
  const pg = state.ctx.adapterType === 'postgres';
  const duck =
    state.ctx.adapterType === 'duckdb' || state.ctx.adapterType === 'json';
  const numeric = (sql: string) =>
    pg
      ? `CAST(${sql} AS DOUBLE PRECISION)`
      : duck
        ? `CAST(${sql} AS DOUBLE)`
        : sql;
  const strict = (args: string[], body: string) =>
    `(CASE WHEN ${args.map((a) => `${a} IS NULL`).join(' OR ')} THEN NULL ELSE ${body} END)`;
  if (op === 'case' || op === 'if') {
    const branches =
      op === 'if' ? [{ when: node.condition, then: node.then }] : node.branches;
    if (!Array.isArray(branches) || branches.length === 0)
      fail('INVALID_EXPRESSION', 'case requires at least one when/then branch');
    const sql = branches.map((b) => {
      if (!isRecord(b))
        fail('INVALID_EXPRESSION', 'case branch requires when/then');
      return `WHEN ${child(b.when)} THEN ${child(b.then)}`;
    });
    const expression = `(CASE ${sql.join(' ')} ELSE ${child(node.else)} END)`;
    return resultType(node, state.ctx) === 'number'
      ? numeric(expression)
      : expression;
  }
  if (op === 'least' || op === 'greatest' || op === 'concat') {
    if (
      !Array.isArray(node.operands) ||
      node.operands.length < (op === 'concat' ? 1 : 2)
    )
      fail(
        'INVALID_EXPRESSION',
        `${op} requires at least ${op === 'concat' ? 1 : 2} operands`,
      );
    const args = node.operands.map(child);
    if (op === 'concat') return `(${args.join(' || ')})`;
    const fn =
      !pg && !duck ? (op === 'least' ? 'MIN' : 'MAX') : op.toUpperCase();
    return numeric(strict(args, `${fn}(${args.join(', ')})`));
  }
  if (op === 'mod') {
    const left = child(node.left),
      right = child(node.right);
    // Native % is integer-only on SQLite; use truncation toward zero for a
    // fractional remainder with the dividend's sign on every backend.
    const quotient = `((${left} * 1.0) / NULLIF(${right}, 0))`;
    const ceil =
      !pg && !duck ? sqliteIntegral(quotient, 'ceil') : `CEIL(${quotient})`;
    const floor =
      !pg && !duck ? sqliteIntegral(quotient, 'floor') : `FLOOR(${quotient})`;
    return numeric(
      `(${left} - (CASE WHEN ${quotient} < 0 THEN ${ceil} ELSE ${floor} END) * ${right})`,
    );
  }
  if (op === 'round') {
    const value = child(node.value),
      digitsSql = child(node.digits);
    const digits = integerArg(node.digits, digitsSql, -12, 12);
    if (pg)
      return `CAST(ROUND(CAST(${value} AS NUMERIC), (${digits})) AS DOUBLE PRECISION)`;
    if (duck) return `ROUND(CAST(${value} AS DOUBLE), (${digits}))`;
    // SQLite ignores negative digits; implement those by scaling first.
    const factor = `(CASE (${digits}) ${Array.from({ length: 12 }, (_, i) => `WHEN -${i + 1} THEN ${10 ** (i + 1)}`).join(' ')} ELSE NULL END)`;
    return `(CASE WHEN (${digits}) < 0 THEN ROUND((${value} * 1.0) / ${factor}, 0) * ${factor} ELSE ROUND(${value}, (${digits})) END)`;
  }
  if (op === 'substring') {
    const value = child(node.value),
      start = child(node.start),
      length = child(node.length);
    return `SUBSTR(${value}, (${integerArg(node.start, start, 1, 2147483647)}), (${integerArg(node.length, length, 0, 2147483647)}))`;
  }
  if (op === 'daysBetween') {
    if (state.ctx.mode === 'ddl') {
      requireTemporal(node.later, state);
      requireTemporal(node.earlier, state);
    }
    const later = child(node.later),
      earlier = child(node.earlier);
    if (pg || duck)
      return `CAST((CAST(${later} AS DATE) - CAST(${earlier} AS DATE)) AS ${pg ? 'DOUBLE PRECISION' : 'DOUBLE'})`;
    return `(julianday(DATE(${later})) - julianday(DATE(${earlier})))`;
  }
  if (op === 'addDays') {
    if (state.ctx.mode === 'ddl') requireTemporal(node.value, state);
    const value = child(node.value),
      daysSql = child(node.days);
    const days = integerArg(node.days, daysSql, -365000, 365000);
    const added = `(CAST(${value} AS DATE) + (${days}))`;
    if (pg || duck) return added;
    return `DATE(${value}, CAST((${days}) AS TEXT) || ' days')`;
  }
  if (op === 'year' || op === 'month' || op === 'day') {
    if (state.ctx.mode === 'ddl') requireTemporal(node.value, state);
    const value = child(node.value);
    if (pg || duck)
      return `CAST(EXTRACT(${op.toUpperCase()} FROM CAST(${value} AS TIMESTAMP)) AS INTEGER)`;
    return `CAST(STRFTIME('${op === 'year' ? '%Y' : op === 'month' ? '%m' : '%d'}', ${value}) AS INTEGER)`;
  }
  if (op === 'lower' || op === 'upper') {
    // SQLite case conversion is ASCII-only. Use that exact contract on every
    // backend rather than expose collation/Unicode-version-dependent results.
    let value = child(node.value);
    if (pg)
      return `TRANSLATE(${value}, '${op === 'lower' ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : 'abcdefghijklmnopqrstuvwxyz'}', '${op === 'lower' ? 'abcdefghijklmnopqrstuvwxyz' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}')`;
    for (let i = 0; i < 26; i++) {
      const upper = String.fromCharCode(65 + i),
        lower = String.fromCharCode(97 + i);
      value = `REPLACE(${value}${pg ? ' COLLATE "C"' : ''}, ${quoteString(op === 'lower' ? upper : lower, pg)}, ${quoteString(op === 'lower' ? lower : upper, pg)})`;
    }
    return value;
  }
  if ((op === 'floor' || op === 'ceil') && !pg && !duck)
    return sqliteIntegral(child(node.value), op);
  if (
    op === 'abs' ||
    op === 'floor' ||
    op === 'ceil' ||
    op === 'trim' ||
    op === 'length'
  )
    return ['abs', 'floor', 'ceil'].includes(op)
      ? numeric(`${op.toUpperCase()}(${child(node.value)})`)
      : `${op.toUpperCase()}(${child(node.value)})`;
  return undefined;
}

export interface RenderExpressionOptions {
  dialect: 'sqlite' | 'postgres' | 'duckdb' | 'json';
  mode: 'ddl' | 'query';
  /** Maps a logical column to an identifier, never to SQL. Dots delimit parts. */
  resolveColumn?: (
    column: string,
  ) => string | { name: string; type: ExpressionResultType };
}
export interface RenderExpressionResult {
  sql: string;
  values: unknown[];
  resultType: ExpressionResultType;
  immutable: Record<'sqlite' | 'postgres' | 'duckdb', boolean>;
}

/** Render a closed scalar expression. DDL additionally requires immutability. */
export function renderExpression(
  node: AggregateOperand,
  options: RenderExpressionOptions,
): RenderExpressionResult {
  if (
    !['sqlite', 'postgres', 'duckdb', 'json'].includes(options.dialect) ||
    !['ddl', 'query'].includes(options.mode)
  )
    fail('INVALID_EXPRESSION', 'Invalid expression dialect or mode');
  const columns = new Map<
    string,
    { name: string; type: ExpressionResultType }
  >();
  const resolve = (name: string) => {
    if (typeof name !== 'string' || !name.length || name.includes('\0'))
      fail('INVALID_EXPRESSION', 'Invalid expression column');
    let column = columns.get(name);
    if (!column) {
      const found = options.resolveColumn?.(name) ?? name;
      column =
        typeof found === 'string' ? { name: found, type: 'unknown' } : found;
      if (
        !column ||
        typeof column.name !== 'string' ||
        !column.name.length ||
        column.name.includes('\0') ||
        column.name.split('.').some((p) => !p)
      )
        fail('INVALID_EXPRESSION', 'Invalid resolved column identifier');
      columns.set(name, column);
    }
    return column;
  };
  const ctx: ExpressionContext = {
    adapterType: options.dialect,
    nextIndex: 1,
    values: [],
    mode: options.mode,
    identifier: (name) =>
      resolve(name)
        .name.split('.')
        .map((part) => `"${part.replace(/"/g, '""')}"`)
        .join('.'),
    columnType: (name) => resolve(name).type,
  };
  const sql = renderAggregateExpression(node, ctx);
  // Validate DDL in each dialect as well: metadata describes portability,
  // independent of the dialect selected for this query.
  const immutable = { sqlite: true, postgres: true, duckdb: true };
  for (const dialect of ['sqlite', 'postgres', 'duckdb'] as const) {
    try {
      renderAggregateExpression(node, {
        ...ctx,
        adapterType: dialect,
        mode: 'ddl',
        nextIndex: 1,
        values: [],
        nodeCount: 0,
        sqlWork: 0,
      });
    } catch (error) {
      if (error instanceof ExpressionError && error.code === 'NON_IMMUTABLE')
        immutable[dialect] = false;
      else throw error;
    }
  }
  if (options.mode === 'ddl' && !Object.values(immutable).every(Boolean))
    fail(
      'NON_IMMUTABLE',
      'Expression must be immutable on every dialect for generated use',
    );
  return {
    sql,
    values: ctx.values,
    resultType: resultType(node, ctx),
    immutable,
  };
}

// libsql registers math extensions without SQLITE_DETERMINISTIC. Express these
// using core arithmetic so generated columns/indexes work on that adapter too.
function sqliteIntegral(value: string, op: 'floor' | 'ceil'): string {
  const trunc = `CAST(${value} AS INTEGER)`;
  return `(CASE WHEN ${value} >= 4503599627370496 OR ${value} <= -4503599627370496 THEN ${value} WHEN ${trunc} ${op === 'floor' ? '>' : '<'} ${value} THEN ${trunc} ${op === 'floor' ? '-' : '+'} 1 ELSE ${trunc} END)`;
}
function postgresDateISO(value: string): string {
  const part = (unit: string, width: number) =>
    `LPAD(CAST(CAST(EXTRACT(${unit} FROM ${value}) AS INTEGER) AS TEXT), ${width}, '0')`;
  return `(${part('YEAR', 4)} || '-' || ${part('MONTH', 2)} || '-' || ${part('DAY', 2)})`;
}

const PORTABLE_FIELDS: Record<string, string[]> = {
  case: ['branches', 'else'],
  if: ['condition', 'then', 'else'],
  round: ['value', 'digits'],
  abs: ['value'],
  floor: ['value'],
  ceil: ['value'],
  lower: ['value'],
  upper: ['value'],
  trim: ['value'],
  length: ['value'],
  year: ['value'],
  month: ['value'],
  day: ['value'],
  least: ['operands'],
  greatest: ['operands'],
  concat: ['operands'],
  mod: ['left', 'right'],
  substring: ['value', 'start', 'length'],
  daysBetween: ['later', 'earlier'],
  addDays: ['value', 'days'],
};
function validateShape(node: Record<string, unknown>): void {
  let fields: string[];
  if (!('op' in node)) fields = 'col' in node ? ['col'] : ['value'];
  else {
    const op = node.op;
    if (typeof op !== 'string')
      fail('INVALID_EXPRESSION', 'Expression requires an operator');
    if (Object.hasOwn(PORTABLE_FIELDS, op))
      fields = ['op', ...PORTABLE_FIELDS[op]];
    else if (Object.hasOwn(ARITHMETIC, op) || Object.hasOwn(COMPARISON, op))
      fields = ['op', 'left', 'right'];
    else if (op === 'secondsBetween') fields = ['op', 'later', 'earlier'];
    else if (['and', 'or', 'coalesce'].includes(op))
      fields = ['op', 'operands'];
    else if (['not', 'isNull', 'isNotNull', 'asText'].includes(op))
      fields = ['op', 'operand'];
    else
      fail(
        'INVALID_EXPRESSION',
        `Unsupported aggregate expression operator: ${op}`,
      );
  }
  if (
    fields.some((key) => !Object.hasOwn(node, key)) ||
    Object.keys(node).some((key) => !fields.includes(key))
  )
    fail('INVALID_EXPRESSION', 'Expression has missing or unknown fields');
  if (node.op === 'case' && Array.isArray(node.branches)) {
    for (const b of node.branches)
      if (
        !isRecord(b) ||
        Object.keys(b).length !== 2 ||
        !Object.hasOwn(b, 'when') ||
        !Object.hasOwn(b, 'then')
      )
        fail('INVALID_EXPRESSION', 'case branch requires only when/then');
  }
}

function temporalSeconds(
  node: unknown,
  sql: string,
  ctx: ExpressionContext,
): string {
  if (
    (ctx.adapterType === 'postgres' ||
      ctx.adapterType === 'duckdb' ||
      ctx.adapterType === 'json') &&
    resultType(node, ctx) === 'date'
  )
    return `CAST(${sql} AS TIMESTAMP)`;
  return sql;
}
