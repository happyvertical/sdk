#!/usr/bin/env node

/**
 * Sets up semantic-release configuration for all workspace packages
 * Creates .releaserc.json in each package that extends the shared config
 */

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packagesDir = 'packages';
const sharedConfig = '../../.releaserc.packages.json';

// Config template for each package
const packageConfig = {
  extends: sharedConfig,
};

// Get all package directories
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

console.log(
  `Setting up semantic-release for ${packageDirs.length} packages...\n`,
);

let created = 0;
let skipped = 0;

for (const pkgDir of packageDirs) {
  const pkgPath = join(packagesDir, pkgDir);
  const packageJsonPath = join(pkgPath, 'package.json');
  const releaseConfigPath = join(pkgPath, '.releaserc.json');

  // Skip if no package.json
  if (!existsSync(packageJsonPath)) {
    console.log(`  ⚠️  ${pkgDir}: No package.json, skipping`);
    skipped++;
    continue;
  }

  // Check if config already exists
  if (existsSync(releaseConfigPath)) {
    console.log(`  ℹ️  ${pkgDir}: .releaserc.json already exists, skipping`);
    skipped++;
    continue;
  }

  // Create config
  writeFileSync(
    releaseConfigPath,
    JSON.stringify(packageConfig, null, 2) + '\n',
  );
  console.log(`  ✔️  ${pkgDir}: Created .releaserc.json`);
  created++;
}

console.log(`\nCompleted:`);
console.log(`  Created: ${created}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Total: ${packageDirs.length}`);
