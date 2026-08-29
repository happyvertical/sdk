import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseError } from '@happyvertical/utils';

/** SQLite's public SQLITE_OPEN_NOFOLLOW flag. */
const SQLITE_OPEN_NOFOLLOW = 0x01000000;

export interface SecureSqliteStatement {
  sql: string;
  args?: unknown[];
}

export interface SecureSqliteResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid?: number;
}

export interface SecureSqliteTransactionClient {
  readonly closed: boolean;
  execute(
    statement: string | SecureSqliteStatement,
  ): Promise<SecureSqliteResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): void;
}

export interface SecureSqliteClient {
  execute(
    statement: string | SecureSqliteStatement,
  ): Promise<SecureSqliteResult>;
  transaction(mode?: string): Promise<SecureSqliteTransactionClient>;
  close(): Promise<void>;
}

interface Sqlite3Database {
  all(
    sql: string,
    params: unknown[],
    callback: (error: Error | null, rows: Record<string, unknown>[]) => void,
  ): void;
  close(callback: (error: Error | null) => void): void;
}

interface Sqlite3Module {
  // biome-ignore lint/style/useNamingConvention: mirrors sqlite3's public API
  Database: new (
    filename: string,
    mode: number,
    callback: (error: Error | null) => void,
  ) => Sqlite3Database;
  // biome-ignore lint/style/useNamingConvention: mirrors sqlite3's public API
  OPEN_CREATE: number;
  // biome-ignore lint/style/useNamingConvention: mirrors sqlite3's public API
  OPEN_FULLMUTEX: number;
  // biome-ignore lint/style/useNamingConvention: mirrors sqlite3's public API
  OPEN_READWRITE: number;
}

/** @internal Deterministic acquisition seam used by the integration tests. */
export interface SecureSqliteRuntime {
  platform: NodeJS.Platform;
  beforeDriverOpen?: (filePath: string) => void | Promise<void>;
  afterDriverOpen?: (filePath: string) => void | Promise<void>;
  loadDriver: () => Promise<Sqlite3Module>;
}

const defaultRuntime: SecureSqliteRuntime = {
  platform: process.platform,
  loadDriver: async () => {
    const moduleName = 'sqlite3';
    const imported = await import(/* @vite-ignore */ moduleName);
    return (imported.default ?? imported) as Sqlite3Module;
  },
};

function resolveSecureFilePath(url: string): string {
  if (
    url === ':memory:' ||
    url.startsWith('file::memory:') ||
    /^(?:https?|libsql):/i.test(url)
  ) {
    throw new DatabaseError(
      'Secure SQLite acquisition requires a local file-backed database',
      {
        hint: "Use a local path or 'file:...' URL, or disable secureFile for memory and remote databases.",
      },
    );
  }

  if (url.startsWith('file://')) {
    const parsed = new URL(url);
    if (parsed.search || parsed.hash) {
      throw new DatabaseError(
        'Secure SQLite acquisition does not support file URLs with query parameters or fragments',
        {},
      );
    }
    return resolve(fileURLToPath(parsed));
  }

  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    if (!path || path.includes('?') || path.includes('#')) {
      throw new DatabaseError(
        'Secure SQLite acquisition requires a plain file path without query parameters or fragments',
        {},
      );
    }
    return resolve(path);
  }

  return resolve(url);
}

function allSqlite3(
  database: Sqlite3Database,
  statement: string | SecureSqliteStatement,
): Promise<Record<string, unknown>[]> {
  const sql = typeof statement === 'string' ? statement : statement.sql;
  const args = typeof statement === 'string' ? [] : (statement.args ?? []);

  return new Promise((resolveResult, reject) => {
    database.all(sql, args, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolveResult(rows);
    });
  });
}

function closeSqlite3(database: Sqlite3Database): Promise<void> {
  return new Promise((resolveClose, reject) => {
    database.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveClose();
    });
  });
}

function createClient(database: Sqlite3Database): SecureSqliteClient {
  let closePromise: Promise<void> | undefined;
  let executionTail = Promise.resolve();
  let totalChanges = 0;

  const execute = (
    statement: string | SecureSqliteStatement,
  ): Promise<SecureSqliteResult> => {
    const pending = executionTail.then(async () => {
      const rows = await allSqlite3(database, statement);
      const [metrics] = await allSqlite3(
        database,
        'SELECT total_changes() AS totalChanges, changes() AS rowsAffected, last_insert_rowid() AS lastInsertRowid',
      );
      const nextTotalChanges = Number(metrics?.totalChanges ?? totalChanges);
      const changed = nextTotalChanges > totalChanges;
      totalChanges = nextTotalChanges;

      return {
        rows,
        rowsAffected: changed ? Number(metrics?.rowsAffected ?? 0) : 0,
        ...(changed
          ? { lastInsertRowid: Number(metrics?.lastInsertRowid ?? 0) }
          : {}),
      };
    });

    executionTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };

  return {
    execute,
    transaction: async () => {
      await execute('BEGIN IMMEDIATE');
      let transactionClosed = false;

      const end = async (sql: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
        if (transactionClosed) return;
        await execute(sql);
        transactionClosed = true;
      };

      return {
        get closed() {
          return transactionClosed;
        },
        execute,
        commit: () => end('COMMIT'),
        rollback: () => end('ROLLBACK'),
        close: () => {},
      };
    },
    close: async () => {
      closePromise ??= closeSqlite3(database);
      try {
        await closePromise;
      } catch (error) {
        closePromise = undefined;
        throw error;
      }
    },
  };
}

/**
 * Atomically opens a local SQLite file without following symbolic links.
 *
 * The sqlite3 driver passes `SQLITE_OPEN_NOFOLLOW` directly to
 * `sqlite3_open_v2()`. SQLite's VFS resolves the complete pathname under that
 * flag and rejects a symbolic link in either the leaf or any ancestor at the
 * instant the driver opens or creates the database. The returned SQLite handle
 * remains bound to that acquired file even if another process later renames
 * the pathname; callers that require a stable directory entry for the entire
 * connection lifetime must additionally protect the containing directory.
 *
 * @internal Call through `getDatabase({ type: 'sqlite', secureFile: true })`.
 */
export async function createSecureSqliteClient(
  url: string,
  runtime: SecureSqliteRuntime = defaultRuntime,
): Promise<SecureSqliteClient> {
  if (runtime.platform !== 'darwin' && runtime.platform !== 'linux') {
    throw new DatabaseError(
      `Secure SQLite acquisition is unsupported on ${runtime.platform}`,
      {
        hint: 'secureFile requires the sqlite3 Unix VFS on macOS or Linux. Disable secureFile only if pathname acquisition is acceptable.',
      },
    );
  }

  const filePath = resolveSecureFilePath(url);
  let sqlite3: Sqlite3Module;
  try {
    sqlite3 = await runtime.loadDriver();
  } catch (error) {
    throw new DatabaseError(
      'Secure SQLite acquisition could not load the sqlite3 driver',
      {
        hint: 'Install @happyvertical/sql with its sqlite3 native dependency and allow its platform install script, or disable secureFile only if pathname acquisition is acceptable.',
        originalError: error instanceof Error ? error.message : String(error),
      },
    );
  }
  await runtime.beforeDriverOpen?.(filePath);

  const mode =
    sqlite3.OPEN_READWRITE |
    sqlite3.OPEN_CREATE |
    sqlite3.OPEN_FULLMUTEX |
    SQLITE_OPEN_NOFOLLOW;

  const database = await new Promise<Sqlite3Database>((resolveOpen, reject) => {
    let opened: Sqlite3Database;
    opened = new sqlite3.Database(filePath, mode, (error) => {
      if (error) {
        reject(
          new DatabaseError(
            'Secure SQLite acquisition rejected the database path',
            {
              path: filePath,
              hint: 'Ensure the database path and every ancestor are real directories/files, not symbolic links, and that the file is writable.',
              originalError: error.message,
            },
          ),
        );
        return;
      }
      resolveOpen(opened);
    });
  });

  try {
    await runtime.afterDriverOpen?.(filePath);
  } catch (error) {
    await closeSqlite3(database).catch(() => {});
    throw error;
  }

  return createClient(database);
}
