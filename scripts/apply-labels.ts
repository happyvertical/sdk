#!/usr/bin/env bun
/**
 * Apply Standard Labels to Repository
 *
 * Creates or updates labels to match the organization standard.
 */

import { execSync } from 'node:child_process';

interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

// Standard labels from @happyvertical/github-actions
const STANDARD_LABELS: Record<string, LabelDefinition[]> = {
  type: [
    {
      name: 'type: bug',
      color: 'd73a4a',
      description: "Something isn't working",
    },
    {
      name: 'type: feature',
      color: '0075ca',
      description: 'New feature or enhancement',
    },
    {
      name: 'type: docs',
      color: '0075ca',
      description: 'Documentation improvements',
    },
    {
      name: 'type: maintenance',
      color: '6c757d',
      description: 'Maintenance and refactoring',
    },
    {
      name: 'type: research',
      color: 'a371f7',
      description: 'Research and investigation',
    },
    {
      name: 'type: question',
      color: 'd876e3',
      description: 'Question or discussion',
    },
  ],
  priority: [
    {
      name: 'priority: critical',
      color: 'b60205',
      description: 'Critical priority, needs immediate attention',
    },
    { name: 'priority: high', color: 'd93f0b', description: 'High priority' },
    {
      name: 'priority: medium',
      color: 'fbca04',
      description: 'Medium priority (default)',
    },
    { name: 'priority: low', color: 'fef2c0', description: 'Low priority' },
    {
      name: 'priority: icebox',
      color: 'e1e4e8',
      description: 'Future consideration, keep in Backlog',
    },
  ],
  size: [
    {
      name: 'size: xs',
      color: 'c2e0c6',
      description: 'Extra small (< 2 hours)',
    },
    { name: 'size: s', color: '7bd88f', description: 'Small (2-4 hours)' },
    { name: 'size: m', color: '3fb950', description: 'Medium (~1 day)' },
    { name: 'size: l', color: '2ea043', description: 'Large (2-3 days)' },
    {
      name: 'size: xl',
      color: '1a7f37',
      description: 'Extra large (> 3 days)',
    },
  ],
  status: [
    {
      name: 'status: blocked',
      color: 'd73a4a',
      description: 'Blocked by external dependency',
    },
    {
      name: 'status: help-wanted',
      color: '008672',
      description: 'Community contributions welcome',
    },
    {
      name: 'status: good-first-issue',
      color: '7057ff',
      description: 'Good for newcomers',
    },
  ],
};

// SDK-specific area labels
const SDK_AREA_LABELS: LabelDefinition[] = [
  {
    name: 'area: core',
    color: 'fbca04',
    description: 'Core packages (utils, logger, types)',
  },
  { name: 'area: ai', color: 'fbca04', description: 'AI package' },
  {
    name: 'area: database',
    color: 'fbca04',
    description: 'SQL/database package',
  },
  { name: 'area: files', color: 'fbca04', description: 'Files package' },
  {
    name: 'area: web',
    color: 'fbca04',
    description: 'Spider/web crawling package',
  },
  {
    name: 'area: documents',
    color: 'fbca04',
    description: 'PDF, OCR, documents packages',
  },
  {
    name: 'area: infrastructure',
    color: 'fbca04',
    description: 'Cache, geo, translator, weather, email',
  },
  {
    name: 'area: tooling',
    color: 'fbca04',
    description: 'SDK MCP, GitHub Actions',
  },
  { name: 'area: docs', color: 'fbca04', description: 'Documentation' },
  {
    name: 'area: tests',
    color: 'fbca04',
    description: 'Testing infrastructure',
  },
];

function exec(command: string): string {
  return execSync(command, { encoding: 'utf-8' }).trim();
}

function createOrUpdateLabel(repo: string, label: LabelDefinition): void {
  const { name, color, description } = label;

  try {
    // Try to update first
    exec(
      `gh label edit "${name}" --repo ${repo} --color "${color}" --description "${description}"`,
    );
    console.log(`✓ Updated label: ${name}`);
  } catch (_error) {
    // If update fails, try to create
    try {
      exec(
        `gh label create "${name}" --repo ${repo} --color "${color}" --description "${description}"`,
      );
      console.log(`✓ Created label: ${name}`);
    } catch (_createError) {
      console.error(`✗ Failed to create/update label: ${name}`);
    }
  }
}

function main(): void {
  const repo = process.argv[2] || 'happyvertical/sdk';

  console.log(`\nApplying standard labels to ${repo}...\n`);

  // Apply all standard labels
  console.log('Type labels:');
  for (const label of STANDARD_LABELS.type) {
    createOrUpdateLabel(repo, label);
  }

  console.log('\nPriority labels:');
  for (const label of STANDARD_LABELS.priority) {
    createOrUpdateLabel(repo, label);
  }

  console.log('\nSize labels:');
  for (const label of STANDARD_LABELS.size) {
    createOrUpdateLabel(repo, label);
  }

  console.log('\nStatus labels:');
  for (const label of STANDARD_LABELS.status) {
    createOrUpdateLabel(repo, label);
  }

  // Apply SDK-specific area labels if this is the SDK repo
  if (repo.includes('sdk')) {
    console.log('\nSDK area labels:');
    for (const label of SDK_AREA_LABELS) {
      createOrUpdateLabel(repo, label);
    }
  }

  console.log('\n✅ Label application complete!\n');
}

main();
