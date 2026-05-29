#!/usr/bin/env bash
set -euo pipefail

echo "Testing workspace package export resolution..."

node --input-type=module <<'EOF'
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const packagesDir = join(root, 'packages');
const failures = [];
let checkedPackages = 0;
let checkedSpecifiers = 0;
let checkedTargets = 0;

function addFailure(message) {
  failures.push(message);
}

function isPathTarget(value) {
  return typeof value === 'string' && value.startsWith('./');
}

function collectPathTargets(value, targets = []) {
  if (isPathTarget(value)) {
    targets.push(value);
    return targets;
  }

  if (!value || typeof value !== 'object') {
    return targets;
  }

  for (const nested of Object.values(value)) {
    collectPathTargets(nested, targets);
  }

  return targets;
}

function hasRuntimeTarget(value) {
  if (isPathTarget(value)) {
    return true;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  if (isPathTarget(value.import) || isPathTarget(value.default)) {
    return true;
  }

  for (const [condition, nested] of Object.entries(value)) {
    if (condition === 'types') {
      continue;
    }

    if (hasRuntimeTarget(nested)) {
      return true;
    }
  }

  return false;
}

function exportSpecifier(packageName, exportKey) {
  return exportKey === '.'
    ? packageName
    : `${packageName}/${exportKey.replace(/^\.\//, '')}`;
}

async function resolveFromPackage(packageDir, specifiers) {
  const tempDir = await mkdtemp(join(packageDir, '.export-resolution-'));
  const scriptPath = join(tempDir, 'check.mjs');

  try {
    await writeFile(
      scriptPath,
      [
        `const specifiers = ${JSON.stringify(specifiers)};`,
        'const resolved = {};',
        'for (const specifier of specifiers) {',
        '  resolved[specifier] = await import.meta.resolve(specifier);',
        '}',
        'export default resolved;',
        '',
      ].join('\n'),
    );

    return (await import(pathToFileURL(scriptPath).href)).default;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

const packageJsonPaths = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesDir, entry.name, 'package.json'))
  .filter((path) => existsSync(path))
  .sort();

for (const packageJsonPath of packageJsonPaths) {
  const packageDir = dirname(packageJsonPath);
  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  checkedPackages += 1;

  if (!pkg.name) {
    addFailure(`${packageJsonPath}: missing package name`);
    continue;
  }

  const exportEntries = Object.entries(pkg.exports ?? {});

  if (exportEntries.length === 0) {
    addFailure(`${pkg.name}: missing package exports`);
    continue;
  }

  const specifiers = [];

  for (const [exportKey, exportValue] of exportEntries) {
    for (const target of collectPathTargets(exportValue)) {
      checkedTargets += 1;
      const targetPath = resolve(packageDir, target);

      if (!existsSync(targetPath)) {
        addFailure(`${pkg.name} export ${exportKey} target is missing: ${target}`);
      }
    }

    if (hasRuntimeTarget(exportValue)) {
      specifiers.push(exportSpecifier(pkg.name, exportKey));
    }
  }

  checkedSpecifiers += specifiers.length;

  try {
    const resolved = await resolveFromPackage(packageDir, specifiers);

    for (const [specifier, resolvedUrl] of Object.entries(resolved)) {
      if (!resolvedUrl.startsWith('file://')) {
        addFailure(`${specifier} resolved to non-file URL: ${resolvedUrl}`);
        continue;
      }

      const resolvedPath = new URL(resolvedUrl);

      if (!existsSync(resolvedPath)) {
        addFailure(`${specifier} resolved to missing file: ${resolvedUrl}`);
      }
    }
  } catch (error) {
    addFailure(
      `${pkg.name}: failed to resolve package exports: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length > 0) {
  console.error('Export resolution failed:');

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(
  `Export resolution passed for ${checkedPackages} package(s), ${checkedSpecifiers} runtime specifier(s), and ${checkedTargets} declared target(s).`,
);
EOF
