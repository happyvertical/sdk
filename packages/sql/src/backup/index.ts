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
import { access, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertCanExportDatabase,
  assertCanImportDatabase,
  createPostgresDatabase,
  dropPostgresDatabase,
  dumpPostgresDatabase,
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
 *
 * **Failure model:** the function is all-or-nothing. If any step after
 * the initial directory creation throws — `dumpPostgresDatabase`,
 * `onBackup`, `onDatabaseMetadata`, `getGitSha`, or the final manifest
 * write — the partial backup directory is removed (best-effort)
 * before the original error is re-thrown. Callers therefore never see
 * a backup directory on disk without a complete manifest, which would
 * otherwise poison later `restoreBackup` calls with confusing
 * "no manifest" errors and leak a partial dump containing sensitive
 * data. If cleanup itself fails, that error is logged via
 * `console.warn` and swallowed so it doesn't mask the original.
 */
export async function exportBackup<Extra = unknown>(
  options: ExportBackupOptions<Extra>,
): Promise<ExportBackupResult<Extra>> {
  assertCanExportDatabase(options.databaseUrl, options);

  const label = validateLabel(options.label ?? 'backup');
  const backupPath = await createUniqueBackupDir(
    options.backupRoot ?? defaultBackupRoot(),
    label,
  );

  try {
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
      await mkdir(filesDir, { recursive: true, mode: 0o700 });
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
  } catch (error) {
    // Partial state on disk would either confuse later restoreBackup
    // calls (no manifest → cryptic ENOENT) or leak sensitive dump
    // contents. Remove the directory; if cleanup fails, log but don't
    // mask the original error.
    try {
      await rm(backupPath, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(
        `exportBackup: failed to clean up partial backup at ${backupPath}:`,
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError),
      );
    }
    throw error;
  }
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
  const dumpPath = join(
    backupPath,
    validateManifestPathSegment(
      manifest.database.dumpFile,
      'database dump file',
    ),
  );
  const filesDir = join(
    backupPath,
    validateManifestPathSegment(manifest.files.directory, 'files directory'),
  );

  await restorePostgresDatabase(options.databaseUrl, dumpPath);

  if (!options.skipFiles && options.onRestore) {
    await options.onRestore({
      backupPath,
      databaseUrl: options.databaseUrl,
      filesDir,
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

  // Validate the backup BEFORE dropping the local database. A mistyped
  // backupPath, missing dump file, or corrupted manifest would otherwise
  // destroy the existing database (drop + create) and only then fail
  // when restoreBackup tries to read the manifest — leaving the
  // developer with an empty local DB and a confusing ENOENT error.
  const backupPath = resolve(options.backupPath);
  const manifest = await readBackupManifest(backupPath);
  const dumpFile = validateManifestPathSegment(
    manifest.database.dumpFile,
    'database dump file',
  );
  await access(join(backupPath, dumpFile));

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

function validateLabel(label: string): string {
  if (!label || label === '.' || label === '..' || /[\\/]/u.test(label)) {
    throw new Error(
      `Backup label "${label}" is invalid. Labels must be a single path-safe segment.`,
    );
  }
  return label;
}

function validateManifestPathSegment(value: string, field: string): string {
  if (!value || value === '.' || value === '..' || /[\\/]/u.test(value)) {
    throw new Error(
      `Backup manifest ${field} is invalid: "${value}". It must be a single path segment.`,
    );
  }
  return value;
}

async function createUniqueBackupDir(
  backupRoot: string,
  label: string,
): Promise<string> {
  const root = resolve(backupRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });

  const baseName = `${label}-${timestampForBackup()}`;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt.toString(36)}`;
    const candidate = join(root, `${baseName}${suffix}`);
    try {
      await mkdir(candidate, { mode: 0o700 });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Failed to create a unique backup directory under ${root} for label "${label}".`,
  );
}
