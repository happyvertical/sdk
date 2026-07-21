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
  | {
      fn: AggregateFunction;
      column?: string;
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
  select: AggregateSelectExpr[];
  where?: WhereClause;
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
  if (!/^[a-zA-Z0-9_.]+$/.test(identifier)) {
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

function aggregateExpression(
  expr: Extract<AggregateSelectExpr, { fn: AggregateFunction }>,
): string {
  const normalizedFn = String(expr.fn).toLowerCase();
  const fn = validateSqlIdentifier(String(expr.fn)).toUpperCase();
  if (normalizedFn === 'count' && !expr.column) {
    if (expr.distinct) {
      throw new Error(`Aggregate ${expr.fn} with distinct requires a column`);
    }
    return 'COUNT(*)';
  }
  if (!expr.column) {
    throw new Error(`Aggregate ${expr.fn} requires a column`);
  }
  const col = validateSqlIdentifier(expr.column);
  const distinct = expr.distinct ? 'DISTINCT ' : '';
  return `${fn}(${distinct}${col})`;
}

function selectExpression(
  expr: AggregateSelectExpr,
  adapterType: SqlAdapterType | undefined,
): { expression: string; alias: string; groupingCandidate: boolean } {
  if ('column' in expr && !('fn' in expr) && !('bucket' in expr)) {
    const column = validateSqlIdentifier(expr.column);
    const alias = validateSqlIdentifier(expr.as ?? expr.column);
    return { expression: column, alias, groupingCandidate: true };
  }
  if ('bucket' in expr) {
    const expression = bucketExpr(adapterType, expr.bucket, expr.column);
    const alias = validateSqlIdentifier(expr.as);
    return { expression, alias, groupingCandidate: true };
  }

  const expression = aggregateExpression(expr);
  const alias = validateSqlIdentifier(expr.as);
  return { expression, alias, groupingCandidate: false };
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

function buildOrderBy(orderBy: string | string[] | undefined): string {
  if (!orderBy) return '';
  const items = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts = items.map((item) => {
    const [field, direction = 'ASC'] = item.trim().split(/\s+/);
    const normalizedDirection = direction.toUpperCase();
    if (!VALID_DIRECTIONS.has(normalizedDirection)) {
      throw new Error(`Invalid aggregate order direction: ${direction}`);
    }
    const orderExpr = validateSqlIdentifier(field);
    return `${orderExpr} ${normalizedDirection}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
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

  const expressionByAlias = new Map<string, string>();
  const groupingAliases: string[] = [];
  const selectSql = spec.select.map((expr) => {
    const selected = selectExpression(expr, adapterType);
    expressionByAlias.set(selected.alias, selected.expression);
    if (selected.groupingCandidate) {
      groupingAliases.push(selected.alias);
    }
    return `${selected.expression} AS ${selected.alias}`;
  });

  const where = spec.where
    ? buildWhere(spec.where, startIndex, adapterType)
    : { sql: '', values: [] };
  let nextParamIndex = startIndex + where.values.length;

  const groupByItems = spec.groupBy ?? groupingAliases;
  const groupBySql =
    groupByItems.length > 0
      ? `GROUP BY ${groupByItems
          .map((item) =>
            expressionByAlias.has(item)
              ? expressionByAlias.get(item)
              : validateSqlIdentifier(item),
          )
          .join(', ')}`
      : '';

  const having = buildHaving(
    spec.having,
    expressionByAlias,
    nextParamIndex,
    adapterType,
  );
  nextParamIndex += having.values.length;

  const orderBySql = buildOrderBy(spec.orderBy);

  const pagingValues: any[] = [];
  const pagingSql: string[] = [];
  if (spec.limit !== undefined) {
    pagingSql.push(`LIMIT ${placeholder(nextParamIndex++)}`);
    pagingValues.push(spec.limit);
  } else if (
    spec.offset !== undefined &&
    normalizeAdapter(adapterType) === 'sqlite'
  ) {
    pagingSql.push('LIMIT -1');
  }
  if (spec.offset !== undefined) {
    pagingSql.push(`OFFSET ${placeholder(nextParamIndex++)}`);
    pagingValues.push(spec.offset);
  }

  const sql = [
    `SELECT ${selectSql.join(', ')}`,
    `FROM ${from}`,
    where.sql,
    groupBySql,
    having.sql,
    orderBySql,
    pagingSql.join(' '),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    sql,
    values: [...where.values, ...having.values, ...pagingValues],
  };
}
