import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const secretsDirectory = new URL('../packages/secrets/', import.meta.url);

test('secrets git preparation remains package-local', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('package.json', secretsDirectory), 'utf8'),
  );
  const workspace = await readFile(
    new URL('pnpm-workspace.yaml', secretsDirectory),
    'utf8',
  );

  assert.equal(
    manifest.scripts.prepare,
    'node scripts/prepare-git-dependency.mjs',
  );
  assert.equal(
    workspace,
    "packages:\n  - '.'\n  - '../sql'\n  - '../utils'\n",
  );

  const projects = JSON.parse(
    execFileSync(
      'pnpm',
      [
        '--dir',
        fileURLToPath(secretsDirectory),
        'list',
        '--recursive',
        '--depth',
        '-1',
        '--json',
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.deepEqual(
    projects.map(({ name }) => name).sort(),
    ['@happyvertical/secrets', '@happyvertical/sql', '@happyvertical/utils'],
  );
});
