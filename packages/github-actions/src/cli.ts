#!/usr/bin/env node

/**
 * CLI Interface for GitHub Actions
 *
 * Usage:
 *   github-actions triage
 *
 * Environment Variables:
 *   GITHUB_TOKEN - GitHub authentication token
 *   GITHUB_REPOSITORY - Repository (owner/repo)
 *   ISSUE_NUMBER - Issue number to triage
 *   ISSUE_TITLE - Issue title
 *   ISSUE_BODY - Issue body (optional)
 *   ISSUE_AUTHOR - Issue author username
 *   CONFIG - JSON config string or file path (optional)
 */

import { readFileSync } from 'node:fs';
import { type TriageConfig, type TriageContext, triageIssue } from './index.js';

async function main() {
  const command = process.argv[2];

  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  if (command === 'triage') {
    await runTriage();
  } else {
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
  }
}

async function runTriage() {
  // Get required environment variables
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const issueNumber = process.env.ISSUE_NUMBER;
  const issueTitle = process.env.ISSUE_TITLE;
  const issueBody = process.env.ISSUE_BODY;
  const issueAuthor = process.env.ISSUE_AUTHOR;

  if (!token || !repository || !issueNumber || !issueTitle || !issueAuthor) {
    console.error('Missing required environment variables:');
    console.error('  GITHUB_TOKEN');
    console.error('  GITHUB_REPOSITORY');
    console.error('  ISSUE_NUMBER');
    console.error('  ISSUE_TITLE');
    console.error('  ISSUE_AUTHOR');
    process.exit(1);
  }

  const [owner, repo] = repository.split('/');

  // Load configuration
  const config = loadConfig();

  // Build context
  const context: TriageContext = {
    token,
    owner,
    repo,
    issueNumber: parseInt(issueNumber, 10),
    issueTitle,
    issueBody,
    issueAuthor,
    config,
  };

  // Run triage
  const result = await triageIssue(context);

  if (!result.success) {
    console.error('Triage failed');
    process.exit(1);
  }

  console.log('Triage successful');
  process.exit(0);
}

function loadConfig(): TriageConfig {
  const configEnv = process.env.CONFIG;

  if (!configEnv) {
    // Default config
    return {
      repoDescription: 'GitHub repository',
    };
  }

  try {
    // Try to parse as JSON
    return JSON.parse(configEnv) as TriageConfig;
  } catch {
    // Try to read as file path
    try {
      const configFile = readFileSync(configEnv, 'utf-8');
      return JSON.parse(configFile) as TriageConfig;
    } catch (error) {
      console.error('Error loading config:', (error as Error).message);
      return {
        repoDescription: 'GitHub repository',
      };
    }
  }
}

function showHelp() {
  console.log(`
@have/github-actions CLI

Usage:
  github-actions triage

Commands:
  triage    Run AI-powered issue triage

Environment Variables:
  GITHUB_TOKEN       GitHub authentication token (required)
  GITHUB_REPOSITORY  Repository in owner/repo format (required)
  ISSUE_NUMBER       Issue number to triage (required)
  ISSUE_TITLE        Issue title (required)
  ISSUE_BODY         Issue body (optional)
  ISSUE_AUTHOR       Issue author username (required)
  CONFIG             JSON config string or file path (optional)

Config Format:
  {
    "repoDescription": "Repository description for AI",
    "packagePattern": "@have/*",
    "packageExamples": ["@have/ai", "@have/sql"],
    "projectEnabled": true,
    "projectId": "PVT_xxx",
    "statusFieldId": "PVTSSF_xxx",
    "statusOptions": {
      "To Do": "option_id_1",
      "In Progress": "option_id_2"
    }
  }

Examples:
  # Basic triage with environment variables
  export GITHUB_TOKEN="ghp_xxx"
  export GITHUB_REPOSITORY="owner/repo"
  export ISSUE_NUMBER="123"
  export ISSUE_TITLE="Bug report"
  export ISSUE_AUTHOR="username"
  github-actions triage

  # Triage with config file
  export CONFIG=".github/triage-config.json"
  github-actions triage

  # Triage with inline config
  export CONFIG='{"repoDescription":"My project","packagePattern":"@myorg/*"}'
  github-actions triage
`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
