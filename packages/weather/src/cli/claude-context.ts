#!/usr/bin/env node
/**
 * CLI script to install Claude Code context for @happyvertical/weather
 * Run: npx @happyvertical/weather claude-context
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const Dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(Dirname, '../..');
const targetDir = join(process.cwd(), '.claude');

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

const pkgName = 'weather';
const claudeMdSrc = join(pkgRoot, 'CLAUDE.md');
const metaSrc = join(pkgRoot, '.claude-meta.json');

if (existsSync(claudeMdSrc)) {
  copyFileSync(claudeMdSrc, join(targetDir, `have-${pkgName}.md`));
}

if (existsSync(metaSrc)) {
  copyFileSync(metaSrc, join(targetDir, `have-${pkgName}.meta.json`));
}

console.log(`✓ Installed @happyvertical/${pkgName} context to .claude/`);
