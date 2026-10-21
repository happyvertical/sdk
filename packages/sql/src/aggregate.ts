import {
  type AggregateJoin,
  type AggregateOperand,
  type ExpressionContext,
  renderAggregateExpression,
} from './aggregate-expression.js';
import type { WhereClause } from './shared/types.js';
import {
  buildWhere,
  parseConditionKey,
  raw,
  type SqlAdapterType,
  unwrapRawKey,
} from './shared/utils.js';

export type AggregateTimeBucketUnit =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year';

export type AggregateFunction =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | (string & {});

export type AggregateSelectExpr =
  | { column: string; as?: string }
  /** A row expression used as a grouping key (a computed column of each row). */
  | { expr: AggregateOperand; as: string }
  | {
      fn: AggregateFunction;
      column?: string;
      /** A row expression to aggregate in place of `column` (not both). */
      expr?: AggregateOperand;
      /**
       * Aggregate only the rows this predicate holds for (a filtered count or
       * sum). Rows where it is false or NULL are skipped. With `count` and no
       * column or expression it counts the matching rows.
       */
      filter?: AggregateOperand;
      as: string;
      distinct?: boolean;
    }
  | {
      bucket: AggregateTimeBucketUnit;
      column: string;
      as: string;
    };

export interface AggregateSpec {
  from: string;
  /** Alias for `from`, so its columns can be qualified (`o.total`) beside joined tables. */
  fromAlias?: string;
  /**
   * Tables joined to `from`, in order. With joins, a column naming a table must
   * be qualified by `from`, `fromAlias` or a join alias.
   */
  joins?: AggregateJoin[];
  select: AggregateSelectExpr[];
  where?: WhereClause;
  /** A row predicate built from expression nodes, ANDed with `where`. */
  whereExpr?: AggregateOperand;
  groupBy?: string[];
  having?: WhereClause;
  orderBy?: string | string[];
  limit?: number;
  offset?: number;
}

export interface AggregateBuildResult {
  sql: string;
  values: any[];
}

const VALID_DIRECTIONS = new Set(['ASC', 'DESC']);
const VALID_BUCKET_UNITS = new Set<AggregateTimeBucketUnit>([
  'minute',
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);

function validateSqlIdentifier(identifier: string): string {
  // Reject non-strings before the regex. `test` coerces via `toString`, so a
  // value whose `toString` differs across reads could pass here and interpolate
  // a different identifier into the aggregate SQL than the one validated.
  if (typeof identifier !== 'string' || !/^[a-zA-Z0-9_.]+$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return identifier;
}

function normalizeAdapter(adapterType?: SqlAdapterType): SqlAdapterType {
  return adapterType ?? 'sqlite';
}

function placeholder(index: number): string {
  return `$${index}`;
}

export function bucketExpr(
  adapterType: SqlAdapterType | undefined,
  unit: AggregateTimeBucketUnit,
  column: string,
): string {
  if (!VALID_BUCKET_UNITS.has(unit)) {
    throw new Error(`Invalid aggregate bucket unit: ${unit}`);
  }

  const col = validateSqlIdentifier(column);
  const adapter = normalizeAdapter(adapterType);

  if (adapter === 'postgres' || adapter === 'duckdb' || adapter === 'json') {
    return `date_trunc('${unit}', ${col})`;
  }

  switch (unit) {
    case 'minute':
      return `strftime('%Y-%m-%d %H:%M:00', ${col})`;
    case 'hour':
      return `strftime('%Y-%m-%d %H:00:00', ${col})`;
    case 'day':
      return `strftime('%Y-%m-%d 00:00:00', ${col})`;
    case 'week':
      return `strftime('%Y-%m-%d 00:00:00', date(${col}, printf('-%d days', (CAST(strftime('%w', ${col}) AS INTEGER) + 6) % 7)))`;
    case 'month':
      return `strftime('%Y-%m-01 00:00:00', ${col})`;
    case 'quarter':
      return `strftime('%Y-%m-%d 00:00:00', date(strftime('%Y-', ${col}) || printf('%02d', ((CAST(strftime('%m', ${col}) AS INTEGER) - 1) / 3) * 3 + 1) || '-01'))`;
    case 'year':
      return `strftime('%Y-01-01 00:00:00', ${col})`;
  }
}

/** What a select expression, join and predicate share while one query is built. */
interface BuildState {
  ctx: ExpressionContext;
  /** Table names and aliases a qualified column may name; undefined without joins. */
  scope: Set<string> | undefined;
}

function checkColumn(state: BuildState, column: string): string {
  const { scope } = state;
  if (scope && column.includes('.')) {
    const parts = column.split('.');
    if (parts.length !== 2 || !scope.has(parts[0])) {
      throw new Error(
        `Aggregate column ${column} must be qualified by the from table or a join alias`,
      );
    }
  }
  return column;
}

function validateColumn(state: BuildState, column: string): string {
  return checkColumn(state, validateSqlIdentifier(column));
}

function renderExpression(state: BuildState, node: AggregateOperand): string {
  return renderAggregateExpression(node, state.ctx);
}

function aggregateExpression(
  expr: Extract<AggregateSelectExpr, { fn: AggregateFunction }>,
  state: BuildState,
): string {
  const normalizedFn = String(expr.fn).toLowerCase();
  const fn = validateSqlIdentifier(String(expr.fn)).toUpperCase();
  if (expr.column !== undefined && expr.expr !== undefined) {
    throw new Error(`Aggregate ${expr.fn} takes a column or an expr, not both`);
  }
  const hasArgument = Boolean(expr.column) || expr.expr !== undefined;
  // Rendered first so a filter's parameters are numbered before the argument's.
  const filter =
    expr.filter !== undefined
      ? renderExpression(state, expr.filter)
      : undefined;

  if (normalizedFn === 'count' && !hasArgument) {
    if (expr.distinct) {
      throw new Error(`Aggregate ${expr.fn} with distinct requires a column`);
    }
    return filter ? `COUNT(CASE WHEN ${filter} THEN 1 END)` : 'COUNT(*)';
  }
  if (!hasArgument) {
    throw new Error(`Aggregate ${expr.fn} requires a column`);
  }
  const argument =
    expr.expr !== undefined
      ? renderExpression(state, expr.expr)
      : validateColumn(state, expr.column as string);
  const distinct = expr.distinct ? 'DISTINCT ' : '';
  // CASE WHEN rather than FILTER (WHERE ...): it means the same on every
  // dialect and every SQLite version.
  const inner = filter ? `CASE WHEN ${filter} THEN ${argument} END` : argument;
  return `${fn}(${distinct}${inner})`;
}

function selectExpression(
  expr: AggregateSelectExpr,
  adapterType: SqlAdapterType | undefined,
  state: BuildState,
): {
  expression: string;
  alias: string;
  groupingCandidate: boolean;
  computed: boolean;
} {
  if (
    ['fn' in expr, 'expr' in expr && !('fn' in expr), 'bucket' in expr].filter(
      Boolean,
    ).length > 1
  ) {
    throw new Error('Aggregate select item mixes fn, bucket and expr');
  }
  if ('fn' in expr) {
    const expression = aggregateExpression(expr, state);
    const alias = validateSqlIdentifier(expr.as);
    return { expression, alias, groupingCandidate: false, computed: false };
  }
  if ('expr' in expr) {
    const expression = renderExpression(state, expr.expr);
    const alias = validateSqlIdentifier(expr.as);
    return { expression, alias, groupingCandidate: true, computed: true };
  }
  if ('column' in expr && !('bucket' in expr)) {
    const column = validateColumn(state, expr.column);
    // A qualified column (`wo.title`) is named by its column part, not the dotted path.
    const alias = validateSqlIdentifier(
      expr.as ?? expr.column.split('.').pop() ?? expr.column,
    );
    return {
      expression: column,
      alias,
      groupingCandidate: true,
      computed: false,
    };
  }
  const column = validateColumn(state, (expr as { column: string }).column);
  const bucket = (expr as { bucket: AggregateTimeBucketUnit }).bucket;
  const expression = bucketExpr(adapterType, bucket, column);
  const alias = validateSqlIdentifier((expr as { as: string }).as);
  return { expression, alias, groupingCandidate: true, computed: false };
}

function expandHavingKey(
  key: string,
  expressionByAlias: Map<string, string>,
): string {
  // A key the caller already wrapped in raw() is used verbatim: raw() means
  // "this exact SQL", so it deliberately bypasses select-alias expansion.
  if (unwrapRawKey(key).isRaw) return key;

  const parsed = parseConditionKey(key);
  const expression =
    expressionByAlias.get(parsed.field) ?? validateSqlIdentifier(parsed.field);

  // The caller's key is validated above (as an alias or a plain identifier);
  // what comes out is a select expression such as `SUM(total) >`, which only
  // buildWhere's raw channel accepts.
  return raw(`${expression} ${parsed.operator}`);
}

function expandHaving(
  having: WhereClause,
  expressionByAlias: Map<string, string>,
): WhereClause {
  const expandCondition = (condition: Record<string, any>) =>
    Object.fromEntries(
      Object.entries(condition).map(([key, value]) => [
        expandHavingKey(key, expressionByAlias),
        value,
      ]),
    );
  if (Array.isArray(having)) {
    return having.map((andGroup: Record<string, any>[]) =>
      andGroup.map((condition: Record<string, any>) =>
        expandCondition(condition),
      ),
    );
  }

  return expandCondition(having);
}

function buildHaving(
  having: AggregateSpec['having'],
  expressionByAlias: Map<string, string>,
  startIndex: number,
  adapterType: SqlAdapterType | undefined,
): AggregateBuildResult {
  if (!having) return { sql: '', values: [] };
  const expanded = expandHaving(having, expressionByAlias);
  const built = buildWhere(expanded, startIndex, adapterType);

  return {
    sql: built.sql ? built.sql.replace(/^WHERE/, 'HAVING') : '',
    values: built.values,
  };
}

function buildOrderBy(
  orderBy: string | string[] | undefined,
  state: BuildState,
  aliases: ReadonlySet<string>,
): string {
  if (!orderBy) return '';
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts = items.map((item) => {
    const [field, direction = 'ASC'] = item.trim().split(/\s+/);
    const normalizedDirection = direction.toUpperCase();
    if (!VALID_DIRECTIONS.has(normalizedDirection)) {
      throw new Error(`Invalid aggregate order direction: ${direction}`);
    }
    const orderExpr = aliases.has(field)
      ? validateSqlIdentifier(field)
      : validateColumn(state, field);
    return `${orderExpr} ${normalizedDirection}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
}

const VALID_JOIN_TYPES = new Set(['inner', 'left']);
const JOIN_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

function buildScope(
  spec: AggregateSpec,
  from: string,
): Set<string> | undefined {
  const joins = spec.joins ?? [];
  if (joins.length === 0 && spec.fromAlias === undefined) return undefined;
  const scope = new Set<string>();
  const claim = (name: string, what: string) => {
    // A non-string could pass the pattern once and render differently later.
    if (typeof name !== 'string' || !JOIN_ALIAS.test(name)) {
      throw new Error(`Invalid aggregate ${what}: ${name}`);
    }
    if (scope.has(name)) {
      throw new Error(`Duplicate aggregate table name or alias: ${name}`);
    }
    scope.add(name);
  };
  if (spec.fromAlias !== undefined) {
    claim(spec.fromAlias, 'from alias');
  } else {
    if (from.includes('.')) {
      throw new Error(
        'AggregateSpec.fromAlias is required when joining a schema-qualified from table',
      );
    }
    claim(from, 'from table');
  }
  for (const join of joins) {
    claim(join.alias, 'join alias');
  }
  return scope;
}

function joinSql(state: BuildState, joins: AggregateJoin[]): string[] {
  return joins.map((join) => {
    const type = join.type ?? 'inner';
    if (!VALID_JOIN_TYPES.has(type)) {
      throw new Error(`Invalid aggregate join type: ${type}`);
    }
    if (join.on === undefined) {
      throw new Error(`Aggregate join ${join.alias} requires an on condition`);
    }
    const table = validateSqlIdentifier(join.table);
    const alias = join.alias;
    if (typeof alias !== 'string' || !JOIN_ALIAS.test(alias)) {
      throw new Error(`Invalid aggregate join alias: ${String(alias)}`);
    }
    const on = renderExpression(state, join.on);
    return `${type === 'left' ? 'LEFT' : 'INNER'} JOIN ${table} AS ${alias} ON ${on}`;
  });
}

export function buildAggregate(
  spec: AggregateSpec,
  startIndex = 1,
  adapterType?: SqlAdapterType,
): AggregateBuildResult {
  const from = validateSqlIdentifier(spec.from);
  if (spec.select.length === 0) {
    throw new Error(
      'AggregateSpec.select must contain at least one expression',
    );
  }
  if (spec.joins !== undefined && !Array.isArray(spec.joins)) {
    throw new Error('AggregateSpec.joins must be an array');
  }

  // Every bound value is numbered in the order it is built (select, joins,
  // where, whereExpr, having, paging) and listed in that order in `values`.
  const values: any[] = [];
  const ctx: ExpressionContext = {
    adapterType,
    nextIndex: startIndex,
    values,
    identifier: validateSqlIdentifier,
  };
  const state: BuildState = { ctx, scope: buildScope(spec, from) };
  ctx.onColumn = (column) => {
    checkColumn(state, column);
  };

  const expressionByAlias = new Map<string, string>();
  const ordinalByAlias = new Map<string, number>();
  const groupingAliases: string[] = [];
  const selectSql = spec.select.map((expr, position) => {
    const selected = selectExpression(expr, adapterType, state);
    expressionByAlias.set(selected.alias, selected.expression);
    // A computed key is grouped by its position in the select list, so a bound
    // parameter in it is not repeated in the GROUP BY.
    if (selected.computed) ordinalByAlias.set(selected.alias, position + 1);
    if (selected.groupingCandidate) {
      groupingAliases.push(selected.alias);
    }
    return `${selected.expression} AS ${selected.alias}`;
  });

  const joinParts = joinSql(state, spec.joins ?? []);

  const where = spec.where
    ? buildWhere(spec.where, ctx.nextIndex, adapterType)
    : { sql: '', values: [] };
  values.push(...where.values);
  ctx.nextIndex += where.values.length;

  let whereSql = where.sql;
  if (spec.whereExpr !== undefined) {
    const predicate = renderExpression(state, spec.whereExpr);
    whereSql = whereSql ? `${whereSql} AND ${predicate}` : `WHERE ${predicate}`;
  }

  const groupByItems = spec.groupBy ?? groupingAliases;
  const groupBySql =
    groupByItems.length > 0
      ? `GROUP BY ${groupByItems
          .map((item) =>
            ordinalByAlias.has(item)
              ? String(ordinalByAlias.get(item))
              : expressionByAlias.has(item)
                ? expressionByAlias.get(item)
                : validateColumn(state, item),
          )
          .join(', ')}`
      : '';

  const having = buildHaving(
    spec.having,
    expressionByAlias,
    ctx.nextIndex,
    adapterType,
  );
  values.push(...having.values);
  ctx.nextIndex += having.values.length;

  const orderBySql = buildOrderBy(
    spec.orderBy,
    state,
    new Set(expressionByAlias.keys()),
  );

  const pagingSql: string[] = [];
  if (spec.limit !== undefined) {
    pagingSql.push(`LIMIT ${placeholder(ctx.nextIndex++)}`);
    values.push(spec.limit);
  } else if (
    spec.offset !== undefined &&
    normalizeAdapter(adapterType) === 'sqlite'
  ) {
    pagingSql.push('LIMIT -1');
  }
  if (spec.offset !== undefined) {
    pagingSql.push(`OFFSET ${placeholder(ctx.nextIndex++)}`);
    values.push(spec.offset);
  }

  const fromSql =
    spec.fromAlias !== undefined
      ? `${from} AS ${validateSqlIdentifier(spec.fromAlias)}`
      : from;
  const sql = [
    `SELECT ${selectSql.join(', ')}`,
    `FROM ${fromSql}`,
    ...joinParts,
    whereSql,
    groupBySql,
    having.sql,
    orderBySql,
    pagingSql.join(' '),
  ]
    .filter(Boolean)
    .join(' ');

  return { sql, values };
}
