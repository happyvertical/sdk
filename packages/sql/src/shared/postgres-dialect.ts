/**
 * PostgreSQL dialect logic shared by every adapter that speaks to a Postgres
 * server: the `pg` adapter (`../postgres`) and the PGlite adapter
 * (`../pglite`).
 *
 * Everything here runs on a {@link PostgresQueryExecutor}, so the SQL the two
 * adapters emit is the same code rather than two copies that drift. The module
 * must stay browser-safe: no `node:` built-ins and no import of `pg`, because
 * the PGlite adapter's import graph reaches it.
 */

import { DatabaseError } from '@happyvertical/utils';
import {
  generateAddColumnStatement,
  generateCreateIndexStatement,
  quotePostgresColumnName,
  validateColumnName,
  validateColumnNames,
  validateIndexName,
  validateTableName,
} from './alter-utils';
import type {
  QueryResult as BaseQueryResult,
  ColumnDefinition,
  ColumnDefinitionWithName,
  DatabaseInterface,
  IndexDefinition,
  TableInterface,
  TableSchemaInfo,
  UpsertOptions,
  VectorCapabilities,
  VectorIndexOptions,
  VectorSearchOptions,
  VectorSearchResult,
} from './types';
import {
  buildWhere,
  formatDbError,
  resolveInsertColumns,
  wrapDatabaseError,
} from './utils';

/** The one method every statement runs through. */
export type PostgresQueryExecutor = {
  query: (
    sql: string,
    values?: any[],
  ) => Promise<{ rows: any[]; rowCount: number | null }>;
};

/**
 * Operator for the given distance metric in pgvector
 */
function vectorOperator(metric: 'cosine' | 'l2' | 'ip'): string {
  switch (metric) {
    case 'cosine':
      return '<=>';
    case 'l2':
      return '<->';
    case 'ip':
      return '<#>';
    default:
      return '<=>';
  }
}

function getMaxPostgresParameterIndex(sql: string): number {
  let maxIndex = 0;
  for (const match of sql.matchAll(/\$(\d+)/g)) {
    const index = Number(match[1]);
    if (Number.isSafeInteger(index) && index > maxIndex) {
      maxIndex = index;
    }
  }
  return maxIndex;
}

function usesSingleArrayParameter(sql: string): boolean {
  const identifier = String.raw`(?:"[^"]+"|[a-z_][\w$]*)`;
  const qualifiedIdentifier = String.raw`${identifier}(?:\s*\.\s*${identifier})?`;
  const arrayType = String.raw`${qualifiedIdentifier}(?:\s*\([^)]*\))?\s*\[\]`;

  return (
    new RegExp(String.raw`\$1\s*::\s*${arrayType}`, 'i').test(sql) ||
    new RegExp(
      String.raw`\bCAST\s*\(\s*\$1\s+AS\s+${arrayType}\s*\)`,
      'i',
    ).test(sql) ||
    /\b(?:ANY|ALL|SOME)\s*\(\s*\$1\s*\)/i.test(sql)
  );
}

function normalizeRawQueryValues(sql: string, values: any[]): any[] {
  if (values.length !== 1 || !Array.isArray(values[0])) {
    return values;
  }

  const valuesArray = values[0];
  const maxParameterIndex = getMaxPostgresParameterIndex(sql);

  if (maxParameterIndex === 1 && usesSingleArrayParameter(sql)) {
    return values;
  }

  if (maxParameterIndex === 0 || maxParameterIndex === valuesArray.length) {
    return valuesArray;
  }

  return values;
}

function rewriteQuestionMarkPlaceholders(sql: string): {
  sql: string;
  count: number;
} {
  let output = '';
  let count = 0;
  let index = 0;

  const copyQuoted = (quote: "'" | '"', escaped = false) => {
    output += quote;
    index += 1;

    while (index < sql.length) {
      const char = sql[index];
      output += char;
      index += 1;

      if (escaped && char === '\\' && index < sql.length) {
        output += sql[index];
        index += 1;
        continue;
      }

      if (char === quote) {
        if (sql[index] === quote) {
          output += sql[index];
          index += 1;
          continue;
        }
        break;
      }
    }
  };

  const copyUntil = (end: string) => {
    const endIndex = sql.indexOf(end, index + end.length);
    if (endIndex === -1) {
      output += sql.slice(index);
      index = sql.length;
      return;
    }

    output += sql.slice(index, endIndex + end.length);
    index = endIndex + end.length;
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if ((char === 'E' || char === 'e') && next === "'") {
      output += char;
      index += 1;
      copyQuoted("'", true);
      continue;
    }

    if (char === "'") {
      copyQuoted("'");
      continue;
    }

    if (char === '"') {
      copyQuoted('"');
      continue;
    }

    if (char === '-' && next === '-') {
      const endIndex = sql.indexOf('\n', index + 2);
      if (endIndex === -1) {
        output += sql.slice(index);
        index = sql.length;
      } else {
        output += sql.slice(index, endIndex + 1);
        index = endIndex + 1;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      copyUntil('*/');
      continue;
    }

    if (char === '$') {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][\w$]*\$|^\$\$/);
      if (tag) {
        copyUntil(tag[0]);
        continue;
      }
    }

    if (char === '?' && next !== '|' && next !== '&') {
      count += 1;
      output += `$${count}`;
      index += 1;
      continue;
    }

    output += char;
    index += 1;
  }

  return { sql: output, count };
}

function usesSingleQuestionArrayParameter(sql: string): boolean {
  const identifier = String.raw`(?:"[^"]+"|[a-z_][\w$]*)`;
  const qualifiedIdentifier = String.raw`${identifier}(?:\s*\.\s*${identifier})?`;
  const arrayType = String.raw`${qualifiedIdentifier}(?:\s*\([^)]*\))?\s*\[\]`;

  return (
    new RegExp(String.raw`\?\s*::\s*${arrayType}`, 'i').test(sql) ||
    new RegExp(String.raw`\bCAST\s*\(\s*\?\s+AS\s+${arrayType}\s*\)`, 'i').test(
      sql,
    ) ||
    /\b(?:ANY|ALL|SOME)\s*\(\s*\?\s*\)/i.test(sql)
  );
}

function normalizeQuestionMarkQueryValues(
  sql: string,
  values: any[],
  placeholderCount: number,
): any[] {
  if (values.length !== 1 || !Array.isArray(values[0])) {
    return values;
  }

  if (placeholderCount === 1 && usesSingleQuestionArrayParameter(sql)) {
    return values;
  }

  if (placeholderCount === values[0].length) {
    return values[0];
  }

  return values;
}

export function normalizePostgresRawQuery(
  sql: string,
  values: any[],
): { sql: string; values: any[] } {
  if (getMaxPostgresParameterIndex(sql) > 0) {
    return { sql, values: normalizeRawQueryValues(sql, values) };
  }

  const rewritten = rewriteQuestionMarkPlaceholders(sql);
  const placeholderCount = rewritten.count;
  const queryValues = normalizeQuestionMarkQueryValues(
    sql,
    values,
    placeholderCount,
  );

  if (placeholderCount > 0 && placeholderCount === queryValues.length) {
    return {
      sql: rewritten.sql,
      values: queryValues,
    };
  }

  return { sql, values: normalizeRawQueryValues(sql, values) };
}

/**
 * pgvector index operator class for CREATE INDEX
 */
function vectorOpsClass(metric: 'cosine' | 'l2' | 'ip'): string {
  switch (metric) {
    case 'cosine':
      return 'vector_cosine_ops';
    case 'l2':
      return 'vector_l2_ops';
    case 'ip':
      return 'vector_ip_ops';
    default:
      return 'vector_cosine_ops';
  }
}

/**
 * Convert a number[] to a pgvector literal string: '[0.1,0.2,0.3]'
 */
function toVectorLiteral(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new DatabaseError('Vector embedding must not be empty', {});
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      throw new DatabaseError(
        'Vector embedding contains invalid value (NaN or Infinity)',
        { index: i, value: embedding[i] },
      );
    }
  }
  return `[${embedding.join(',')}]`;
}

/**
 * Creates vector capabilities backed by pgvector for a PostgreSQL pool.
 *
 * @param pool - PostgreSQL connection pool
 * @returns VectorCapabilities implementation
 */
/**
 * `type` is interpolated into `USING <type>`, which cannot be parameterized and
 * is not an identifier the quoting helpers cover. `VectorIndexOptions.type`
 * constrains it at compile time only, so anything reaching this at runtime —
 * a JavaScript caller, or a `filter as VectorIndexOptions` on parsed JSON — has
 * to be checked against the values pgvector actually offers.
 */
const VECTOR_INDEX_TYPES = new Set(['hnsw', 'ivfflat']);

/**
 * `metric` needs the same treatment as `type`, for a less obvious reason.
 *
 * It never reaches SQL directly — `vectorOpsClass`/`vectorOperator` map it
 * through a closed switch with a safe default, so an unknown metric produces a
 * valid operator class. But it is also concatenated into the *generated index
 * name*, which is then interpolated into a quoted identifier, so a metric
 * carrying a `"` still ends that identifier. The safe-default mapping is what
 * makes this easy to miss: the part of the metric that looks dangerous is
 * handled, and the part that is actually dangerous is somewhere else.
 */
const VECTOR_METRICS = new Set(['cosine', 'l2', 'ip']);

export function createVectorCapabilities(
  pool: PostgresQueryExecutor,
): VectorCapabilities {
  return {
    async ensureColumn(
      table: string,
      column: string,
      dimensions: number,
    ): Promise<void> {
      if (!Number.isInteger(dimensions) || dimensions <= 0) {
        throw new DatabaseError(
          'Vector dimensions must be a positive integer',
          { dimensions },
        );
      }
      validateTableName(table);
      validateColumnName(column);
      try {
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
        await pool.query(
          `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" vector(${dimensions})`,
        );
      } catch (e) {
        throw new DatabaseError('Failed to ensure vector column', {
          table,
          column,
          dimensions,
          originalError: formatDbError(e),
        });
      }
    },

    async ensureIndex(
      table: string,
      column: string,
      options?: VectorIndexOptions,
    ): Promise<void> {
      validateTableName(table);
      validateColumnName(column);
      const metric = options?.metric || 'cosine';
      const indexType = options?.type || 'hnsw';
      if (!VECTOR_INDEX_TYPES.has(indexType)) {
        throw new DatabaseError('Unsupported vector index type', {
          table,
          column,
          type: indexType,
          supported: [...VECTOR_INDEX_TYPES],
        });
      }
      if (!VECTOR_METRICS.has(metric)) {
        throw new DatabaseError('Unsupported vector metric', {
          table,
          column,
          metric,
          supported: [...VECTOR_METRICS],
        });
      }
      const opsClass = vectorOpsClass(metric);
      // Every part is now either a validated identifier or one of a closed set,
      // so the generated name cannot carry SQL of its own.
      const indexName = `idx_${table}_${column}_${metric}_${indexType}`;

      try {
        await pool.query(
          `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${table}" USING ${indexType} ("${column}" ${opsClass})`,
        );
      } catch (e) {
        throw new DatabaseError('Failed to ensure vector index', {
          table,
          column,
          indexName,
          originalError: formatDbError(e),
        });
      }
    },

    async upsertVector(
      table: string,
      where: Record<string, any>,
      column: string,
      embedding: number[],
    ): Promise<void> {
      validateTableName(table);
      validateColumnName(column);
      const keys = Object.keys(where);
      validateColumnNames(keys);
      const values = Object.values(where);
      const conditions = keys
        .map((key, i) => `"${key}" IS NOT DISTINCT FROM $${i + 1}`)
        .join(' AND ');
      const vectorParam = `$${values.length + 1}`;

      try {
        await pool.query(
          `UPDATE "${table}" SET "${column}" = ${vectorParam}::vector WHERE ${conditions}`,
          [...values, toVectorLiteral(embedding)],
        );
      } catch (e) {
        throw new DatabaseError('Failed to upsert vector', {
          table,
          column,
          where,
          originalError: formatDbError(e),
        });
      }
    },

    async search(
      table: string,
      column: string,
      embedding: number[],
      options?: VectorSearchOptions,
    ): Promise<VectorSearchResult[]> {
      validateTableName(table);
      validateColumnName(column);
      const metric = options?.metric || 'cosine';
      const limit = options?.limit || 10;
      const op = vectorOperator(metric);

      // $1 is the query vector; user-provided WHERE params use $2, $3, etc.
      const queryParams: any[] = [toVectorLiteral(embedding)];

      let whereClause = `"${column}" IS NOT NULL`;
      if (options?.where) {
        // `options.where` is raw SQL by design, the same documented
        // developer-controlled boundary as `buildWhere`'s operator-suffix keys.
        // It is not validated here; use `options.params` for anything that came
        // from outside the process.
        whereClause += ` AND (${options.where})`;
        if (options.params) {
          queryParams.push(...options.params);
        }
      }

      const limitParam = `$${queryParams.length + 1}`;
      queryParams.push(limit);

      const sql = `SELECT *, ("${column}" ${op} $1::vector) AS distance FROM "${table}" WHERE ${whereClause} ORDER BY "${column}" ${op} $1::vector LIMIT ${limitParam}`;

      try {
        const result = await pool.query(sql, queryParams);

        return result.rows.map((row: Record<string, any>) => ({
          ...row,
          id: row.id as string,
          distance: Number.parseFloat(row.distance),
        }));
      } catch (e) {
        throw new DatabaseError('Failed to execute vector search', {
          table,
          column,
          metric,
          limit,
          originalError: formatDbError(e),
        });
      }
    },
  };
}

/**
 * Keeps the first PostgreSQL statement failure attached to a transaction.
 *
 * PostgreSQL reports every later statement in an aborted transaction as
 * 25P02. Replacing the first failure with that generic state error hides the
 * actionable code and diagnostics from callers, so the tracker rethrows the
 * first failure whenever PostgreSQL reports 25P02, and exposes the recorded
 * failure so a swallowed statement error cannot make COMMIT's implicit
 * rollback look successful: PostgreSQL answers COMMIT on an aborted
 * transaction with a ROLLBACK tag and no error.
 *
 * @param isStatementError - Recognizes the driver's server-reported error
 *   class (`pg`'s or PGlite's `DatabaseError`). Anything else is an
 *   unconfirmed failure — it may be the transport, not the statement.
 */
export function createTransactionErrorTracker(
  isStatementError: (error: unknown) => boolean,
) {
  let firstError: unknown;
  let firstUnconfirmedError: unknown;
  const pending = new Set<Promise<unknown>>();

  const isRollbackToSavepoint = (query: unknown): boolean => {
    const sql =
      typeof query === 'string'
        ? query
        : typeof query === 'object' &&
            query !== null &&
            'text' in query &&
            typeof query.text === 'string'
          ? query.text
          : undefined;
    if (sql === undefined) return false;

    let statement = sql.trimStart();
    while (statement.startsWith('--') || statement.startsWith('/*')) {
      if (statement.startsWith('--')) {
        const newline = statement.search(/[\r\n]/);
        if (newline === -1) return false;
        statement = statement.slice(newline + 1).trimStart();
        continue;
      }
      const commentEnd = statement.indexOf('*/', 2);
      if (commentEnd === -1) return false;
      statement = statement.slice(commentEnd + 2).trimStart();
    }
    return /^ROLLBACK\s+TO(?:\s+SAVEPOINT)?\s+/i.test(statement);
  };

  const errorCode = (error: unknown): string | undefined => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
    ) {
      return error.code;
    }
    return undefined;
  };

  /** Records a failure and returns the error the caller should see. */
  const preserve = (error: unknown): unknown => {
    if (errorCode(error) === '25P02' && firstError !== undefined) {
      return firstError;
    }
    if (errorCode(error) === '25P02' && firstUnconfirmedError !== undefined) {
      return firstUnconfirmedError;
    }
    if (isStatementError(error)) {
      firstError ??= error;
    } else {
      firstUnconfirmedError ??= error;
    }
    return error;
  };

  /**
   * Records that a statement succeeded. A successful rollback to a savepoint
   * restores the transaction to the state at that savepoint, so a recorded
   * statement failure has been contained.
   */
  const confirm = (query: unknown): void => {
    if (isRollbackToSavepoint(query)) firstError = undefined;
    firstUnconfirmedError = undefined;
  };

  const track = <T>(operation: Promise<T>, query: unknown): Promise<T> => {
    const tracked = operation
      .then((result) => {
        confirm(query);
        return result;
      })
      .catch((error) => {
        throw preserve(error);
      });
    pending.add(tracked);
    void tracked.finally(() => pending.delete(tracked)).catch(() => {});
    return tracked;
  };

  return {
    pending,
    preserve,
    confirm,
    track,
    clearError: () => {
      firstError = undefined;
    },
    drain: async () => {
      while (pending.size > 0) {
        await Promise.allSettled([...pending]);
      }
    },
    getError: () => firstError,
    getUnconfirmedError: () => firstUnconfirmedError,
  };
}

/**
 * What an adapter supplies to the shared dialect.
 */
export interface PostgresDialectHost {
  /** Executor for statements outside any transaction. */
  client: PostgresQueryExecutor;

  /**
   * Runs `work` inside a short transaction of its own. Used by a null-aware
   * upsert issued outside a transaction, which needs its advisory lock and the
   * following update/insert to share one.
   */
  runInTransaction<T>(
    work: (executor: PostgresQueryExecutor) => Promise<T>,
  ): Promise<T>;

  /**
   * Executor for read-only catalog probes (server version, index flags).
   *
   * A pooled adapter answers with the pool, so a failing probe cannot abort the
   * caller's transaction. A single-connection adapter has no second connection
   * and must answer with the executor it was handed.
   */
  probeExecutor(executor: PostgresQueryExecutor): PostgresQueryExecutor;
}

/** One level of nested-transaction queueing. */
export interface NestedScope {
  tail: Promise<void>;
}

/**
 * Ambient scope tracking for nested transactions.
 *
 * With one, a nested callback may call the *outer* transaction handle and still
 * be queued under its own scope (the `pg` adapter uses `AsyncLocalStorage`).
 * Without one (browsers have no `AsyncLocalStorage`), each nested callback is
 * handed a handle bound to its own scope instead, so nested work must use the
 * handle it is given.
 */
export interface NestedScopeContext {
  getStore(): NestedScope | undefined;
  run<R>(scope: NestedScope, fn: () => R): R;
}

export type NestedTransaction = (<T>(
  callback: (tx: DatabaseInterface) => Promise<T>,
) => Promise<T>) & {
  drain: () => Promise<void>;
};

/**
 * Creates the dialect: every statement-level method plus nested-transaction
 * and schema-introspection builders, all bound to `host`.
 */
export function createPostgresDialect(host: PostgresDialectHost) {
  // Names nested savepoints. Only ever appended to an identifier the adapter
  // generates, never caller input.
  let savepointSequence = 0;

  /**
   * Serializes a value for database storage
   * Converts objects and arrays to JSON strings
   * Converts Dates to ISO strings
   * Passes through primitives unchanged
   */
  const serializeValue = (value: any): any => {
    if (value === null || value === undefined) {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (ArrayBuffer.isView(value)) {
      return value;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return value;
  };

  /**
   * Serializes all values in an object for database storage
   */
  const serializeRecord = (
    record: Record<string, any>,
  ): Record<string, any> => {
    const serialized: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
      // Skip undefined values - they cannot be passed to the database
      if (value === undefined) {
        continue;
      }
      serialized[key] = serializeValue(value);
    }
    return serialized;
  };
  let serverVersionNumPromise: Promise<number> | undefined;
  const nullsNotDistinctIndexCache = new Map<string, Promise<boolean>>();

  const hasNullConflictValue = (
    conflictColumns: string[],
    data: Record<string, any>,
  ): boolean => conflictColumns.some((col) => data[col] === null);

  const validateUpsertConflictColumns = (
    table: string,
    conflictColumns: string[],
    serializedData: Record<string, any>,
  ): void => {
    const missingColumns = conflictColumns.filter(
      (col) => !(col in serializedData),
    );

    if (missingColumns.length > 0) {
      throw new DatabaseError('Conflict columns missing from data', {
        table,
        conflictColumns,
        missingColumns,
        availableColumns: Object.keys(serializedData),
        hint: 'All columns specified in ON CONFLICT must be present in the data being inserted. Undefined values should be replaced with null or an appropriate default.',
      });
    }
  };

  const getServerVersionNum = async (
    executor: PostgresQueryExecutor,
  ): Promise<number> => {
    serverVersionNumPromise ??= executor
      .query('SHOW server_version_num')
      .then((result) => Number(result.rows[0]?.server_version_num) || 0);
    return serverVersionNumPromise;
  };

  const hasNativeNullsNotDistinctIndex = async (
    executor: PostgresQueryExecutor,
    table: string,
    conflictColumns: string[],
  ): Promise<boolean> => {
    const versionNum = await getServerVersionNum(executor);
    if (versionNum < 150000) return false;

    const cacheKey = `${table}:${conflictColumns.join(',')}`;
    let cached = nullsNotDistinctIndexCache.get(cacheKey);
    if (!cached) {
      cached = executor
        .query(
          `
            SELECT 1
            FROM pg_index i
            WHERE i.indrelid = to_regclass($1)
              AND i.indisunique
              AND i.indnullsnotdistinct
              AND ARRAY(
                SELECT a.attname::text
                FROM unnest(i.indkey) WITH ORDINALITY AS cols(attnum, ord)
                JOIN pg_attribute a
                  ON a.attrelid = i.indrelid
                 AND a.attnum = cols.attnum
                ORDER BY cols.ord
              ) = $2::text[]
            LIMIT 1
          `,
          [table, conflictColumns],
        )
        .then((result) => result.rows.length > 0)
        .catch(() => false);
      nullsNotDistinctIndexCache.set(cacheKey, cached);
    }

    return cached;
  };

  const buildPostgresUpsertParts = (
    conflictColumns: string[],
    serializedData: Record<string, any>,
  ) => {
    const keys = Object.keys(serializedData);
    const columns = keys.map(quotePostgresColumnName);
    const values = Object.values(serializedData);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet = columns
      .map((column, i) => `${column} = $${i + 1}`)
      .join(', ');
    const conflict = conflictColumns.map(quotePostgresColumnName).join(', ');

    return { columns, values, placeholders, updateSet, conflict };
  };

  const executeStandardPostgresUpsert = async (
    executor: PostgresQueryExecutor,
    table: string,
    conflictColumns: string[],
    serializedData: Record<string, any>,
  ): Promise<BaseQueryResult> => {
    const { columns, values, placeholders, updateSet, conflict } =
      buildPostgresUpsertParts(conflictColumns, serializedData);
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;
    const result = await executor.query(sql, values);
    return { operation: 'upsert', affected: result.rowCount ?? 0 };
  };

  const executeNullAwarePostgresUpsert = async (
    executor: PostgresQueryExecutor,
    table: string,
    conflictColumns: string[],
    serializedData: Record<string, any>,
  ): Promise<BaseQueryResult> => {
    const { columns, values, placeholders, updateSet } =
      buildPostgresUpsertParts(conflictColumns, serializedData);
    const lockKey = conflictColumns
      .map((col) => `${col}:${JSON.stringify(serializedData[col])}`)
      .join('|');

    await executor.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [`@happyvertical/sql.upsert:${table}`, lockKey],
    );

    const whereStart = values.length + 1;
    const whereClause = conflictColumns
      .map(
        (col, i) =>
          `${quotePostgresColumnName(col)} IS NOT DISTINCT FROM $${whereStart + i}`,
      )
      .join(' AND ');
    const whereValues = conflictColumns.map((col) => serializedData[col]);
    const updateSql = `UPDATE ${table} SET ${updateSet} WHERE ${whereClause}`;
    const updateResult = await executor.query(updateSql, [
      ...values,
      ...whereValues,
    ]);

    if ((updateResult.rowCount ?? 0) > 0) {
      return { operation: 'upsert', affected: updateResult.rowCount ?? 0 };
    }

    const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const insertResult = await executor.query(insertSql, values);
    return { operation: 'upsert', affected: insertResult.rowCount ?? 0 };
  };
  const executePostgresUpsert = async (
    executor: PostgresQueryExecutor,
    table: string,
    conflictColumns: string[],
    serializedData: Record<string, any>,
    options: UpsertOptions | undefined,
    acquireTransaction: boolean,
  ): Promise<BaseQueryResult> => {
    validateUpsertConflictColumns(table, conflictColumns, serializedData);

    if (
      options?.nullsDistinct ||
      !hasNullConflictValue(conflictColumns, serializedData)
    ) {
      return executeStandardPostgresUpsert(
        executor,
        table,
        conflictColumns,
        serializedData,
      );
    }

    if (
      await hasNativeNullsNotDistinctIndex(
        host.probeExecutor(executor),
        table,
        conflictColumns,
      )
    ) {
      return executeStandardPostgresUpsert(
        executor,
        table,
        conflictColumns,
        serializedData,
      );
    }

    if (!acquireTransaction) {
      return executeNullAwarePostgresUpsert(
        executor,
        table,
        conflictColumns,
        serializedData,
      );
    }

    return host.runInTransaction((transactionExecutor) =>
      executeNullAwarePostgresUpsert(
        transactionExecutor,
        table,
        conflictColumns,
        serializedData,
      ),
    );
  };
  /**
   * Template and values extracted from a tagged template literal
   */
  interface SqlTemplate {
    /**
     * SQL query with parameter placeholders
     */
    sql: string;

    /**
     * Values to use as parameters
     */
    values: any[];
  }

  /**
   * Parses a tagged template literal into a SQL query and values
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Object with SQL query and values array
   */
  const parseTemplate = (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): SqlTemplate => {
    let sql = strings[0];
    const values = [];
    for (let i = 0; i < vars.length; i++) {
      values.push(vars[i]);
      sql += `$${i + 1}${strings[i + 1]}`;
    }
    return { sql, values };
  };
  /**
   * Builds the complete set of query methods bound to one PostgreSQL client.
   *
   * The pool-backed interface and every transaction-scoped interface are
   * instantiated from this one factory, so there is exactly one implementation
   * of each method. The transaction interfaces used to be hand-maintained
   * copies of these bodies, and both had drifted:
   *
   * - they called the client bare, so a failure inside a transaction threw the
   *   raw `pg` error rather than `DatabaseError`, and `instanceof` answered
   *   differently depending on whether the call was in a transaction. `pg`
   *   exports its own class also named `DatabaseError`, so nothing a developer
   *   would check by eye showed the difference (#1115);
   * - they re-exposed `tableExists` and `syncSchema` from the enclosing scope,
   *   which close over the *pool*. Both therefore ran on a different connection
   *   than the transaction, so `tx.tableExists()` could not see a table created
   *   in the same transaction and `tx.syncSchema()` committed its DDL
   *   immediately, surviving a rollback (#1111).
   *
   * Binding a client is the only difference between the two, so it is the only
   * thing this factory parameterizes.
   *
   * @param executor - Pool or checked-out client every statement runs on
   * @param inTransaction - Whether `executor` is already inside a transaction
   * @param serialize - Applied to each record before `insert`/`update` builds
   *   its SQL
   * @param clearTransactionError - Clears a statement error after a savepoint
   *   has successfully restored the transaction to a usable state
   */
  const createClientMethods = (
    executor: PostgresQueryExecutor,
    inTransaction: boolean,
    serialize: (record: Record<string, any>) => Record<string, any>,
    clearTransactionError: () => void = () => {},
  ) => {
    /**
     * Inserts one or more records into a table
     *
     * @param table - Table name
     * @param data - Single record or array of records to insert
     * @returns Promise resolving to operation result
     * @throws Error if the insert operation fails
     *
     * @example Single record insert:
     * ```typescript
     * await db.insert('users', {
     *   name: 'John Doe',
     *   email: 'john@example.com'
     * });
     * ```
     *
     * @example Multiple record insert:
     * ```typescript
     * await db.insert('users', [
     *   { name: 'John', email: 'john@example.com' },
     *   { name: 'Jane', email: 'jane@example.com' }
     * ]);
     * ```
     */
    const insert = async (
      table: string,
      data: Record<string, any> | Record<string, any>[],
    ): Promise<BaseQueryResult> => {
      validateTableName(table);
      // If data is an array, we need to handle multiple rows
      if (Array.isArray(data)) {
        if (data.length === 0) {
          return { operation: 'insert', affected: 0 };
        }
        // Serialize all records in the array
        const serializedRecords = data.map((record) => serialize(record));
        const keys = resolveInsertColumns(table, serializedRecords);
        validateColumnNames(keys);
        const placeholders = serializedRecords
          .map(
            (_, i) =>
              `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(', ')})`,
          )
          .join(', ');
        const query = `INSERT INTO ${table} (${keys.join(
          ', ',
        )}) VALUES ${placeholders}`;
        // Project through `keys` rather than each record's own key order, so a
        // record whose keys were inserted in a different order still binds each
        // value to its own column.
        const values = serializedRecords.flatMap((row) =>
          keys.map((key) => row[key]),
        );
        const result = await executor.query(query, values);
        return { operation: 'insert', affected: result.rowCount ?? 0 };
      }
      // If data is an object, we handle a single row
      const serializedData = serialize(data);
      const keys = Object.keys(serializedData);
      validateColumnNames(keys);
      const values = Object.values(serializedData);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO ${table} (${keys.join(
        ', ',
      )}) VALUES (${placeholders})`;
      const result = await executor.query(query, values);
      return { operation: 'insert', affected: result.rowCount ?? 0 };
    };

    /**
     * Retrieves a single record matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to query result
     */
    const get = async (
      table: string,
      where: Record<string, any>,
    ): Promise<Record<string, any> | null> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildWhere(where, 1, 'postgres');
      if (!whereClause) {
        throw new DatabaseError(
          'GET requires at least one WHERE condition to prevent returning an arbitrary record',
          { table },
        );
      }

      const query = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = await executor.query(query, values);
        return result.rows[0] || null;
      } catch (e) {
        throw new DatabaseError('Failed to retrieve record from table', {
          table,
          sql: query,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Retrieves multiple records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to array of records
     */
    const list = async (
      table: string,
      where: Record<string, any>,
    ): Promise<Record<string, any>[]> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildWhere(where, 1, 'postgres');
      const query = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = await executor.query(query, values);
        return result.rows;
      } catch (e) {
        throw new DatabaseError('Failed to list records from table', {
          table,
          sql: query,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Updates records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records to update
     * @param data - New data to set
     * @returns Promise resolving to operation result
     */
    const update = async (
      table: string,
      where: Record<string, any>,
      data: Record<string, any>,
    ): Promise<BaseQueryResult> => {
      validateTableName(table);
      // Serialize the data to update
      const serializedData = serialize(data);
      const keys = Object.keys(serializedData);
      validateColumnNames(keys);
      const values = Object.values(serializedData);
      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
      const { sql: whereClause, values: whereValues } = buildWhere(
        where,
        values.length + 1,
        'postgres',
      );
      if (!whereClause) {
        throw new DatabaseError(
          'UPDATE requires at least one WHERE condition to prevent accidental update of all records',
          { table },
        );
      }

      const sql = `UPDATE ${table} SET ${setClause} ${whereClause}`;
      try {
        const result = await executor.query(sql, [...values, ...whereValues]);
        return { operation: 'update', affected: result.rowCount ?? 0 };
      } catch (e) {
        throw new DatabaseError('Failed to update records in table', {
          table,
          sql,
          values: [...values, ...whereValues],
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Inserts a record or updates it if it already exists (UPSERT)
     *
     * @param table - Table name
     * @param conflictColumns - Columns that define the uniqueness constraint
     * @param data - Data to insert or update
     * @returns Promise resolving to operation result
     * @throws Error if the upsert operation fails
     */
    const upsert = async (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
      options?: UpsertOptions,
    ): Promise<BaseQueryResult> => {
      validateTableName(table);
      // Snapshot both identifier sources once and validate the snapshots — the
      // exact arrays the executors interpolate — outside the try. `data` is
      // serialized (a plain-object snapshot) and `conflictColumns` is copied,
      // so neither a hostile record nor a hostile conflict-column array can
      // present different identifiers to the check and the SQL renderer. An
      // invalid identifier surfaces by name rather than as the generic wrapper
      // below; PostgreSQL columns are lowercased and quoted after validation.
      const serializedData = serializeRecord(data);
      const conflictCols = [...conflictColumns];
      validateColumnNames([...conflictCols, ...Object.keys(serializedData)]);
      try {
        return await executePostgresUpsert(
          executor,
          table,
          conflictCols,
          serializedData,
          options,
          // A transaction-scoped upsert is already inside a transaction; opening
          // a second one on another pooled connection would deadlock against it.
          !inTransaction,
        );
      } catch (e) {
        if (
          e instanceof DatabaseError &&
          e.message === 'Conflict columns missing from data'
        ) {
          throw e;
        }

        throw new DatabaseError('Failed to upsert record into table', {
          table,
          values: data,
          conflictColumns,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Gets a record matching the where criteria or inserts it if not found
     *
     * @param table - Table name
     * @param where - Criteria to match existing record
     * @returns Promise resolving to the query result or insert result
     */
    const getOrInsert = async (
      table: string,
      where: Record<string, any>,
      data: Record<string, any>,
    ): Promise<Record<string, any>> => {
      validateTableName(table);
      const result = await get(table, where);
      if (result) return result;
      await insert(table, data);

      const inserted = await get(table, where);
      if (!inserted) {
        throw new DatabaseError('Failed to insert and retrieve record', {
          table,
          where,
          data,
        });
      }
      return inserted;
    };

    /**
     * Deletes records from a table matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records for deletion
     * @returns Promise resolving to operation result with count of deleted rows
     * @throws Error if the delete operation fails
     */
    const deleteRecords = async (
      table: string,
      where: Record<string, any>,
    ): Promise<BaseQueryResult> => {
      validateTableName(table);

      const keys = Object.keys(where);
      if (keys.length === 0) {
        throw new DatabaseError(
          'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
          { table },
        );
      }

      const { sql: whereClause, values } = buildWhere(where, 1, 'postgres');

      try {
        const result = await executor.query(
          `DELETE FROM ${table} ${whereClause}`,
          values,
        );

        return { operation: 'delete', affected: result.rowCount ?? 0 };
      } catch (e) {
        throw new DatabaseError('Failed to delete records from table', {
          table,
          where,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Counts records in a table matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records (optional, counts all if omitted)
     * @returns Promise resolving to count of matching records
     * @throws Error if the count operation fails
     */
    const count = async (
      table: string,
      where?: Record<string, any>,
    ): Promise<number> => {
      validateTableName(table);

      try {
        if (!where || Object.keys(where).length === 0) {
          // Count all records
          const result = await executor.query(
            `SELECT COUNT(*) as count FROM ${table}`,
          );
          return Number(result.rows[0]?.count) || 0;
        }

        // Count with conditions
        const { sql: whereClause, values } = buildWhere(where, 1, 'postgres');

        const result = await executor.query(
          `SELECT COUNT(*) as count FROM ${table} ${whereClause}`,
          values,
        );

        return Number(result.rows[0]?.count) || 0;
      } catch (e) {
        throw new DatabaseError('Failed to count records in table', {
          table,
          where,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Creates a table-specific interface for simplified table operations
     *
     * @param tableName - Table name
     * @returns TableMethods interface for the specified table
     */
    const table = (tableName: string): TableInterface => {
      return {
        insert: (data) => insert(tableName, data),
        get: (data) => get(tableName, data),
        list: (data) => list(tableName, data),
      };
    };

    /**
     * Executes a SQL query using template literals and returns a single value
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single value (first column of first row)
     */
    const pluck = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<any> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await executor.query(sql, values);
        const firstRow = result.rows[0];
        if (!firstRow) return null;
        // Return the first column value from the first row
        return Object.values(firstRow)[0];
      } catch (e) {
        throw new DatabaseError('Failed to execute pluck query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a SQL query using template literals and returns a single row
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single result record or null
     */
    const single = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<Record<string, any> | null> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await executor.query(sql, values);
        return result.rows[0] || null;
      } catch (e) {
        throw new DatabaseError('Failed to execute single query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a SQL query using template literals and returns multiple rows
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to array of result records
     */
    const many = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<Record<string, any>[]> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await executor.query(sql, values);
        return result.rows;
      } catch (e) {
        throw new DatabaseError('Failed to execute many query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a SQL query using template literals without returning results
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise that resolves when the query completes
     */
    const execute = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<void> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        await executor.query(sql, values);
      } catch (e) {
        throw new DatabaseError('Failed to execute query', {
          sql,
          values,
          originalError: formatDbError(e),
        });
      }
    };

    /**
     * Executes a raw SQL query with parameterized values
     *
     * Uses PostgreSQL-native placeholders ($1, $2, ...). Legacy ? placeholders
     * are converted only when the placeholder count matches the supplied values,
     * so Postgres operators such as JSONB ? remain intact.
     *
     * @param sql - SQL query string
     * @param values - Variables to use as parameters
     * @returns Promise resolving to query result with rows and count
     */
    const query = async (
      sql: string,
      ...values: any[]
    ): Promise<{ rows: Record<string, any>[]; rowCount: number }> => {
      const query = normalizePostgresRawQuery(sql, values);
      try {
        const result = await executor.query(query.sql, query.values);
        // A successful rollback to a caller-managed savepoint restores the
        // transaction to the state at that savepoint, so any recorded
        // statement failure has been contained and must no longer poison the
        // enclosing commit. This mirrors the adapter-managed savepoint paths.
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? 0,
        };
      } catch (e) {
        throw wrapDatabaseError('Failed to execute raw query', e, {
          sql: query.sql,
          values: query.values,
        });
      }
    };

    /**
     * Checks if a table exists in the database
     *
     * @param tableName - Name of the table to check
     * @returns Promise resolving to boolean indicating if the table exists
     */
    const tableExists = async (tableName: string): Promise<boolean> => {
      const result = await executor.query(
        `SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = $1
            AND table_schema = (
              SELECT namespace.nspname
              FROM pg_catalog.pg_class AS relation
              JOIN pg_catalog.pg_namespace AS namespace
                ON namespace.oid = relation.relnamespace
              WHERE relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident($1))
            )
        )`,
        [tableName],
      );
      return result.rows[0].exists;
    };

    /**
     * Synchronizes database schema with provided SQL DDL
     * Creates tables if they don't exist and adds missing columns
     * Also executes CREATE INDEX statements
     *
     * @param schema - SQL schema definition with CREATE TABLE and CREATE INDEX statements
     * @returns Promise that resolves when schema is synchronized
     */
    /**
     * Runs a step whose failure `syncSchema` deliberately tolerates.
     *
     * Logging and continuing is self-contained on the pool. Inside a
     * transaction it is not: a failed statement puts PostgreSQL in the aborted
     * state, and `COMMIT` on an aborted transaction *succeeds* — it reports a
     * ROLLBACK command tag and no error. The caller is told the transaction
     * committed while every write in it was discarded, which is the silent
     * data loss this whole epic is about, re-entering through the schema path.
     *
     * A savepoint scopes the failure to the step, which is what "log it and
     * continue" was always supposed to mean.
     */
    const runTolerated = async <T>(work: () => Promise<T>): Promise<T> => {
      if (!inTransaction) {
        return work();
      }
      savepointSequence += 1;
      const name = `hv_sync_${savepointSequence}`;
      await executor.query(`SAVEPOINT ${name}`);
      try {
        const result = await work();
        await executor.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        // ROLLBACK TO leaves the savepoint defined, so release it too.
        await executor.query(`ROLLBACK TO SAVEPOINT ${name}`);
        clearTransactionError();
        await executor.query(`RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    };

    const syncSchema = async (schema: string): Promise<void> => {
      const commands = schema
        .trim()
        .split(';')
        .filter((command) => command.trim() !== '');

      // Match CREATE INDEX statements (Issues #867 and #1040).
      // Named groups keep optional clauses from shifting identifier captures.
      const createIndexRegex =
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?(?<indexName>\w+)"?\s+ON\s+"?(?<tableName>\w+)"?\s*(?:USING\s+"?\w+"?\s*)?\([^)]+\)/i;
      const parseCreateIndex = (
        command: string,
      ): { indexName: string; tableName: string } | null => {
        const { indexName, tableName } =
          command.match(createIndexRegex)?.groups ?? {};
        return indexName && tableName ? { indexName, tableName } : null;
      };

      // Pre-scan commands to collect all index names for batch existence check (Issue #798)
      const indexTargets: Array<{ indexName: string; tableName: string }> = [];
      for (const command of commands) {
        const indexMatch = parseCreateIndex(command.trim());
        if (indexMatch) {
          indexTargets.push(indexMatch);
        }
      }

      // Resolve each table through the executor's search_path. Index names are
      // only unique within a schema, so a name-only public lookup can suppress
      // a needed index when another schema has the same name.
      const existingIndexes = new Set<string>();
      if (indexTargets.length > 0) {
        const result = await executor.query(
          `SELECT target.table_name, target.index_name
           FROM unnest($1::text[], $2::text[])
             AS target(table_name, index_name)
           JOIN pg_catalog.pg_class AS relation
             ON relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident(target.table_name))
           JOIN pg_catalog.pg_namespace AS namespace
             ON namespace.oid = relation.relnamespace
           JOIN pg_catalog.pg_indexes AS existing
             ON existing.schemaname = namespace.nspname
             AND existing.tablename = target.table_name
             AND existing.indexname = target.index_name`,
          [
            indexTargets.map((target) => target.tableName),
            indexTargets.map((target) => target.indexName),
          ],
        );
        for (const row of result.rows) {
          existingIndexes.add(`${row.table_name}\u0000${row.index_name}`);
        }
      }

      for (const command of commands) {
        const trimmedCommand = command.trim();

        // Match CREATE TABLE with optional quotes around table name
        // Supports: CREATE TABLE foo, CREATE TABLE "foo", CREATE TABLE IF NOT EXISTS "foo"
        const createTableRegex =
          /CREATE TABLE (IF NOT EXISTS )?"?(\w+)"? \(([\s\S]+)\)/i;
        const tableMatch = trimmedCommand.match(createTableRegex);

        if (tableMatch) {
          const tableName = tableMatch[2];
          const columns = tableMatch[3].trim().split(',\n');

          // Check if table exists
          const exists = await tableExists(tableName);

          if (!exists) {
            // Table doesn't exist, create it
            await executor.query(trimmedCommand);
          } else {
            // Table exists, check for missing columns
            for (const column of columns) {
              const columnDef = column.trim();
              // Table constraints are not column definitions. In particular,
              // a quoted constraint name would otherwise let the unanchored
              // column matcher start at that name and generate an invalid
              // ADD COLUMN statement.
              if (
                /^(?:CONSTRAINT\s+(?:"(?:[^"]|"")*"|\w+)\s+)?(?:(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b|EXCLUDE(?=\s+(?:USING\b|\()))/i.test(
                  columnDef,
                )
              ) {
                continue;
              }
              // Match column name with optional quotes: "id" or id
              const columnMatch = columnDef.match(
                /^("(?:[^"]|"")*"|\w+)\s+\w+[^,]*/,
              );

              if (columnMatch) {
                const identifier = columnMatch[1];
                const columnName = identifier.startsWith('"')
                  ? identifier.slice(1, -1).replace(/""/g, '"')
                  : identifier;

                // Skip constraint definitions
                if (
                  columnName.toUpperCase() === 'PRIMARY' ||
                  columnName.toUpperCase() === 'FOREIGN' ||
                  columnName.toUpperCase() === 'UNIQUE' ||
                  columnName.toUpperCase() === 'CHECK' ||
                  columnName.toUpperCase() === 'CONSTRAINT'
                ) {
                  continue;
                }

                try {
                  await runTolerated(async () => {
                    // Check if column exists
                    const columnExists = await executor.query(
                      `SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = $1
                        AND column_name = $2
                        AND table_schema = (
                          SELECT namespace.nspname
                          FROM pg_catalog.pg_class AS relation
                          JOIN pg_catalog.pg_namespace AS namespace
                            ON namespace.oid = relation.relnamespace
                          WHERE relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident($1))
                        )
                      )`,
                      [tableName, columnName],
                    );

                    if (!columnExists.rows[0].exists) {
                      // Column doesn't exist, add it
                      // Quote the table name for safety
                      const alterCommand = `ALTER TABLE "${tableName}" ADD COLUMN ${columnDef}`;
                      await executor.query(alterCommand);
                    }
                  });
                } catch (error) {
                  // If there's an error checking/adding the column, log it but continue
                  console.error(
                    `Error adding column ${columnName} to ${tableName}:`,
                    error,
                  );
                }
              }
            }
          }
          continue;
        }

        const indexMatch = parseCreateIndex(trimmedCommand);

        if (indexMatch) {
          const { indexName, tableName: indexTableName } = indexMatch;

          // Use pre-fetched batch result instead of per-index query
          const indexKey = `${indexTableName}\u0000${indexName}`;
          if (!existingIndexes.has(indexKey)) {
            try {
              await runTolerated(() => executor.query(trimmedCommand));
              // Track newly created index for idempotency within this call
              existingIndexes.add(indexKey);
            } catch (error) {
              // Log error but continue - index creation failures shouldn't block schema sync
              console.warn(
                `Warning: Failed to create index ${indexName} on ${indexTableName}:`,
                error instanceof Error ? error.message : String(error),
              );
            }
          }
          continue;
        }

        // For any other DDL statements (like other CREATE commands), try to execute them
        // This provides forward compatibility for future DDL types
        if (
          trimmedCommand.toUpperCase().startsWith('CREATE ') &&
          !trimmedCommand.toUpperCase().includes('CREATE TABLE')
        ) {
          try {
            await runTolerated(() => executor.query(trimmedCommand));
          } catch (error) {
            // Log but don't fail - the statement may have already been executed
            console.warn(
              `Warning: DDL statement may have failed:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }
    };

    // Shorthand aliases for query methods
    const oo = many; // (o)bjective-(o)bjects: returns multiple rows
    const oO = single; // (o)bjective-(O)bject: returns a single row
    const ox = pluck; // (o)bjective-(x): returns a single value
    const xx = execute; // (x)ecute-(x)ecute: executes without returning

    return {
      insert,
      get,
      list,
      update,
      upsert,
      getOrInsert,
      delete: deleteRecords,
      count,
      table,
      many,
      single,
      pluck,
      execute,
      query,
      oo,
      oO,
      ox,
      xx,
      tableExists,
      syncSchema,
    };
  };
  /**
   * Builds the `transaction` exposed on a transaction-scoped interface.
   *
   * Re-entering runs the callback under a SAVEPOINT on the *same* connection,
   * which is what callers assume nesting already did. Re-exposing the top-level
   * `transaction` here (the previous behaviour) checked out a second pooled
   * connection and began an independent transaction, so the nested work could
   * not see the enclosing transaction's uncommitted rows, and if the enclosing
   * transaction held a lock the nested one needed, the two deadlocked in a way
   * PostgreSQL cannot detect: the outer connection is blocked on a promise
   * rather than on a lock, so `deadlock_timeout` never fires and the process
   * hangs until some unrelated timeout.
   *
   * @param executor - Error-preserving executor bound to the enclosing client
   * @param scopeFor - Builds the interface handed to the nested callback
   */
  const createNestedTransaction = (
    executor: PostgresQueryExecutor,
    scopeFor: (override?: NestedTransaction) => DatabaseInterface,
    clearTransactionError: () => void,
    scopes?: NestedScopeContext,
  ) => {
    // PostgreSQL permits nested savepoints, but a sibling savepoint cannot be
    // released while a later sibling is still open: releasing the earlier one
    // implicitly discards the later savepoint. Each scope gets its own queue:
    // child scopes are queued behind their parent, while work inside a child
    // gets a fresh queue for its own children.
    const rootScope: NestedScope = { tail: Promise.resolve() };

    const runScope = async <T>(
      scope: NestedScope,
      callback: (tx: DatabaseInterface) => Promise<T>,
    ): Promise<T> => {
      savepointSequence += 1;
      const name = `hv_sp_${savepointSequence}`;
      await executor.query(`SAVEPOINT ${name}`);
      try {
        // Without an ambient scope store the callback gets a handle bound to
        // this scope, which is what routes its own nested work under it.
        const result = await callback(
          scopes ? scopeFor() : scopeFor(bind(scope)),
        );
        // A callback may start nested work without awaiting it. Its savepoint
        // must remain open until that work is finished.
        await scope.tail;
        await executor.query(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        // Promise.all rejects as soon as one sibling fails, but queued siblings
        // are still tied to this savepoint. Let them finish before unwinding.
        await scope.tail;
        try {
          // ROLLBACK TO leaves the savepoint defined, so release it too or it
          // accumulates for the life of the transaction.
          await executor.query(`ROLLBACK TO SAVEPOINT ${name}`);
          clearTransactionError();
          await executor.query(`RELEASE SAVEPOINT ${name}`);
        } catch {
          // The enclosing transaction is already unwinding; its own teardown
          // owns the connection from here.
        }
        throw error;
      }
    };

    const bind = (bound?: NestedScope): NestedTransaction => {
      const nested: NestedTransaction = async <T>(
        callback: (tx: DatabaseInterface) => Promise<T>,
      ): Promise<T> => {
        const parentScope = bound ?? scopes?.getStore() ?? rootScope;
        const scope: NestedScope = { tail: Promise.resolve() };
        const current = parentScope.tail.then(() =>
          scopes
            ? scopes.run(scope, () => runScope(scope, callback))
            : runScope(scope, callback),
        );
        parentScope.tail = current.then(
          () => undefined,
          () => undefined,
        );
        return current;
      };
      nested.drain = () => rootScope.tail;
      return nested;
    };
    return bind();
  };

  return { serializeRecord, createClientMethods, createNestedTransaction };
}

/**
 * Builds `getTableSchema` on top of a dialect's statement methods.
 */
export function createGetTableSchema(methods: {
  many: (
    strings: TemplateStringsArray,
    ...vars: any[]
  ) => Promise<Record<string, any>[]>;
  tableExists: (tableName: string) => Promise<boolean>;
}) {
  const { many, tableExists } = methods;
  /**
   * Retrieves the schema information for a table
   *
   * @param table - Table name
   * @returns Promise resolving to table schema info or null if table doesn't exist
   * @throws Error if the query fails
   */
  const getTableSchema = async (
    table: string,
  ): Promise<TableSchemaInfo | null> => {
    validateTableName(table);

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
          AND table_schema = (
            SELECT namespace.nspname
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident(${table}))
          )
        ORDER BY ordinal_position
      `;

      // Get primary key columns
      const pkRows = await many`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = ${table}
          AND tc.table_schema = (
            SELECT namespace.nspname
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident(${table}))
          )
          AND tc.constraint_type = 'PRIMARY KEY'
      `;

      const pkColumns = new Set(pkRows.map((row) => row.column_name));

      const columns: Record<string, ColumnDefinition> = {};
      for (const row of columnRows) {
        const colName = row.column_name as string;
        columns[colName] = {
          type: row.data_type as string,
          primaryKey: pkColumns.has(colName),
          notNull: row.is_nullable === 'NO',
          defaultValue: row.column_default,
        };
      }

      // Get index information from pg_indexes
      const indexRows = await many`
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE tablename = ${table}
          AND schemaname = (
            SELECT namespace.nspname
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident(${table}))
          )
          AND indexname NOT LIKE '%_pkey'
      `;

      const indexes: IndexDefinition[] = [];
      for (const row of indexRows) {
        const indexName = row.indexname as string;
        const indexDef = row.indexdef as string;

        // Parse column names from index definition
        // Example: CREATE INDEX idx_name ON table (col1, col2)
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
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = ${table}
          AND tc.table_schema = (
            SELECT namespace.nspname
            FROM pg_catalog.pg_class AS relation
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = relation.relnamespace
            WHERE relation.oid = pg_catalog.to_regclass(pg_catalog.quote_ident(${table}))
          )
      `;

      const foreignKeys: Array<{
        column: string;
        referencesTable: string;
        referencesColumn: string;
        onDelete?: string;
        onUpdate?: string;
      }> = [];

      for (const fkRow of fkRows) {
        foreignKeys.push({
          column: fkRow.column_name as string,
          referencesTable: fkRow.foreign_table_name as string,
          referencesColumn: fkRow.foreign_column_name as string,
          onDelete: fkRow.delete_rule as string | undefined,
          onUpdate: fkRow.update_rule as string | undefined,
        });
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
  };

  return getTableSchema;
}

/**
 * Builds the `alterTable` operations on top of a statement executor.
 */
export function createAlterTable(client: PostgresQueryExecutor) {
  return {
    /**
     * Adds a new column to an existing table
     *
     * @param table - Table name
     * @param column - Column definition with name
     * @returns Promise that resolves when column is added
     * @throws Error if the alter operation fails
     */
    addColumn: async (
      table: string,
      column: ColumnDefinitionWithName,
    ): Promise<void> => {
      validateTableName(table);
      validateColumnName(column.name);

      let sql: string | undefined;
      try {
        sql = generateAddColumnStatement(table, column, 'postgres');
        await client.query(sql);
      } catch (e) {
        throw wrapDatabaseError('Failed to add column to table', e, {
          table,
          column: column.name,
          ...(sql ? { sql } : {}),
        });
      }
    },

    /**
     * Adds a new index to an existing table
     *
     * @param table - Table name
     * @param index - Index definition
     * @returns Promise that resolves when index is created
     * @throws Error if the create index operation fails
     */
    addIndex: async (table: string, index: IndexDefinition): Promise<void> => {
      validateTableName(table);
      validateIndexName(index.name);

      for (const col of index.columns) {
        validateColumnName(col);
      }

      let sql: string | undefined;
      try {
        sql = generateCreateIndexStatement(table, index);
        await client.query(sql);
      } catch (e) {
        throw wrapDatabaseError('Failed to create index on table', e, {
          table,
          index: index.name,
          ...(sql ? { sql } : {}),
        });
      }
    },
  };
}
