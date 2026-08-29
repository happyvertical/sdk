import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { dirname, parse, relative, resolve, sep } from 'node:path';
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
  lastInsertRowid?: bigint;
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

export interface SecureSqliteCustodyOptions {
  custody: 'trusted-parent';
  root?: string;
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
  currentUid?: () => number;
  inspectDarwinAcl?: (filePath: string) => Promise<boolean>;
  loadDriver: () => Promise<Sqlite3Module>;
}

/** @internal Parses the stable permission marker emitted by macOS `/bin/ls`. */
export function parseDarwinAclListing(listing: string): boolean {
  const permissionMarker = /^[bcdlps-][rwxStTs-]{9}([+@ ])/.exec(listing)?.[1];
  if (!permissionMarker) {
    throw new Error('macOS ACL inspection returned an unrecognized listing');
  }
  return permissionMarker === '+';
}

function inspectDarwinAcl(filePath: string): Promise<boolean> {
  return new Promise((resolveInspection, reject) => {
    execFile(
      '/bin/ls',
      ['-lde', '--', filePath],
      {
        encoding: 'utf8',
        env: {
          // biome-ignore lint/style/useNamingConvention: standard POSIX locale variable
          LC_ALL: 'C',
        },
        timeout: 5_000,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          resolveInspection(parseDarwinAclListing(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

const defaultRuntime: SecureSqliteRuntime = {
  platform: process.platform,
  currentUid: () => {
    if (!process.getuid) {
      throw new Error('process.getuid() is unavailable');
    }
    return process.getuid();
  },
  inspectDarwinAcl,
  loadDriver: async () => {
    const moduleName = 'sqlite3';
    const imported = await import(/* @vite-ignore */ moduleName);
    return (imported.default ?? imported) as Sqlite3Module;
  },
};

const GROUP_OR_WORLD_WRITE = 0o022;
const STICKY_BIT = 0o1000;

function pathComponents(path: string): string[] {
  const root = parse(path).root;
  const components = path.slice(root.length).split(sep).filter(Boolean);
  const paths = [root];
  for (const component of components) {
    paths.push(resolve(paths.at(-1) ?? root, component));
  }
  return paths;
}

async function validateDarwinAcl(
  filePath: string,
  runtime: SecureSqliteRuntime,
): Promise<void> {
  if (runtime.platform !== 'darwin') return;

  let hasAcl: boolean;
  try {
    const inspect = runtime.inspectDarwinAcl ?? defaultRuntime.inspectDarwinAcl;
    if (!inspect) throw new Error('macOS ACL inspector is unavailable');
    hasAcl = await inspect(filePath);
  } catch (error) {
    throw new DatabaseError(
      'Secure SQLite acquisition cannot inspect macOS access control lists',
      {
        path: filePath,
        originalError: error instanceof Error ? error.message : String(error),
      },
    );
  }

  if (hasAcl) {
    throw new DatabaseError(
      'Secure SQLite custody path contains a macOS access control list',
      {
        path: filePath,
        hint: 'Remove the ACL from the application-custodied path before requesting secure acquisition.',
      },
    );
  }
}

async function validateTrustedParentCustody(
  filePath: string,
  options: SecureSqliteCustodyOptions,
  runtime: SecureSqliteRuntime,
): Promise<void> {
  if (options.custody !== 'trusted-parent') {
    throw new DatabaseError(
      'Secure SQLite acquisition requires trusted-parent custody',
      {},
    );
  }

  let currentUid: number;
  try {
    currentUid = (runtime.currentUid ?? defaultRuntime.currentUid)?.() ?? -1;
  } catch (error) {
    throw new DatabaseError(
      'Secure SQLite acquisition cannot verify the current user',
      { originalError: error instanceof Error ? error.message : String(error) },
    );
  }

  const databaseParent = dirname(filePath);
  const custodyRoot = resolve(options.root ?? databaseParent);
  const relativeDatabasePath = relative(custodyRoot, filePath);
  if (
    !relativeDatabasePath ||
    relativeDatabasePath === '..' ||
    relativeDatabasePath.startsWith(`..${sep}`) ||
    parse(relativeDatabasePath).root
  ) {
    throw new DatabaseError(
      'Secure SQLite database must be beneath its trusted custody root',
      { path: filePath, custodyRoot },
    );
  }

  const custodyRelative = relative(custodyRoot, databaseParent);
  const custodiedParents = new Set([
    custodyRoot,
    ...pathComponents(databaseParent).filter((path) => {
      const child = relative(custodyRoot, path);
      return child === '' || (!child.startsWith(`..${sep}`) && child !== '..');
    }),
  ]);

  if (
    custodyRelative === '..' ||
    custodyRelative.startsWith(`..${sep}`) ||
    parse(custodyRelative).root
  ) {
    throw new DatabaseError(
      'Secure SQLite parent must be beneath its trusted custody root',
      { path: databaseParent, custodyRoot },
    );
  }

  for (const componentPath of pathComponents(databaseParent)) {
    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      stats = await lstat(componentPath);
    } catch (error) {
      throw new DatabaseError(
        'Secure SQLite custody chain contains an inaccessible component',
        {
          path: componentPath,
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new DatabaseError(
        'Secure SQLite custody chain must contain only real directories',
        { path: componentPath },
      );
    }
    await validateDarwinAcl(componentPath, runtime);

    const isCustodied = custodiedParents.has(componentPath);
    if (isCustodied) {
      if (stats.uid !== currentUid) {
        throw new DatabaseError(
          'Secure SQLite custody directory is not owned by the current user',
          {
            path: componentPath,
            expectedUid: currentUid,
            actualUid: stats.uid,
          },
        );
      }
      if ((stats.mode & GROUP_OR_WORLD_WRITE) !== 0) {
        throw new DatabaseError(
          'Secure SQLite custody directory is group/world writable',
          { path: componentPath },
        );
      }
    } else if (
      (stats.mode & GROUP_OR_WORLD_WRITE) !== 0 &&
      (stats.mode & STICKY_BIT) === 0
    ) {
      throw new DatabaseError(
        'Secure SQLite ancestor permits replacement by another principal',
        { path: componentPath },
      );
    }
  }

  try {
    const leaf = await lstat(filePath);
    if (leaf.isSymbolicLink() || !leaf.isFile()) {
      throw new DatabaseError(
        'Secure SQLite database leaf must be a regular file',
        { path: filePath },
      );
    }
    if (leaf.uid !== currentUid) {
      throw new DatabaseError(
        'Secure SQLite database leaf is not owned by the current user',
        { path: filePath, expectedUid: currentUid, actualUid: leaf.uid },
      );
    }
    if ((leaf.mode & GROUP_OR_WORLD_WRITE) !== 0) {
      throw new DatabaseError(
        'Secure SQLite database leaf is group/world writable',
        { path: filePath },
      );
    }
    await validateDarwinAcl(filePath, runtime);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

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
  if (args.some((value) => typeof value === 'bigint')) {
    throw new DatabaseError(
      'BigInt parameters are unsupported by the secure sqlite3 driver',
      {
        hint: 'Use a safely representable number or an explicitly typed decimal/text column. BigInt is rejected rather than silently binding NULL.',
      },
    );
  }

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
  let state: 'open' | 'closing' | 'closed' = 'open';

  const execute = (
    statement: string | SecureSqliteStatement,
  ): Promise<SecureSqliteResult> => {
    if (state !== 'open') {
      return Promise.reject(
        new DatabaseError('Secure SQLite client is closing or closed', {}),
      );
    }
    const pending = executionTail.then(async () => {
      const rows = await allSqlite3(database, statement);
      const [metrics] = await allSqlite3(
        database,
        'SELECT total_changes() AS totalChanges, changes() AS rowsAffected, CAST(last_insert_rowid() AS TEXT) AS lastInsertRowid',
      );
      const nextTotalChanges = Number(metrics?.totalChanges ?? totalChanges);
      const changed = nextTotalChanges > totalChanges;
      totalChanges = nextTotalChanges;

      return {
        rows,
        rowsAffected: changed ? Number(metrics?.rowsAffected ?? 0) : 0,
        ...(changed
          ? { lastInsertRowid: BigInt(String(metrics?.lastInsertRowid ?? '0')) }
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
      if (state === 'closed') return;
      if (!closePromise) {
        state = 'closing';
        closePromise = executionTail.then(() => closeSqlite3(database));
      }
      try {
        await closePromise;
        state = 'closed';
      } catch (error) {
        state = 'open';
        closePromise = undefined;
        throw error;
      }
    },
  };
}

/**
 * Opens a local SQLite file under an explicit trusted-parent custody contract.
 *
 * Static path components and their ownership/mode are checked before driver
 * acquisition. The sqlite3 driver then passes `SQLITE_OPEN_NOFOLLOW` directly
 * to `sqlite3_open_v2()` for atomic no-follow acquisition of the leaf. This
 * protects against static symlinks and mutation by principals that cannot
 * write the custodied parent; it is not a boundary against hostile processes
 * running as the same account.
 *
 * @internal Call through `getDatabase()` with typed `secureFile` custody.
 */
export async function createSecureSqliteClient(
  url: string,
  options: SecureSqliteCustodyOptions,
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
  await validateTrustedParentCustody(filePath, options, runtime);
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
