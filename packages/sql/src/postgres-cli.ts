/**
 * Shell-out wrappers for the postgres command-line tools (`pg_dump`,
 * `pg_restore`, `createdb`, `dropdb`) and the URL/locality helpers that
 * surround them.
 *
 * These live in `@happyvertical/sql` because postgres URL parsing and pg
 * binary invocation are SQL-layer concerns — no SMRT awareness or backup
 * orchestration here. See `@happyvertical/sql/backup` for the higher-level
 * snapshot helpers that compose these primitives with file storage.
 */
import { spawn } from 'node:child_process';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PostgresLocalityOptions {
  /** Allow exporting from a non-local database without --allow-production. */
  allowProduction?: boolean;
  /** Allow exporting a local database when `prod: true` is set. */
  allowLocal?: boolean;
  /** True when the caller is running a production-flavored export. */
  prod?: boolean;
}

export interface PostgresImportLocalityOptions {
  allowProduction?: boolean;
}

export interface DumpOptions {
  /** Extra args appended after the built-in pg_dump flags. */
  extraArgs?: string[];
  /** Override the binary name (e.g. `/usr/local/pg17/bin/pg_dump`). */
  binary?: string;
}

export interface RestoreOptions {
  extraArgs?: string[];
  binary?: string;
  /**
   * Wrap the restore in `--single-transaction --exit-on-error` so a
   * mid-restore failure rolls the target database back to its prior
   * state instead of leaving it partially-restored-but-failing.
   * Defaults to `true`. Set to `false` if you need parallel restore
   * (`--jobs N` in `extraArgs`); pg_restore rejects `--single-transaction`
   * combined with `--jobs`.
   */
  singleTransaction?: boolean;
}

export interface CreateDropOptions {
  /** Database name to drop. Defaults to the one parsed from the URL. */
  database?: string;
  /**
   * The maintenance database to connect to when running create/drop
   * (the target DB itself can't be open). Defaults to 'postgres'.
   */
  maintenanceDatabase?: string;
  extraArgs?: string[];
  binary?: string;
}

/**
 * Extract the database name from a postgres connection URL.
 *
 * Throws if the URL has no path/db segment (postgres rejects connections
 * without one anyway).
 */
export function databaseNameFromUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\/+/u, ''));
  if (!database) throw new Error('Database URL must include a database name.');
  return database;
}

/**
 * Treat localhost / 127.0.0.1 / ::1 / empty-hostname URLs as "local".
 *
 * Used by the export/import safety guards to decide whether a command
 * needs `--allow-production` to proceed.
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    const url = new URL(databaseUrl);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    return (
      hostname === '' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

/**
 * Strip credentials from a postgres URL for logging/manifest use.
 * Returns `[invalid database url]` if parsing fails.
 *
 * Redacts both the userinfo (`user:password@`) and any credential-shaped
 * query parameters (`?password=…`, `?passwd=…`, `?pass=…`) — cloud
 * providers like Neon and Supabase emit URLs with `?password=` instead of
 * (or in addition to) the userinfo form, and leaking those into logs or
 * the backup manifest defeats the rest of the redaction.
 */
export function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    for (const param of ['password', 'passwd', 'pass']) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '***');
      }
    }
    return url.toString();
  } catch {
    return '[invalid database url]';
  }
}

/**
 * Translate a postgres URL into the libpq env vars that pg_dump/pg_restore
 * read. Passing credentials this way keeps them out of process argv (and
 * therefore out of `ps`, audit logs, and error output).
 *
 * `databaseOverride` lets callers point pg tools at a different db on the
 * same server (e.g. connecting to `postgres` to drop the real target).
 */
export function postgresEnvFromUrl(
  databaseUrl: string,
  databaseOverride?: string,
): Record<string, string> {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`Unsupported database URL protocol: ${url.protocol}`);
  }

  const env: Record<string, string> = {};
  const database = databaseOverride ?? databaseNameFromUrl(databaseUrl);

  // Only set vars we have URL-derived values for. Inherited libpq env
  // (PGHOST, PGSERVICE, etc.) is scrubbed separately by `runCommand`
  // via `LIBPQ_INHERITANCE_VARS` — see below. We cannot use empty
  // strings to "unset" these vars: libpq treats e.g. `PGSERVICE=''` as
  // a request for a service literally named empty-string, which fails
  // with `definition of service "" not found`. The right way to
  // "unset" is to remove the key entirely from the child's env, which
  // runCommand does for us before merging.
  env.PGDATABASE = database;
  if (url.hostname) env.PGHOST = url.hostname;
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeUserInfo(url.username);

  // Password can come from userinfo OR query-string (`?password=...`,
  // `?passwd=...`, `?pass=...`) — cloud providers like Neon and
  // Supabase use the query-string form. `redactDatabaseUrl` already
  // masks all three in logs; the env builder honors all three for
  // connection.
  const passwordFromUrl =
    (url.password && decodeUserInfo(url.password)) ||
    url.searchParams.get('password') ||
    url.searchParams.get('passwd') ||
    url.searchParams.get('pass') ||
    '';
  if (passwordFromUrl) env.PGPASSWORD = passwordFromUrl;

  for (const [param, envName] of [
    ['sslmode', 'PGSSLMODE'],
    ['sslrootcert', 'PGSSLROOTCERT'],
    ['sslcert', 'PGSSLCERT'],
    ['sslkey', 'PGSSLKEY'],
  ] as const) {
    const value = url.searchParams.get(param);
    if (value) env[envName] = value;
  }

  return env;
}

/**
 * Libpq env vars that determine **where** a pg connection lands. Scrubbed
 * from the inherited parent environment by `runCommand` so a developer
 * with `PGHOST=staging` in their shell can't silently redirect a
 * pg_dump call that was supposed to target the URL the caller passed.
 *
 * SSL-related vars (PGSSLMODE/PGSSLROOTCERT/...) are intentionally NOT
 * scrubbed — a caller may legitimately want to inherit a system-wide
 * certificate path. They're explicitly overridden only when the URL
 * supplies a value.
 *
 * Auth vars (PGPASSWORD / PGPASSFILE) are intentionally NOT scrubbed:
 * they don't change target routing and some environments intentionally
 * supply credentials out-of-band while keeping DATABASE_URL passwordless.
 */
const LIBPQ_INHERITANCE_VARS = [
  'PGHOST',
  'PGHOSTADDR',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGSERVICE',
  'PGSERVICEFILE',
] as const;

/**
 * Guard for export operations. Two distinct hazards:
 * - running a "prod" export against a local DB by mistake (likely a
 *   developer running prod scripts on their laptop)
 * - running a regular export against a non-local DB (likely a developer
 *   pointing at staging or prod when they meant to target their laptop)
 *
 * Each escape hatch is named so the override has to be deliberate.
 */
export function assertCanExportDatabase(
  databaseUrl: string,
  options: PostgresLocalityOptions,
): void {
  const local = isLocalDatabaseUrl(databaseUrl);
  if (options.prod && local && !options.allowLocal) {
    throw new Error(
      'Refusing to run a production-flavored export against a local database. Pass allowLocal only when intentionally testing the production export path.',
    );
  }
  if (!options.prod && !local && !options.allowProduction) {
    throw new Error(
      'Refusing to export a non-local database without allowProduction. Use the production export path, or pass allowProduction intentionally.',
    );
  }
}

/**
 * Guard for import/restore operations against non-local databases.
 * Restoring is destructive, so the default is "local only".
 */
export function assertCanImportDatabase(
  databaseUrl: string,
  options: PostgresImportLocalityOptions,
): void {
  if (!isLocalDatabaseUrl(databaseUrl) && !options.allowProduction) {
    throw new Error(
      'Refusing to import into a non-local database without allowProduction.',
    );
  }
}

/**
 * Run `pg_dump` against `databaseUrl`, writing a custom-format archive to
 * `dumpPath`. Defaults match the common "logical backup, no-owner, no-acl"
 * recipe used for cross-environment restores.
 *
 * Credentials travel via env vars, never argv.
 */
export async function dumpPostgresDatabase(
  databaseUrl: string,
  dumpPath: string,
  options: DumpOptions = {},
): Promise<void> {
  await mkdir(dirname(dumpPath), { recursive: true, mode: 0o700 });
  await runCommand(
    options.binary ?? 'pg_dump',
    [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file',
      dumpPath,
      ...(options.extraArgs ?? []),
    ],
    { env: postgresEnvFromUrl(databaseUrl) },
  );
  await chmod(dumpPath, 0o600);
}

/**
 * Run `pg_restore` against `databaseUrl` from a custom-format archive at
 * `dumpPath`. Uses `--clean --if-exists` so the target db can be a previous
 * state of the same schema.
 */
export async function restorePostgresDatabase(
  databaseUrl: string,
  dumpPath: string,
  options: RestoreOptions = {},
): Promise<void> {
  const singleTransaction = options.singleTransaction ?? true;
  await runCommand(
    options.binary ?? 'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      // Atomic-restore default: wrap the whole operation in one
      // transaction. Without this, a mid-restore failure (e.g. a unique
      // constraint conflict halfway through data load) leaves the
      // target database with the `--clean` DROPs applied AND part of
      // the new schema/data, while pg_restore still exits non-zero —
      // operationally the worst of both worlds. Caller can opt out via
      // `singleTransaction: false` when running parallel restores
      // (`--jobs N`) since pg_restore rejects the combination.
      ...(singleTransaction ? ['--single-transaction', '--exit-on-error'] : []),
      '--dbname',
      databaseNameFromUrl(databaseUrl),
      ...(options.extraArgs ?? []),
      // POSIX end-of-options marker: `dumpPath` is the final positional
      // and must be interpreted as a path, not a flag. Without `--`, a
      // path that starts with `-` (e.g. a temp file generated as
      // `-tmp-XXX.dump`) would be misparsed by pg_restore as an unknown
      // option.
      '--',
      dumpPath,
    ],
    { env: postgresEnvFromUrl(databaseUrl) },
  );
}

/**
 * `createdb`-equivalent. Connects via the maintenance database (default
 * `postgres`) and creates the database named in the URL, or in
 * `options.database` if provided.
 */
export async function createPostgresDatabase(
  databaseUrl: string,
  options: CreateDropOptions = {},
): Promise<void> {
  const database = options.database ?? databaseNameFromUrl(databaseUrl);
  await runCommand(
    options.binary ?? 'createdb',
    [database, ...(options.extraArgs ?? [])],
    {
      env: postgresEnvFromUrl(
        databaseUrl,
        options.maintenanceDatabase ?? 'postgres',
      ),
    },
  );
}

/**
 * `dropdb`-equivalent, with `--if-exists` by default so callers can use
 * this idempotently as part of a reset flow.
 */
export async function dropPostgresDatabase(
  databaseUrl: string,
  options: CreateDropOptions = {},
): Promise<void> {
  const database = options.database ?? databaseNameFromUrl(databaseUrl);
  await runCommand(
    options.binary ?? 'dropdb',
    ['--if-exists', database, ...(options.extraArgs ?? [])],
    {
      env: postgresEnvFromUrl(
        databaseUrl,
        options.maintenanceDatabase ?? 'postgres',
      ),
    },
  );
}

/**
 * Spawn helper used by the wrappers above. Inherits stdio so progress and
 * error output stream to the parent terminal (these are interactive ops),
 * unless the caller passes `stdio: 'pipe'` for programmatic use — in
 * which case stderr is captured and included in the thrown error so the
 * failure isn't an opaque `"pg_dump exited with status 1"`.
 *
 * Libpq connection vars (PGHOST, PGSERVICE, ...) inherited from the
 * parent process are scrubbed before merging with `options.env`. This is
 * the half of "URL-determined connection target" that
 * `postgresEnvFromUrl` can't do alone: without scrubbing, a developer
 * with `PGHOST=staging` in their shell would silently redirect the
 * child's connection regardless of what the URL specified.
 */
export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: 'inherit' | 'pipe';
  } = {},
): Promise<void> {
  const parentEnv = { ...process.env };
  for (const key of LIBPQ_INHERITANCE_VARS) {
    delete parentEnv[key];
  }

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...parentEnv, ...options.env },
      stdio: options.stdio ?? 'inherit',
    });

    // When the caller pipes stdio, capture stderr so we can surface it
    // in the rejection. Default (`'inherit'`) streams stderr to the
    // parent terminal live; there's nothing to capture in that case.
    const stderrChunks: Buffer[] = [];
    if (options.stdio === 'pipe' && child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      const stderrSuffix = stderr ? `: ${stderr.slice(-2000)}` : '';
      reject(new Error(`${command} exited with status ${code}${stderrSuffix}`));
    });
  });
}

function decodeUserInfo(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
