import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConditionalWriteUnsupportedError,
  FileNotFoundError,
  FilesystemError,
  PermissionError,
} from '../shared/types';

// ---------------------------------------------------------------------------
// Mock googleapis + google-auth-library
// ---------------------------------------------------------------------------

const mockFilesList = vi.fn();
const mockFilesGet = vi.fn();
const mockFilesCreate = vi.fn();
const mockFilesUpdate = vi.fn();
const mockFilesCopy = vi.fn();
const mockFilesExport = vi.fn();

vi.mock('googleapis', () => {
  // Use a real function (not arrow) so it can be called with `new`
  function oAuth2() {
    return { setCredentials: vi.fn() };
  }

  return {
    google: {
      auth: { OAuth2: oAuth2 },
      drive: vi.fn().mockReturnValue({
        files: {
          list: (...args: any[]) => mockFilesList(...args),
          get: (...args: any[]) => mockFilesGet(...args),
          create: (...args: any[]) => mockFilesCreate(...args),
          update: (...args: any[]) => mockFilesUpdate(...args),
          copy: (...args: any[]) => mockFilesCopy(...args),
          export: (...args: any[]) => mockFilesExport(...args),
        },
      }),
    },
  };
});

vi.mock('google-auth-library', () => {
  function googleAuth() {
    return {};
  }
  return { GoogleAuth: googleAuth };
});

import { GoogleDriveProvider } from './gdrive';

describe('GoogleDriveProvider', () => {
  let provider: GoogleDriveProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    provider = new GoogleDriveProvider({
      type: 'gdrive',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      refreshToken: 'test-refresh-token',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Construction and auth
  // -------------------------------------------------------------------------

  describe('construction', () => {
    it('should construct with OAuth2 credentials', () => {
      expect(provider).toBeInstanceOf(GoogleDriveProvider);
    });

    it('should construct with service account key', () => {
      const p = new GoogleDriveProvider({
        type: 'gdrive',
        serviceAccountKey: JSON.stringify({
          client_email: 'test@test.iam.gserviceaccount.com',
          private_key: 'fake-key',
        }),
      });
      expect(p).toBeInstanceOf(GoogleDriveProvider);
    });

    it('should construct with access token only', () => {
      const p = new GoogleDriveProvider({
        type: 'gdrive',
        accessToken: 'ya29.test',
      });
      expect(p).toBeInstanceOf(GoogleDriveProvider);
    });
  });

  // -------------------------------------------------------------------------
  // exists()
  // -------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true when file exists', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'file-1', name: 'readme.txt' }] },
      });

      const result = await provider.exists('readme.txt');
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });

      const result = await provider.exists('missing.txt');
      expect(result).toBe(false);
    });

    it('should return true for root path', async () => {
      const result = await provider.exists('.');
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // read()
  // -------------------------------------------------------------------------

  describe('read', () => {
    it('should read a regular file as string', async () => {
      // Resolve path
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'file-1', name: 'test.txt' }] },
      });
      // Get metadata
      mockFilesGet
        .mockResolvedValueOnce({ data: { mimeType: 'text/plain' } })
        // Download content
        .mockResolvedValueOnce({
          data: Buffer.from('hello world'),
        });

      const result = await provider.read('test.txt');
      expect(result).toBe('hello world');
    });

    it('should return Buffer when raw option is true', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'file-1', name: 'image.png' }] },
      });
      mockFilesGet
        .mockResolvedValueOnce({ data: { mimeType: 'image/png' } })
        .mockResolvedValueOnce({ data: Buffer.from([0x89, 0x50]) });

      const result = await provider.read('image.png', { raw: true });
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should export Google Docs files', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'doc-1', name: 'doc' }] },
      });
      mockFilesGet.mockResolvedValueOnce({
        data: { mimeType: 'application/vnd.google-apps.document' },
      });
      mockFilesExport.mockResolvedValueOnce({
        data: Buffer.from('exported text'),
      });

      const result = await provider.read('doc');
      expect(result).toBe('exported text');
    });

    it('should throw FileNotFoundError for missing file', async () => {
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });

      await expect(provider.read('nope.txt')).rejects.toThrow(
        FileNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // write()
  // -------------------------------------------------------------------------

  describe('write', () => {
    it('fails closed before API calls when conditional create is requested', async () => {
      await expect(
        provider.write('immutable.txt', 'first', { overwrite: false }),
      ).rejects.toBeInstanceOf(ConditionalWriteUnsupportedError);
      expect(mockFilesList).not.toHaveBeenCalled();
      expect(mockFilesCreate).not.toHaveBeenCalled();
      expect(mockFilesUpdate).not.toHaveBeenCalled();
    });

    it('should create a new file', async () => {
      // resolvePathToId returns null (file doesn't exist)
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      // create
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'new-1' } });

      await provider.write('hello.txt', 'hello');
      expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    });

    it('should update an existing file', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'existing-1', name: 'hello.txt' }] },
      });
      mockFilesUpdate.mockResolvedValueOnce({ data: { id: 'existing-1' } });

      await provider.write('hello.txt', 'updated');
      expect(mockFilesUpdate).toHaveBeenCalledTimes(1);
    });

    it('should create parent folders when createParents is true', async () => {
      // resolvePathToId for "a/b/file.txt" -> null
      mockFilesList
        .mockResolvedValueOnce({ data: { files: [] } }) // file doesn't exist
        .mockResolvedValueOnce({ data: { files: [] } }) // "a" doesn't exist
        .mockResolvedValueOnce({ data: { files: [] } }); // "a/b" doesn't exist

      // Create folder "a"
      mockFilesCreate
        .mockResolvedValueOnce({ data: { id: 'folder-a' } })
        // Create folder "b"
        .mockResolvedValueOnce({ data: { id: 'folder-b' } })
        // Create file
        .mockResolvedValueOnce({ data: { id: 'new-file' } });

      await provider.write('a/b/file.txt', 'content', {
        createParents: true,
      });

      // 2 folders + 1 file = 3 creates
      expect(mockFilesCreate).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('should trash the file', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'file-1', name: 'old.txt' }] },
      });
      mockFilesUpdate.mockResolvedValueOnce({ data: {} });

      await provider.delete('old.txt');

      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'file-1',
          requestBody: { trashed: true },
        }),
      );
    });

    it('should throw FileNotFoundError for missing file', async () => {
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });

      await expect(provider.delete('nope.txt')).rejects.toThrow(
        FileNotFoundError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // copy()
  // -------------------------------------------------------------------------

  describe('copy', () => {
    it('should copy a file', async () => {
      // Resolve source
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'src-1', name: 'a.txt' }] },
      });
      mockFilesCopy.mockResolvedValueOnce({ data: { id: 'copy-1' } });

      await provider.copy('a.txt', 'b.txt');
      expect(mockFilesCopy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // move()
  // -------------------------------------------------------------------------

  describe('move', () => {
    it('should move a file', async () => {
      // Resolve source
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'src-1', name: 'old.txt' }] },
      });
      // Get current parents
      mockFilesGet.mockResolvedValueOnce({
        data: { parents: ['parent-1'] },
      });

      mockFilesUpdate.mockResolvedValueOnce({ data: { id: 'src-1' } });

      await provider.move('old.txt', 'new.txt');
      expect(mockFilesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileId: 'src-1',
          addParents: 'root',
          removeParents: 'parent-1',
          requestBody: { name: 'new.txt' },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // createDirectory()
  // -------------------------------------------------------------------------

  describe('createDirectory', () => {
    it('should create a folder', async () => {
      mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
      mockFilesCreate.mockResolvedValueOnce({ data: { id: 'dir-1' } });

      await provider.createDirectory('new-folder');
      expect(mockFilesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            name: 'new-folder',
            mimeType: 'application/vnd.google-apps.folder',
          }),
        }),
      );
    });

    it('should create nested folders recursively', async () => {
      mockFilesList
        .mockResolvedValueOnce({ data: { files: [] } }) // "a" doesn't exist
        .mockResolvedValueOnce({ data: { files: [] } }); // "a/b" doesn't exist

      mockFilesCreate
        .mockResolvedValueOnce({ data: { id: 'dir-a' } })
        .mockResolvedValueOnce({ data: { id: 'dir-b' } });

      await provider.createDirectory('a/b');
      expect(mockFilesCreate).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('should list files in root folder', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: 'f1',
              name: 'file1.txt',
              mimeType: 'text/plain',
              size: '100',
              modifiedTime: '2024-01-01T00:00:00Z',
            },
            {
              id: 'f2',
              name: 'folder1',
              mimeType: 'application/vnd.google-apps.folder',
              size: '0',
              modifiedTime: '2024-01-02T00:00:00Z',
            },
          ],
        },
      });

      const results = await provider.list('.');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('file1.txt');
      expect(results[0].isDirectory).toBe(false);
      expect(results[1].name).toBe('folder1');
      expect(results[1].isDirectory).toBe(true);
    });

    it('should handle pagination', async () => {
      mockFilesList
        .mockResolvedValueOnce({
          data: {
            files: [
              {
                id: 'f1',
                name: 'page1.txt',
                mimeType: 'text/plain',
                size: '10',
                modifiedTime: '2024-01-01T00:00:00Z',
              },
            ],
            nextPageToken: 'token-2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            files: [
              {
                id: 'f2',
                name: 'page2.txt',
                mimeType: 'text/plain',
                size: '20',
                modifiedTime: '2024-01-02T00:00:00Z',
              },
            ],
          },
        });

      const results = await provider.list('.');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('page1.txt');
      expect(results[1].name).toBe('page2.txt');
    });

    it('should apply filter pattern', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: {
          files: [
            {
              id: 'f1',
              name: 'readme.txt',
              mimeType: 'text/plain',
              size: '10',
              modifiedTime: '2024-01-01T00:00:00Z',
            },
            {
              id: 'f2',
              name: 'image.png',
              mimeType: 'image/png',
              size: '500',
              modifiedTime: '2024-01-01T00:00:00Z',
            },
          ],
        },
      });

      const results = await provider.list('.', { filter: /\.txt$/ });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('readme.txt');
    });
  });

  // -------------------------------------------------------------------------
  // getStats()
  // -------------------------------------------------------------------------

  describe('getStats', () => {
    it('should return file stats', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'file-1', name: 'test.txt' }] },
      });
      mockFilesGet.mockResolvedValueOnce({
        data: {
          id: 'file-1',
          name: 'test.txt',
          mimeType: 'text/plain',
          size: '1024',
          createdTime: '2024-01-01T00:00:00Z',
          modifiedTime: '2024-06-15T12:00:00Z',
        },
      });

      const stats = await provider.getStats('test.txt');
      expect(stats.size).toBe(1024);
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.mode).toBe(0o644);
    });

    it('should return directory stats with mode 0o755', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'dir-1', name: 'docs' }] },
      });
      mockFilesGet.mockResolvedValueOnce({
        data: {
          id: 'dir-1',
          name: 'docs',
          mimeType: 'application/vnd.google-apps.folder',
          size: '0',
          createdTime: '2024-01-01T00:00:00Z',
          modifiedTime: '2024-06-15T12:00:00Z',
        },
      });

      const stats = await provider.getStats('docs');
      expect(stats.isDirectory).toBe(true);
      expect(stats.isFile).toBe(false);
      expect(stats.mode).toBe(0o755);
    });
  });

  // -------------------------------------------------------------------------
  // getMimeType()
  // -------------------------------------------------------------------------

  describe('getMimeType', () => {
    it('should detect MIME type by extension', async () => {
      expect(await provider.getMimeType('doc.pdf')).toBe('application/pdf');
      expect(await provider.getMimeType('pic.png')).toBe('image/png');
      expect(await provider.getMimeType('data.json')).toBe('application/json');
    });

    it('should return octet-stream for unknown extensions', async () => {
      expect(await provider.getMimeType('file.xyz')).toBe(
        'application/octet-stream',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getCapabilities()
  // -------------------------------------------------------------------------

  describe('getCapabilities', () => {
    it('should report correct capabilities', async () => {
      const caps = await provider.getCapabilities();
      expect(caps.versioning).toBe(true);
      expect(caps.sharing).toBe(true);
      expect(caps.offlineCapable).toBe(false);
      expect(caps.streaming).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Path cache
  // -------------------------------------------------------------------------

  describe('path cache', () => {
    it('should cache resolved path IDs', async () => {
      mockFilesList.mockResolvedValue({
        data: { files: [{ id: 'cached-id', name: 'cached.txt' }] },
      });

      // First call resolves from API
      await provider.exists('cached.txt');
      // Second call should use cache (no additional API calls)
      await provider.exists('cached.txt');

      // files.list should have been called only once
      expect(mockFilesList).toHaveBeenCalledTimes(1);
    });

    it('should expire cache entries based on TTL', async () => {
      const shortTTLProvider = new GoogleDriveProvider({
        type: 'gdrive',
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
        pathCacheTTL: 1, // 1ms TTL
      });

      mockFilesList.mockResolvedValue({
        data: { files: [{ id: 'id-1', name: 'test.txt' }] },
      });

      await shortTTLProvider.exists('test.txt');

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 10));

      await shortTTLProvider.exists('test.txt');

      // Should have been called twice because cache expired
      expect(mockFilesList).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe('error mapping', () => {
    it('should map 404 to FileNotFoundError', async () => {
      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'f1', name: 'x.txt' }] },
      });
      mockFilesGet.mockRejectedValueOnce({ code: 404, message: 'Not found' });

      await expect(provider.getStats('x.txt')).rejects.toThrow(
        FileNotFoundError,
      );
    });

    it('should map 403 to PermissionError', async () => {
      // Create fresh provider to avoid cache from previous test
      const p = new GoogleDriveProvider({
        type: 'gdrive',
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
      });

      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'f1', name: 'x.txt' }] },
      });
      mockFilesGet.mockRejectedValueOnce({ code: 403, message: 'Forbidden' });

      await expect(p.getStats('x.txt')).rejects.toThrow(PermissionError);
    });

    it('should map 401 to auth error', async () => {
      const p = new GoogleDriveProvider({
        type: 'gdrive',
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
      });

      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'f1', name: 'x.txt' }] },
      });
      mockFilesGet.mockRejectedValueOnce({
        code: 401,
        message: 'Unauthorized',
      });

      await expect(p.getStats('x.txt')).rejects.toThrow(FilesystemError);
    });

    it('should map 429 to rate limit error', async () => {
      const p = new GoogleDriveProvider({
        type: 'gdrive',
        clientId: 'id',
        clientSecret: 'secret',
        refreshToken: 'token',
      });

      mockFilesList.mockResolvedValueOnce({
        data: { files: [{ id: 'f1', name: 'x.txt' }] },
      });
      mockFilesGet.mockRejectedValueOnce({
        code: 429,
        message: 'Too many requests',
      });

      await expect(p.getStats('x.txt')).rejects.toThrow(/Rate limited/);
    });
  });
});
