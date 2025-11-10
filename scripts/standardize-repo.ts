#!/usr/bin/env bun
/**
 * Repository Standardization Script
 *
 * Applies HappyVertical workflow standards to a repository:
 * - Standard labels (type, priority, size, status, agent)
 * - Custom area labels
 * - Triage configuration
 * - Workflow files
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

interface TriageConfig {
  repoDescription: string;
  packagePattern?: string;
  packageExamples?: string[];
  projectEnabled: boolean;
  projectId?: string;
  statusFieldId?: string;
  statusOptions?: Record<string, string>;
}

interface StandardizeOptions {
  repo: string; // Format: "owner/repo"
  repoPath?: string; // Local path (defaults to current directory)
  repoDescription: string;
  areaLabels: string[];
  projectId?: string;
  statusFieldId?: string;
  statusOptions?: Record<string, string>;
  packagePattern?: string;
  packageExamples?: string[];
}

// Standard labels (from @happyvertical/github-actions)
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
  agent: [
    {
      name: 'agent: triage',
      color: 'bfdadc',
      description: 'AI triage in progress',
    },
    {
      name: 'agent: planning',
      color: 'bfdadc',
      description: 'AI planning assistance',
    },
    {
      name: 'agent: implementation',
      color: 'bfdadc',
      description: 'AI implementation in progress',
    },
    {
      name: 'agent: testing',
      color: 'bfdadc',
      description: 'AI testing in progress',
    },
    {
      name: 'agent: review',
      color: 'bfdadc',
      description: 'AI code review in progress',
    },
  ],
};

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
    console.log(`  ✓ Updated label: ${name}`);
  } catch (_error) {
    // If update fails, try to create
    try {
      exec(
        `gh label create "${name}" --repo ${repo} --color "${color}" --description "${description}"`,
      );
      console.log(`  ✓ Created label: ${name}`);
    } catch (_createError) {
      console.error(`  ✗ Failed to create/update label: ${name}`);
    }
  }
}

function applyLabels(options: StandardizeOptions): void {
  console.log('\n📋 Applying standard labels...');

  // Apply all standard label categories
  for (const [category, labels] of Object.entries(STANDARD_LABELS)) {
    console.log(`\n${category} labels:`);
    for (const label of labels) {
      createOrUpdateLabel(options.repo, label);
    }
  }

  // Apply custom area labels
  if (options.areaLabels.length > 0) {
    console.log('\nArea labels:');
    for (const area of options.areaLabels) {
      const label: LabelDefinition = {
        name: `area: ${area}`,
        color: 'fbca04',
        description: `${area.charAt(0).toUpperCase() + area.slice(1)} area`,
      };
      createOrUpdateLabel(options.repo, label);
    }
  }

  console.log('\n✅ Labels applied successfully!');
}

function createTriageConfig(options: StandardizeOptions): void {
  console.log('\n📝 Creating triage configuration...');

  const repoPath = options.repoPath || '.';
  const githubDir = join(repoPath, '.github');
  const configPath = join(githubDir, 'triage-config.json');

  // Ensure .github directory exists
  if (!existsSync(githubDir)) {
    mkdirSync(githubDir, { recursive: true });
  }

  const config: TriageConfig = {
    repoDescription: options.repoDescription,
    projectEnabled: !!options.projectId,
  };

  if (options.packagePattern) {
    config.packagePattern = options.packagePattern;
  }

  if (options.packageExamples) {
    config.packageExamples = options.packageExamples;
  }

  if (options.projectId) {
    config.projectId = options.projectId;
    config.statusFieldId = options.statusFieldId;
    config.statusOptions = options.statusOptions;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`  ✓ Created ${configPath}`);
}

function copyWorkflowFiles(options: StandardizeOptions): void {
  console.log('\n📄 Deploying workflow files...');

  const repoPath = options.repoPath || '.';
  const workflowsDir = join(repoPath, '.github', 'workflows');
  const happyverticalDir = join(workflowsDir, 'happyvertical');
  const sdkTemplatesDir = join(
    __dirname,
    '..',
    '.github',
    'workflow-templates',
  );

  // Ensure workflows directory exists
  if (!existsSync(workflowsDir)) {
    mkdirSync(workflowsDir, { recursive: true });
  }

  // Create happyvertical directory
  if (!existsSync(happyverticalDir)) {
    mkdirSync(happyverticalDir, { recursive: true });
    console.log('  ✓ Created happyvertical/ directory');
  }

  // Copy standard workflow templates to happyvertical/
  const templates = [
    'on-issue-opened-template.yml',
    'on-label-changed-template.yml',
    'on-issue-closed-template.yml',
    'on-pr-opened-template.yml',
    'on-merge-main-template.yml',
  ];

  for (const template of templates) {
    const srcPath = join(sdkTemplatesDir, template);
    const destName = template.replace('-template', '');
    const destPath = join(happyverticalDir, destName);

    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      console.log(`  ✓ Copied ${destName} to happyvertical/`);
    } else {
      console.error(`  ✗ ${template} not found in SDK`);
    }
  }

  // Create happyvertical README
  const readmePath = join(happyverticalDir, 'README.md');
  const readmeContent = `# Standard Workflows - DO NOT EDIT

This directory contains auto-generated workflow files managed by the HappyVertical
standardization script. Manual changes will be overwritten on updates.

## Workflows

- **on-issue-opened.yml** - Automated triage when issues are created
- **on-label-changed.yml** - Label enforcement and agent orchestration
- **on-issue-closed.yml** - Cleanup when issues are closed
- **on-pr-opened.yml** - Pull request automation
- **on-merge-main.yml** - Build pipeline (test → build → publish)

## To Update

Run the standardization script:
\`\`\`bash
bun scripts/standardize-repo.ts --repo ${options.repo} --path ${repoPath}
\`\`\`

## To Customize

Edit the repository-specific workflows in the parent directory:
- \`../test.yml\` - Test execution
- \`../build.yml\` - Build process
- \`../publish.yml\` - Publishing

## Source

https://github.com/happyvertical/sdk/.github/workflow-templates/
`;

  writeFileSync(readmePath, readmeContent);
  console.log('  ✓ Created happyvertical/README.md');

  // Create metadata file
  const metadata = {
    generated: new Date().toISOString(),
    version: '1.0.0',
    source: 'happyvertical/sdk',
  };

  writeFileSync(
    join(happyverticalDir, '_metadata.json'),
    JSON.stringify(metadata, null, 2),
  );
  console.log('  ✓ Created _metadata.json');

  // Scaffold test/build/publish workflows if they don't exist
  const scaffolds = [
    { template: 'test-scaffold.yml', dest: 'test.yml' },
    { template: 'build-scaffold.yml', dest: 'build.yml' },
    { template: 'publish-scaffold.yml', dest: 'publish.yml' },
  ];

  for (const scaffold of scaffolds) {
    const destPath = join(workflowsDir, scaffold.dest);

    if (!existsSync(destPath)) {
      const srcPath = join(sdkTemplatesDir, scaffold.template);

      if (existsSync(srcPath)) {
        copyFileSync(srcPath, destPath);
        console.log(`  ✓ Scaffolded ${scaffold.dest} (editable)`);
      }
    } else {
      console.log(`  ℹ ${scaffold.dest} already exists (not overwriting)`);
    }
  }
}

function displaySummary(options: StandardizeOptions): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log('🎉 Repository standardization complete!');
  console.log('='.repeat(60));
  console.log(`\nRepository: ${options.repo}`);
  console.log(`\n✅ Applied:`);
  console.log(
    `  - ${Object.values(STANDARD_LABELS).flat().length} standard labels`,
  );
  console.log(`  - ${options.areaLabels.length} area labels`);
  console.log(`  - Triage configuration`);
  console.log(`  - Workflow files`);

  if (options.projectId) {
    console.log(`  - Project board integration (ID: ${options.projectId})`);
  }

  console.log(`\n📝 Next steps:`);
  console.log(`  1. Review and commit changes: git add .github/`);
  console.log(`  2. Test triage workflow by creating an issue`);

  if (!options.projectId) {
    console.log(
      `  3. (Optional) Create a project board and update triage-config.json`,
    );
  }

  console.log('\n');
}

function parseArguments(): StandardizeOptions | null {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: bun scripts/standardize-repo.ts [options]

Options:
  --repo <owner/repo>          Repository to standardize (required)
  --path <local-path>          Local repository path (default: current directory)
  --description <text>         Repository description (required)
  --areas <area1,area2,...>    Comma-separated area labels (required)
  --project-id <id>            GitHub Project ID (optional)
  --status-field-id <id>       Status field ID for project (optional)
  --package-pattern <pattern>  Package naming pattern (optional, e.g., "@org/*")
  --package-examples <list>    Comma-separated package examples (optional)

Examples:
  # Standardize smrt repository
  bun scripts/standardize-repo.ts \\
    --repo happyvertical/smrt \\
    --path ../smrt \\
    --description "SMRT framework for building AI agents" \\
    --areas "core,agents,templates,docs"

  # Standardize with project board
  bun scripts/standardize-repo.ts \\
    --repo happyvertical/sdk \\
    --description "TypeScript monorepo for AI agent development" \\
    --areas "core,ai,database,files" \\
    --project-id "PVT_kwDOB9Y8ns4A8-TY" \\
    --status-field-id "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY"
    `);
    return null;
  }

  const options: Partial<StandardizeOptions> = {
    areaLabels: [],
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--repo':
        options.repo = value;
        break;
      case '--path':
        options.repoPath = value;
        break;
      case '--description':
        options.repoDescription = value;
        break;
      case '--areas':
        options.areaLabels = value.split(',').map((a) => a.trim());
        break;
      case '--project-id':
        options.projectId = value;
        break;
      case '--status-field-id':
        options.statusFieldId = value;
        break;
      case '--package-pattern':
        options.packagePattern = value;
        break;
      case '--package-examples':
        options.packageExamples = value.split(',').map((e) => e.trim());
        break;
      default:
        console.error(`Unknown option: ${key}`);
        return null;
    }
  }

  // Validate required options
  if (
    !options.repo ||
    !options.repoDescription ||
    !options.areaLabels ||
    options.areaLabels.length === 0
  ) {
    console.error('Error: Missing required options');
    console.error('Required: --repo, --description, --areas');
    return null;
  }

  // If project ID provided, require status field ID
  if (options.projectId && !options.statusFieldId) {
    console.error(
      'Error: --status-field-id required when --project-id is provided',
    );
    return null;
  }

  return options as StandardizeOptions;
}

function main(): void {
  const options = parseArguments();
  if (!options) {
    process.exit(1);
  }

  console.log('\n🚀 Starting repository standardization...');
  console.log(`Target: ${options.repo}`);

  try {
    // Apply labels to remote repository
    applyLabels(options);

    // Create local configuration files
    createTriageConfig(options);

    // Copy workflow files
    copyWorkflowFiles(options);

    // Display summary
    displaySummary(options);
  } catch (error) {
    console.error('\n❌ Standardization failed:', error);
    process.exit(1);
  }
}

main();
