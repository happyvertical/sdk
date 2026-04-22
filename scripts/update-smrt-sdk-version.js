#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [, , smrtRepoPath, nextVersion] = process.argv;

if (!smrtRepoPath || !nextVersion) {
  console.error(
    'Usage: node scripts/update-smrt-sdk-version.js <smrt-repo-path> <sdk-version>',
  );
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  console.error(`Invalid SDK version: ${nextVersion}`);
  process.exit(1);
}

const SDK_SPEC = `^${nextVersion}`;
const sdkPackageNames = collectSdkPackageNames();

if (sdkPackageNames.size === 0) {
  console.error('No SDK workspace packages found to sync.');
  process.exit(1);
}

const smrtWorkspacePath = path.join(smrtRepoPath, 'pnpm-workspace.yaml');
const smrtPackagePath = path.join(smrtRepoPath, 'package.json');

if (!existsSync(smrtWorkspacePath) || !existsSync(smrtPackagePath)) {
  console.error(
    `Expected pnpm-workspace.yaml and package.json in ${smrtRepoPath}`,
  );
  process.exit(1);
}

const workspaceChanges = updateSmrtWorkspace(
  smrtWorkspacePath,
  sdkPackageNames,
);
const packageChanges = updateSmrtPackageJson(smrtPackagePath, sdkPackageNames);

console.log(
  `Updated ${workspaceChanges} catalog entr${workspaceChanges === 1 ? 'y' : 'ies'} and ${packageChanges} package.json entr${packageChanges === 1 ? 'y' : 'ies'} in ${smrtRepoPath}`,
);

function collectSdkPackageNames() {
  const packageNames = new Set();
  const packagesDir = path.join(process.cwd(), 'packages');

  if (!existsSync(packagesDir)) {
    return packageNames;
  }

  const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort();

  for (const packageDir of packageDirs) {
    const manifestPath = path.join(packagesDir, packageDir, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      typeof manifest.name === 'string' &&
      manifest.name.startsWith('@happyvertical/')
    ) {
      packageNames.add(manifest.name);
    }
  }

  return packageNames;
}

function updateSmrtWorkspace(workspacePath, packageNames) {
  const lines = readFileSync(workspacePath, 'utf8').split('\n');
  let changes = 0;

  const updatedLines = lines.map((line) => {
    const match = line.match(/^(\s+)'(@happyvertical\/[^']+)':\s+(.+)$/);
    if (!match) {
      return line;
    }

    const [, indent, packageName, currentSpec] = match;
    if (!packageNames.has(packageName) || currentSpec === SDK_SPEC) {
      return line;
    }

    changes += 1;
    return `${indent}'${packageName}': ${SDK_SPEC}`;
  });

  writeFileSync(workspacePath, `${updatedLines.join('\n')}\n`);
  return changes;
}

function updateSmrtPackageJson(packagePath, packageNames) {
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  let changes = 0;

  for (const section of ['dependencies', 'pnpm.overrides']) {
    const target = getNestedSection(manifest, section);
    if (!target) {
      continue;
    }

    for (const [packageName, currentSpec] of Object.entries(target)) {
      if (!packageNames.has(packageName) || currentSpec === SDK_SPEC) {
        continue;
      }

      target[packageName] = SDK_SPEC;
      changes += 1;
    }
  }

  writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
  return changes;
}

function getNestedSection(object, sectionPath) {
  return sectionPath.split('.').reduce((value, key) => value?.[key], object);
}
