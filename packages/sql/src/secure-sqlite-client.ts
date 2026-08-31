import { execFile } from 'node:child_process';
import type { BigIntStats } from 'node:fs';
import { lstat, open, unlink } from 'node:fs/promises';
import { dirname, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseError } from '@happyvertical/utils';

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
  readonly transactionReservation: 'exclusive';
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

interface NodeSqliteStatement {
  all(...args: unknown[]): Record<string, unknown>[];
  columns(): Array<{ name: string }>;
  run(...args: unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  setReadBigInts(enabled: boolean): void;
}

interface NodeSqliteDatabase {
  readonly isTransaction: boolean;
  prepare(sql: string): NodeSqliteStatement;
  close(): void;
}

interface NodeSqliteModule {
  // biome-ignore lint/style/useNamingConvention: mirrors node:sqlite's public API
  DatabaseSync: new (
    filename: string,
    options?: {
      enableForeignKeyConstraints?: boolean;
      enableDoubleQuotedStringLiterals?: boolean;
    },
  ) => NodeSqliteDatabase;
}

/** @internal Deterministic acquisition seam used by the integration tests. */
export interface SecureSqliteRuntime {
  platform: NodeJS.Platform;
  nodeVersion?: string;
  currentUid?: () => number;
  pathOwnerUid?: (filePath: string, actualUid: number) => number;
  inspectDarwinAcl?: (filePath: string) => Promise<boolean>;
  openLeaf?: typeof open;
  lstatLeaf?: typeof lstat;
  loadDriver: () => Promise<NodeSqliteModule>;
}

/**
 * @internal Parses the stable ACL section emitted by macOS `/bin/ls`.
 * Returns true only when the ACL grants authority; deny-only ACLs are
 * restrictive and do not weaken trusted-parent custody.
 */
export function parseDarwinAclListing(listing: string): boolean {
  const permissionMarker = /^[bcdlps-][rwxStTs-]{9}([+@ ])/.exec(listing)?.[1];
  if (!permissionMarker) {
    throw new Error('macOS ACL inspection returned an unrecognized listing');
  }
  const aclEntries = listing.split('\n').slice(1).filter(Boolean);
  if (aclEntries.length === 0) {
    if (permissionMarker === '+') {
      throw new Error('macOS ACL inspection returned no ACL entries');
    }
    return false;
  }
  if (permissionMarker !== '+' && permissionMarker !== '@') {
    throw new Error('macOS ACL inspection returned entries without a marker');
  }
  let grantsAuthority = false;
  for (const entry of aclEntries) {
    const parsed = /^\s+\d+:\s+.+\s+(allow|deny)\s+[A-Za-z_,]+\s*$/.exec(entry);
    if (!parsed) {
      throw new Error('macOS ACL inspection returned an unrecognized entry');
    }
    if (parsed[1] === 'allow') grantsAuthority = true;
  }
  return grantsAuthority;
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
  nodeVersion: process.versions.node,
  currentUid: () => {
    if (!process.getuid) {
      throw new Error('process.getuid() is unavailable');
    }
    return process.getuid();
  },
  inspectDarwinAcl,
  loadDriver: async () => {
    const moduleName = 'node:sqlite';
    return (await import(/* @vite-ignore */ moduleName)) as NodeSqliteModule;
  },
};

const GROUP_OR_WORLD_WRITE = 0o022;
const STICKY_BIT = 0o1000;
const MINIMUM_NODE_VERSION = [24, 18, 0] as const;

function validateNodeVersion(runtime: SecureSqliteRuntime): void {
  const version = runtime.nodeVersion ?? defaultRuntime.nodeVersion ?? '';
  const match =
    /^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version,
    );
  const parsed = match?.slice(1, 4).map(Number);
  const isPrerelease = Boolean(match?.[4]);
  if (
    !parsed ||
    parsed.some((part) => !Number.isSafeInteger(part)) ||
    isPrerelease ||
    parsed[0] < MINIMUM_NODE_VERSION[0] ||
    (parsed[0] === MINIMUM_NODE_VERSION[0] &&
      parsed[1] < MINIMUM_NODE_VERSION[1]) ||
    (parsed[0] === MINIMUM_NODE_VERSION[0] &&
      parsed[1] === MINIMUM_NODE_VERSION[1] &&
      parsed[2] < MINIMUM_NODE_VERSION[2])
  ) {
    throw new DatabaseError('Secure SQLite requires Node.js 24.18.0 or newer', {
      actualVersion: version || 'unknown',
      minimumVersion: MINIMUM_NODE_VERSION.join('.'),
      hint: 'Upgrade the runtime before requesting trusted-parent secure SQLite. Default LibSQL mode remains available on older supported runtimes.',
    });
  }
}

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
      'Secure SQLite custody path contains a permissive macOS access control list',
      {
        path: filePath,
        hint: 'Remove ACL entries that grant authority from the application-custodied path before requesting secure acquisition.',
      },
    );
  }
}

async function validateTrustedParentCustody(
  filePath: string,
  options: SecureSqliteCustodyOptions,
  runtime: SecureSqliteRuntime,
): Promise<boolean> {
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

    const componentUid =
      runtime.pathOwnerUid?.(componentPath, stats.uid) ?? stats.uid;
    const isCustodied = custodiedParents.has(componentPath);
    if (isCustodied) {
      if (componentUid !== currentUid) {
        throw new DatabaseError(
          'Secure SQLite custody directory is not owned by the current user',
          {
            path: componentPath,
            expectedUid: currentUid,
            actualUid: componentUid,
          },
        );
      }
      if ((stats.mode & GROUP_OR_WORLD_WRITE) !== 0) {
        throw new DatabaseError(
          'Secure SQLite custody directory is group/world writable',
          { path: componentPath },
        );
      }
    } else {
      if (componentUid !== currentUid && componentUid !== 0) {
        throw new DatabaseError(
          'Secure SQLite ancestor is owned by an untrusted user',
          {
            path: componentPath,
            expectedUid: currentUid,
            actualUid: componentUid,
          },
        );
      }
      if (
        (stats.mode & GROUP_OR_WORLD_WRITE) !== 0 &&
        (stats.mode & STICKY_BIT) === 0
      ) {
        throw new DatabaseError(
          'Secure SQLite ancestor permits replacement by another principal',
          { path: componentPath },
        );
      }
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
    const leafUid = runtime.pathOwnerUid?.(filePath, leaf.uid) ?? leaf.uid;
    if (leafUid !== currentUid) {
      throw new DatabaseError(
        'Secure SQLite database leaf is not owned by the current user',
        { path: filePath, expectedUid: currentUid, actualUid: leafUid },
      );
    }
    if ((leaf.mode & GROUP_OR_WORLD_WRITE) !== 0) {
      throw new DatabaseError(
        'Secure SQLite database leaf is group/world writable',
        { path: filePath },
      );
    }
    await validateDarwinAcl(filePath, runtime);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  }
}

interface SecureLeafIdentity {
  birthtimeNs: bigint;
  ctimeNs: bigint;
  dev: bigint;
  ino: bigint;
}

function leafIdentity(
  stats: Pick<BigIntStats, 'birthtimeNs' | 'ctimeNs' | 'dev' | 'ino'>,
): SecureLeafIdentity {
  return {
    birthtimeNs: stats.birthtimeNs,
    ctimeNs: stats.ctimeNs,
    dev: stats.dev,
    ino: stats.ino,
  };
}

function sameLeafIdentity(
  left: SecureLeafIdentity,
  right: SecureLeafIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.birthtimeNs === right.birthtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function createSecureLeaf(
  filePath: string,
  runtime: SecureSqliteRuntime,
): Promise<SecureLeafIdentity | undefined> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await (runtime.openLeaf ?? open)(filePath, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return undefined;
    throw new DatabaseError(
      'Secure SQLite could not create the database leaf',
      {
        path: filePath,
        originalError: error instanceof Error ? error.message : String(error),
      },
    );
  }

  let identity: SecureLeafIdentity | undefined;
  let acquisitionError: unknown;
  try {
    const stats = await handle.stat({ bigint: true });
    identity = leafIdentity(stats);
  } catch (error) {
    acquisitionError = error;
  }
  try {
    await handle.close();
  } catch (error) {
    acquisitionError = acquisitionError
      ? new AggregateError(
          [acquisitionError, error],
          'Secure SQLite leaf inspection and close failed',
        )
      : error;
  }

  if (acquisitionError) {
    // If fstat failed, there is no trustworthy pathname identity with which to
    // decide whether cleanup is still deleting the file we created. Leave the
    // restrictive empty leaf behind rather than unlinking a replacement.
    const cleanupError = identity
      ? await removeCreatedLeafIfUnchanged(filePath, identity, runtime)
      : undefined;
    throw new DatabaseError('Secure SQLite could not close the created leaf', {
      path: filePath,
      originalError:
        acquisitionError instanceof Error
          ? acquisitionError.message
          : String(acquisitionError),
      ...(!identity ? { cleanupSkipped: 'leaf identity unavailable' } : {}),
      ...(cleanupError ? { cleanupError } : {}),
    });
  }

  return identity;
}

async function removeCreatedLeafIfUnchanged(
  filePath: string,
  identity: SecureLeafIdentity,
  runtime: SecureSqliteRuntime,
): Promise<string | undefined> {
  try {
    const current = await (runtime.lstatLeaf ?? lstat)(filePath, {
      bigint: true,
    });
    if (!sameLeafIdentity(leafIdentity(current), identity)) {
      return undefined;
    }
    await unlink(filePath);
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return error instanceof Error ? error.message : String(error);
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

function normalizeExactInteger(value: unknown): unknown {
  if (typeof value !== 'bigint') return value;
  if (
    value >= BigInt(Number.MIN_SAFE_INTEGER) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value);
  }
  return value;
}

function normalizeExactRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      normalizeExactInteger(value),
    ]),
  );
}

function toExactBigInt(value: number | bigint, metric: string): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isSafeInteger(value)) {
    throw new DatabaseError(
      `Secure SQLite returned an inexact ${metric} metric`,
      { metric, value },
    );
  }
  return BigInt(value);
}

/** @internal Exact public-contract range guard used by deterministic tests. */
export function toPublicRowCount(value: number | bigint): number {
  const exact = toExactBigInt(value, 'changes');
  if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new DatabaseError(
      'Secure SQLite changes exceed the public safe-integer row-count range',
      {
        changes: exact.toString(),
        maxSafeInteger: Number.MAX_SAFE_INTEGER,
      },
    );
  }
  return Number(exact);
}

/**
 * node:sqlite does not bind named parameters from the positional array used by
 * the existing LibSQL adapter. Translate executable parameters to SQLite
 * numeric slots while preserving SQLite's first-occurrence allocation and
 * reuse rules, including Tcl-style `$name::suffix(...)` parameters. Quoted
 * text, identifiers, and comments remain untouched.
 */
function normalizeNodeSqlitePlaceholders(sql: string): string {
  let normalized = '';
  let index = 0;
  let quote: "'" | '"' | '`' | ']' | undefined;
  let largestParameterIndex = 0;
  const namedParameterIndexes = new Map<string, number>();

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (quote) {
      normalized += char;
      if (char === quote) {
        if (next === quote && quote !== ']') {
          normalized += next;
          index += 2;
          continue;
        }
        quote = undefined;
      }
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === '`' || char === '[') {
      quote = char === '[' ? ']' : char;
      normalized += char;
      index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index + 2);
      if (end === -1) return normalized + sql.slice(index);
      normalized += sql.slice(index, end + 1);
      index = end + 1;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      if (end === -1) return normalized + sql.slice(index);
      normalized += sql.slice(index, end + 2);
      index = end + 2;
      continue;
    }

    if (char === '?') {
      let end = index + 1;
      while (/[0-9]/.test(sql[end] ?? '')) end += 1;
      if (end > index + 1) {
        largestParameterIndex = Math.max(
          largestParameterIndex,
          Number(sql.slice(index + 1, end)),
        );
        normalized += sql.slice(index, end);
      } else {
        largestParameterIndex += 1;
        normalized += `?${largestParameterIndex}`;
      }
      index = end;
      continue;
    }

    if (
      (char === '$' || char === ':' || char === '@') &&
      /[A-Za-z0-9_]/.test(next ?? '') &&
      !/[A-Za-z0-9_$:@]/.test(sql[index - 1] ?? '')
    ) {
      let end = index + 2;
      while (/[A-Za-z0-9_]/.test(sql[end] ?? '')) end += 1;
      if (char === '$') {
        while (
          sql.slice(end, end + 2) === '::' &&
          /[A-Za-z0-9_]/.test(sql[end + 2] ?? '')
        ) {
          end += 3;
          while (/[A-Za-z0-9_]/.test(sql[end] ?? '')) end += 1;
        }
        if (sql[end] === '(') {
          const closingParenthesis = sql.indexOf(')', end + 1);
          if (closingParenthesis !== -1) end = closingParenthesis + 1;
        }
      }
      const token = sql.slice(index, end);
      let parameterIndex = namedParameterIndexes.get(token);
      if (parameterIndex === undefined) {
        largestParameterIndex += 1;
        parameterIndex = largestParameterIndex;
        namedParameterIndexes.set(token, parameterIndex);
      }
      normalized += `?${parameterIndex}`;
      index = end;
      continue;
    }

    normalized += char;
    index += 1;
  }

  return normalized;
}

function executeNodeSqlite(
  database: NodeSqliteDatabase,
  statement: string | SecureSqliteStatement,
): SecureSqliteResult {
  const sql = normalizeNodeSqlitePlaceholders(
    typeof statement === 'string' ? statement : statement.sql,
  );
  const args = (
    typeof statement === 'string' ? [] : (statement.args ?? [])
  ).map((value) => (typeof value === 'boolean' ? Number(value) : value));
  const prepared = database.prepare(sql);
  prepared.setReadBigInts(true);

  if (prepared.columns().length > 0) {
    const beforeStatement = database.prepare(
      'SELECT total_changes() AS totalChanges',
    );
    beforeStatement.setReadBigInts(true);
    const before = toExactBigInt(
      beforeStatement.all()[0]?.totalChanges as number | bigint,
      'totalChanges',
    );
    const rows = prepared.all(...args).map(normalizeExactRow);
    const afterStatement = database.prepare(
      'SELECT total_changes() AS totalChanges, changes() AS changes, last_insert_rowid() AS lastInsertRowid',
    );
    afterStatement.setReadBigInts(true);
    const metrics = afterStatement.all()[0];
    const after = toExactBigInt(
      metrics?.totalChanges as number | bigint,
      'totalChanges',
    );
    const changed = after > before;
    const rowsAffected = changed
      ? toPublicRowCount(metrics?.changes as number | bigint)
      : 0;
    return {
      rows,
      rowsAffected,
      ...(changed
        ? {
            lastInsertRowid: toExactBigInt(
              metrics?.lastInsertRowid as number | bigint,
              'lastInsertRowid',
            ),
          }
        : {}),
    };
  }

  const result = prepared.run(...args);
  const rowsAffected = toPublicRowCount(result.changes);
  return {
    rows: [],
    rowsAffected,
    ...(rowsAffected > 0
      ? {
          lastInsertRowid: toExactBigInt(
            result.lastInsertRowid,
            'lastInsertRowid',
          ),
        }
      : {}),
  };
}

function createClient(database: NodeSqliteDatabase): SecureSqliteClient {
  interface ReservationOwner {
    active: boolean;
    beforeExecute?: () => void;
    tail: Promise<void>;
  }

  let closePromise: Promise<void> | undefined;
  let executionTail = Promise.resolve();
  let state: 'open' | 'closing' | 'closed' = 'open';

  const executeStatement = async (
    statement: string | SecureSqliteStatement,
  ): Promise<SecureSqliteResult> => {
    return executeNodeSqlite(database, statement);
  };

  const enqueue = (
    statement: string | SecureSqliteStatement,
    owner?: ReservationOwner,
  ): Promise<SecureSqliteResult> => {
    if (owner) {
      if (!owner.active || state === 'closed') {
        return Promise.reject(
          new DatabaseError(
            'Secure SQLite transaction reservation is closed',
            {},
          ),
        );
      }
      const pending = owner.tail.then(() => {
        if (!owner.active || state === 'closed') {
          throw new DatabaseError(
            'Secure SQLite transaction reservation is closed',
            {},
          );
        }
        owner.beforeExecute?.();
        return executeStatement(statement);
      });
      owner.tail = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    }

    if (state !== 'open') {
      return Promise.reject(
        new DatabaseError('Secure SQLite client is closing or closed', {}),
      );
    }
    const pending = executionTail.then(() => executeStatement(statement));

    executionTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };

  const acquireReservation = async (): Promise<{
    owner: ReservationOwner;
    release: () => Promise<void>;
  }> => {
    if (state !== 'open') {
      throw new DatabaseError('Secure SQLite client is closing or closed', {});
    }

    const owner: ReservationOwner = {
      active: false,
      tail: Promise.resolve(),
    };
    let markAcquired: () => void = () => {};
    let markReleased: () => void = () => {};
    const acquired = new Promise<void>((resolveAcquired) => {
      markAcquired = resolveAcquired;
    });
    const released = new Promise<void>((resolveReleased) => {
      markReleased = resolveReleased;
    });
    const reservation = executionTail.then(async () => {
      owner.active = true;
      markAcquired();
      await released;
      await owner.tail;
      owner.active = false;
    });
    executionTail = reservation.then(
      () => undefined,
      () => undefined,
    );

    await acquired;
    let releaseStarted = false;
    return {
      owner,
      release: async () => {
        if (!releaseStarted) {
          releaseStarted = true;
          markReleased();
        }
        await reservation;
      },
    };
  };

  const execute = (
    statement: string | SecureSqliteStatement,
  ): Promise<SecureSqliteResult> => enqueue(statement);

  return {
    transactionReservation: 'exclusive',
    execute,
    transaction: async () => {
      const { owner, release } = await acquireReservation();
      try {
        await enqueue('BEGIN IMMEDIATE', owner);
      } catch (error) {
        await release();
        throw error;
      }
      let transactionClosed = false;
      let transactionEnding = false;
      let reservationReleased = false;
      let automaticRollbackError: DatabaseError | undefined;

      const releaseReservation = async (): Promise<void> => {
        if (reservationReleased) return;
        reservationReleased = true;
        await release();
      };

      const detectAutomaticRollback = (): void => {
        if (transactionClosed || database.isTransaction) return;
        transactionClosed = true;
        automaticRollbackError = new DatabaseError(
          'Secure SQLite transaction ended automatically',
          {
            hint: 'A statement conflict policy such as ON CONFLICT ROLLBACK ended the transaction. No later accepted work was executed.',
          },
        );
        // Release only after every statement already accepted by this owner has
        // drained. Those later statements observe transactionClosed and reject
        // before touching SQLite.
        void releaseReservation().catch(() => {});
      };

      const executeInTransaction = async (
        statement: string | SecureSqliteStatement,
      ): Promise<SecureSqliteResult> => {
        detectAutomaticRollback();
        if (transactionClosed) {
          throw (
            automaticRollbackError ??
            new DatabaseError(
              'Secure SQLite transaction reservation is closed',
              {},
            )
          );
        }
        try {
          return await enqueue(statement, owner);
        } finally {
          detectAutomaticRollback();
        }
      };
      owner.beforeExecute = () => {
        detectAutomaticRollback();
        if (transactionClosed) {
          throw (
            automaticRollbackError ??
            new DatabaseError(
              'Secure SQLite transaction reservation is closed',
              {},
            )
          );
        }
      };

      const end = async (sql: 'COMMIT' | 'ROLLBACK'): Promise<void> => {
        if (transactionEnding) {
          throw new DatabaseError(
            'Secure SQLite transaction is already ending',
            {},
          );
        }
        if (transactionClosed) {
          await releaseReservation();
          if (sql === 'COMMIT' && automaticRollbackError) {
            throw automaticRollbackError;
          }
          return;
        }
        transactionEnding = true;
        if (sql === 'COMMIT') {
          try {
            await enqueue(sql, owner);
            transactionClosed = true;
            await releaseReservation();
            return;
          } finally {
            transactionEnding = false;
          }
        }
        try {
          await enqueue(sql, owner);
          transactionClosed = true;
          await releaseReservation();
        } catch (rollbackError) {
          // A failed rollback leaves SQLite's transaction state uncertain. Do
          // not return this connection to service: close it after the accepted
          // owner queue drains and propagate every cleanup failure.
          transactionClosed = true;
          state = 'closing';
          let closeError: unknown;
          try {
            await releaseReservation();
            database.close();
          } catch (error) {
            closeError = error;
          } finally {
            state = 'closed';
          }
          if (closeError) {
            throw new AggregateError(
              [rollbackError, closeError],
              'Secure SQLite rollback and connection invalidation both failed',
              { cause: rollbackError },
            );
          }
          throw rollbackError;
        } finally {
          transactionEnding = false;
        }
      };

      return {
        get closed() {
          return transactionClosed;
        },
        execute: executeInTransaction,
        commit: () => end('COMMIT'),
        rollback: () => end('ROLLBACK'),
        close: () => {
          if (!transactionClosed) void end('ROLLBACK').catch(() => {});
        },
      };
    },
    close: async () => {
      if (state === 'closed') return;
      if (!closePromise) {
        state = 'closing';
        closePromise = executionTail.then(() => database.close());
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
 * Static path components and their ownership/mode are checked before the
 * built-in `node:sqlite` driver opens the file. Other principals cannot replace
 * a path beneath the caller-custodied parent. Hostile processes running as the
 * same account are explicitly outside this boundary.
 *
 * @internal Call through `getDatabase()` with typed `secureFile` custody.
 */
export async function createSecureSqliteClient(
  url: string,
  options: SecureSqliteCustodyOptions,
  runtime: SecureSqliteRuntime = defaultRuntime,
): Promise<SecureSqliteClient> {
  validateNodeVersion(runtime);
  if (runtime.platform !== 'darwin' && runtime.platform !== 'linux') {
    throw new DatabaseError(
      `Secure SQLite acquisition is unsupported on ${runtime.platform}`,
      {
        hint: 'secureFile requires built-in node:sqlite on macOS or Linux. Disable secureFile only if trusted-parent custody is not required.',
      },
    );
  }

  const filePath = resolveSecureFilePath(url);
  const leafExisted = await validateTrustedParentCustody(
    filePath,
    options,
    runtime,
  );
  let nodeSqlite: NodeSqliteModule;
  try {
    nodeSqlite = await runtime.loadDriver();
  } catch (error) {
    throw new DatabaseError(
      'Secure SQLite acquisition could not load the node:sqlite driver',
      {
        hint: 'Run @happyvertical/sql on its supported Node.js version with built-in node:sqlite available.',
        originalError: error instanceof Error ? error.message : String(error),
      },
    );
  }
  let createdLeaf: SecureLeafIdentity | undefined;
  if (!leafExisted) {
    createdLeaf = await createSecureLeaf(filePath, runtime);
    // An EEXIST race or inherited platform ACL must still satisfy the complete
    // custody contract before the driver sees the path. Other principals
    // cannot create beneath a validated trusted parent; hostile same-UID
    // mutation remains outside the documented boundary.
    try {
      const acquiredLeaf = await validateTrustedParentCustody(
        filePath,
        options,
        runtime,
      );
      if (!acquiredLeaf) {
        throw new DatabaseError(
          'Secure SQLite database leaf disappeared during acquisition',
          { path: filePath },
        );
      }
      if (createdLeaf) {
        let current: BigIntStats;
        try {
          current = await (runtime.lstatLeaf ?? lstat)(filePath, {
            bigint: true,
          });
        } catch (error) {
          throw new DatabaseError(
            'Secure SQLite database leaf changed during acquisition',
            {
              path: filePath,
              originalError:
                error instanceof Error ? error.message : String(error),
            },
          );
        }
        if (!sameLeafIdentity(leafIdentity(current), createdLeaf)) {
          throw new DatabaseError(
            'Secure SQLite database leaf changed during acquisition',
            { path: filePath },
          );
        }
      }
    } catch (error) {
      if (createdLeaf) {
        await removeCreatedLeafIfUnchanged(filePath, createdLeaf, runtime);
      }
      throw error;
    }
  }

  let database: NodeSqliteDatabase;
  try {
    database = new nodeSqlite.DatabaseSync(filePath, {
      // Match the legacy LibSQL adapter rather than inheriting node:sqlite's
      // intentionally stricter defaults.
      enableForeignKeyConstraints: false,
      enableDoubleQuotedStringLiterals: true,
    });
  } catch (error) {
    let cleanupError: string | undefined;
    if (createdLeaf) {
      cleanupError = await removeCreatedLeafIfUnchanged(
        filePath,
        createdLeaf,
        runtime,
      );
    }
    throw new DatabaseError(
      'Secure SQLite acquisition rejected the database path',
      {
        path: filePath,
        hint: 'Ensure the database path and every ancestor are real directories/files, not symbolic links, and that the file is writable.',
        originalError: error instanceof Error ? error.message : String(error),
        ...(cleanupError ? { cleanupError } : {}),
      },
    );
  }

  return createClient(database);
}
