#!/usr/bin/env node
/**
 * Automation script to rename all @have/* packages to @happyvertical/*
 *
 * This script:
 * - Updates all package.json files
 * - Updates all TypeScript import statements
 * - Updates all markdown documentation
 * - Updates configuration files
 *
 * Run with: node scripts/rename-packages.js
 */

import { readFileSync, writeFileSync, globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

let filesUpdated = 0;
const updatedFiles = [];

function updateFile(filePath, replaceFn) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const updated = replaceFn(content);

    if (content !== updated) {
      writeFileSync(filePath, updated);
      filesUpdated++;
      updatedFiles.push(filePath.replace(rootDir + '/', ''));
      console.log(`✓ Updated: ${filePath.replace(rootDir + '/', '')}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`✗ Error updating ${filePath}:`, error.message);
    return false;
  }
}

function replacePackageReferences(content) {
  return content
    .replace(/"@have\//g, '"@happyvertical/')
    .replace(/'@have\//g, "'@happyvertical/")
    .replace(/`@have\//g, '`@happyvertical/')
    .replace(/@have\//g, '@happyvertical/');
}

console.log('🔄 Starting package renaming from @have to @happyvertical...\n');

// 1. Update all package.json files
console.log('📦 Updating package.json files...');
const packageJsonFiles = globSync('packages/*/package.json', { cwd: rootDir });
const rootPackageJson = 'package.json';

for (const file of [rootPackageJson, ...packageJsonFiles]) {
  const filePath = join(rootDir, file);
  updateFile(filePath, replacePackageReferences);
}

// 2. Update TypeScript files
console.log('\n📝 Updating TypeScript files...');
const tsFiles = globSync('packages/**/src/**/*.{ts,tsx}', {
  cwd: rootDir,
  ignore: ['**/node_modules/**', '**/dist/**']
});

for (const file of tsFiles) {
  const filePath = join(rootDir, file);
  updateFile(filePath, replacePackageReferences);
}

// 3. Update test files
console.log('\n🧪 Updating test files...');
const testFiles = globSync('packages/**/*.{test,spec}.{ts,tsx}', {
  cwd: rootDir,
  ignore: ['**/node_modules/**', '**/dist/**']
});

for (const file of testFiles) {
  const filePath = join(rootDir, file);
  updateFile(filePath, replacePackageReferences);
}

// 4. Update markdown files
console.log('\n📄 Updating markdown files...');
const mdFiles = globSync('**/*.md', {
  cwd: rootDir,
  ignore: ['**/node_modules/**', '**/dist/**', 'CHANGELOG.md']
});

for (const file of mdFiles) {
  const filePath = join(rootDir, file);
  updateFile(filePath, replacePackageReferences);
}

// 5. Update configuration files
console.log('\n⚙️  Updating configuration files...');
const configFiles = [
  '.github/triage-config.json',
  '.github/workflows/on-issue-opened.yml',
  '.github/actions/issue-triage/action.yml'
];

for (const file of configFiles) {
  const filePath = join(rootDir, file);
  updateFile(filePath, replacePackageReferences);
}

// 6. Update vite config files
console.log('\n🔧 Updating vite config files...');
const viteConfigs = globSync('packages/*/vite.config.ts', { cwd: rootDir });

for (const file of viteConfigs) {
  const filePath = join(rootDir, file);
  updateFile(filePath, (content) => {
    return content.replace(/\/\^@have\\\//g, '/^@happyvertical\\/');
  });
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('✅ Package renaming complete!\n');
console.log(`📊 Summary:`);
console.log(`   - Files updated: ${filesUpdated}`);
console.log(`   - Package.json files: ${packageJsonFiles.length + 1}`);
console.log(`   - TypeScript files: ${tsFiles.length}`);
console.log(`   - Test files: ${testFiles.length}`);
console.log(`   - Markdown files: ${mdFiles.length}`);
console.log(`   - Config files: ${configFiles.length}`);
console.log(`   - Vite configs: ${viteConfigs.length}`);

console.log('\n📝 Updated files:');
for (const file of updatedFiles.slice(0, 20)) {
  console.log(`   - ${file}`);
}
if (updatedFiles.length > 20) {
  console.log(`   ... and ${updatedFiles.length - 20} more files`);
}

console.log('\n⚠️  Next steps:');
console.log('   1. Run: npm install (to update lockfile)');
console.log('   2. Run: npm run build');
console.log('   3. Run: npm test');
console.log('   4. Run: npm run typecheck');
console.log('   5. Review changes: git diff');
console.log('   6. Commit: git add . && git commit');
console.log('\n' + '='.repeat(60));
