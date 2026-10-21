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
export type AggregateLiteral = string | number | boolean | Date | null;

export type AggregateArithmeticOp = 'add' | 'sub' | 'mul' | 'div';
export type AggregateComparisonOp = 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte';

export type AggregateOperand =
  /** A column, bare (`qty`) or qualified by a table alias (`wo.estimated_hours`). */
  | { col: string }
  /** A literal value. */
  | { value: AggregateLiteral }
  | AggregateExpression;

export type AggregateExpression =
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
  | { op: 'coalesce'; operands: AggregateOperand[] };

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
}

interface RenderState {
  ctx: ExpressionContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function literal(value: unknown, state: RenderState): string {
  const { ctx } = state;
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Aggregate expression numbers must be finite');
    }
    // Inlined: a finite number cannot carry SQL, and an inlined number avoids
    // an untyped parameter (`$1 + $2`) that Postgres cannot infer.
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Aggregate expression dates must be valid');
    }
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
    const placeholder = `$${ctx.nextIndex++}`;
    ctx.values.push(value);
    return placeholder;
  }
  throw new Error(
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

function renderOperand(
  node: unknown,
  state: RenderState,
  depth: number,
): string {
  if (depth > MAX_DEPTH) {
    throw new Error(`Aggregate expression is nested deeper than ${MAX_DEPTH}`);
  }
  state.ctx.nodeCount = (state.ctx.nodeCount ?? 0) + 1;
  if (state.ctx.nodeCount > MAX_NODES) {
    throw new Error(`Aggregate expression has more than ${MAX_NODES} nodes`);
  }
  if (!isRecord(node)) {
    throw new Error('Aggregate expression node must be an object');
  }
  const { ctx } = state;

  if ('col' in node) {
    const column = ctx.identifier(node.col as string);
    ctx.onColumn?.(column);
    return column;
  }
  if ('value' in node) {
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
    return secondsBetween(
      ctx.adapterType,
      child(node.later),
      child(node.earlier),
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
      throw new Error(
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
      throw new Error(
        'Aggregate expression coalesce requires at least one operand',
      );
    }
    return `COALESCE(${operands.map(child).join(', ')})`;
  }
  throw new Error(`Unsupported aggregate expression operator: ${String(op)}`);
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
  return renderOperand(node, { ctx }, 0);
}
