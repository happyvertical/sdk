#!/usr/bin/env node
/**
 * Auto-generate Changesets from conventional commits
 *
 * Analyzes commits since last release and creates changeset files
 * based on conventional commit messages (feat:, fix:, etc.)
 *
 * Version bump rules for 0.x.x releases:
 * - Breaking changes (feat!, BREAKING CHANGE) → minor bump (0.x.0)
 * - Features, fixes, perf → patch bump (0.0.x)
 * - Other commit types (chore, docs, etc.) → no bump
 */

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ParsedCommit {
  type: string;
  scope?: string;
  breaking: boolean;
  message: string;
  body?: string;
  hash: string;
}

const CONVENTIONAL_COMMIT_REGEX = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8' }).trim();
  } catch (_error) {
    return '';
  }
}

function getCommitsSinceLastRelease(): string[] {
  // Try to get commits since last tag
  const lastTag = exec('git describe --tags --abbrev=0 2>/dev/null');

  let range: string;
  if (lastTag) {
    range = `${lastTag}..HEAD`;
  } else {
    // No tags exist, get all commits
    range = 'HEAD';
  }

  const commits = exec(
    `git log ${range} --pretty=format:"%H|||%s|||%b%x00" --no-merges`,
  );

  if (!commits) return [];

  // Split on null byte (not newline) to handle multi-line commit bodies
  return commits
    .split('\x00')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseConventionalSubject(
  subject: string,
  body: string | undefined,
  hash: string,
): ParsedCommit | null {
  const match = subject.match(CONVENTIONAL_COMMIT_REGEX);

  if (!match) {
    return null;
  }

  const [, type, scope, breaking, message] = match;

  // Check if body contains BREAKING CHANGE
  const hasBreakingInBody = body?.includes('BREAKING CHANGE') || false;

  return {
    type,
    scope,
    breaking: !!breaking || hasBreakingInBody,
    message: message.trim(),
    body,
    hash: hash.substring(0, 7),
  };
}

function parseConventionalCommitsFromBody(
  hash: string,
  body: string | undefined,
): ParsedCommit[] {
  if (!body) {
    return [];
  }

  const parsedCommits = body
    .split('\n')
    .map((line) => line.replaceAll(String.fromCharCode(0), '').trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, ''))
    .map((line, index) =>
      parseConventionalSubject(line, undefined, `${hash}-${index}`),
    )
    .filter((commit): commit is ParsedCommit => commit !== null);

  if (parsedCommits.length > 0) {
    console.log(
      `Using ${parsedCommits.length} conventional commit(s) from squash body: ${hash.substring(0, 7)}`,
    );
  }

  return parsedCommits;
}

function parseConventionalCommit(commitLine: string): ParsedCommit[] {
  const [hash, subject, body] = commitLine.split('|||');

  // Skip if subject is undefined or empty
  if (!subject) {
    console.log(
      `Skipping commit with empty subject: ${hash?.substring(0, 7) || 'unknown'}`,
    );
    return [];
  }

  const parsedSubject = parseConventionalSubject(subject, body, hash);

  if (parsedSubject) {
    return [parsedSubject];
  }

  console.log(`Skipping non-conventional commit subject: ${subject}`);
  return parseConventionalCommitsFromBody(hash, body);
}

function determineVersionBump(
  commits: ParsedCommit[],
): 'major' | 'minor' | 'patch' | null {
  // For 0.x.x versions, we use different rules:
  // - Breaking changes → minor (0.x.0)
  // - Features, fixes, perf, dep updates → patch (0.0.x)

  const hasBreaking = commits.some((c) => c.breaking);
  if (hasBreaking) return 'minor'; // Breaking in 0.x → minor bump

  const hasFeature = commits.some((c) => c.type === 'feat');
  const hasFix = commits.some((c) => ['fix', 'perf'].includes(c.type));
  const hasDeps = commits.some((c) => c.type === 'chore' && c.scope === 'deps');

  if (hasFeature || hasFix || hasDeps) return 'patch';

  return null; // No releaseable commits
}

function generateChangesetContent(
  commits: ParsedCommit[],
  bump: 'major' | 'minor' | 'patch',
): string {
  const features = commits.filter((c) => c.type === 'feat');
  const fixes = commits.filter((c) => c.type === 'fix');
  const breaking = commits.filter((c) => c.breaking);
  const deps = commits.filter((c) => c.type === 'chore' && c.scope === 'deps');

  let content = `---\n`;
  // Use @happyvertical/utils as representative package (all packages in fixed group will bump together)
  content += `"@happyvertical/utils": ${bump}\n`;
  content += `---\n\n`;

  if (breaking.length > 0) {
    content += `### Breaking Changes\n\n`;
    breaking.forEach((c) => {
      content += `- ${c.message}${c.scope ? ` (${c.scope})` : ''}\n`;
    });
    content += `\n`;
  }

  if (features.length > 0) {
    content += `### Features\n\n`;
    features.forEach((c) => {
      content += `- ${c.message}${c.scope ? ` (${c.scope})` : ''}\n`;
    });
    content += `\n`;
  }

  if (fixes.length > 0) {
    content += `### Bug Fixes\n\n`;
    fixes.forEach((c) => {
      content += `- ${c.message}${c.scope ? ` (${c.scope})` : ''}\n`;
    });
    content += `\n`;
  }

  if (deps.length > 0) {
    content += `### Dependencies\n\n`;
    deps.forEach((c) => {
      content += `- ${c.message}\n`;
    });
  }

  return `${content.trim()}\n`;
}

function hasExistingChangesets(): boolean {
  const changesetDir = join(process.cwd(), '.changeset');
  if (!existsSync(changesetDir)) return false;

  const files = readdirSync(changesetDir);
  return files.some(
    (f) => f.endsWith('.md') && f !== 'README.md' && f !== 'config.json',
  );
}

function main() {
  console.log('🔍 Checking for conventional commits...');

  // Check if there are already changesets
  if (hasExistingChangesets()) {
    console.log('✅ Existing changesets found, skipping auto-generation');
    return;
  }

  const commitLines = getCommitsSinceLastRelease();

  if (commitLines.length === 0) {
    console.log('ℹ️  No commits found since last release');
    return;
  }

  console.log(`📝 Analyzing ${commitLines.length} commits...`);

  const parsedCommits = commitLines.flatMap(parseConventionalCommit);

  if (parsedCommits.length === 0) {
    console.log('ℹ️  No conventional commits found');
    return;
  }

  const bump = determineVersionBump(parsedCommits);

  if (!bump) {
    console.log('ℹ️  No releaseable commits found (only chore, docs, etc.)');
    return;
  }

  console.log(`📦 Version bump: ${bump}`);
  console.log(`   - ${parsedCommits.length} conventional commits`);
  console.log(
    `   - ${parsedCommits.filter((c) => c.type === 'feat').length} features`,
  );
  console.log(
    `   - ${parsedCommits.filter((c) => c.type === 'fix').length} fixes`,
  );
  console.log(
    `   - ${parsedCommits.filter((c) => c.breaking).length} breaking changes`,
  );

  // Generate changeset
  const changesetId = randomBytes(8).toString('hex');
  const changesetPath = join(
    process.cwd(),
    '.changeset',
    `auto-${changesetId}.md`,
  );
  const changesetContent = generateChangesetContent(parsedCommits, bump);

  writeFileSync(changesetPath, changesetContent);

  console.log(`✅ Generated changeset: .changeset/auto-${changesetId}.md`);
  console.log('');
  console.log('Changeset content:');
  console.log('---');
  console.log(changesetContent);
  console.log('---');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  determineVersionBump,
  generateChangesetContent,
  parseConventionalCommit,
};
