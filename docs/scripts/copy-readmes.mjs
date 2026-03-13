#!/usr/bin/env node

/**
 * Script to copy package READMEs to docs/content directory
 * This maintains a single source of truth for documentation.
 */

import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
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

const githubRepoUrl = 'https://github.com/happyvertical/sdk';

function toPosixPath(path) {
  return path.split('\\').join('/');
}

function toGitHubUrl(targetPath, isDirectory = false) {
  const repoRelativePath = toPosixPath(relative(repoRoot, targetPath));
  const kind = isDirectory ? 'tree' : 'blob';
  return `${githubRepoUrl}/${kind}/main/${repoRelativePath}`;
}

function normalizeReadmeHref(href, pkg) {
  const packageRoot = join(packagesDir, pkg);

  if (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')
  ) {
    return href;
  }

  if (href === '../../LICENSE' || href === '../../../LICENSE') {
    return '/license';
  }

  if (href === '../../CONTRIBUTING.md' || href === '../../../CONTRIBUTING.md') {
    return '/contributing';
  }

  if (!href.startsWith('./') && !href.startsWith('../')) {
    return href;
  }

  const candidatePath = resolve(packageRoot, href.replace(/\/+$/, ''));
  if (!candidatePath.startsWith(repoRoot)) {
    return href;
  }

  const isDirectory =
    existsSync(candidatePath) && statSync(candidatePath).isDirectory();

  return toGitHubUrl(candidatePath, isDirectory);
}

function normalizeReadmeLinks(content, pkg) {
  const imageLinkPattern = /\[(!\[[^\]]*]\([^)]+\))]\(([^)]+)\)/g;
  const standardLinkPattern = /\[([^\]]+)]\(([^)]+)\)/g;

  const normalizeMatch = (match, label, href) => {
    const normalizedHref = normalizeReadmeHref(href, pkg);
    return normalizedHref === href ? match : `[${label}](${normalizedHref})`;
  };

  return content
    .replace(imageLinkPattern, normalizeMatch)
    .replace(standardLinkPattern, normalizeMatch);
}

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

      const readme = await readFile(sourcePath, 'utf8');
      const normalizedReadme = normalizeReadmeLinks(readme, pkg);

      await writeFile(destPath, normalizedReadme);
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
