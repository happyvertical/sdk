#!/usr/bin/env node

/**
 * Script to copy package READMEs to docs/content directory
 * This maintains a single source of truth for documentation.
 */

import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

// Paths
const repoRoot = join(currentDir, '../..');
const docsRoot = join(currentDir, '..');
const contentDir = join(docsRoot, 'content');
const packagesDir = join(repoRoot, 'packages');

// Package names to copy
const packages = [
  'ai',
  'auth',
  'cache',
  'comfyui',
  'documents',
  'encryption',
  'files',
  'geo',
  'github-actions',
  'json',
  'logger',
  'projects',
  'repos',
  'sdk-mcp',
  'secrets',
  'social',
  'sql',
  'translator',
  'utils',
  'video',
  'weather',
];

async function copyPackageReadmes() {
  try {
    // Ensure content directory exists
    if (!existsSync(contentDir)) {
      await mkdir(contentDir, { recursive: true });
    }

    console.log('Copying package READMEs to docs/content...');

    // Copy index.md from backup if it exists, otherwise from main docs
    const indexSource = existsSync(join(docsRoot, 'docs.backup/index.md'))
      ? join(docsRoot, 'docs.backup/index.md')
      : join(docsRoot, 'content/index.md');

    if (existsSync(indexSource)) {
      await copyFile(indexSource, join(contentDir, 'index.md'));
      console.log('✓ Copied index.md');
    }

    // Copy each package README
    for (const pkg of packages) {
      const sourcePath = join(packagesDir, pkg, 'README.md');
      const destPath = join(contentDir, `${pkg}.md`);

      if (!existsSync(sourcePath)) {
        console.warn(`⚠ Warning: ${sourcePath} does not exist, skipping`);
        continue;
      }

      await copyFile(sourcePath, destPath);
      console.log(`✓ Copied ${pkg}.md`);
    }

    console.log('\nAll package READMEs copied successfully!');
  } catch (error) {
    console.error('Error copying READMEs:', error);
    process.exit(1);
  }
}

// Run the script
copyPackageReadmes();
