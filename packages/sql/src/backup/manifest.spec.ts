import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  type BackupManifest,
  DEFAULT_DUMP_FILE,
  DEFAULT_FILES_DIR,
  readBackupManifest,
  timestampForBackup,
  writeBackupManifest,
} from './manifest';

describe('backup manifest', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'backup-manifest-'));
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it('round-trips a manifest', async () => {
    const manifest: BackupManifest = {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      timestamp: '2026-05-27T00:00:00.000Z',
      gitSha: 'abc123',
      source: 'current',
      database: {
        dumpFile: DEFAULT_DUMP_FILE,
        url: 'postgresql://***:***@localhost/app',
        metadata: { rowCount: 42 },
      },
      files: {
        directory: DEFAULT_FILES_DIR,
        exported: false,
        count: 0,
        bytes: 0,
      },
      extra: { resume: { published: true } },
    };

    await writeBackupManifest(dir, manifest);
    const loaded = await readBackupManifest(dir);
    expect(loaded).toEqual(manifest);
  });

  it('rejects manifests with the wrong kind or version', async () => {
    await writeBackupManifest(dir, {
      kind: 'foreign-backup' as any,
      version: BACKUP_VERSION,
      timestamp: '',
      gitSha: null,
      source: 'x',
      database: { dumpFile: 'x', url: 'x' },
      files: { directory: 'x', exported: false, count: 0, bytes: 0 },
    });
    await expect(readBackupManifest(dir)).rejects.toThrow(
      /Unsupported backup manifest/u,
    );
  });

  it('produces filesystem-safe timestamps', () => {
    expect(timestampForBackup(new Date('2026-05-26T12:34:56.789Z'))).toBe(
      '2026-05-26T12-34-56-789Z',
    );
  });
});
