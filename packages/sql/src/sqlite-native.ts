import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseError } from '@happyvertical/utils';
import { DatabaseSchemaManager } from './schema-manager.js';
import {
  generateAddColumnStatement,
  generateCreateIndexStatement,
  validateColumnName,
  validateColumnNames,
  validateIndexName,
  validateTableName,
} from './shared/alter-utils.js';
import { getCachedSqliteDatabase } from './shared/sqlite-connection-cache.js';
import { createTransactionLock } from './shared/transaction-lock.js';
import type {
  ColumnDefinition,
  ColumnDefinitionWithName,
  DatabaseInterface,
  IndexDefinition,
  NotificationCapabilities,
  NotificationListenOptions,
  NotificationPruneOptions,
  NotificationWaitOptions,
  QueryResult,
  SchemaInitializationOptions,
  SchemaProvider,
  SqliteNotificationCapabilityOptions,
  SqliteVectorCapabilityOptions,
  TableInterface,
  TableSchemaInfo,
  TransactionHandle,
  UpsertOptions,
  VectorCapabilities,
  VectorIndexOptions,
  VectorSearchOptions,
  VectorSearchResult,
  WhereClause,
} from './shared/types.js';
import { NestedTransactionError, resolveSchemas } from './shared/types.js';
import {
  buildWhere,
  formatDbError,
  resolveInsertColumns,
  wrapDatabaseError,
} from './shared/utils.js';
import type { SqliteOptions } from './sqlite.js';

type NativeDatabase = any;
type NativeStatement = any;
type NativeCloseable = { close?: () => void };

/** @internal Best-effort, retryable closer used by native SQLite. */
export function createNativeSqliteCloser(
  notificationCloseables: Set<NativeCloseable>,
  honkerDb: NativeCloseable | null,
  database: { close(): void },
): () => Promise<void> {
  const completed = new Set<object>();
  let active: Promise<void> | undefined;
  return async () => {
    active ??= (async () => {
      const resources: NativeCloseable[] = [
        ...notificationCloseables,
        ...(honkerDb ? [honkerDb] : []),
        database,
      ];
      const errors: unknown[] = [];
      for (const resource of resources) {
        if (completed.has(resource)) continue;
        try {
          resource.close?.();
          completed.add(resource);
          notificationCloseables.delete(resource);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          'Failed to close native SQLite resources',
        );
      }
    })();
    try {
      await active;
    } finally {
      active = undefined;
    }
  };
}

const nativeNullAwareUpsertLocks = new Map<string, Promise<void>>();
let nodeSqliteModulePromise: Promise<any> | null = null;
// sqlite-vector's ESM wrapper uses dynamic require for platform packages.
const requireOptionalPackage = createRequire(import.meta.url);

interface NativeSqliteLocation {
  location: string;
  filePath: string | null;
  isMemory: boolean;
}

interface NativeQueryResult {
  rows: Record<string, any>[];
  rowCount: number;
  command?: string;
  fields?: Array<{ name: string }>;
}

function getCapabilityOptions<T extends Record<string, any>>(
  value: boolean | T | undefined,
): T {
  return typeof value === 'object' && value ? value : ({} as T);
}

function resolveNativeLocation(url = ':memory:'): NativeSqliteLocation {
  if (
    url.startsWith('libsql://') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    throw new DatabaseError(
      'SQLite native capabilities are only supported for local SQLite databases',
      {
        url,
        hint: "Use a local file path, 'file:...' URL, or ':memory:' when enabling SQLite capabilities.",
      },
    );
  }

  if (url === ':memory:' || url.startsWith('file::memory:')) {
    return { location: url, filePath: null, isMemory: true };
  }

  if (url.startsWith('file://')) {
    const filePath = fileURLToPath(new URL(url));
    return { location: filePath, filePath, isMemory: false };
  }

  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    if (!path || path.includes('?')) {
      throw new DatabaseError(
        'SQLite native capabilities do not support file: URLs with query parameters',
        { url },
      );
    }
    const filePath = resolve(path);
    return { location: filePath, filePath, isMemory: false };
  }

  const filePath = resolve(url);
  return { location: filePath, filePath, isMemory: false };
}

async function loadNodeSqlite(): Promise<any> {
  nodeSqliteModulePromise ??= importNodeSqlite().catch((error) => {
    nodeSqliteModulePromise = null;
    throw error;
  });
  return nodeSqliteModulePromise;
}

async function importNodeSqlite(): Promise<any> {
  const originalEmitWarning = process.emitWarning;

  try {
    process.emitWarning = function suppressNodeSqliteExperimentalWarning(
      warning: string | Error,
      ...args: any[]
    ) {
      if (
        args[0] === 'ExperimentalWarning' &&
        String(warning).includes('SQLite is an experimental feature')
      ) {
        return;
      }

      return originalEmitWarning.call(process, warning as any, ...args);
    } as typeof process.emitWarning;

    const moduleName = 'node:sqlite';
    return (await import(/* @vite-ignore */ moduleName)) as any;
  } catch (error) {
    throw new DatabaseError('Node native SQLite is not available', {
      originalError: formatDbError(error),
      hint: 'SQLite native capabilities require a Node.js runtime with node:sqlite support.',
    });
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function loadSqliteVectorExtension(
  database: NativeDatabase,
): Promise<void> {
  try {
    const moduleName = '@sqliteai/sqlite-vector';
    const module = requireOptionalPackage(moduleName) as any;
    const getExtensionPath =
      module.getExtensionPath ?? module.default?.getExtensionPath;

    if (typeof getExtensionPath !== 'function') {
      throw new Error('getExtensionPath export was not found');
    }

    database.enableLoadExtension(true);
    database.loadExtension(getExtensionPath());
  } catch (error) {
    throw new DatabaseError(
      'Failed to load optional SQLite vector capability: install @sqliteai/sqlite-vector',
      {
        packageName: '@sqliteai/sqlite-vector',
        originalError: formatDbError(error),
        hint: 'Install @sqliteai/sqlite-vector to use SQLite vector capabilities.',
      },
    );
  } finally {
    try {
      database.enableLoadExtension(false);
    } catch (_error) {
      // Leave the original extension-loading failure intact.
    }
  }
}

async function openHonkerDatabase(
  filePath: string,
  options: SqliteNotificationCapabilityOptions,
): Promise<any> {
  try {
    const moduleName = '@russellthehippo/honker-node';
    const module = requireOptionalPackage(moduleName) as any;
    const open = module.open ?? module.default?.open;

    if (typeof open !== 'function') {
      throw new Error('open export was not found');
    }

    return open(filePath, options.maxReaders, options.watcherBackend);
  } catch (error) {
    throw new DatabaseError(
      'Failed to load optional SQLite notification capability: install @russellthehippo/honker-node',
      {
        packageName: '@russellthehippo/honker-node',
        originalError: formatDbError(error),
        hint: 'Install @russellthehippo/honker-node to use SQLite notification capabilities.',
      },
    );
  }
}

function toPlainRow(row: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(row));
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function firstSqlToken(sql: string): string {
  return sql.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
}

function normalizeNativeQuery(
  sql: string,
  values: any[],
): { sql: string; args: any[] } {
  const flatArgs = Array.isArray(values[0]) ? values[0] : values;
  const parameterIndexes = Array.from(sql.matchAll(/\$(\d+)/g)).map((match) =>
    Number(match[1]),
  );

  if (parameterIndexes.length === 0) {
    return { sql, args: flatArgs };
  }

  const args = parameterIndexes.map((index) => flatArgs[index - 1]);
  return { sql: sql.replace(/\$(\d+)/g, '?'), args };
}

function executeNativeQuery(
  database: NativeDatabase,
  sql: string,
  args: any[] = [],
): NativeQueryResult {
  const statement: NativeStatement = database.prepare(sql);
  const columns = statement.columns();

  if (columns.length > 0) {
    const rows = statement.all(...args).map(toPlainRow);
    return {
      rows,
      rowCount: rows.length,
      command: firstSqlToken(sql),
      fields: columns.map((column: { name: string }) => ({
        name: column.name,
      })),
    };
  }

  const result = statement.run(...args);
  return {
    rows: [],
    rowCount: Number(result?.changes ?? 0),
    command: firstSqlToken(sql),
    fields: [],
  };
}

function createNativeTablesFromSchemas(
  database: NativeDatabase,
  schemas: Record<string, SchemaProvider>,
): void {
  for (const [tableName, schema] of Object.entries(schemas)) {
    try {
      const result = executeNativeQuery(
        database,
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
      );

      if (result.rows.length > 0) {
        continue;
      }

      database.exec(schema.ddl);

      for (const indexSql of schema.indexes ?? []) {
        try {
          database.exec(indexSql);
        } catch (error) {
          console.warn(
            `[sqlite] Failed to create index for ${tableName}: ${formatDbError(error)}`,
          );
        }
      }

      for (const triggerSql of schema.triggers ?? []) {
        try {
          database.exec(triggerSql);
        } catch (error) {
          console.warn(
            `[sqlite] Failed to create trigger for ${tableName}: ${formatDbError(error)}`,
          );
        }
      }
    } catch (error) {
      throw new DatabaseError(
        `Failed to create table ${tableName} from schema`,
        {
          tableName,
          schema,
          originalError: formatDbError(error),
        },
      );
    }
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildQuestionWhere(where: WhereClause, startIndex = 1) {
  const built = buildWhere(where, startIndex, 'sqlite');
  return {
    sql: built.sql.replace(/\$(\d+)/g, '?'),
    values: built.values,
  };
}

function serializeValue(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function serializeRecord(record: Record<string, any>): Record<string, any> {
  const serialized: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) {
      continue;
    }
    serialized[key] = serializeValue(value);
  }
  return serialized;
}

async function withNativeNullAwareUpsertLock<T>(
  lockKey: string,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = nativeNullAwareUpsertLocks.get(lockKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => {}).then(() => current);

  nativeNullAwareUpsertLocks.set(lockKey, next);
  await previous.catch(() => {});

  try {
    return await callback();
  } finally {
    release();
    if (nativeNullAwareUpsertLocks.get(lockKey) === next) {
      nativeNullAwareUpsertLocks.delete(lockKey);
    }
  }
}

function sqliteVectorDistance(metric: 'cosine' | 'l2' | 'ip'): string {
  switch (metric) {
    case 'l2':
      return 'L2';
    case 'ip':
      return 'DOT';
    default:
      return 'COSINE';
  }
}

function sqliteVectorQuantization(
  options: SqliteVectorCapabilityOptions,
): string {
  const parts: string[] = [];

  switch (options.quantization ?? 'turbo4') {
    case 'turbo2':
      parts.push('qtype=TURBO,qbits=2');
      break;
    case 'turbo3':
      parts.push('qtype=TURBO,qbits=3');
      break;
    case 'turbo4':
      parts.push('qtype=TURBO,qbits=4');
      break;
    case 'uint8':
      parts.push('qtype=UINT8');
      break;
    case 'int8':
      parts.push('qtype=INT8');
      break;
    case '1bit':
      parts.push('qtype=1BIT');
      break;
  }

  if (options.maxMemory) {
    parts.push(`max_memory=${options.maxMemory}`);
  }

  return parts.join(',');
}

function createNotificationCapabilities(
  honkerDb: any,
  closeables: Set<{ close?: () => void }>,
): NotificationCapabilities {
  return {
    async notify(channel: string, payload: any): Promise<number> {
      return Number(honkerDb.notify(channel, payload));
    },

    listen(channel: string, options?: NotificationListenOptions) {
      const listener = honkerDb.listen(channel, {
        fallbackPollS:
          options?.fallbackPollMs === null
            ? null
            : options?.fallbackPollMs !== undefined
              ? options.fallbackPollMs / 1000
              : undefined,
      });
      closeables.add(listener);
      return listener;
    },

    async waitForUpdate(options?: NotificationWaitOptions): Promise<boolean> {
      const updateEvents = honkerDb.updateEvents();
      closeables.add(updateEvents);
      let timeout: NodeJS.Timeout | undefined;
      let removeAbortListener: (() => void) | undefined;

      try {
        if (options?.signal?.aborted) {
          return false;
        }

        const updatePromise = updateEvents.next().then(
          () => true,
          () => false,
        );
        const races: Array<Promise<boolean>> = [updatePromise];

        if (options?.timeoutMs !== undefined) {
          const timeoutMs = options.timeoutMs;
          races.push(
            new Promise((resolve) => {
              timeout = setTimeout(
                () => resolve(false),
                Math.max(0, timeoutMs),
              );
            }),
          );
        }

        if (options?.signal) {
          races.push(
            new Promise((resolve) => {
              const onAbort = () => resolve(false);
              options.signal?.addEventListener('abort', onAbort, {
                once: true,
              });
              removeAbortListener = () =>
                options.signal?.removeEventListener('abort', onAbort);
            }),
          );
        }

        return await Promise.race(races);
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        removeAbortListener?.();
        closeables.delete(updateEvents);
        updateEvents.close?.();
      }
    },

    async prune(options?: NotificationPruneOptions): Promise<number> {
      return Number(
        honkerDb.pruneNotifications(options?.olderThanS, options?.maxKeep),
      );
    },
  };
}

function createVectorCapabilities(
  database: NativeDatabase,
  options: SqliteVectorCapabilityOptions,
): VectorCapabilities {
  const initialized = new Map<
    string,
    { dimensions: number; metric: 'cosine' | 'l2' | 'ip' }
  >();
  const indexed = new Map<
    string,
    { metric: 'cosine' | 'l2' | 'ip'; options: SqliteVectorCapabilityOptions }
  >();

  const keyFor = (table: string, column: string) => `${table}.${column}`;

  const columnExists = (table: string, column: string): boolean => {
    const rows = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all()
      .map(toPlainRow);
    return rows.some((row: Record<string, any>) => row.name === column);
  };

  const ensureInitialized = (
    table: string,
    column: string,
    dimensions: number,
    metric: 'cosine' | 'l2' | 'ip' = 'cosine',
  ): void => {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new DatabaseError('Vector dimensions must be a positive integer', {
        dimensions,
      });
    }

    validateTableName(table);
    validateColumnName(column);

    executeNativeQuery(database, 'SELECT vector_init(?, ?, ?)', [
      table,
      column,
      `dimension=${dimensions},type=FLOAT32,distance=${sqliteVectorDistance(metric)}`,
    ]);
    initialized.set(keyFor(table, column), { dimensions, metric });
  };

  const quantize = (
    table: string,
    column: string,
    vectorOptions: SqliteVectorCapabilityOptions,
  ): void => {
    const quantizationOptions = sqliteVectorQuantization(vectorOptions);
    if (quantizationOptions) {
      executeNativeQuery(database, 'SELECT vector_quantize(?, ?, ?)', [
        table,
        column,
        quantizationOptions,
      ]);
    } else {
      executeNativeQuery(database, 'SELECT vector_quantize(?, ?)', [
        table,
        column,
      ]);
    }

    if (vectorOptions.preload) {
      executeNativeQuery(database, 'SELECT vector_quantize_preload(?, ?)', [
        table,
        column,
      ]);
    }
  };

  return {
    async ensureColumn(
      table: string,
      column: string,
      dimensions: number,
    ): Promise<void> {
      validateTableName(table);
      validateColumnName(column);

      try {
        if (!columnExists(table, column)) {
          executeNativeQuery(
            database,
            `ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} BLOB`,
          );
        }
        ensureInitialized(table, column, dimensions, 'cosine');
      } catch (error) {
        throw new DatabaseError('Failed to ensure SQLite vector column', {
          table,
          column,
          dimensions,
          originalError: formatDbError(error),
        });
      }
    },

    async ensureIndex(
      table: string,
      column: string,
      indexOptions?: VectorIndexOptions,
    ): Promise<void> {
      validateTableName(table);
      validateColumnName(column);

      const key = keyFor(table, column);
      const dimensions =
        indexOptions?.dimensions ?? initialized.get(key)?.dimensions;
      if (!dimensions) {
        throw new DatabaseError(
          'SQLite vector index creation requires dimensions',
          {
            table,
            column,
            hint: 'Call ensureColumn(table, column, dimensions) first or pass dimensions to ensureIndex().',
          },
        );
      }

      const metric = indexOptions?.metric ?? 'cosine';

      try {
        ensureInitialized(table, column, dimensions, metric);
        const vectorOptions = { ...options };
        quantize(table, column, vectorOptions);
        indexed.set(key, { metric, options: vectorOptions });
      } catch (error) {
        throw new DatabaseError('Failed to ensure SQLite vector index', {
          table,
          column,
          originalError: formatDbError(error),
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

      const key = keyFor(table, column);
      const dimensions = initialized.get(key)?.dimensions ?? embedding.length;
      const { sql: whereClause, values } = buildQuestionWhere(where);

      if (!whereClause) {
        throw new DatabaseError(
          'SQLite vector update requires at least one WHERE condition',
          { table, column },
        );
      }

      try {
        ensureInitialized(
          table,
          column,
          dimensions,
          initialized.get(key)?.metric ?? 'cosine',
        );
        executeNativeQuery(
          database,
          `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column)} = vector_as_f32(?) ${whereClause}`,
          [JSON.stringify(embedding), ...values],
        );

        const indexState = indexed.get(key);
        if (indexState) {
          quantize(table, column, indexState.options);
        }
      } catch (error) {
        throw new DatabaseError('Failed to upsert SQLite vector', {
          table,
          column,
          where,
          originalError: formatDbError(error),
        });
      }
    },

    async search(
      table: string,
      column: string,
      embedding: number[],
      searchOptions?: VectorSearchOptions,
    ): Promise<VectorSearchResult[]> {
      validateTableName(table);
      validateColumnName(column);

      const key = keyFor(table, column);
      const metric = searchOptions?.metric ?? 'cosine';
      const limit = searchOptions?.limit ?? 10;
      const limitArg = BigInt(limit);
      const dimensions = initialized.get(key)?.dimensions ?? embedding.length;
      const indexState = indexed.get(key);
      const useQuantizedScan = indexState?.metric === metric;
      const scanFunction = useQuantizedScan
        ? 'vector_quantize_scan'
        : 'vector_full_scan';
      const convertedWhere = searchOptions?.where
        ? searchOptions.where.replace(/\$(\d+)/g, '?')
        : '';
      const whereParams = searchOptions?.params ?? [];

      try {
        ensureInitialized(table, column, dimensions, metric);

        const rows = convertedWhere
          ? executeNativeQuery(
              database,
              `SELECT base.*, base.rowid AS __sqlite_rowid, vec.distance
               FROM ${scanFunction}(?, ?, vector_as_f32(?)) AS vec
               JOIN ${quoteIdentifier(table)} AS base ON base.rowid = vec.rowid
               WHERE (${convertedWhere})
               ORDER BY vec.distance
               LIMIT ?`,
              [
                table,
                column,
                JSON.stringify(embedding),
                ...whereParams,
                limitArg,
              ],
            ).rows
          : executeNativeQuery(
              database,
              `SELECT base.*, base.rowid AS __sqlite_rowid, vec.distance
               FROM ${scanFunction}(?, ?, vector_as_f32(?), ?) AS vec
               JOIN ${quoteIdentifier(table)} AS base ON base.rowid = vec.rowid
               ORDER BY vec.distance`,
              [table, column, JSON.stringify(embedding), limitArg],
            ).rows;

        return rows.map((row) => {
          const { __sqlite_rowid: rowid, ...result } = row;
          return {
            ...result,
            id: String(result.id ?? rowid),
            distance: Number(row.distance),
          };
        });
      } catch (error) {
        throw new DatabaseError('Failed to execute SQLite vector search', {
          table,
          column,
          metric,
          limit,
          originalError: formatDbError(error),
        });
      }
    },
  };
}

export async function getNativeSqliteDatabase(
  options: SqliteOptions = {},
): Promise<DatabaseInterface> {
  const url = options.url || ':memory:';

  return getCachedSqliteDatabase('native', options, () =>
    createNativeSqliteDatabase(options, url),
  );
}

async function createNativeSqliteDatabase(
  options: SqliteOptions,
  url: string,
): Promise<DatabaseInterface> {
  const location = resolveNativeLocation(url);
  const notificationsOptions = getCapabilityOptions(
    options.capabilities?.notifications,
  );
  const vectorOptions = getCapabilityOptions(options.capabilities?.vector);
  const wantsNotifications = Boolean(options.capabilities?.notifications);
  const wantsVector = Boolean(options.capabilities?.vector);

  if (wantsNotifications && location.isMemory) {
    throw new DatabaseError(
      'SQLite notification capabilities require a file-backed database',
      {
        url,
        hint: 'Use a temporary file-backed .db for development and tests that need notifications.',
      },
    );
  }

  const { DatabaseSync } = await loadNodeSqlite();
  const database = new DatabaseSync(location.location, {
    allowExtension: wantsVector,
  });

  // One lock per connection. `getNativeSqliteDatabase` hands cached callers
  // this same closure, so "created here" and "per connection" are the same
  // scope.
  const connectionLock = createTransactionLock(
    'sqlite (native)',
    options.transactionQueueTimeout,
  );
  let closeResources: (() => Promise<void>) | undefined;

  try {
    if (wantsVector) {
      await loadSqliteVectorExtension(database);
    }

    const honkerDb =
      wantsNotifications && location.filePath
        ? await openHonkerDatabase(location.filePath, notificationsOptions)
        : null;
    const notificationCloseables = new Set<{ close?: () => void }>();

    const vectorCapabilities = wantsVector
      ? createVectorCapabilities(database, vectorOptions)
      : undefined;
    const notificationCapabilities = honkerDb
      ? createNotificationCapabilities(honkerDb, notificationCloseables)
      : undefined;

    const query = async (
      sql: string,
      ...values: any[]
    ): Promise<{ rows: Record<string, any>[]; rowCount: number }> => {
      const normalized = normalizeNativeQuery(sql, values);
      try {
        const result = executeNativeQuery(
          database,
          normalized.sql,
          normalized.args,
        );
        return { rows: result.rows, rowCount: result.rowCount };
      } catch (error) {
        throw wrapDatabaseError('Failed to execute raw query', error, {
          sql: normalized.sql,
          values: normalized.args,
        });
      }
    };

    const parseTemplate = (strings: TemplateStringsArray, ...vars: any[]) => {
      let sql = strings[0];
      const values = [];
      for (let i = 0; i < vars.length; i++) {
        values.push(vars[i]);
        sql += `?${strings[i + 1]}`;
      }
      return { sql, values };
    };

    const insert = async (
      table: string,
      data: Record<string, any> | Record<string, any>[],
    ): Promise<QueryResult> => {
      validateTableName(table);
      const records = (Array.isArray(data) ? data : [data]).map(
        serializeRecord,
      );
      if (records.length === 0) {
        return { operation: 'insert', affected: 0 };
      }
      const keys = resolveInsertColumns(table, records);
      validateColumnNames(keys);
      const placeholders = records
        .map(() => `(${keys.map(() => '?').join(', ')})`)
        .join(', ');
      const values = records.flatMap((record) =>
        keys.map((key) => record[key]),
      );
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;

      try {
        const result = executeNativeQuery(database, sql, values);
        return { operation: 'insert', affected: result.rowCount };
      } catch (error) {
        throw new DatabaseError('Failed to insert records into table', {
          table,
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const get = async (
      table: string,
      where: WhereClause,
    ): Promise<Record<string, any> | null> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildQuestionWhere(where);
      if (!whereClause) {
        throw new DatabaseError(
          'GET requires at least one WHERE condition to prevent returning an arbitrary record',
          { table },
        );
      }

      const sql = `SELECT * FROM ${table} ${whereClause}`;
      try {
        const result = executeNativeQuery(database, sql, values);
        return result.rows[0] || null;
      } catch (error) {
        throw new DatabaseError('Failed to retrieve record from table', {
          table,
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const list = async (
      table: string,
      where: WhereClause,
    ): Promise<Record<string, any>[]> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildQuestionWhere(where);
      const sql = `SELECT * FROM ${table} ${whereClause}`;
      try {
        return executeNativeQuery(database, sql, values).rows;
      } catch (error) {
        throw new DatabaseError('Failed to list records from table', {
          table,
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const update = async (
      table: string,
      where: WhereClause,
      data: Record<string, any>,
    ): Promise<QueryResult> => {
      validateTableName(table);
      const serializedData = serializeRecord(data);
      const keys = Object.keys(serializedData);
      validateColumnNames(keys);
      const values = Object.values(serializedData);
      const setClause = keys.map((key) => `${key} = ?`).join(', ');
      const { sql: whereClause, values: whereValues } =
        buildQuestionWhere(where);

      if (!whereClause) {
        throw new DatabaseError(
          'UPDATE requires at least one WHERE condition to prevent accidental update of all records',
          { table },
        );
      }

      const sql = `UPDATE ${table} SET ${setClause} ${whereClause}`;
      try {
        const result = executeNativeQuery(database, sql, [
          ...values,
          ...whereValues,
        ]);
        return { operation: 'update', affected: result.rowCount };
      } catch (error) {
        throw new DatabaseError('Failed to update records in table', {
          table,
          sql,
          values: [...values, ...whereValues],
          originalError: formatDbError(error),
        });
      }
    };

    const hasNullConflictValue = (
      conflictColumns: string[],
      data: Record<string, any>,
    ): boolean => conflictColumns.some((column) => data[column] === null);

    const validateUpsertConflictColumns = (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): void => {
      const missingColumns = conflictColumns.filter(
        (column) => !(column in serializedData),
      );

      if (missingColumns.length > 0) {
        throw new DatabaseError('Conflict columns missing from data', {
          table,
          conflictColumns,
          missingColumns,
          availableColumns: Object.keys(serializedData),
          hint: 'All columns specified in ON CONFLICT must be present in the data being inserted. Undefined values are filtered out during serialization - consider using null or an empty string instead.',
        });
      }
    };

    const executeStandardUpsert = (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): QueryResult => {
      const keys = Object.keys(serializedData);
      const values = Object.values(serializedData);
      const placeholders = keys.map(() => '?').join(', ');
      const updateSet = keys
        .map((key) => `${key} = excluded.${key}`)
        .join(', ');
      const conflict = conflictColumns.join(', ');
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;
      const result = executeNativeQuery(database, sql, values);
      return { operation: 'upsert', affected: result.rowCount };
    };

    const executeNullAwareUpsertAttempt = (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): QueryResult => {
      const keys = Object.keys(serializedData);
      const values = Object.values(serializedData);
      const updateSet = keys.map((key) => `${key} = ?`).join(', ');
      const whereClause = conflictColumns
        .map((column) => `${column} IS ?`)
        .join(' AND ');
      const whereValues = conflictColumns.map(
        (column) => serializedData[column],
      );

      const updateResult = executeNativeQuery(
        database,
        `UPDATE ${table} SET ${updateSet} WHERE ${whereClause}`,
        [...values, ...whereValues],
      );

      if (updateResult.rowCount > 0) {
        return { operation: 'upsert', affected: updateResult.rowCount };
      }

      const placeholders = keys.map(() => '?').join(', ');
      const insertResult = executeNativeQuery(
        database,
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
        values,
      );

      return { operation: 'upsert', affected: insertResult.rowCount };
    };

    /**
     * Rejects hostile table/column identifiers before an upsert builds SQL.
     *
     * Called from the public entry points rather than from `executeUpsert`, so
     * the failure reaches the caller naming the bad identifier instead of being
     * flattened into the wrapper's generic "Failed to upsert record into table".
     *
     * Validates the keys of the already-serialized snapshot — the exact array
     * the executors interpolate — not a fresh enumeration of the caller's
     * `data`. Enumerating `data` again could disagree with the snapshot if it is
     * a Proxy whose `ownKeys` trap returns different keys on successive reads.
     */
    const validateUpsertIdentifiers = (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
    ): void => {
      validateTableName(table);
      validateColumnNames([...conflictColumns, ...Object.keys(serializedData)]);
    };

    const executeUpsert = async (
      table: string,
      conflictColumns: string[],
      serializedData: Record<string, any>,
      upsertOptions: UpsertOptions | undefined,
      acquireTransaction: boolean,
    ): Promise<QueryResult> => {
      validateUpsertConflictColumns(table, conflictColumns, serializedData);

      if (
        upsertOptions?.nullsDistinct ||
        !hasNullConflictValue(conflictColumns, serializedData)
      ) {
        return executeStandardUpsert(table, conflictColumns, serializedData);
      }

      if (!acquireTransaction) {
        return executeNullAwareUpsertAttempt(
          table,
          conflictColumns,
          serializedData,
        );
      }

      const lockKey = `${location.location}:${table}:${conflictColumns
        .map((column) => `${column}:${JSON.stringify(serializedData[column])}`)
        .join('|')}`;

      return withNativeNullAwareUpsertLock(lockKey, async () => {
        // This opens a transaction on the shared connection like any other, so
        // it takes the same lock — otherwise a null-aware upsert overlapping a
        // `transaction()` call reintroduces exactly the corruption the lock
        // exists to prevent.
        const releaseConnection = await connectionLock.acquire();
        try {
          database.exec('BEGIN IMMEDIATE');
          const result = executeNullAwareUpsertAttempt(
            table,
            conflictColumns,
            serializedData,
          );
          database.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            database.exec('ROLLBACK');
          } catch (_rollbackError) {
            // Preserve the original failure.
          }
          throw error;
        } finally {
          releaseConnection();
        }
      });
    };

    const upsert = async (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
      upsertOptions?: UpsertOptions,
    ): Promise<QueryResult> => {
      // Snapshot the record and the conflict columns once and thread both
      // through validation and SQL, so neither a hostile record nor a hostile
      // conflict-column array can present different identifiers to each.
      const serializedData = serializeRecord(data);
      const conflictCols = [...conflictColumns];
      validateUpsertIdentifiers(table, conflictCols, serializedData);
      try {
        return await executeUpsert(
          table,
          conflictCols,
          serializedData,
          upsertOptions,
          true,
        );
      } catch (error) {
        if (getErrorMessage(error) === 'Conflict columns missing from data') {
          throw error;
        }
        throw new DatabaseError('Failed to upsert record into table', {
          table,
          values: data,
          conflictColumns,
          originalError: formatDbError(error),
        });
      }
    };

    const upsertInCurrentTransaction = (
      table: string,
      conflictColumns: string[],
      data: Record<string, any>,
      upsertOptions?: UpsertOptions,
    ): Promise<QueryResult> => {
      // Snapshot the record and the conflict columns once and thread both
      // through validation and SQL, so neither a hostile record nor a hostile
      // conflict-column array can present different identifiers to each.
      const serializedData = serializeRecord(data);
      const conflictCols = [...conflictColumns];
      validateUpsertIdentifiers(table, conflictCols, serializedData);
      return executeUpsert(
        table,
        conflictCols,
        serializedData,
        upsertOptions,
        false,
      );
    };

    const getOrInsert = async (
      table: string,
      where: WhereClause,
      data: Record<string, any>,
    ): Promise<Record<string, any>> => {
      const existing = await get(table, where);
      if (existing) return existing;
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

    const deleteRecords = async (
      table: string,
      where: WhereClause,
    ): Promise<QueryResult> => {
      validateTableName(table);
      const { sql: whereClause, values } = buildQuestionWhere(where);
      if (!whereClause) {
        throw new DatabaseError(
          'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
          { table },
        );
      }

      try {
        const result = executeNativeQuery(
          database,
          `DELETE FROM ${table} ${whereClause}`,
          values,
        );
        return { operation: 'delete', affected: result.rowCount };
      } catch (error) {
        throw new DatabaseError('Failed to delete records from table', {
          table,
          where,
          originalError: formatDbError(error),
        });
      }
    };

    const count = async (
      table: string,
      where?: WhereClause,
    ): Promise<number> => {
      validateTableName(table);
      if (
        !where ||
        (typeof where === 'object' && Object.keys(where).length === 0)
      ) {
        const result = executeNativeQuery(
          database,
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        return Number(result.rows[0]?.count) || 0;
      }

      const { sql: whereClause, values } = buildQuestionWhere(where);
      const result = executeNativeQuery(
        database,
        `SELECT COUNT(*) as count FROM ${table} ${whereClause}`,
        values,
      );
      return Number(result.rows[0]?.count) || 0;
    };

    const tableExists = async (tableName: string): Promise<boolean> => {
      const result = executeNativeQuery(
        database,
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
      );
      return result.rows.length > 0;
    };

    const syncSchema = async (schema: string): Promise<void> => {
      const commands = schema
        .replace(/\s+/g, ' ')
        .replace(/DEFAULT CAST\(([^)]+)\s+AS\s+\w+\)/gi, 'DEFAULT $1')
        .trim()
        .split(';')
        .map((command) => command.trim())
        .filter((command) => command.length > 0);

      for (const command of commands) {
        database.exec(command);
      }
    };

    const many = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<Record<string, any>[]> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        return executeNativeQuery(database, sql, values).rows;
      } catch (error) {
        throw new DatabaseError('Failed to execute many query', {
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const single = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<Record<string, any> | null> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        return executeNativeQuery(database, sql, values).rows[0] || null;
      } catch (error) {
        throw new DatabaseError('Failed to execute single query', {
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const pluck = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<any> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const row = executeNativeQuery(database, sql, values).rows[0];
        return row ? Object.values(row)[0] : null;
      } catch (error) {
        throw new DatabaseError('Failed to execute pluck query', {
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const execute = async (
      strings: TemplateStringsArray,
      ...vars: any[]
    ): Promise<void> => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        if (values.length === 0) {
          database.exec(sql);
          return;
        }
        executeNativeQuery(database, sql, values);
      } catch (error) {
        throw new DatabaseError('Failed to execute query', {
          sql,
          values,
          originalError: formatDbError(error),
        });
      }
    };

    const oo = many;
    const oO = single;
    const ox = pluck;
    const xx = execute;

    const table = (tableName: string): TableInterface => ({
      insert: (data) => insert(tableName, data),
      get: (where) => get(tableName, where),
      list: (where) => list(tableName, where),
    });

    // Names nested savepoints. Only ever appended to an identifier the adapter
    // generates, never caller input.
    let savepointSequence = 0;

    /**
     * Re-enters the transaction already in progress under a savepoint.
     *
     * This is what the transaction-scoped interface exposes as `transaction`.
     * Handing it the top-level `transaction` instead — the previous behaviour —
     * sent a nested call into a second BEGIN on the one shared connection; that
     * throws, and the nested call's own ROLLBACK then discarded the *enclosing*
     * transaction's work while later writes committed in autocommit.
     */
    const nestedTransaction = async <T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
    ): Promise<T> => {
      savepointSequence += 1;
      const name = `hv_sp_${savepointSequence}`;
      database.exec(`SAVEPOINT ${name}`);
      try {
        const result = await callback(
          buildDatabaseInterface(
            upsertInCurrentTransaction,
            nestedTransaction,
            refuseNestedBeginTransaction,
          ),
        );
        database.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
      } catch (error) {
        try {
          // ROLLBACK TO leaves the savepoint defined, so release it too or it
          // accumulates for the life of the transaction.
          database.exec(`ROLLBACK TO SAVEPOINT ${name}`);
          database.exec(`RELEASE SAVEPOINT ${name}`);
        } catch {
          // The enclosing transaction is already unwinding; its teardown owns
          // the connection from here.
        }
        throw error;
      }
    };

    const transaction = async <T>(
      callback: (tx: DatabaseInterface) => Promise<T>,
    ): Promise<T> =>
      // Held across the whole BEGIN … COMMIT/ROLLBACK span. Without it two
      // overlapping calls raced on the one connection: the second BEGIN threw,
      // its catch ran ROLLBACK, and that rollback ended the *first*
      // transaction — half of its writes durable, half lost, and its promise
      // rejected, so the caller was told nothing had happened.
      connectionLock.run(async () => {
        try {
          database.exec('BEGIN TRANSACTION');
          const txDb = buildDatabaseInterface(
            upsertInCurrentTransaction,
            nestedTransaction,
            refuseNestedBeginTransaction,
          );
          const result = await callback(txDb);
          database.exec('COMMIT');
          return result;
        } catch (error) {
          // A failing ROLLBACK must not replace the caller's error: SQLite
          // reports "cannot rollback - no transaction is active" whenever the
          // transaction is already gone, which says nothing about what failed.
          try {
            database.exec('ROLLBACK');
          } catch {
            // Nothing left to roll back.
          }
          throw error;
        }
      });

    /**
     * The `beginTransaction` exposed on a transaction-scoped interface.
     *
     * Unlike `transaction`, a manual handle has no savepoint equivalent: it
     * would have to own the connection until the caller ends it, which the
     * enclosing transaction already does. Issuing a second BEGIN threw before
     * transactions were serialized; now it would instead wait on a lock its own
     * caller holds, so refuse explicitly rather than deadlock.
     */
    const refuseNestedBeginTransaction = async (): Promise<never> => {
      throw new NestedTransactionError(
        'beginTransaction() cannot be called inside a transaction. Use the transaction you already have, or nest with transaction() to re-enter it under a savepoint.',
        { adapter: 'sqlite-native' },
      );
    };

    const beginTransaction = async (): Promise<TransactionHandle> => {
      // The handle owns the connection until the caller ends it, so the lock is
      // held across the gap rather than around a single call. A handle that is
      // never committed or rolled back therefore blocks every later transaction
      // until the queue timeout reports it.
      const releaseConnection = await connectionLock.acquire();
      try {
        database.exec('BEGIN TRANSACTION');
      } catch (error) {
        // No transaction was opened, so there is no handle to end it and
        // nothing left to release the connection.
        releaseConnection();
        throw error;
      }

      let active = true;

      // COMMIT and ROLLBACK can both throw, and the transaction is over either
      // way, so the connection goes back before the error is rethrown.
      const end = (command: 'COMMIT' | 'ROLLBACK'): void => {
        if (!active) {
          throw new DatabaseError('Transaction already ended', {});
        }
        try {
          database.exec(command);
        } catch (error) {
          // COMMIT can fail and leave the transaction *open* — SQLite documents
          // exactly that for SQLITE_BUSY. Releasing the connection then would hand
          // the next queued caller a connection still inside a transaction: its
          // BEGIN would throw, and its catch would ROLLBACK, discarding this
          // transaction's work. So normalize before releasing, the way the pooled
          // adapter's discardTxClient does.
          try {
            database.exec('ROLLBACK');
          } catch {
            // Already gone; nothing left to normalize.
          }
          throw error;
        } finally {
          active = false;
          releaseConnection();
        }
      };

      const commit = async (): Promise<void> => end('COMMIT');

      const rollback = async (): Promise<void> => end('ROLLBACK');

      return {
        // The handle is inside a transaction for the same reason a callback
        // scope is, so it re-enters via savepoint too.
        ...buildDatabaseInterface(
          upsertInCurrentTransaction,
          nestedTransaction,
          refuseNestedBeginTransaction,
        ),
        commit,
        rollback,
        isActive: () => active,
      };
    };

    const initializeSchemas = async (
      schemaOptions: SchemaInitializationOptions,
    ): Promise<void> => {
      const schemaManager = new DatabaseSchemaManager();
      await schemaManager.initializeSchemas(
        buildDatabaseInterface(upsert),
        schemaOptions,
      );
    };

    const getTableSchema = async (
      tableName: string,
    ): Promise<TableSchemaInfo | null> => {
      validateTableName(tableName);

      if (!(await tableExists(tableName))) {
        return null;
      }

      const columnRows = database
        .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
        .all()
        .map(toPlainRow);

      const columns: Record<string, ColumnDefinition> = {};
      for (const row of columnRows) {
        columns[row.name as string] = {
          type: row.type as string,
          primaryKey: row.pk === 1,
          notNull: row.notnull === 1,
          defaultValue: row.dflt_value,
        };
      }

      const indexRows = executeNativeQuery(
        database,
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND tbl_name = ?
           AND name NOT LIKE 'sqlite_%'`,
        [tableName],
      ).rows;

      const indexes: IndexDefinition[] = [];
      for (const row of indexRows) {
        const indexName = row.name as string;
        const indexInfoRows = database
          .prepare(`PRAGMA index_info(${quoteIdentifier(indexName)})`)
          .all()
          .map(toPlainRow);
        const indexListRows = database
          .prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
          .all()
          .map(toPlainRow);

        indexes.push({
          name: indexName,
          columns: indexInfoRows.map((info: Record<string, any>) => info.name),
          unique: indexListRows.some(
            (info: Record<string, any>) =>
              info.name === indexName && info.unique === 1,
          ),
        });
      }

      const fkRows = database
        .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`)
        .all()
        .map(toPlainRow);

      return {
        tableName,
        columns,
        indexes,
        foreignKeys: fkRows.map((row: Record<string, any>) => ({
          column: row.from as string,
          referencesTable: row.table as string,
          referencesColumn: row.to as string,
          onDelete: row.on_delete as string | undefined,
          onUpdate: row.on_update as string | undefined,
        })),
      };
    };

    const alterTable = {
      addColumn: async (
        tableName: string,
        column: ColumnDefinitionWithName,
      ): Promise<void> => {
        validateTableName(tableName);
        validateColumnName(column.name);
        try {
          const sql = generateAddColumnStatement(tableName, column, 'sqlite');
          executeNativeQuery(database, sql);
        } catch (error) {
          throw wrapDatabaseError('Failed to add column to table', error, {
            table: tableName,
            column: column.name,
          });
        }
      },

      addIndex: async (
        tableName: string,
        index: IndexDefinition,
      ): Promise<void> => {
        validateTableName(tableName);
        validateIndexName(index.name);
        for (const column of index.columns) {
          validateColumnName(column);
        }
        try {
          const sql = generateCreateIndexStatement(tableName, index);
          executeNativeQuery(database, sql);
        } catch (error) {
          throw wrapDatabaseError('Failed to create index on table', error, {
            table: tableName,
            index: index.name,
          });
        }
      },
    };

    const close = createNativeSqliteCloser(
      notificationCloseables,
      honkerDb,
      database,
    );
    closeResources = close;

    function buildDatabaseInterface(
      upsertImpl: DatabaseInterface['upsert'],
      transactionImpl: DatabaseInterface['transaction'] = transaction,
      beginTransactionImpl: DatabaseInterface['beginTransaction'] = beginTransaction,
    ): DatabaseInterface {
      return {
        url,
        client: database,
        query,
        insert,
        update,
        upsert: upsertImpl,
        get,
        list,
        getOrInsert,
        delete: deleteRecords,
        count,
        table,
        tableExists,
        many,
        single,
        pluck,
        execute,
        oo,
        oO,
        ox,
        xx,
        syncSchema,
        initializeSchemas,
        transaction: transactionImpl,
        beginTransaction: beginTransactionImpl,
        getTableSchema,
        alterTable,
        close,
        ...(vectorCapabilities ? { vector: vectorCapabilities } : {}),
        ...(notificationCapabilities
          ? { notifications: notificationCapabilities }
          : {}),
      };
    }

    const db = buildDatabaseInterface(upsert);
    const resolvedSchemas = resolveSchemas(options.schemas);
    if (resolvedSchemas && Object.keys(resolvedSchemas).length > 0) {
      createNativeTablesFromSchemas(database, resolvedSchemas);
    }

    return db;
  } catch (error) {
    try {
      if (closeResources) await closeResources();
      else database.close();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Native SQLite initialization and cleanup failed',
      );
    }
    throw error;
  }
}
