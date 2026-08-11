import { ConnectionCache } from './connection-cache';
import type { DatabaseInterface, DatabaseOptions } from './types';

export type SqliteAdapterPath = 'libsql' | 'native';

const sqliteConnectionCache = new ConnectionCache<DatabaseInterface>();
type SqliteCacheGroup = {
  barrier?: Promise<void>;
  failure?: unknown;
  hasFailure: boolean;
};
const sqliteCacheGroups = new Map<string, SqliteCacheGroup>();

const cacheKey = (dbid: string, path: SqliteAdapterPath) =>
  `sqlite:${path}:${dbid}`;

async function closeSqliteDatabase(db: DatabaseInterface): Promise<void> {
  await db.close?.();
}

async function clearSqliteCacheGroup(dbid: string): Promise<void> {
  const group = sqliteCacheGroups.get(dbid) ?? { hasFailure: false };
  sqliteCacheGroups.set(dbid, group);
  const previous = group.barrier;
  const barrier = (previous?.catch(() => {}) ?? Promise.resolve()).then(
    async () => {
      const results = await Promise.allSettled([
        sqliteConnectionCache.evict(
          cacheKey(dbid, 'libsql'),
          closeSqliteDatabase,
        ),
        sqliteConnectionCache.evict(
          cacheKey(dbid, 'native'),
          closeSqliteDatabase,
        ),
      ]);
      const failures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (failures.length) {
        group.failure =
          failures.length === 1
            ? failures[0].reason
            : new AggregateError(
                failures.map((failure) => failure.reason),
                'Multiple SQLite adapter paths failed to clear',
              );
        group.hasFailure = true;
        throw group.failure;
      }
      group.failure = undefined;
      group.hasFailure = false;
    },
  );
  group.barrier = barrier;
  try {
    await barrier;
  } finally {
    if (group.barrier === barrier) {
      group.barrier = undefined;
      if (!group.hasFailure) sqliteCacheGroups.delete(dbid);
    }
  }
}

async function awaitSqliteCacheGroup(dbid: string): Promise<void> {
  const group = sqliteCacheGroups.get(dbid);
  if (!group) return;
  if (group.barrier) await group.barrier;
  if (group.hasFailure) throw group.failure;
}

export async function getCachedSqliteDatabase(
  path: SqliteAdapterPath,
  options: DatabaseOptions,
  create: () => Promise<DatabaseInterface>,
): Promise<DatabaseInterface> {
  const { dbid } = options;
  if (dbid && options.clearCache) {
    await clearSqliteCacheGroup(dbid);
  } else if (dbid) {
    await awaitSqliteCacheGroup(dbid);
  }

  return sqliteConnectionCache.getOrCreate(
    dbid ? cacheKey(dbid, path) : undefined,
    { ...options, clearCache: false },
    async () => {
      const db = await create();
      const originalClose = db.close?.bind(db);
      let closePromise: Promise<void> | undefined;
      db.close = async () => {
        sqliteConnectionCache.forget(db);
        if (!closePromise) {
          closePromise = originalClose?.() ?? Promise.resolve();
        }
        try {
          await closePromise;
        } catch (error) {
          closePromise = undefined;
          throw error;
        }
      };
      return db;
    },
    closeSqliteDatabase,
  );
}
