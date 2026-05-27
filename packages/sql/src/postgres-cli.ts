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
import { mkdir } from 'node:fs/promises';
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
 */
export function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
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
  env.PGDATABASE = database;
  if (url.hostname) env.PGHOST = url.hostname;
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);

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
  await mkdir(dirname(dumpPath), { recursive: true });
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
  await runCommand(
    options.binary ?? 'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '--dbname',
      databaseNameFromUrl(databaseUrl),
      ...(options.extraArgs ?? []),
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
 * error output stream to the parent terminal (these are interactive ops).
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
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with status ${code}`));
    });
  });
}
