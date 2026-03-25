import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFilesystem, getProviderInfo, isProviderAvailable } from '../index';
import { initializeProviders } from '../shared/factory';
import type { S3Options } from '../shared/types';
import {
  DirectoryNotEmptyError,
  FileNotFoundError,
  InvalidPathError,
  PermissionError,
} from '../shared/types';

const awsSdkMock = vi.hoisted(() => {
  const mockSend = vi.fn();
  const clientConfigs: Array<Record<string, unknown>> = [];

  class MockS3Client {
    constructor(config: Record<string, unknown>) {
      clientConfigs.push(config);
    }

    send = mockSend;
  }

  class HeadObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class GetObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class PutObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class DeleteObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class CopyObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }

  class ListObjectsV2Command {
    constructor(readonly input: Record<string, unknown>) {}
  }

  return {
    mockSend,
    clientConfigs,
    MockS3Client,
    HeadObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    ListObjectsV2Command,
  };
});

const { mockSend, clientConfigs } = awsSdkMock;
const tempDirs: string[] = [];

vi.mock('@aws-sdk/client-s3', () => ({
  CopyObjectCommand: awsSdkMock.CopyObjectCommand,
  DeleteObjectCommand: awsSdkMock.DeleteObjectCommand,
  GetObjectCommand: awsSdkMock.GetObjectCommand,
  HeadObjectCommand: awsSdkMock.HeadObjectCommand,
  ListObjectsV2Command: awsSdkMock.ListObjectsV2Command,
  PutObjectCommand: awsSdkMock.PutObjectCommand,
  S3Client: awsSdkMock.MockS3Client,
}));

import { S3FilesystemProvider } from './s3';

const defaultOptions: S3Options = {
  type: 's3',
  region: 'us-east-1',
  bucket: 'imago',
  endpoint: 'http://127.0.0.1:39000',
  accessKeyId: 'imago',
  secretAccessKey: 'imago-dev-secret',
  forcePathStyle: true,
};

function createProvider(overrides: Partial<S3Options> = {}) {
  return new S3FilesystemProvider({
    ...defaultOptions,
    ...overrides,
  });
}

function getCommandInput(callIndex = 0) {
  return mockSend.mock.calls[callIndex]?.[0]?.input as
    | Record<string, unknown>
    | undefined;
}

function createS3Error(statusCode: number, name: string) {
  return Object.assign(new Error(name), {
    $metadata: { httpStatusCode: statusCode },
    name,
  });
}

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'happyvertical-files-s3-'));
  tempDirs.push(dir);
  return dir;
}

describe('S3FilesystemProvider', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    clientConfigs.length = 0;
    await initializeProviders();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  describe('registration', () => {
    it('registers the S3 provider and exposes the expected metadata', () => {
      expect(isProviderAvailable('s3')).toBe(true);
      expect(getProviderInfo('s3')).toMatchObject({
        available: true,
        requiredOptions: ['region', 'bucket'],
      });
    });

    it('creates an S3 filesystem instance via the factory without issuing network requests', async () => {
      const filesystem = await getFilesystem(defaultOptions);

      expect(filesystem).toBeInstanceOf(S3FilesystemProvider);
      expect(mockSend).not.toHaveBeenCalled();
      expect(clientConfigs[0]).toMatchObject({
        region: 'us-east-1',
        endpoint: 'http://127.0.0.1:39000',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'imago',
          secretAccessKey: 'imago-dev-secret',
        },
      });
    });
  });

  describe('exists', () => {
    it('treats root paths as existing even when basePath is configured', async () => {
      const provider = createProvider({ basePath: 'tenant-a' });

      await expect(provider.exists('.')).resolves.toBe(true);
      await expect(provider.exists('/')).resolves.toBe(true);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('checks directories via prefix listing when no exact object key exists', async () => {
      const provider = createProvider();
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockResolvedValueOnce({
          Contents: [{ Key: 'assets/logo.png' }],
        });

      await expect(provider.exists('assets')).resolves.toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(getCommandInput(2)).toMatchObject({
        Bucket: 'imago',
        Prefix: 'assets/',
        MaxKeys: 1,
      });
    });

    it('treats explicit directory marker objects as existing directories', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockResolvedValueOnce({
          LastModified: modified,
        });

      await expect(provider.exists('assets')).resolves.toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(getCommandInput(1)).toMatchObject({
        Bucket: 'imago',
        Key: 'assets/',
      });
    });
  });

  describe('read', () => {
    it('reads text and raw binary content', async () => {
      const provider = createProvider();
      mockSend
        .mockResolvedValueOnce({ Body: Buffer.from('hello world') })
        .mockResolvedValueOnce({ Body: Buffer.from([0x89, 0x50]) });

      await expect(provider.read('notes/hello.txt')).resolves.toBe(
        'hello world',
      );
      await expect(
        provider.read('images/icon.png', { raw: true }),
      ).resolves.toEqual(Buffer.from([0x89, 0x50]));
    });

    it('maps missing keys and forbidden reads to typed filesystem errors', async () => {
      const provider = createProvider();
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NoSuchKey'))
        .mockRejectedValueOnce(createS3Error(403, 'Forbidden'));

      await expect(provider.read('missing.txt')).rejects.toThrow(
        FileNotFoundError,
      );
      await expect(provider.read('private.txt')).rejects.toThrow(
        PermissionError,
      );
    });
  });

  describe('write', () => {
    it('writes objects with inferred content types and honors base paths', async () => {
      const provider = createProvider({ basePath: 'tenant-a' });
      mockSend.mockResolvedValueOnce({});

      await provider.write('docs/readme.txt', 'hello');

      expect(getCommandInput()).toMatchObject({
        Bucket: 'imago',
        Key: 'tenant-a/docs/readme.txt',
        ContentType: 'text/plain',
      });
      expect(getCommandInput()?.Body).toEqual(Buffer.from('hello'));
    });

    it('preserves the trailing slash when creating directory markers', async () => {
      const provider = createProvider();
      mockSend.mockResolvedValueOnce({});

      await provider.createDirectory('reports/2026');

      expect(getCommandInput()).toMatchObject({
        Bucket: 'imago',
        Key: 'reports/2026/',
        ContentType: 'application/octet-stream',
      });
    });

    it('does not apply basePath twice when creating directory markers', async () => {
      const provider = createProvider({ basePath: 'tenant-a' });
      mockSend.mockResolvedValueOnce({});

      await provider.createDirectory('reports/2026');

      expect(getCommandInput()).toMatchObject({
        Bucket: 'imago',
        Key: 'tenant-a/reports/2026/',
      });
    });
  });

  describe('list', () => {
    it('includes CommonPrefixes in non-recursive directory listings without duplicating folder markers', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend.mockResolvedValueOnce({
        CommonPrefixes: [{ Prefix: 'docs/guides/' }, { Prefix: 'docs/api/' }],
        Contents: [
          { Key: 'docs/guides/', LastModified: modified, Size: 0 },
          { Key: 'docs/readme.txt', LastModified: modified, Size: 5 },
        ],
      });

      const items = await provider.list('docs');

      expect(items).toEqual([
        expect.objectContaining({
          name: 'guides',
          path: 'docs/guides',
          isDirectory: true,
        }),
        expect.objectContaining({
          name: 'api',
          path: 'docs/api',
          isDirectory: true,
        }),
        expect.objectContaining({
          name: 'readme.txt',
          path: 'docs/readme.txt',
          isDirectory: false,
          size: 5,
          mimeType: 'text/plain',
        }),
      ]);
      expect(items.filter((item) => item.name === 'guides')).toHaveLength(1);
    });

    it('treats folder markers as directories during recursive listings and applies filters', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'docs/guides/', LastModified: modified, Size: 0 },
          { Key: 'docs/guides/intro.json', LastModified: modified, Size: 7 },
          { Key: 'docs/root.txt', LastModified: modified, Size: 4 },
        ],
      });

      const items = await provider.list('docs', {
        recursive: true,
        filter: /^(guides|intro\.json)$/,
      });

      expect(items).toEqual([
        expect.objectContaining({
          name: 'guides',
          path: 'docs/guides',
          isDirectory: true,
        }),
        expect.objectContaining({
          name: 'intro.json',
          path: 'docs/guides/intro.json',
          isDirectory: false,
          mimeType: 'application/json',
        }),
      ]);
    });

    it('follows continuation tokens until all listing pages have been merged', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend
        .mockResolvedValueOnce({
          IsTruncated: true,
          NextContinuationToken: 'page-2',
          CommonPrefixes: [{ Prefix: 'docs/guides/' }],
          Contents: [{ Key: 'docs/root.txt', LastModified: modified, Size: 4 }],
        })
        .mockResolvedValueOnce({
          IsTruncated: false,
          CommonPrefixes: [{ Prefix: 'docs/api/' }],
          Contents: [
            {
              Key: 'docs/tutorials/part-1.txt',
              LastModified: modified,
              Size: 12,
            },
          ],
        });

      const items = await provider.list('docs');

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(getCommandInput(1)).toMatchObject({
        Bucket: 'imago',
        Prefix: 'docs/',
        Delimiter: '/',
        ContinuationToken: 'page-2',
      });
      expect(items).toHaveLength(4);
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'guides',
            path: 'docs/guides',
            isDirectory: true,
          }),
          expect.objectContaining({
            name: 'api',
            path: 'docs/api',
            isDirectory: true,
          }),
          expect.objectContaining({
            name: 'tutorials',
            path: 'docs/tutorials',
            isDirectory: true,
          }),
          expect.objectContaining({
            name: 'root.txt',
            path: 'docs/root.txt',
            isDirectory: false,
          }),
        ]),
      );
    });
  });

  describe('metadata operations', () => {
    it('returns directory stats for the provider root without probing S3', async () => {
      const provider = createProvider({ basePath: 'tenant-a' });

      const stats = await provider.getStats('.');

      expect(stats).toMatchObject({
        size: 0,
        isFile: false,
        isDirectory: true,
      });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns file stats from HeadObject responses', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend.mockResolvedValueOnce({
        ContentLength: 12,
        LastModified: modified,
      });

      const stats = await provider.getStats('docs/readme.txt');

      expect(stats).toMatchObject({
        size: 12,
        isFile: true,
        isDirectory: false,
        mtime: modified,
      });
    });

    it('returns directory stats from child objects when there is no folder marker object', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'docs/reports/summary.txt', LastModified: modified },
          ],
        });

      const stats = await provider.getStats('docs/reports');

      expect(stats).toMatchObject({
        size: 0,
        isFile: false,
        isDirectory: true,
        mtime: modified,
      });
    });

    it('returns directory stats from an explicit folder marker object', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockResolvedValueOnce({
          LastModified: modified,
          ContentLength: 0,
        });

      const stats = await provider.getStats('docs/reports');

      expect(stats).toMatchObject({
        size: 0,
        isFile: false,
        isDirectory: true,
        mtime: modified,
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(getCommandInput(1)).toMatchObject({
        Bucket: 'imago',
        Key: 'docs/reports/',
      });
    });

    it('uses directory markers when deleting directories', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockResolvedValueOnce({
          Contents: [{ Key: 'docs/reports/', LastModified: modified }],
        })
        .mockResolvedValueOnce({});

      await provider.delete('docs/reports');

      expect(getCommandInput(3)).toMatchObject({
        Bucket: 'imago',
        Key: 'docs/reports/',
      });
    });

    it('rejects deleting non-empty directories', async () => {
      const provider = createProvider();
      const modified = new Date('2026-03-25T00:00:00Z');
      mockSend
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockRejectedValueOnce(createS3Error(404, 'NotFound'))
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'docs/reports/summary.txt', LastModified: modified },
          ],
        })
        .mockResolvedValueOnce({
          Contents: [
            { Key: 'docs/reports/summary.txt', LastModified: modified },
          ],
        });

      await expect(provider.delete('docs/reports')).rejects.toThrow(
        DirectoryNotEmptyError,
      );
      expect(mockSend).toHaveBeenCalledTimes(4);
      expect(getCommandInput(3)).toMatchObject({
        Bucket: 'imago',
        Prefix: 'docs/reports/',
        MaxKeys: 2,
      });
    });

    it('encodes copy sources for keys that contain reserved characters', async () => {
      const provider = createProvider();
      mockSend.mockResolvedValueOnce({});

      await provider.copy('docs/my file.txt', 'docs/copy.txt');

      expect(getCommandInput()).toMatchObject({
        Bucket: 'imago',
        Key: 'docs/copy.txt',
        CopySource: 'imago/docs/my%20file.txt',
      });
    });
  });

  describe('local file transfer helpers', () => {
    it('uploads local files through write()', async () => {
      const provider = createProvider();
      const dir = await createTempDir();
      const localPath = join(dir, 'upload.txt');
      await writeFile(localPath, 'upload me');
      mockSend.mockResolvedValueOnce({});

      await provider.upload(localPath, 'docs/upload.txt');

      expect(getCommandInput()).toMatchObject({
        Bucket: 'imago',
        Key: 'docs/upload.txt',
      });
      expect(getCommandInput()?.Body).toEqual(Buffer.from('upload me'));
    });

    it('downloads remote files to the requested local path', async () => {
      const provider = createProvider();
      const dir = await createTempDir();
      const localPath = join(dir, 'downloaded.txt');
      mockSend.mockResolvedValueOnce({ Body: Buffer.from('downloaded') });

      const result = await provider.download('docs/readme.txt', localPath);

      expect(result).toBe(localPath);
      await expect(readFile(localPath, 'utf8')).resolves.toBe('downloaded');
    });

    it('downloads remote files into the provider cache directory by default', async () => {
      const dir = await createTempDir();
      const provider = createProvider({
        basePath: 'tenant-a',
        cacheDir: dir,
      });
      mockSend.mockResolvedValueOnce({ Body: Buffer.from('downloaded') });

      const result = await provider.download('docs/readme.txt');

      expect(result).toBe(join(dir, 'tenant-a', 'docs', 'readme.txt'));
      await expect(readFile(result, 'utf8')).resolves.toBe('downloaded');
    });

    it('rejects unsafe default download targets', async () => {
      const dir = await createTempDir();
      const provider = createProvider({ cacheDir: dir });
      mockSend.mockResolvedValueOnce({ Body: Buffer.from('downloaded') });

      await expect(provider.download('../outside.txt')).rejects.toThrow(
        InvalidPathError,
      );
    });
  });

  describe('capabilities', () => {
    it('reports buffered semantics instead of streaming support', async () => {
      const provider = createProvider();

      await expect(provider.getCapabilities()).resolves.toMatchObject({
        streaming: false,
      });
    });
  });
});
