import { execFile, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  CreateBucketCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S3FilesystemProvider } from './s3';

const execFileAsync = promisify(execFile);
const dockerAvailable =
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
const minioEnabled =
  dockerAvailable &&
  (!process.env.CI || process.env.HAPPYVERTICAL_RUN_MINIO_TESTS === '1');
const describeIfDocker = minioEnabled ? describe : describe.skip;

const MINIO_IMAGE =
  'minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e';
const MINIO_ROOT_USER = 'minioadmin';
const MINIO_ROOT_PASSWORD = 'minioadmin';

let containerName = '';
let endpoint = '';
let bucket = '';
const tempDirs: string[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runDocker(args: string[]) {
  return execFileAsync('docker', args, {
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf8',
  });
}

async function ensureMinioImage() {
  try {
    await runDocker(['image', 'inspect', MINIO_IMAGE]);
  } catch {
    await runDocker(['pull', MINIO_IMAGE]);
  }
}

async function getMappedPort(name: string, containerPort: string) {
  const { stdout } = await runDocker(['port', name, containerPort]);
  const match = stdout.match(/:(\d+)\s*$/m);
  if (!match) {
    throw new Error(`Could not determine mapped port for ${containerPort}`);
  }
  return Number(match[1]);
}

async function waitForMinioReady(targetEndpoint: string) {
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: targetEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: MINIO_ROOT_USER,
      secretAccessKey: MINIO_ROOT_PASSWORD,
    },
  });

  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await client.send(new ListBucketsCommand({}));
      return client;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }

  throw new Error(
    `MinIO did not become ready: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'happyvertical-files-minio-'));
  tempDirs.push(dir);
  return dir;
}

function createProvider(basePath: string) {
  return new S3FilesystemProvider({
    type: 's3',
    region: 'us-east-1',
    bucket,
    endpoint,
    accessKeyId: MINIO_ROOT_USER,
    secretAccessKey: MINIO_ROOT_PASSWORD,
    forcePathStyle: true,
    basePath,
  });
}

describeIfDocker('S3FilesystemProvider (MinIO)', () => {
  beforeAll(async () => {
    await ensureMinioImage();

    containerName = `files-minio-${process.pid}-${Date.now()}`;
    const { stdout } = await runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--publish',
      '127.0.0.1::9000',
      '--env',
      `MINIO_ROOT_USER=${MINIO_ROOT_USER}`,
      '--env',
      `MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}`,
      MINIO_IMAGE,
      'server',
      '/data',
    ]);

    if (!stdout.trim()) {
      throw new Error('Failed to start MinIO container');
    }

    const port = await getMappedPort(containerName, '9000/tcp');
    endpoint = `http://127.0.0.1:${port}`;

    const client = await waitForMinioReady(endpoint);
    bucket = `sdk-files-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }, 120_000);

  afterAll(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );

    if (containerName) {
      await runDocker(['rm', '--force', containerName]).catch(() => {});
    }
  }, 30_000);

  it('round-trips files against a real MinIO server', async () => {
    const provider = createProvider('integration/roundtrip');

    await provider.write('docs/readme.txt', 'hello from minio');

    await expect(provider.exists('docs/readme.txt')).resolves.toBe(true);
    await expect(provider.read('docs/readme.txt')).resolves.toBe(
      'hello from minio',
    );
    await expect(
      provider.read('docs/readme.txt', { raw: true }),
    ).resolves.toEqual(Buffer.from('hello from minio'));
    await expect(provider.getMimeType('docs/readme.txt')).resolves.toBe(
      'text/plain',
    );
  });

  it('returns child folders from non-recursive listings via CommonPrefixes', async () => {
    const provider = createProvider('integration/list');

    await provider.write('reports/2026/summary.json', '{"ok":true}');

    const items = await provider.list('reports');

    expect(items).toContainEqual(
      expect.objectContaining({
        name: '2026',
        path: 'integration/list/reports/2026',
        isDirectory: true,
      }),
    );
  });

  it('treats empty directory markers as directories and can delete them cleanly', async () => {
    const provider = createProvider('integration/directories');

    await provider.createDirectory('staging');

    await expect(provider.getStats('staging')).resolves.toMatchObject({
      isDirectory: true,
      isFile: false,
    });

    const listed = await provider.list('.');
    expect(listed).toContainEqual(
      expect.objectContaining({
        name: 'staging',
        path: 'integration/directories/staging',
        isDirectory: true,
      }),
    );

    await provider.delete('staging');
    await expect(provider.exists('staging')).resolves.toBe(false);
  });

  it('uploads from disk and downloads back to disk through MinIO', async () => {
    const provider = createProvider('integration/transfer');
    const dir = await createTempDir();
    const sourcePath = join(dir, 'upload.txt');
    const downloadPath = join(dir, 'download.txt');

    await writeFile(sourcePath, 'disk transfer');

    await provider.upload(sourcePath, 'artifacts/upload.txt');
    const writtenPath = await provider.download(
      'artifacts/upload.txt',
      downloadPath,
    );

    expect(writtenPath).toBe(downloadPath);
    await expect(readFile(downloadPath, 'utf8')).resolves.toBe('disk transfer');
  });
});
