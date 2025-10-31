#!/usr/bin/env node

/**
 * Validates that all package versions are below 1.0.0
 * Fails the build if any version is >= 1.0.0
 *
 * This ensures semantic-release doesn't accidentally bump to 1.x or higher
 * while we're still in pre-1.0 development.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function validateVersion(packageName, version) {
  // Parse version (format: MAJOR.MINOR.PATCH)
  const versionMatch = version.match(/^(\d+)\.(\d+)\.(\d+)/);

  if (!versionMatch) {
    console.error(`❌ Invalid version format: ${version} in ${packageName}`);
    console.error('Expected format: MAJOR.MINOR.PATCH (e.g., 0.45.0)');
    return false;
  }

  const [, major] = versionMatch;
  const majorVersion = Number.parseInt(major, 10);

  if (majorVersion >= 1) {
    console.error(`❌ Version validation failed for ${packageName}!`);
    console.error(`   Current version: ${version}`);
    console.error(`   Major version is ${majorVersion}, but must be 0`);
    return false;
  }

  return true;
}

let hasError = false;

// Validate root package
console.log('Validating root package...');
const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'));
if (!validateVersion('root', rootPkg.version)) {
  hasError = true;
} else {
  console.log(`  ✅ root: ${rootPkg.version}`);
}

// Validate all workspace packages
console.log('\nValidating workspace packages...');
const packagesDir = 'packages';

if (existsSync(packagesDir)) {
  const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const pkgDir of packageDirs) {
    const packageJsonPath = join(packagesDir, pkgDir, 'package.json');

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (!validateVersion(pkg.name, pkg.version)) {
      hasError = true;
    } else {
      console.log(`  ✅ ${pkg.name}: ${pkg.version}`);
    }
  }
}

if (hasError) {
  console.error('\n❌ Version validation failed!');
  console.error(
    'This project is configured to stay below 1.0.0 during pre-release.',
  );
  console.error('To publish 1.0.0 or higher, this validation must be removed.');
  process.exit(1);
}

console.log('\n✅ All versions validated successfully');
