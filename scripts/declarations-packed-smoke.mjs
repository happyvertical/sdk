import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const workspace = readJson(resolve(root, 'package.json'));
const evidence = process.env.SDK_DECLARATIONS_EVIDENCE_DIR;

// TypeScript also searches ancestor node_modules directories for imports. A
// temporary directory alone is not isolation when /tmp/node_modules exists.
function hasCleanAncestors(directory) {
  for (let current = resolve(directory); ; current = dirname(current)) {
    if (existsSync(resolve(current, 'node_modules'))) return false;
    if (dirname(current) === current) return true;
  }
}
const temporaryRoot = [tmpdir(), homedir()].find(hasCleanAncestors);
assert.ok(
  temporaryRoot,
  'Choose a TMPDIR with no ancestor node_modules directories',
);
const fixture = mkdtempSync(
  resolve(temporaryRoot, '.sdk-packed-declarations-'),
);
const packages = new Map();
for (const entry of readdirSync(resolve(root, 'packages'), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const dir = resolve(root, 'packages', entry.name);
  try {
    const manifest = readJson(resolve(dir, 'package.json'));
    packages.set(manifest.name, { dir, manifest });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const packed = new Map();
const externalVersions = new Map();

function run(command, args, cwd = fixture) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (evidence && command === 'pnpm' && args[0] === 'install') {
    writeFileSync(
      resolve(evidence, 'consumer-install.log'),
      `${result.stdout ?? ''}${result.stderr ?? ''}\nexit=${result.status}\n`,
    );
  }
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`,
  );
  return result.stdout;
}

function pack(name) {
  if (packed.has(name)) return;
  const { dir, manifest } = packages.get(name);
  const destination = resolve(fixture, 'tarballs', name);
  mkdirSync(destination, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', destination], dir);
  const tarballs = readdirSync(destination).filter((path) =>
    path.endsWith('.tgz'),
  );
  assert.equal(tarballs.length, 1);
  const tarball = resolve(destination, tarballs[0]);
  packed.set(name, tarball);
  if (evidence) {
    mkdirSync(resolve(evidence, 'tarballs'), { recursive: true });
    copyFileSync(tarball, resolve(evidence, 'tarballs', tarballs[0]));
  }
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  })) {
    if (packages.has(dependency)) {
      pack(dependency);
      continue;
    }
    // Match the producer's resolved direct external versions, without exposing
    // its node_modules tree or injecting its development-only @types packages.
    let version;
    try {
      version = readJson(
        resolve(dir, 'node_modules', dependency, 'package.json'),
      ).version;
    } catch (error) {
      const optional =
        manifest.peerDependenciesMeta?.[dependency]?.optional ||
        Object.hasOwn(manifest.optionalDependencies ?? {}, dependency);
      if (optional && error.code === 'ENOENT') continue;
      throw error;
    }
    const existing = externalVersions.get(dependency);
    assert.ok(
      !existing || existing === version,
      `Conflicting external versions for ${dependency}`,
    );
    externalVersions.set(dependency, version);
  }
}

try {
  for (const name of [
    '@happyvertical/ai',
    '@happyvertical/auth',
    '@happyvertical/files',
    '@happyvertical/sql',
  ])
    pack(name);
  const dependencies = Object.fromEntries(
    [...packed].map(([name, path]) => [name, `file:${path}`]),
  );
  const nodeTypes = readJson(
    resolve(root, 'packages/ai/node_modules/@types/node/package.json'),
  ).version;
  writeFileSync(
    resolve(fixture, 'package.json'),
    JSON.stringify(
      {
        name: 'sdk-packed-declaration-consumer',
        private: true,
        type: 'module',
        packageManager: workspace.packageManager,
        dependencies,
        devDependencies: {
          typescript: workspace.devDependencies.typescript,
          '@types/node': nodeTypes,
        },
      },
      null,
      2,
    ),
  );
  // pnpm 11 reads overrides from workspace configuration, not package.json.
  writeFileSync(
    resolve(fixture, 'pnpm-workspace.yaml'),
    JSON.stringify(
      {
        packages: ['.'],
        overrides: { ...Object.fromEntries(externalVersions), ...dependencies },
      },
      null,
      2,
    ),
  );
  // This fixture executes only the compiler, not package runtime code. Production
  // workspace install/build gates run their normal lifecycle scripts separately.
  run('pnpm', [
    'install',
    '--ignore-scripts',
    '--no-frozen-lockfile',
    '--registry',
    'https://registry.npmjs.org',
  ]);
  const inventory = run('pnpm', ['list', '--depth', 'Infinity', '--json']);
  function assertLocalSdk(value) {
    if (!value || typeof value !== 'object') return;
    for (const [name, dependency] of Object.entries(value)) {
      if (packages.has(name)) {
        assert.ok(packed.has(name), `Unpacked SDK dependency: ${name}`);
        assert.match(
          dependency.resolved ?? '',
          /^file:/,
          `SDK dependency must use the candidate tarball: ${name}`,
        );
      }
      assertLocalSdk(dependency);
    }
  }
  assertLocalSdk(JSON.parse(inventory));
  if (evidence) {
    copyFileSync(
      resolve(fixture, 'package.json'),
      resolve(evidence, 'consumer-package.json'),
    );
    copyFileSync(
      resolve(fixture, 'pnpm-lock.yaml'),
      resolve(evidence, 'consumer-pnpm-lock.yaml'),
    );
    copyFileSync(
      resolve(fixture, 'pnpm-workspace.yaml'),
      resolve(evidence, 'consumer-pnpm-workspace.yaml'),
    );
    writeFileSync(resolve(evidence, 'consumer-installed.json'), inventory);
  }
  writeFileSync(
    resolve(fixture, 'consumer.mjs'),
    `
import { LocalChatGPTSessionManager } from '@happyvertical/auth/local';
const manager = new LocalChatGPTSessionManager({
  appName: 'packed-consumer',
  path: new URL('./chatgpt.json', import.meta.url).pathname,
});
if ((await manager.sessions()).length !== 0) throw new Error('unexpected session');
`,
  );
  run(process.execPath, ['consumer.mjs']);
  writeFileSync(
    resolve(fixture, 'consumer.ts'),
    `
import { makeId, pluralizeWord } from '@happyvertical/utils/browser';
import { getAI, type AIInterface } from '@happyvertical/ai';
import { getAIAuto } from '@happyvertical/ai/node';
import { LocalChatGPTSessionManager } from '@happyvertical/auth/local';
import { getFilesystem, type FilesystemInterface } from '@happyvertical/files';
import { getDatabase, type DatabaseInterface } from '@happyvertical/sql';
const id: string = makeId();
const plural: string = pluralizeWord('unit', 2);
pluralizeWord.addPluralRule(/unit$/, 'units');
const ai: Promise<AIInterface> = getAI({ type: 'openai' });
const auto: Promise<AIInterface> = getAIAuto();
const auth = new LocalChatGPTSessionManager({ appName: 'packed-consumer' });
const files: Promise<FilesystemInterface> = getFilesystem({ type: 'local' });
const sql: Promise<DatabaseInterface> = getDatabase({ type: 'sqlite', url: ':memory:' });
type IsAny<T> = 0 extends (1 & T) ? true : false;
const aiAny: IsAny<Awaited<ReturnType<typeof getAI>>> = false;
const autoAny: IsAny<Awaited<ReturnType<typeof getAIAuto>>> = false;
const filesAny: IsAny<Awaited<ReturnType<typeof getFilesystem>>> = false;
const sqlAny: IsAny<Awaited<ReturnType<typeof getDatabase>>> = false;
const pluralAny: IsAny<ReturnType<typeof pluralizeWord>> = false;
// Legacy clients accept custom provider strings; preserve that public contract.
getAI({ type: 'custom-provider' });
// @ts-expect-error A provider name must remain a string.
getAI({ type: 42 });
// @ts-expect-error Published pluralization functions require a word string.
pluralizeWord(42);
// @ts-expect-error A string cannot satisfy the published filesystem interface.
const invalid: FilesystemInterface = 'not-a-filesystem';
void [id, plural, ai, auto, auth, files, sql, aiAny, autoAny, filesAny, sqlAny, pluralAny, invalid];
`,
  );
  const require = createRequire(resolve(fixture, 'package.json'));
  for (const mode of ['Bundler', 'NodeNext']) {
    writeFileSync(
      resolve(fixture, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2023',
          module: mode === 'NodeNext' ? 'NodeNext' : 'ESNext',
          moduleResolution: mode,
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ['node'],
        },
        files: ['consumer.ts'],
      }),
    );
    run(process.execPath, [
      require.resolve('typescript/bin/tsc'),
      '-p',
      'tsconfig.json',
    ]);
    console.log(
      `Packed AI root/node, auth/local, files and SQL: ${mode} strict declarations passed`,
    );
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
