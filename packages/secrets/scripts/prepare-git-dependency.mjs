import { readFile, realpath, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const packageDirectory = new URL('..', import.meta.url);
const repositoryDirectory = new URL('../../..', import.meta.url);

const build = spawnSync(
  'pnpm',
  ['--dir', repositoryDirectory.pathname, '--filter', '@happyvertical/secrets', 'build'],
  { stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const git = spawnSync(
  'git',
  ['-C', repositoryDirectory.pathname, 'rev-parse', '--show-toplevel'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
);
if (
  git.status === 0 &&
  (await realpath(git.stdout.trim())) ===
    (await realpath(repositoryDirectory.pathname))
) {
  process.exit(0);
}

const manifestUrl = new URL('package.json', packageDirectory);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
for (const dependencies of [
  manifest.dependencies,
  manifest.optionalDependencies,
  manifest.peerDependencies,
]) {
  if (!dependencies) continue;
  for (const [name, specifier] of Object.entries(dependencies)) {
    if (typeof specifier === 'string' && specifier.startsWith('workspace:')) {
      dependencies[name] = manifest.version;
    }
  }
}
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
