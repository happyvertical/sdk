# @happyvertical/github-actions

## Purpose and Responsibilities

The github-actions package provides reusable utilities for GitHub Actions workflows, including AI-powered issue triage, duplicate detection, auto-labeling, and project board management.

## Key Features

- **AI-Powered Triage**: Analyze issues using AI for categorization and labeling
- **Duplicate Detection**: Find similar existing issues
- **Auto-Labeling**: Automatically apply labels based on content
- **Project Board Management**: Move issues/PRs between columns
- **Planning Workflow**: Definition of ready validation

## Architecture Overview

```
@happyvertical/github-actions/
├── triage/     # Issue triage with AI analysis
├── planning/   # Planning and definition of ready
└── shared/     # Common utilities and adapters
```

## Key APIs

### Issue Triage

```typescript
import { triageIssue } from '@happyvertical/github-actions';

const result = await triageIssue({
  owner: 'happyvertical',
  repo: 'sdk',
  issueNumber: 123,
  githubToken: process.env.GITHUB_TOKEN,
  aiOptions: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY
  }
});

console.log(result.labels);      // Suggested labels
console.log(result.priority);    // Suggested priority
console.log(result.duplicates);  // Similar issues
```

### Project Board Management

```typescript
import { moveToColumn } from '@happyvertical/github-actions';

await moveToColumn({
  owner: 'happyvertical',
  projectNumber: 1,
  itemId: 'issue-123',
  columnName: 'In Progress',
  githubToken: process.env.GITHUB_TOKEN
});
```

### Definition of Ready

```typescript
import { checkDefinitionOfReady } from '@happyvertical/github-actions/planning';

const result = await checkDefinitionOfReady({
  owner: 'happyvertical',
  repo: 'sdk',
  issueNumber: 123,
  githubToken: process.env.GITHUB_TOKEN
});

if (result.isReady) {
  console.log('Issue meets definition of ready');
} else {
  console.log('Missing:', result.missingCriteria);
}
```

## CLI Usage

```bash
# Triage a specific issue
github-actions triage --owner happyvertical --repo sdk --issue 123

# Check definition of ready
github-actions planning:ready --owner happyvertical --repo sdk --issue 123
```

## Environment Variables

```bash
GITHUB_TOKEN=ghp_xxx          # GitHub Personal Access Token
HAVE_AI_API_KEY=xxx           # AI provider API key
HAVE_AI_TYPE=openai           # AI provider type
```

## Dependencies

- **Internal**:
  - `@happyvertical/projects` - Project board management
  - `@happyvertical/repos` - Repository operations

## Development Guidelines

- Use v2 modules (triage/index-v2.js) for new implementations
- Legacy exports maintained for backward compatibility
- AI analysis uses @happyvertical/ai indirectly through shared utilities
- Tests use mocked GitHub API responses

## Expert Agent Expertise

When working with github-actions:

1. **Triage Flow**: Issue → AI Analysis → Labels → Project Column
2. **Token Permissions**: Needs repo and project scopes
3. **Rate Limits**: Be mindful of GitHub API rate limits
4. **AI Provider**: Configure via HAVE_AI_* environment variables
5. **Duplicate Detection**: Uses embedding similarity when available

## Related Packages

- **@happyvertical/projects**: GitHub Projects V2 integration
- **@happyvertical/repos**: Repository management
- **@happyvertical/graphql**: Underlying GraphQL client
