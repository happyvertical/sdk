#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Validates that built workspace packages contain the files they advertise
 * through main/types/exports/bin metadata before CI or publish proceeds.
 */

function addArtifact(artifacts, label, relativePath, type = 'file') {
  if (typeof relativePath !== 'string' || !relativePath.startsWith('./')) {
    return;
  }

  artifacts.push({ label, relativePath, type });
}

function collectRelativePaths(value, label, artifacts) {
  if (typeof value === 'string') {
    addArtifact(artifacts, label, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectRelativePaths(item, `${label}[${index}]`, artifacts);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectRelativePaths(nestedValue, `${label}.${key}`, artifacts);
  }
}

function collectDeclaredArtifacts(packageJson) {
  const artifacts = [];

  addArtifact(artifacts, 'main', packageJson.main);
  addArtifact(artifacts, 'module', packageJson.module);
  addArtifact(artifacts, 'types', packageJson.types);
  addArtifact(artifacts, 'typings', packageJson.typings);

  if (typeof packageJson.bin === 'string') {
    addArtifact(artifacts, 'bin', packageJson.bin);
  } else if (packageJson.bin && typeof packageJson.bin === 'object') {
    for (const [binName, binPath] of Object.entries(packageJson.bin)) {
      addArtifact(artifacts, `bin.${binName}`, binPath);
    }
  }

  if (packageJson.exports) {
    collectRelativePaths(packageJson.exports, 'exports', artifacts);
  }

  if (packageJson.scripts?.build && packageJson.files?.includes('dist')) {
    artifacts.push({
      label: 'files.dist',
      relativePath: './dist',
      type: 'dir',
    });
  }

  return Array.from(
    new Map(
      artifacts.map((artifact) => [
        `${artifact.label}:${artifact.relativePath}:${artifact.type}`,
        artifact,
      ]),
    ).values(),
  );
}

function validateArtifact(packageDir, artifact) {
  const absolutePath = path.resolve(packageDir, artifact.relativePath);

  if (!existsSync(absolutePath)) {
    return `${artifact.label} -> ${artifact.relativePath} is missing`;
  }

  const stats = statSync(absolutePath);

  if (artifact.type === 'dir' && !stats.isDirectory()) {
    return `${artifact.label} -> ${artifact.relativePath} should be a directory`;
  }

  if (artifact.type === 'file' && !stats.isFile()) {
    return `${artifact.label} -> ${artifact.relativePath} should be a file`;
  }

  return null;
}

async function validateBuild() {
  const packagesDir = path.join(process.cwd(), 'packages');
  const packageDirs = await fs.readdir(packagesDir, { withFileTypes: true });
  const failures = [];
  let checkedPackages = 0;

  for (const dirent of packageDirs) {
    if (!dirent.isDirectory()) {
      continue;
    }

    const packageDir = path.join(packagesDir, dirent.name);
    const packageJsonPath = path.join(packageDir, 'package.json');

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const artifacts = collectDeclaredArtifacts(packageJson);

    if (artifacts.length === 0) {
      continue;
    }

    checkedPackages += 1;

    for (const artifact of artifacts) {
      const failure = validateArtifact(packageDir, artifact);
      if (failure) {
        failures.push(`${packageJson.name}: ${failure}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('❌ Build artifact validation failed:\n');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ Build artifact validation passed for ${checkedPackages} package(s)`,
  );
}

validateBuild().catch((error) => {
  console.error('❌ Error during build validation:', error.message);
  process.exit(1);
});
