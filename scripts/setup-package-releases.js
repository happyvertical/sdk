#!/usr/bin/env node

/**
 * Sets up semantic-release configuration for all workspace packages
 * Creates .releaserc.json in each package that extends the shared config
 * and includes package-specific tagFormat for proper monorepo releases
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packagesDir = 'packages';
const sharedConfig = '../../.releaserc.packages.json';

// Get all package directories
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

console.log(
  `Setting up semantic-release for ${packageDirs.length} packages...\n`,
);

let created = 0;
let updated = 0;
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

  // Read package.json to get package name
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const packageName = packageJson.name;

  if (!packageName) {
    console.log(`  ⚠️  ${pkgDir}: No name in package.json, skipping`);
    skipped++;
    continue;
  }

  // Create package-specific config with tagFormat
  const packageConfig = {
    extends: sharedConfig,
    tagFormat: `${packageName}@\${version}`,
  };

  const configContent = JSON.stringify(packageConfig, null, 2) + '\n';

  // Check if config needs update
  if (existsSync(releaseConfigPath)) {
    const existingConfig = readFileSync(releaseConfigPath, 'utf-8');
    if (existingConfig === configContent) {
      console.log(`  ℹ️  ${pkgDir}: .releaserc.json up to date`);
      skipped++;
      continue;
    }
    console.log(`  🔄  ${pkgDir}: Updating .releaserc.json with tagFormat`);
    updated++;
  } else {
    console.log(`  ✔️  ${pkgDir}: Created .releaserc.json with tagFormat`);
    created++;
  }

  // Write config
  writeFileSync(releaseConfigPath, configContent);
}

console.log(`\nCompleted:`);
console.log(`  Created: ${created}`);
console.log(`  Updated: ${updated}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Total: ${packageDirs.length}`);
