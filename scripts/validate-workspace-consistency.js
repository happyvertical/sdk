#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const INTERNAL_SCOPE = '@happyvertical/';
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function collectWorkspaceManifestPaths() {
  const manifestPaths = ['package.json'];

  if (existsSync('docs/package.json')) {
    manifestPaths.push('docs/package.json');
  }

  if (existsSync('packages')) {
    const packageDirs = readdirSync('packages', { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .sort();

    for (const packageDir of packageDirs) {
      const manifestPath = path.join('packages', packageDir, 'package.json');
      if (existsSync(manifestPath)) {
        manifestPaths.push(manifestPath);
      }
    }
  }

  return manifestPaths;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function validateChangesetConfig(errors) {
  const configPath = '.changeset/config.json';

  if (!existsSync(configPath)) {
    errors.push('Missing .changeset/config.json');
    return;
  }

  const config = readJson(configPath);
  const fixedGroups = Array.isArray(config.fixed) ? config.fixed : [];
  const hasHappyverticalFixedGroup = fixedGroups.some(
    (group) => Array.isArray(group) && group.includes('@happyvertical/*'),
  );

  if (!hasHappyverticalFixedGroup) {
    errors.push(
      'Changesets fixed config must include "@happyvertical/*" so published workspace versions stay aligned.',
    );
  }

  if (!config.updateInternalDependencies) {
    errors.push(
      'Changesets config must set updateInternalDependencies so internal semver ranges cannot drift if workspace specs are replaced.',
    );
  }
}

function validateWorkspacePackages(errors) {
  const manifestPaths = collectWorkspaceManifestPaths();
  const manifests = [];
  const internalPackageNames = new Set();

  for (const manifestPath of manifestPaths) {
    const manifest = readJson(manifestPath);
    manifests.push({ manifestPath, manifest });

    if (
      typeof manifest.name === 'string' &&
      manifest.name.startsWith(INTERNAL_SCOPE)
    ) {
      internalPackageNames.add(manifest.name);
    }
  }

  const internalVersions = new Map();

  for (const { manifestPath, manifest } of manifests) {
    if (
      typeof manifest.name === 'string' &&
      manifest.name.startsWith(INTERNAL_SCOPE)
    ) {
      internalVersions.set(manifest.name, {
        manifestPath,
        version: manifest.version,
      });
    }
  }

  const uniqueVersions = new Set(
    Array.from(internalVersions.values())
      .map(({ version }) => version)
      .filter(Boolean),
  );

  if (uniqueVersions.size > 1) {
    errors.push(
      `Published @happyvertical workspace packages must share one version. Found: ${Array.from(
        uniqueVersions,
      ).join(', ')}`,
    );
    for (const [packageName, { manifestPath, version }] of internalVersions) {
      errors.push(`  ${packageName} -> ${version} (${manifestPath})`);
    }
  }

  for (const { manifestPath, manifest } of manifests) {
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = manifest[section];
      if (!dependencies || typeof dependencies !== 'object') {
        continue;
      }

      for (const [dependencyName, specifier] of Object.entries(dependencies)) {
        if (!internalPackageNames.has(dependencyName)) {
          continue;
        }

        if (specifier !== 'workspace:*') {
          errors.push(
            `${manifestPath}: ${section}.${dependencyName} must use "workspace:*" (found ${JSON.stringify(
              specifier,
            )}).`,
          );
        }
      }
    }
  }
}

function main() {
  const errors = [];

  validateChangesetConfig(errors);
  validateWorkspacePackages(errors);

  if (errors.length > 0) {
    console.error('❌ Workspace consistency validation failed:\n');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    '✅ Workspace consistency validated: internal package versions are aligned and in-repo dependencies use workspace:*',
  );
}

main();
