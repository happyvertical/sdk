#!/usr/bin/env node
/**
 * CLI script to install agent context for @happyvertical/sdk-mcp
 * Run the published context installer binary for this package.
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

const pkgName = 'sdk-mcp';
const agentMdSrc = existsSync(join(pkgRoot, 'AGENT.md'))
  ? join(pkgRoot, 'AGENT.md')
  : join(pkgRoot, 'CLAUDE.md');
const metaSrc = existsSync(join(pkgRoot, 'metadata.json'))
  ? join(pkgRoot, 'metadata.json')
  : join(pkgRoot, '.claude-meta.json');

if (existsSync(agentMdSrc)) {
  copyFileSync(agentMdSrc, join(targetDir, `have-${pkgName}.md`));
}

if (existsSync(metaSrc)) {
  copyFileSync(metaSrc, join(targetDir, `have-${pkgName}.meta.json`));
}

console.log(`✓ Installed @happyvertical/${pkgName} context to .claude/`);
