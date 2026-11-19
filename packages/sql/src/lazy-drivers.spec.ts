/**
 * Each adapter loads its driver only when that adapter is created. Opening
 * SQLite must not load `pg`, `ws`, the libsql hrana client or `node-fetch`,
 * and opening PostgreSQL or PGlite must not load the SQLite driver.
 *
 * Every scenario runs in a fresh child process so other tests (and module
 * mocks) cannot influence what is loaded. The child records each module file
 * Node loads and the parent matches those paths against the driver packages.
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let buildDir: string;
let runnerFile: string;

/** Substrings that identify a driver package inside a loaded file path. */
const DRIVERS = {
  pg: '/node_modules/pg/',
  ws: '/node_modules/ws/',
  hrana: '/@libsql/hrana-client/',
  libsqlWebSocketClient: '/@libsql/client/lib-esm/ws.js',
  libsqlHttpClient: '/@libsql/client/lib-esm/http.js',
  nodeFetch: '/node_modules/node-fetch/',
  libsql: '/node_modules/libsql/',
  duckdb: '/@duckdb/node-api/',
  pglite: '/@electric-sql/pglite/',
} as const;

type DriverName = keyof typeof DRIVERS;

beforeAll(async () => {
  const cache = join(packageRoot, 'node_modules', '.cache');
  await mkdir(cache, { recursive: true });
  buildDir = await mkdtemp(join(cache, 'sdk-lazy-drivers-'));
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
  runnerFile = join(buildDir, 'runner.mjs');
  await writeFile(
    runnerFile,
    `import { registerHooks } from 'node:module';
const loaded = new Set();
registerHooks({
  load(url, context, nextLoad) {
    loaded.add(url);
    return nextLoad(url, context);
  },
});
const scenario = process.argv[2];
const entry = process.argv[3];
let error;
try {
  const sql = await import(entry);
  if (scenario === 'sqlite') {
    const db = await sql.getDatabase({ type: 'sqlite', url: ':memory:' });
    await db.close();
  } else if (scenario === 'pglite') {
    const db = await sql.getDatabase({ type: 'pglite' });
    await db.close();
  } else if (scenario === 'postgres') {
    // No server is running: opening fails after the driver has been loaded.
    await sql.getDatabase({
      type: 'postgres',
      url: 'postgres://u:p@127.0.0.1:1/db',
      connectionTimeoutMillis: 500,
    }).then((db) => db.close?.(), (e) => { error = String(e.message); });
    await sql.clearPostgresConnectionCache();
  }
} catch (e) {
  error = String(e && e.message);
}
console.log(JSON.stringify({ loaded: [...loaded], error }));
`,
  );
}, 120_000);

afterAll(async () => {
  if (buildDir) await rm(buildDir, { recursive: true, force: true });
});

async function loadedDrivers(scenario: string): Promise<Set<DriverName>> {
  const entry = pathToFileURL(join(buildDir, 'entry.mjs')).href;
  const { stdout } = await run(
    process.execPath,
    [runnerFile, scenario, entry],
    { cwd: packageRoot },
  );
  const report = JSON.parse(stdout.trim().split('\n').pop() as string) as {
    loaded: string[];
    error?: string;
  };
  if (scenario !== 'postgres') expect(report.error).toBeUndefined();
  const found = new Set<DriverName>();
  for (const url of report.loaded) {
    for (const [name, needle] of Object.entries(DRIVERS)) {
      if (url.includes(needle)) found.add(name as DriverName);
    }
  }
  return found;
}

describe('adapter drivers load lazily', () => {
  it('loads no driver for the root entry alone', async () => {
    expect([...(await loadedDrivers('none'))]).toEqual([]);
  });

  it('loads only the embedded libsql engine when opening SQLite', async () => {
    expect([...(await loadedDrivers('sqlite'))]).toEqual(['libsql']);
  });

  it('loads only pg when opening PostgreSQL', async () => {
    expect([...(await loadedDrivers('postgres'))]).toEqual(['pg']);
  });

  it('loads only PGlite when opening PGlite', async () => {
    expect([...(await loadedDrivers('pglite'))]).toEqual(['pglite']);
  });
});
