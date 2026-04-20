import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fetchToFile } from './fetch';

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
        }, 100);
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
        timeout: 10,
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
});
