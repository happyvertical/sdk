/**
 * Backup orchestration — composes the pg shell-out helpers in
 * `../postgres-cli` with caller-supplied hooks for file storage,
 * app-specific manifest extras, and post-restore steps.
 *
 * Decoupled from `@happyvertical/files` on purpose: callers that want a
 * file-storage backup pass an `onBackup` callback that does the copy
 * however they prefer (local cp, S3 sync, WebDAV walk). That keeps this
 * subpath usable by apps that only need the database half.
 */
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertCanExportDatabase,
  assertCanImportDatabase,
  createPostgresDatabase,
  databaseNameFromUrl,
  dropPostgresDatabase,
  dumpPostgresDatabase,
  postgresEnvFromUrl,
  redactDatabaseUrl,
  restorePostgresDatabase,
} from '../postgres-cli';
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  type BackupManifest,
  type BackupManifestFiles,
  DEFAULT_DUMP_FILE,
  DEFAULT_FILES_DIR,
  readBackupManifest,
  timestampForBackup,
  writeBackupManifest,
} from './manifest';

export {
  BACKUP_KIND,
  BACKUP_VERSION,
  type BackupManifest,
  type BackupManifestDatabase,
  type BackupManifestFiles,
  DEFAULT_DUMP_FILE,
  DEFAULT_FILES_DIR,
  DEFAULT_MANIFEST_FILE,
  readBackupManifest,
  timestampForBackup,
  writeBackupManifest,
} from './manifest';

export interface ExportBackupContext {
  backupPath: string;
  databaseUrl: string;
  /**
   * Local directory the caller should copy file storage into.
   * Already exists by the time `onBackup` runs.
   */
  filesDir: string;
}

export interface ExportBackupResult<Extra = unknown> {
  /** Absolute path to the backup directory. */
  backupPath: string;
  /** The manifest that was written. */
  manifest: BackupManifest & { extra?: Extra };
}

export interface ExportBackupOptions<Extra = unknown> {
  databaseUrl: string;
  /** Override the parent dir for the timestamped backup. Defaults to ~/.local/share/happyvertical/backups. */
  backupRoot?: string;
  /** Prefix the timestamp with this label (e.g. 'prod', 'pre-migration'). Defaults to 'backup'. */
  label?: string;
  /** Allow exporting from a non-local DB without --allow-production. */
  allowProduction?: boolean;
  /** Allow exporting from a local DB even though `prod: true` is set. */
  allowLocal?: boolean;
  /** Caller is running a prod-flavored export. */
  prod?: boolean;
  /** Skip the file-storage half entirely (no `onBackup` invoked). */
  skipFiles?: boolean;
  /**
   * Caller-supplied hook for backing up file storage. Receives the
   * already-created backup/files directory; whatever it returns is
   * recorded as `extra` on the manifest.
   */
  onBackup?: (ctx: ExportBackupContext) => Promise<Extra | void>;
  /**
   * Caller-supplied hook for filling the database half of the manifest
   * with diagnostic metadata (row counts, schema count, etc.) — runs
   * after the dump completes.
   */
  onDatabaseMetadata?: (ctx: {
    databaseUrl: string;
  }) => Promise<Record<string, unknown>>;
  /** Recorded as `files.storageConfig` on the manifest after redaction by the caller. */
  filesStorageConfig?: unknown;
  /** Working dir used when discovering the git sha. Defaults to process.cwd(). */
  gitCwd?: string;
}

export interface RestoreBackupContext {
  backupPath: string;
  databaseUrl: string;
  filesDir: string;
  manifest: BackupManifest;
}

export interface RestoreBackupOptions {
  databaseUrl: string;
  backupPath: string;
  allowProduction?: boolean;
  /** Skip the file-storage half (no `onRestore` invoked). */
  skipFiles?: boolean;
  /**
   * Caller-supplied hook for restoring file storage from
   * `backupPath/<files.directory>`. Runs after the pg_restore completes.
   */
  onRestore?: (ctx: RestoreBackupContext) => Promise<void>;
}

export interface ResetLocalOptions
  extends Omit<RestoreBackupOptions, 'allowProduction'> {}

/** Default root for backups. Override via $HAPPYVERTICAL_BACKUP_DIR or `backupRoot`. */
export function defaultBackupRoot(): string {
  return (
    process.env.HAPPYVERTICAL_BACKUP_DIR ??
    join(homedir(), '.local', 'share', 'happyvertical', 'backups')
  );
}

/**
 * Take a postgres dump and (optionally) a snapshot of file storage,
 * writing both plus a manifest into a fresh timestamped directory.
 *
 * Returns the directory path and the manifest. The manifest's `extra`
 * field carries whatever `onBackup` returned.
 */
export async function exportBackup<Extra = unknown>(
  options: ExportBackupOptions<Extra>,
): Promise<ExportBackupResult<Extra>> {
  assertCanExportDatabase(options.databaseUrl, options);

  const label = options.label ?? 'backup';
  const backupPath = resolve(
    options.backupRoot ?? defaultBackupRoot(),
    `${label}-${timestampForBackup()}`,
  );
  await mkdir(backupPath, { recursive: true });

  const dumpPath = join(backupPath, DEFAULT_DUMP_FILE);
  await dumpPostgresDatabase(options.databaseUrl, dumpPath);

  const filesDir = join(backupPath, DEFAULT_FILES_DIR);
  let filesInfo: BackupManifestFiles = {
    directory: DEFAULT_FILES_DIR,
    exported: false,
    count: 0,
    bytes: 0,
    reason: 'Skipped by skipFiles.',
    storageConfig: options.filesStorageConfig,
  };
  let extra: Extra | undefined;

  if (!options.skipFiles && options.onBackup) {
    await mkdir(filesDir, { recursive: true });
    const result = await options.onBackup({
      backupPath,
      databaseUrl: options.databaseUrl,
      filesDir,
    });
    if (result !== undefined && result !== null) extra = result as Extra;
    filesInfo = {
      directory: DEFAULT_FILES_DIR,
      exported: true,
      count: 0,
      bytes: 0,
      storageConfig: options.filesStorageConfig,
    };
  }

  const metadata = options.onDatabaseMetadata
    ? await options.onDatabaseMetadata({ databaseUrl: options.databaseUrl })
    : undefined;

  const manifest: BackupManifest & { extra?: Extra } = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    gitSha: await getGitSha(options.gitCwd),
    source: label,
    database: {
      dumpFile: DEFAULT_DUMP_FILE,
      url: redactDatabaseUrl(options.databaseUrl),
      metadata,
    },
    files: filesInfo,
    extra,
  };

  await writeBackupManifest(backupPath, manifest);
  return { backupPath, manifest };
}

/**
 * Restore a backup directory into `databaseUrl` and, if `onRestore` is
 * provided, run the file-storage half. The caller controls everything
 * after the dump completes (file copy, migrations, doctor) via the hook.
 */
export async function restoreBackup(
  options: RestoreBackupOptions,
): Promise<BackupManifest> {
  const backupPath = resolve(options.backupPath);
  const manifest = await readBackupManifest(backupPath);
  assertCanImportDatabase(options.databaseUrl, options);

  await restorePostgresDatabase(
    options.databaseUrl,
    join(backupPath, manifest.database.dumpFile),
  );

  if (!options.skipFiles && options.onRestore) {
    await options.onRestore({
      backupPath,
      databaseUrl: options.databaseUrl,
      filesDir: join(backupPath, manifest.files.directory),
      manifest,
    });
  }

  return manifest;
}

/**
 * Drop-and-recreate the target database, then run `restoreBackup`.
 * Local-only: explicitly refuses non-local URLs without an escape hatch
 * (this is a destructive operation by design).
 */
export async function resetLocalDatabaseFromBackup(
  options: ResetLocalOptions,
): Promise<BackupManifest> {
  assertCanImportDatabase(options.databaseUrl, { allowProduction: false });

  await dropPostgresDatabase(options.databaseUrl);
  await createPostgresDatabase(options.databaseUrl);
  return restoreBackup({ ...options, allowProduction: false });
}

async function getGitSha(cwd: string = process.cwd()): Promise<string | null> {
  try {
    return await new Promise<string>((resolvePromise, reject) => {
      execFile('git', ['rev-parse', 'HEAD'], { cwd }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePromise(stdout.trim());
      });
    });
  } catch {
    return null;
  }
}
