#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Package build order based on dependencies
// Format: [packageName, directory] where directory is 'core' or 'modules'
const buildOrder = [
  // Core infrastructure packages
  ['types', 'core'],        // Shared type definitions, zero dependencies
  ['config', 'core'],       // Configuration management, no internal dependencies
  ['utils', 'core'],        // Base utilities, no internal dependencies
  ['logger', 'core'],       // Depends on types, utils
  ['files', 'core'],        // Depends on utils
  ['cache', 'core'],        // Depends on utils
  ['geo', 'core'],          // Depends on utils, cache
  ['translator', 'core'],   // Depends on utils, cache
  ['sql', 'core'],          // No internal dependencies
  ['ocr', 'core'],          // No internal dependencies
  ['pdf', 'core'],          // Depends on ocr
  ['ai', 'core'],           // No internal dependencies
  ['spider', 'core'],       // Depends on utils, files
  ['smrt', 'core'],         // Depends on ai, files, sql, utils, types, logger (framework)
  // SMRT domain modules
  ['notes', 'modules'],     // Depends on smrt (for SmrtObject integration)
  ['agents', 'modules'],    // Depends on smrt, config, logger
  ['tags', 'modules'],      // Depends on smrt, utils
  ['places', 'modules'],    // Depends on smrt, utils, geo, cache
  ['profiles', 'modules'],  // Depends on smrt, utils (and optionally tags)
  ['events', 'modules'],    // Depends on smrt, utils, places, profiles
  ['assets', 'modules'],    // Depends on smrt, utils, tags
  ['accounts', 'modules'],  // Depends on smrt, utils, sql
  ['gnode', 'modules'],     // Depends on smrt
  ['content', 'modules'],   // Depends on smrt, pdf, spider
  ['products', 'modules'],  // Depends on smrt
];

console.log('Building all packages in dependency order...\n');

let successCount = 0;
let failureCount = 0;

for (const [packageName, directory] of buildOrder) {
  const packagePath = resolve(process.cwd(), 'packages', directory, packageName);

  // Check if package exists
  if (!existsSync(packagePath)) {
    console.log(`⚠️  Package ${packageName} not found in packages/${directory}/, skipping...`);
    continue;
  }

  console.log(`🔨 Building @have/${packageName}...`);

  try {
    // Set environment variable and run vite build
    const env = { ...process.env, VITE_BUILD_PACKAGE: packageName };

    execSync(`pnpm vite build`, {
      stdio: 'inherit',
      env,
      cwd: process.cwd()
    });

    console.log(`✅ Successfully built @have/${packageName}\n`);
    successCount++;
  } catch (error) {
    console.error(`❌ Failed to build @have/${packageName}:`);
    console.error(error.message);
    console.log('');
    failureCount++;

    // Continue building other packages even if one fails
    // This allows partial builds to work
  }
}

console.log('\n📊 Build Summary:');
console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${failureCount}`);
console.log(`📦 Total: ${buildOrder.length}`);

if (failureCount > 0) {
  console.log('\n⚠️  Some packages failed to build. Check the output above for details.');
  process.exit(1);
} else {
  console.log('\n🎉 All packages built successfully!');
}