#!/usr/bin/env node
/**
 * Label Management CLI
 *
 * Apply standard labels across repositories
 */

import { getRepository } from '@happyvertical/repos';
import {
  AREA_LABEL_TEMPLATE,
  getAllStandardLabels,
  type LabelDefinition,
} from './shared/labels.js';

interface CliOptions {
  token: string;
  owner: string;
  repo: string;
  dryRun?: boolean;
  includeArea?: boolean;
  areaLabels?: string[];
}

/**
 * Apply standard labels to a repository
 */
export async function applyStandardLabels(options: CliOptions): Promise<void> {
  console.log(
    `\n🏷️  Applying standard labels to ${options.owner}/${options.repo}`,
  );

  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    const repo = await getRepository({
      type: 'github',
      owner: options.owner,
      repo: options.repo,
      token: options.token,
    });

    // Get standard labels
    const standardLabels = getAllStandardLabels();

    // Add area labels if requested
    const labelsToApply: LabelDefinition[] = [...standardLabels];

    if (options.includeArea) {
      const areaLabels = options.areaLabels
        ? options.areaLabels.map((name) => ({
            name: `area: ${name}`,
            color: 'fbca04',
            description: `${name.charAt(0).toUpperCase() + name.slice(1)} area`,
          }))
        : AREA_LABEL_TEMPLATE;

      labelsToApply.push(...areaLabels);
    }

    console.log(`📋 Found ${labelsToApply.length} labels to create/update:\n`);

    // Group by category for display
    const byCategory: Record<string, LabelDefinition[]> = {};
    for (const label of labelsToApply) {
      const category = label.name.split(':')[0];
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(label);
    }

    for (const [category, labels] of Object.entries(byCategory)) {
      console.log(`  ${category}:`);
      for (const label of labels) {
        console.log(
          `    - ${label.name} (#${label.color}) - ${label.description}`,
        );
      }
    }

    if (options.dryRun) {
      console.log('\n✅ Dry run complete - no changes made');
      return;
    }

    // Apply labels
    console.log('\n🔧 Creating/updating labels...\n');

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const label of labelsToApply) {
      try {
        // Try to update first
        const existingLabels = await repo.listLabels();
        const existing = existingLabels.find((l) => l.name === label.name);

        if (existing) {
          await repo.updateLabel(label.name, {
            name: label.name,
            color: label.color,
            description: label.description,
          });
          console.log(`  ✅ Updated: ${label.name}`);
          updated++;
        } else {
          await repo.createLabel({
            name: label.name,
            color: label.color,
            description: label.description,
          });
          console.log(`  ✨ Created: ${label.name}`);
          created++;
        }
      } catch (error) {
        console.error(
          `  ❌ Error with ${label.name}: ${(error as Error).message}`,
        );
        errors++;
      }
    }

    console.log(`\n✅ Label sync complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    if (errors > 0) {
      console.log(`   Errors: ${errors}`);
    }
  } catch (error) {
    console.error('❌ Failed to apply labels:', (error as Error).message);
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Label Management CLI

Usage: github-actions labels [options]

Options:
  --token <token>       GitHub token (or GITHUB_TOKEN env var)
  --owner <owner>       Repository owner
  --repo <repo>         Repository name
  --dry-run             Preview changes without applying
  --include-area        Include area labels
  --area <label>        Custom area label (can be used multiple times)
  -h, --help            Show this help message

Examples:
  # Dry run
  github-actions labels --owner happyvertical --repo sdk --dry-run

  # Apply standard labels
  github-actions labels --owner happyvertical --repo sdk

  # Apply with custom area labels
  github-actions labels --owner happyvertical --repo sdk --include-area --area core --area api --area ui

Environment Variables:
  GITHUB_TOKEN          GitHub personal access token
`);
    process.exit(0);
  }

  const token = args[args.indexOf('--token') + 1] || process.env.GITHUB_TOKEN;
  const owner = args[args.indexOf('--owner') + 1];
  const repo = args[args.indexOf('--repo') + 1];
  const dryRun = args.includes('--dry-run');
  const includeArea = args.includes('--include-area');

  // Parse custom area labels
  const areaLabels: string[] = [];
  let i = 0;
  while ((i = args.indexOf('--area', i)) !== -1) {
    areaLabels.push(args[i + 1]);
    i++;
  }

  if (!token) {
    console.error('❌ Error: GitHub token is required');
    console.error('   Use --token <token> or set GITHUB_TOKEN env var');
    process.exit(1);
  }

  if (!owner || !repo) {
    console.error('❌ Error: --owner and --repo are required');
    process.exit(1);
  }

  await applyStandardLabels({
    token,
    owner,
    repo,
    dryRun,
    includeArea,
    areaLabels: areaLabels.length > 0 ? areaLabels : undefined,
  });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
