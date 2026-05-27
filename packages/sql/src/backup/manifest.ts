/**
 * Backup manifest shape and helpers.
 *
 * The manifest is the source-of-truth for what's in a backup directory:
 * which database it came from, when, at what commit, and any
 * app-specific metadata that the caller chose to attach via the `extra`
 * field. Bumping `BACKUP_VERSION` is the way to evolve the shape — older
 * backups will fail `readBackupManifest` until upgraded.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const BACKUP_KIND = 'happyvertical-backup' as const;
export const BACKUP_VERSION = 1 as const;
export const DEFAULT_DUMP_FILE = 'database.dump';
export const DEFAULT_FILES_DIR = 'files';
export const DEFAULT_MANIFEST_FILE = 'manifest.json';

export interface BackupManifestDatabase {
  /** File name of the pg_dump archive within the backup directory. */
  dumpFile: string;
  /** Redacted URL the dump was taken from. */
  url: string;
  /** Caller-supplied diagnostic metadata (row counts, schema count, etc.). */
  metadata?: Record<string, unknown>;
}

export interface BackupManifestFiles {
  /** Directory name within the backup that holds copied file storage. */
  directory: string;
  exported: boolean;
  count: number;
  bytes: number;
  reason?: string;
  /** Redacted provider config, if the caller chose to record it. */
  storageConfig?: unknown;
}

export interface BackupManifest {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  timestamp: string;
  gitSha: string | null;
  /** Free-form label (e.g. 'current', 'prod', 'pre-migration'). */
  source: string;
  database: BackupManifestDatabase;
  files: BackupManifestFiles;
  /** Opaque slot for app-specific extension (resume publish status, etc.). */
  extra?: unknown;
}

/**
 * Read a backup manifest from `backupPath/manifest.json` and validate
 * that it matches this package's kind+version. Throws (with the path
 * included) on mismatch — that's almost always a real problem worth
 * surfacing, not silently tolerating.
 */
export async function readBackupManifest(
  backupPath: string,
): Promise<BackupManifest> {
  const manifestPath = join(resolve(backupPath), DEFAULT_MANIFEST_FILE);
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as BackupManifest;
  if (manifest.kind !== BACKUP_KIND || manifest.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup manifest at ${manifestPath} (kind=${manifest.kind}, version=${manifest.version}).`,
    );
  }
  return manifest;
}

export async function writeBackupManifest(
  backupPath: string,
  manifest: BackupManifest,
): Promise<void> {
  await writeFile(
    join(backupPath, DEFAULT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
}

/**
 * Filesystem-safe timestamp suitable for backup directory names — same
 * shape as `Date.toISOString()` but with `:` and `.` swapped to `-` so
 * the value is a valid path segment on Windows and friendly to shell
 * tab-completion everywhere else.
 */
export function timestampForBackup(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
