/**
 * The PostgreSQL connection-cache HMAC key is generated on first use, never at
 * import (#1518). An import-time WebCrypto key job leaves every isolate that
 * loads the package with work in flight, and Node aborts the whole process
 * when a worker thread is terminated while that job completes.
 */
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const passwordOptions = {
  host: 'db.invalid',
  database: 'app',
  user: 'app',
  password: 'secret',
} as const;

async function importFreshPostgres() {
  vi.resetModules();
  return import('./postgres');
}

describe('PostgreSQL cache identity HMAC key', () => {
  beforeEach(() => {
    globalThis.__haveSqlPostgresCacheHmacKey = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.__haveSqlPostgresCacheHmacKey = undefined;
  });

  it('starts no key generation when the module is imported', async () => {
    const generateKey = vi.spyOn(webcrypto.subtle, 'generateKey');

    await importFreshPostgres();
    await import('./index');

    expect(generateKey).not.toHaveBeenCalled();
    expect(globalThis.__haveSqlPostgresCacheHmacKey).toBeUndefined();
  });

  it('does not generate a key for an explicit dbid', async () => {
    const generateKey = vi.spyOn(webcrypto.subtle, 'generateKey');
    const { getPostgresConnectionCacheKey } = await importFreshPostgres();

    await expect(
      getPostgresConnectionCacheKey({ ...passwordOptions, dbid: 'named' }),
    ).resolves.toBe('named');
    expect(generateKey).not.toHaveBeenCalled();
  });

  it('generates one key for concurrent first callers and reuses it', async () => {
    const generateKey = vi.spyOn(webcrypto.subtle, 'generateKey');
    const { getPostgresConnectionCacheKey } = await importFreshPostgres();

    const keys = await Promise.all(
      Array.from({ length: 8 }, () =>
        getPostgresConnectionCacheKey(passwordOptions),
      ),
    );
    const later = await getPostgresConnectionCacheKey(passwordOptions);

    expect(generateKey).toHaveBeenCalledTimes(1);
    expect(generateKey).toHaveBeenCalledWith(
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    expect(new Set([...keys, later]).size).toBe(1);
    expect(later).toMatch(/^pg:hmac-sha256:v1:[0-9a-f]{64}$/);
  });

  it('shares the key with another copy of the module in the same isolate', async () => {
    const first = await importFreshPostgres();
    const firstKey = await first.getPostgresConnectionCacheKey(passwordOptions);
    const generateKey = vi.spyOn(webcrypto.subtle, 'generateKey');

    const second = await importFreshPostgres();
    expect(second).not.toBe(first);
    await expect(
      second.getPostgresConnectionCacheKey(passwordOptions),
    ).resolves.toBe(firstKey);
    expect(generateKey).not.toHaveBeenCalled();
  });

  it('does not cache a rejected generation', async () => {
    const generateKey = vi
      .spyOn(webcrypto.subtle, 'generateKey')
      .mockRejectedValueOnce(new Error('keygen unavailable'));
    const { getPostgresConnectionCacheKey } = await importFreshPostgres();

    const failures = await Promise.allSettled([
      getPostgresConnectionCacheKey(passwordOptions),
      getPostgresConnectionCacheKey(passwordOptions),
    ]);
    expect(failures.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(generateKey).toHaveBeenCalledTimes(1);
    expect(globalThis.__haveSqlPostgresCacheHmacKey).toBeUndefined();

    await expect(
      getPostgresConnectionCacheKey(passwordOptions),
    ).resolves.toMatch(/^pg:hmac-sha256:v1:/);
    expect(generateKey).toHaveBeenCalledTimes(2);
  });

  it('does not cache a synchronous generation failure', async () => {
    const generateKey = vi
      .spyOn(webcrypto.subtle, 'generateKey')
      .mockImplementationOnce(() => {
        throw new Error('keygen threw');
      });
    const { getPostgresConnectionCacheKey } = await importFreshPostgres();

    await expect(
      getPostgresConnectionCacheKey(passwordOptions),
    ).rejects.toThrow('keygen threw');
    expect(globalThis.__haveSqlPostgresCacheHmacKey).toBeUndefined();
    await expect(
      getPostgresConnectionCacheKey(passwordOptions),
    ).resolves.toMatch(/^pg:hmac-sha256:v1:/);
    expect(generateKey).toHaveBeenCalledTimes(2);
  });
});

describe('terminating a worker that imported the package', () => {
  const packageRoot = resolve(import.meta.dirname, '..');
  let buildDir = '';

  afterAll(async () => {
    if (buildDir) {
      await rm(buildDir, { recursive: true, force: true });
    }
  });

  it('does not abort the process', async () => {
    // The worker needs a runnable copy of this package, and the tests do not
    // depend on `dist` existing. Build the source into a cache directory
    // under the package so bare imports resolve through its node_modules.
    const cache = join(packageRoot, 'node_modules', '.cache');
    await mkdir(cache, { recursive: true });
    buildDir = await mkdtemp(join(cache, 'sdk-hmac-worker-'));
    const { build } = await import('vite');
    await build({
      configFile: false,
      logLevel: 'silent',
      root: packageRoot,
      build: {
        ssr: join(packageRoot, 'src', 'index.ts'),
        outDir: buildDir,
        emptyOutDir: true,
        minify: false,
        rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
      },
    });
    const entry = pathToFileURL(join(buildDir, 'entry.mjs')).href;

    // The worker reports whether importing the package left a key promise
    // behind, then is terminated straight away: the window in which an
    // import-time key job aborts Node. A separate process keeps such an abort
    // from taking the test runner down; its exit status is the assertion.
    const workerFile = join(buildDir, 'worker.mjs');
    await writeFile(
      workerFile,
      `import { parentPort } from 'node:worker_threads';
await import(${JSON.stringify(entry)});
parentPort.postMessage(globalThis.__haveSqlPostgresCacheHmacKey === undefined);
`,
    );
    const driver = join(buildDir, 'driver.mjs');
    await writeFile(
      driver,
      `import { Worker } from 'node:worker_threads';
for (let i = 0; i < 40; i++) {
  const worker = new Worker(${JSON.stringify(workerFile)});
  const clean = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  await worker.terminate();
  if (clean !== true) {
    console.error('importing the package started HMAC key generation');
    process.exit(3);
  }
}
console.log('ok');
`,
    );

    const result = spawnSync(process.execPath, [driver], {
      encoding: 'utf8',
      timeout: 90_000,
    });

    expect(
      { status: result.status, signal: result.signal },
      result.stderr,
    ).toEqual({ status: 0, signal: null });
    expect(result.stdout.trim()).toBe('ok');
  }, 120_000);
});
