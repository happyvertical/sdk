#!/usr/bin/env node

/**
 * Validates that package version is below 1.0.0
 * Fails the build if version is >= 1.0.0
 *
 * This ensures semantic-release doesn't accidentally bump to 1.x or higher
 * while we're still in pre-1.0 development.
 */

import { readFileSync } from 'node:fs';

// Read the root package.json
const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const currentVersion = rootPkg.version;

console.log(`Current version: ${currentVersion}`);

// Parse version (format: MAJOR.MINOR.PATCH)
const versionMatch = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);

if (!versionMatch) {
  console.error(`❌ Invalid version format: ${currentVersion}`);
  console.error('Expected format: MAJOR.MINOR.PATCH (e.g., 0.45.0)');
  process.exit(1);
}

const [, major] = versionMatch;
const majorVersion = Number.parseInt(major, 10);

if (majorVersion >= 1) {
  console.error(`❌ Version validation failed!`);
  console.error(`   Current version: ${currentVersion}`);
  console.error(`   Major version is ${majorVersion}, but must be 0`);
  console.error('');
  console.error(
    'This project is configured to stay below 1.0.0 during pre-release.',
  );
  console.error('To publish 1.0.0 or higher, this validation must be removed.');
  process.exit(1);
}

console.log(
  `✅ Version validation passed (major version is ${majorVersion}, below 1.0.0)`,
);
