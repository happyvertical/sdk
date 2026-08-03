import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const documentsManifest = JSON.parse(
  readFileSync('packages/documents/package.json', 'utf8'),
);
const workspaceYaml = readFileSync('pnpm-workspace.yaml', 'utf8');

function readCatalog() {
  const catalog = new Map();
  let inCatalog = false;

  for (const line of workspaceYaml.split('\n')) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }
    if (inCatalog && /^\S/.test(line)) break;
    if (!inCatalog) continue;

    const match = /^\s{2}'([^']+)':\s*(\S+)\s*$/.exec(line);
    if (match) catalog.set(match[1], match[2]);
  }

  return catalog;
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function caretRangeIncludes(range, version) {
  const rangeMatch = /^\^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(range);
  const versionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!rangeMatch || !versionMatch) return false;

  const lower = rangeMatch.slice(1).map((part) => Number(part ?? 0));
  const candidate = versionMatch.slice(1).map(Number);
  const upper =
    lower[0] > 0
      ? [lower[0] + 1, 0, 0]
      : lower[1] > 0
        ? [0, lower[1] + 1, 0]
        : [0, 0, lower[2] + 1];

  return (
    compareVersions(candidate, lower) >= 0 &&
    compareVersions(candidate, upper) < 0
  );
}

test('Documents publishes its direct HappyVertical dependency contract', () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(documentsManifest.dependencies).filter(([name]) =>
        name.startsWith('@happyvertical/'),
      ),
    ),
    {
      '@happyvertical/files': 'workspace:*',
      '@happyvertical/ocr': 'catalog:',
      '@happyvertical/pdf': 'catalog:',
      '@happyvertical/spider': 'catalog:',
      '@happyvertical/utils': 'workspace:*',
    },
  );
});

test('Documents catalog ranges accept the audited released dependency family', () => {
  const catalog = readCatalog();
  const releasedDependencies = {
    '@happyvertical/ocr': '0.61.1',
    '@happyvertical/pdf': '0.65.9',
    '@happyvertical/spider': '1.1.13',
  };

  assert.equal(catalog.get('@happyvertical/ocr'), '^0.61.1');
  for (const [name, version] of Object.entries(releasedDependencies)) {
    const range = catalog.get(name);
    assert.ok(
      range && caretRangeIncludes(range, version),
      `${name} ${range ?? '<missing>'} must accept released version ${version}`,
    );
  }
});
