/**
 * CLI Usage Examples (as tests)
 *
 * These tests document how to use the CLI in different scenarios.
 * Following the testing standard: examples should have corresponding tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('CLI Examples', () => {
  // Store original env for cleanup
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Configuration loading', () => {
    it('Example: Loading config from JSON string', () => {
      const configString = JSON.stringify({
        repoDescription: 'Test repository',
        projectEnabled: false,
      });

      // This is how the CLI would parse a JSON string config
      const config = JSON.parse(configString);

      expect(config).toEqual({
        repoDescription: 'Test repository',
        projectEnabled: false,
      });
    });

    it('Example: Config structure for single-package repo', () => {
      const config = {
        repoDescription: 'SMRT framework for building AI agents',
        projectEnabled: false,
      };

      expect(config.repoDescription).toBe(
        'SMRT framework for building AI agents',
      );
      expect(config.projectEnabled).toBe(false);
      expect(config.packagePattern).toBeUndefined();
    });

    it('Example: Config structure for monorepo without project board', () => {
      const config = {
        repoDescription: 'TypeScript monorepo for AI agent development',
        packagePattern: '@have/*',
        packageExamples: ['@have/ai', '@have/sql', '@have/files'],
        projectEnabled: false,
      };

      expect(config.packagePattern).toBe('@have/*');
      expect(config.packageExamples).toHaveLength(3);
      expect(config.projectEnabled).toBe(false);
    });

    it('Example: Config structure for monorepo with project board', () => {
      const config = {
        repoDescription: 'TypeScript monorepo for AI agent development',
        packagePattern: '@have/*',
        packageExamples: ['@have/ai', '@have/sql'],
        projectEnabled: true,
        projectId: 'PVT_kwDOB9Y8ns4A8-TY',
        statusFieldId: 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY',
        statusOptions: {
          'To Do': 'c0c9ab27',
          'In Progress': 'ce670088',
          'Review & Testing': 'ee1f96bd',
        },
      };

      expect(config.projectEnabled).toBe(true);
      expect(config.projectId).toBeDefined();
      expect(config.statusFieldId).toBeDefined();
      expect(Object.keys(config.statusOptions)).toHaveLength(3);
    });
  });

  describe('Environment variable parsing', () => {
    it('Example: Required environment variables for triage', () => {
      const env = {
        GITHUB_TOKEN: 'ghp_test_token_abc123',
        GITHUB_REPOSITORY: 'happyvertical/sdk',
        ISSUE_NUMBER: '291',
        ISSUE_TITLE: 'Centralize issue triage automation',
        ISSUE_BODY: 'We should centralize the triage logic...',
        ISSUE_AUTHOR: 'willthefirst',
        CONFIG: '.github/triage-config.json',
      };

      // Parse repository owner/name
      const [owner, repo] = env.GITHUB_REPOSITORY.split('/');
      expect(owner).toBe('happyvertical');
      expect(repo).toBe('sdk');

      // Parse issue number as integer
      const issueNumber = Number.parseInt(env.ISSUE_NUMBER, 10);
      expect(issueNumber).toBe(291);
      expect(Number.isNaN(issueNumber)).toBe(false);
    });

    it('Example: Handling optional ISSUE_BODY', () => {
      const envWithBody = {
        ISSUE_BODY: 'This is the issue description',
      };

      const envWithoutBody = {
        ISSUE_BODY: undefined,
      };

      const envWithEmptyBody = {
        ISSUE_BODY: '',
      };

      expect(envWithBody.ISSUE_BODY).toBe('This is the issue description');
      expect(envWithoutBody.ISSUE_BODY).toBeUndefined();
      expect(envWithEmptyBody.ISSUE_BODY).toBe('');
    });
  });

  describe('Triage context construction', () => {
    it('Example: Building TriageContext from environment', () => {
      const env = {
        GITHUB_TOKEN: 'ghp_test',
        GITHUB_REPOSITORY: 'happyvertical/sdk',
        ISSUE_NUMBER: '123',
        ISSUE_TITLE: 'Add Redis cache support',
        ISSUE_BODY: 'We need Redis for distributed caching',
        ISSUE_AUTHOR: 'developer',
      };

      const config = {
        repoDescription: 'TypeScript monorepo',
        packagePattern: '@have/*',
        projectEnabled: false,
      };

      const [owner, repo] = env.GITHUB_REPOSITORY.split('/');

      const context = {
        token: env.GITHUB_TOKEN,
        owner,
        repo,
        issueNumber: Number.parseInt(env.ISSUE_NUMBER, 10),
        issueTitle: env.ISSUE_TITLE,
        issueBody: env.ISSUE_BODY,
        issueAuthor: env.ISSUE_AUTHOR,
        config,
      };

      expect(context.owner).toBe('happyvertical');
      expect(context.repo).toBe('sdk');
      expect(context.issueNumber).toBe(123);
      expect(context.issueTitle).toBe('Add Redis cache support');
      expect(context.config.packagePattern).toBe('@have/*');
    });

    it('Example: Handling missing ISSUE_BODY gracefully', () => {
      const context = {
        token: 'ghp_test',
        owner: 'happyvertical',
        repo: 'sdk',
        issueNumber: 123,
        issueTitle: 'Test issue',
        issueBody: undefined,
        issueAuthor: 'test-user',
        config: { repoDescription: 'Test' },
      };

      // Issue body should be optional in the context
      expect(context.issueBody).toBeUndefined();
      expect(context.issueTitle).toBeDefined();
    });
  });

  describe('Label formatting examples', () => {
    it('Example: Formatting type labels for GitHub', () => {
      const types = ['bug', 'feature', 'enhancement'];
      const labels = types.map((type) => `type:${type}`);

      expect(labels).toEqual(['type:bug', 'type:feature', 'type:enhancement']);
    });

    it('Example: Formatting priority labels for GitHub', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      const labels = priorities.map((priority) => `priority:${priority}`);

      expect(labels).toEqual([
        'priority:critical',
        'priority:high',
        'priority:medium',
        'priority:low',
      ]);
    });

    it('Example: Combining type and priority labels', () => {
      const analysis = {
        type: 'bug',
        priority: 'high',
        urgency: 'urgent',
        reasoning: 'Critical security vulnerability',
      };

      const labels = [`type:${analysis.type}`, `priority:${analysis.priority}`];

      expect(labels).toEqual(['type:bug', 'priority:high']);
      expect(labels).toHaveLength(2);
    });
  });

  describe('Error handling examples', () => {
    it('Example: Detecting missing required environment variables', () => {
      const requiredVars = [
        'GITHUB_TOKEN',
        'GITHUB_REPOSITORY',
        'ISSUE_NUMBER',
        'ISSUE_TITLE',
        'ISSUE_AUTHOR',
        'CONFIG',
      ];

      const env = {
        GITHUB_TOKEN: 'ghp_test',
        // Missing other required vars
      };

      const missingVars = requiredVars.filter((varName) => !env[varName]);

      expect(missingVars).toEqual([
        'GITHUB_REPOSITORY',
        'ISSUE_NUMBER',
        'ISSUE_TITLE',
        'ISSUE_AUTHOR',
        'CONFIG',
      ]);
      expect(missingVars.length).toBeGreaterThan(0);
    });

    it('Example: Validating GITHUB_REPOSITORY format', () => {
      const validRepo = 'happyvertical/sdk';
      const invalidRepo1 = 'not-valid';
      const invalidRepo2 = 'too/many/slashes';

      expect(validRepo.split('/').length).toBe(2);
      expect(invalidRepo1.split('/').length).toBe(1); // Should be 2
      expect(invalidRepo2.split('/').length).toBe(3); // Should be 2
    });

    it('Example: Validating ISSUE_NUMBER is numeric', () => {
      const validNumber = '123';
      const invalidNumber = 'abc';

      expect(Number.isNaN(Number.parseInt(validNumber, 10))).toBe(false);
      expect(Number.isNaN(Number.parseInt(invalidNumber, 10))).toBe(true);
    });
  });

  describe('Triage result examples', () => {
    it('Example: Successful triage result structure', () => {
      const result = {
        labels: ['type:feature', 'priority:medium'],
        duplicates: [],
        projectUpdated: false,
      };

      expect(result.labels).toContain('type:feature');
      expect(result.labels).toContain('priority:medium');
      expect(result.duplicates).toEqual([]);
      expect(result.projectUpdated).toBe(false);
    });

    it('Example: Triage result with duplicates found', () => {
      const result = {
        labels: ['type:bug', 'priority:high'],
        duplicates: [
          { number: 45, title: 'Similar bug report', state: 'open' },
          { number: 67, title: 'Another similar issue', state: 'closed' },
        ],
        projectUpdated: false,
      };

      expect(result.duplicates).toHaveLength(2);
      expect(result.duplicates[0].number).toBe(45);
      expect(result.duplicates[1].state).toBe('closed');
    });

    it('Example: Triage result with project board update', () => {
      const result = {
        labels: ['type:bug', 'priority:critical'],
        duplicates: [],
        projectUpdated: true,
      };

      expect(result.projectUpdated).toBe(true);
      expect(result.labels).toContain('priority:critical');
    });
  });
});
