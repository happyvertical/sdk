import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SqliteOptions } from '../sqlite';
import { type DatabaseEngine, ReopenNotSupportedError } from './types';

/** The SQLite engines, which share files but not file locks. */
type SqliteEngine = Extract<DatabaseEngine, 'node-sqlite' | 'libsql'>;

/**
 * The normalized URL when `url` names a remote LibSQL database (`libsql:`,
 * `http:` or `https:`), otherwise `undefined`. The adapter uses this one test
 * everywhere, so a URL with stray whitespace is remote in every code path.
 */
export function remoteSqliteUrl(url: string): string | undefined {
  const normalized = url.replace(/[\t\n\r]/g, '').trim();
  return /^(?:https?|libsql):/i.test(normalized) ? normalized : undefined;
}

/**
 * The local file a SQLite URL opens, or `undefined` for in-memory and remote
 * databases. Accepts a plain path, `file:path`, and `file://path`.
 */
export function localSqliteFilePath(url: string): string | undefined {
  if (url === ':memory:' || url.startsWith('file::memory:')) return undefined;
  if (remoteSqliteUrl(url)) return undefined;
  try {
    if (url.startsWith('file://')) return fileURLToPath(new URL(url));
    if (url.startsWith('file:')) {
      const path = url.slice('file:'.length).split('?')[0];
      return path ? resolve(path) : undefined;
    }
  } catch {
    return undefined;
  }
  return resolve(url);
}

/** Resolved real path; falls back to the real parent when the file is new. */
function realFilePath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    try {
      return join(realpathSync(dirname(path)), basename(path));
    } catch {
      return path;
    }
  }
}

/**
 * Bookkeeping of the SQLite files this thread holds open, by resolved real
 * path. It exists to warn about the one unsafe arrangement: the same file held
 * through both engines.
 *
 * It sees only this thread. A connection opened in a worker thread (the
 * hazardous case in practice) is invisible to it, because module state is
 * per thread, so a worker has to rely on {@link DatabaseInterface.engine} and
 * `reopenOptions()` instead.
 */
const openFiles = new Map<string, Map<SqliteEngine, number>>();
const warned = new Set<string>();

/**
 * Records that this thread opened `url` through `engine` and warns once per
 * file when the other engine already holds it. Returns an idempotent release
 * to call when the connection closes. In-memory and remote URLs are ignored.
 */
export function trackSqliteFile(url: string, engine: SqliteEngine): () => void {
  const local = localSqliteFilePath(url);
  if (!local) return () => {};
  const path = realFilePath(local);
  const engines = openFiles.get(path) ?? new Map<SqliteEngine, number>();
  openFiles.set(path, engines);
  engines.set(engine, (engines.get(engine) ?? 0) + 1);

  const other: SqliteEngine = engine === 'libsql' ? 'node-sqlite' : 'libsql';
  if (engines.has(other) && !warned.has(path)) {
    warned.add(path);
    process.emitWarning(
      `SQLite file ${path} is open through both node:sqlite and @libsql/client in this process. ` +
        'They are separate copies of SQLite whose file locks do not coordinate, so concurrent ' +
        'writes can corrupt the file. Open every connection to one file through the same engine ' +
        '(compare db.engine, and use db.reopenOptions() for a second connection).',
      { type: 'SqliteEngineMixWarning', code: 'HV_SQL_SQLITE_ENGINE_MIX' },
    );
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (engines.get(engine) ?? 1) - 1;
    if (count > 0) engines.set(engine, count);
    else engines.delete(engine);
    if (engines.size === 0) {
      openFiles.delete(path);
      warned.delete(path);
    }
  };
}

/** @internal test hook */
export function resetSqliteFileTracking(): void {
  openFiles.clear();
  warned.clear();
}

/**
 * The location a reopen should use, fixed when the connection is acquired so a
 * later `process.chdir` or a worker with another working directory still
 * reaches the same file. Remote URLs are returned as they are.
 */
function absoluteSqliteUrl(url: string): string {
  // A `file://` URL is already absolute, and decoding it would lose escapes.
  const remote = remoteSqliteUrl(url);
  if (remote) return remote;
  if (url.startsWith('file://')) return url;
  const local = localSqliteFilePath(url);
  if (!local) return url;
  const query = url.startsWith('file:') ? url.split('?').slice(1) : [];
  return query.length ? `file:${local}?${query.join('?')}` : local;
}

/**
 * Builds the `reopenOptions` function for a SQLite connection: options that
 * reopen the same database on the same engine, for another thread.
 */
export function createSqliteReopenOptions(
  engine: SqliteEngine,
  options: SqliteOptions,
  url: string,
): () => SqliteOptions & { type: 'sqlite' } {
  const memory = url === ':memory:' || url.startsWith('file::memory:');
  const location = memory ? url : absoluteSqliteUrl(url);
  // Fixed at acquisition like the path. `windowsCustody` is a function and
  // cannot cross a thread boundary; it is left out, so a Windows worker must
  // supply its own verifier or `getDatabase` fails closed.
  const secureFile =
    options.secureFile && typeof options.secureFile === 'object'
      ? {
          driver: options.secureFile.driver,
          custody: options.secureFile.custody,
          ...(options.secureFile.root === undefined
            ? {}
            : { root: resolve(options.secureFile.root) }),
        }
      : undefined;
  return () => {
    if (memory) {
      throw new ReopenNotSupportedError(
        engine,
        'an in-memory database exists only inside its own connection',
      );
    }
    const defined = <T extends object>(value: T): T =>
      Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
      ) as T;
    const reopened: SqliteOptions & { type: 'sqlite' } = {
      type: 'sqlite',
      url: location,
      ...defined({
        transactionQueueTimeout: options.transactionQueueTimeout,
      }),
    };
    if (engine === 'node-sqlite') {
      // Copies, so a caller changing the result cannot change this connection.
      if (secureFile) reopened.secureFile = { ...secureFile };
      if (options.capabilities) {
        reopened.capabilities = structuredClone(options.capabilities);
      }
      return reopened;
    }
    return Object.assign(
      reopened,
      defined({
        authToken: options.authToken,
        encryptionKey: options.encryptionKey,
      }),
    );
  };
}
