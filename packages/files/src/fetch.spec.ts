import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  fetchJSON,
  fetchText,
  fetchToFile,
  writeResponseToFile,
} from './fetch';

describe('fetchToFile', () => {
  let server: Server;
  let serverUrl: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'files-fetch-'));

    server = createServer((req, res) => {
      if (req.url === '/headers') {
        if (req.headers['x-test-token'] !== 'present') {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('missing header');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.end('header ok');
        return;
      }

      if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/pdf' });
          res.end('slow response');
        }, 250);
        return;
      }

      if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.write(Buffer.alloc(1024, 'a'));
        res.write(Buffer.alloc(1024, 'b'));
        res.end(Buffer.alloc(1024, 'c'));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Failed to start test server');
        }
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('streams to disk with custom headers', async () => {
    const targetPath = join(tempDir, 'headers.pdf');

    await fetchToFile(`${serverUrl}/headers`, targetPath, {
      headers: {
        'x-test-token': 'present',
      },
    });

    await expect(readFile(targetPath, 'utf8')).resolves.toBe('header ok');
  });

  it('honors timeout when provided', async () => {
    const targetPath = join(tempDir, 'slow.pdf');

    await expect(
      fetchToFile(`${serverUrl}/slow`, targetPath, {
        timeout: 25,
      }),
    ).rejects.toThrow();
  });

  it('enforces maxBytes and removes partial files', async () => {
    const targetPath = join(tempDir, 'large.pdf');

    await expect(
      fetchToFile(`${serverUrl}/large`, targetPath, {
        maxBytes: 1500,
      }),
    ).rejects.toThrow('Downloaded content exceeded maxBytes');

    await expect(readFile(targetPath)).rejects.toThrow();
  });

  it('preserves an existing file when a refresh fails', async () => {
    const targetPath = join(tempDir, 'existing.pdf');
    await writeFile(targetPath, 'existing content');

    await expect(
      fetchToFile(`${serverUrl}/large`, targetPath, {
        maxBytes: 1500,
      }),
    ).rejects.toThrow('Downloaded content exceeded maxBytes');

    await expect(readFile(targetPath, 'utf8')).resolves.toBe(
      'existing content',
    );
  });

  it('rejects cleanly when the destination path cannot be opened', async () => {
    const targetPath = join(tempDir, 'missing', 'headers.pdf');

    await expect(
      fetchToFile(`${serverUrl}/headers`, targetPath),
    ).rejects.toThrow();
    await expect(readFile(targetPath)).rejects.toThrow();
  });

  it.skipIf(process.platform === 'win32')(
    'preserves existing destination permissions when refreshing a file',
    async () => {
      const targetPath = join(tempDir, 'secure.pdf');
      await writeFile(targetPath, 'existing content');
      await chmod(targetPath, 0o600);

      await fetchToFile(`${serverUrl}/headers`, targetPath, {
        headers: {
          'x-test-token': 'present',
        },
      });

      await expect(readFile(targetPath, 'utf8')).resolves.toBe('header ok');
      const targetStats = await stat(targetPath);
      expect(targetStats.mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === 'win32')(
    'writes through symlink destinations without replacing the symlink',
    async () => {
      const targetPath = join(tempDir, 'target.pdf');
      const symlinkPath = join(tempDir, 'linked.pdf');

      await writeFile(targetPath, 'existing content');
      await symlink(targetPath, symlinkPath);

      await fetchToFile(`${serverUrl}/headers`, symlinkPath, {
        headers: {
          'x-test-token': 'present',
        },
      });

      await expect(readFile(targetPath, 'utf8')).resolves.toBe('header ok');
      const linkStats = await lstat(symlinkPath);
      expect(linkStats.isSymbolicLink()).toBe(true);
    },
  );
});

describe('fetch response helpers', () => {
  let server: Server;
  let serverUrl: string;

  beforeEach(async () => {
    server = createServer((_req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Failed to start test server');
        }
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('throws for non-ok text responses', async () => {
    await expect(fetchText(serverUrl)).rejects.toThrow('Failed to fetch');
  });

  it('throws for non-ok JSON responses', async () => {
    await expect(fetchJSON(serverUrl)).rejects.toThrow('Failed to fetch');
  });
});

describe('writeResponseToFile', () => {
  let server: Server;
  let serverUrl: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'files-response-'));

    server = createServer((req, res) => {
      if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'application/pdf' });
        res.write(Buffer.alloc(1024, 'a'));
        res.write(Buffer.alloc(1024, 'b'));
        res.end(Buffer.alloc(1024, 'c'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end('response body');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('Failed to start test server');
        }
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('writes an existing streamed response to disk', async () => {
    const response = await fetch(`${serverUrl}/large`);
    const targetPath = join(tempDir, 'response.pdf');

    await writeResponseToFile(response, targetPath);

    const buffer = await readFile(targetPath);
    expect(buffer.byteLength).toBe(3072);
  });

  it('preserves an existing file when response streaming exceeds maxBytes', async () => {
    const response = await fetch(`${serverUrl}/large`);
    const targetPath = join(tempDir, 'existing.pdf');
    await writeFile(targetPath, 'existing content');

    await expect(
      writeResponseToFile(response, targetPath, { maxBytes: 1500 }),
    ).rejects.toThrow('Downloaded content exceeded maxBytes');

    await expect(readFile(targetPath, 'utf8')).resolves.toBe(
      'existing content',
    );
  });
});
