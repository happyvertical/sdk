/**
 * The case from happyvertical/smrt#4978: one connection holds a write
 * transaction in the main thread and a worker thread opens a second
 * connection from `db.reopenOptions()`. Each thread has its own module state,
 * so nothing but the options and `engine` connects them.
 */
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

const secureFile = {
  driver: 'node:sqlite',
  custody: 'trusted-parent',
} as const;

const packageRoot = resolve(import.meta.dirname, '..');
let buildDir = '';
let workerFile = '';
const roots: string[] = [];

interface WorkerReport {
  engine?: string;
  write?: 'wrote' | 'refused';
  finishedAt?: number;
  error?: string;
}

beforeAll(async () => {
  // The worker needs a runnable copy of this package, and the tests do not
  // depend on `dist` existing. Build the source once into a cache directory
  // under the package so bare imports resolve through its node_modules.
  const cache = join(packageRoot, 'node_modules', '.cache');
  await mkdir(cache, { recursive: true });
  buildDir = await mkdtemp(join(cache, 'sdk-engine-worker-'));
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
  workerFile = join(buildDir, 'worker.mjs');
  await writeFile(
    workerFile,
    `import { parentPort, workerData } from 'node:worker_threads';
const { getDatabase } = await import(workerData.entry);
const report = {};
const db = await getDatabase(workerData.options);
try {
  report.engine = db.engine;
  if (workerData.busyTimeoutMs) {
    await db.query('PRAGMA busy_timeout = ' + workerData.busyTimeoutMs);
  }
  parentPort.postMessage({ ready: true });
  try {
    await db.update('t', { id: 1 }, { v: 'worker' });
    report.write = 'wrote';
  } catch (error) {
    report.write = 'refused';
    report.error = String(error.message) + JSON.stringify(error.context ?? {});
  }
  report.finishedAt = Date.now();
} finally {
  await db.close().catch(() => {});
}
parentPort.postMessage({ done: true, report });
`,
  );
}, 120_000);

afterAll(async () => {
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
  for (const root of roots) await rm(root, { recursive: true, force: true });
});

async function runWorker(
  options: unknown,
  extra: Record<string, unknown> = {},
  whileRunning?: () => Promise<void>,
): Promise<WorkerReport> {
  const entry = pathToFileURL(join(buildDir, 'entry.mjs')).href;
  const worker = new Worker(workerFile, {
    workerData: { entry, options, ...extra },
  });
  let markReady: () => void = () => {};
  const ready = new Promise<void>((r) => {
    markReady = r;
  });
  const report = new Promise<WorkerReport>((resolveReport, reject) => {
    worker.on('message', (message) => {
      if (message.ready) markReady();
      else resolveReport(message.report);
    });
    worker.once('error', reject);
  });
  await ready;
  await whileRunning?.();
  const exited = new Promise<void>((done) => worker.once('exit', () => done()));
  const result = await report;
  // Let the worker finish on its own: terminating a thread with a pending
  // crypto job aborts the whole process on some Node versions.
  await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))]);
  await worker.terminate();
  return result;
}

describe.each([
  [
    'node-sqlite',
    (file: string) => ({ type: 'sqlite', url: file, secureFile }),
  ],
  ['libsql', (file: string) => ({ type: 'sqlite', url: file })],
] as const)('reopenOptions in a worker thread (%s)', (engine, make) => {
  async function setup() {
    const root = await mkdtemp(join(await realpath(tmpdir()), 'sdk-worker-'));
    roots.push(root);
    const db = (await getDatabase(
      make(join(root, 'w.db')) as never,
    )) as DatabaseInterface;
    await db.query('PRAGMA journal_mode = WAL');
    await db.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    await db.query("INSERT INTO t (id, v) VALUES (1, 'a')");
    return db;
  }

  it('opens on the same engine and is refused while the main thread writes', async () => {
    const db = await setup();
    try {
      const options = db.reopenOptions?.();
      expect(structuredClone(options)).toEqual(options);
      const holder = await db.beginTransaction?.();
      let report: WorkerReport;
      try {
        await holder?.update('t', { id: 1 }, { v: 'held' });
        report = await runWorker(options);
      } finally {
        await holder?.commit();
      }
      expect(report.engine).toBe(engine);
      expect(report.write).toBe('refused');
      expect(report.error).toMatch(/database is locked|SQLITE_BUSY/i);
      expect(report.error).not.toMatch(/malformed|locking protocol/i);
      const integrity = await db.query('PRAGMA integrity_check');
      expect(Object.values(integrity.rows[0] ?? {})).toEqual(['ok']);
      expect(await db.get('t', { id: 1 })).toMatchObject({ v: 'held' });
    } finally {
      await db.close?.();
    }
  }, 60_000);

  it('waits for the main thread when the worker sets a busy timeout', async () => {
    const db = await setup();
    try {
      const holder = await db.beginTransaction?.();
      await holder?.update('t', { id: 1 }, { v: 'held' });
      let committedAt = Number.POSITIVE_INFINITY;
      const report = await runWorker(
        db.reopenOptions?.(),
        { busyTimeoutMs: 5_000 },
        async () => {
          // The worker has the lock contention in front of it from here on.
          await new Promise((r) => setTimeout(r, 300));
          committedAt = Date.now();
          await holder?.commit();
        },
      );
      expect(report.engine).toBe(engine);
      expect(report.write).toBe('wrote');
      // The write could only finish after the main thread released the lock.
      expect(report.finishedAt ?? 0).toBeGreaterThanOrEqual(committedAt);
      expect(await db.get('t', { id: 1 })).toMatchObject({ v: 'worker' });
      const integrity = await db.query('PRAGMA integrity_check');
      expect(Object.values(integrity.rows[0] ?? {})).toEqual(['ok']);
    } finally {
      await db.close?.();
    }
  }, 60_000);
});
