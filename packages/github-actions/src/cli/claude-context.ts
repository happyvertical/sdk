#!/usr/bin/env node
/**
 * CLI script to install Claude Code context for @happyvertical/github-actions
 * Run: npx @happyvertical/github-actions claude-context
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(__dirname, '../..');
const targetDir = join(process.cwd(), '.claude');

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

const pkgName = 'github-actions';
const claudeMdSrc = join(pkgRoot, 'CLAUDE.md');
const metaSrc = join(pkgRoot, '.claude-meta.json');

if (existsSync(claudeMdSrc)) {
  copyFileSync(claudeMdSrc, join(targetDir, `have-${pkgName}.md`));
}

if (existsSync(metaSrc)) {
  copyFileSync(metaSrc, join(targetDir, `have-${pkgName}.meta.json`));
}

console.log(`✓ Installed @happyvertical/${pkgName} context to .claude/`);
