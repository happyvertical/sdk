#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Package build order based on dependencies
const buildOrder = [
  'types',      // Shared type definitions, zero dependencies
  'utils',      // Base utilities, no internal dependencies
  'logger',     // Depends on types, utils
  'files',      // Depends on utils
  'cache',      // Depends on utils
  'geo',        // Depends on utils, cache
  'translator', // Depends on utils, cache
  'sql',        // No internal dependencies
  'ocr',        // No internal dependencies
  'pdf',        // Depends on ocr
  'ai',         // No internal dependencies
  'spider',     // Depends on utils, files
  'smrt',       // Depends on ai, files, sql, utils, types, logger
  'tags',       // Depends on smrt, utils
  'places',     // Depends on smrt, utils, geo, cache
  'profiles',   // Depends on smrt, utils (and optionally tags)
  'events',     // Depends on smrt, utils, places, profiles
  'assets',     // Depends on smrt, utils, tags
  'content',    // Depends on smrt, pdf, spider
  'products',   // Depends on smrt
];

console.log('Building all packages in dependency order...\n');

let successCount = 0;
let failureCount = 0;

for (const packageName of buildOrder) {
  const packagePath = resolve(process.cwd(), 'packages', packageName);

  // Check if package exists
  if (!existsSync(packagePath)) {
    console.log(`⚠️  Package ${packageName} not found, skipping...`);
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