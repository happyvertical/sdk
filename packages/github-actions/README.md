# @happyvertical/github-actions

GitHub Actions utilities for CI/CD automation. Provides AI-powered issue triage (labeling, duplicate detection, project board management), implementation planning with Definition of Ready validation, and standardized label management. Uses `@happyvertical/repos` and `@happyvertical/projects` for GitHub API interactions.

## Installation

```bash
# .npmrc
@happyvertical:registry=https://npm.pkg.github.com

npm install @happyvertical/github-actions
```

Peer dependencies: `@happyvertical/repos`, `@happyvertical/projects`.

## CLI Usage

The package provides two CLI commands:

### Triage

Run AI-powered issue triage in a GitHub Actions workflow:

```bash
# Required env vars: GITHUB_TOKEN, GITHUB_REPOSITORY, ISSUE_NUMBER, ISSUE_TITLE, ISSUE_AUTHOR
# Optional: ISSUE_BODY, CONFIG (path to config file or JSON string)
npx @happyvertical/github-actions triage
```

### Labels

Apply standardized labels (type, priority, size, status, agent) to a repository:

```bash
github-actions labels --owner happyvertical --repo sdk --dry-run
github-actions labels --owner happyvertical --repo sdk --include-area --area core --area api
```

## Configuration

Create a `.github/triage-config.json`:

```json
{
  "repoDescription": "TypeScript monorepo for AI agent development",
  "packagePattern": "@happyvertical/*",
  "packageExamples": ["@happyvertical/ai", "@happyvertical/sql"],
  "projectEnabled": true,
  "projectId": "PVT_kwDOB9Y8ns4A8-TY",
  "statusFieldId": "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY",
  "statusOptions": {
    "To Do": "c0c9ab27",
    "In Progress": "ce670088",
    "Review & Testing": "ee1f96bd"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repoDescription` | string | Yes | Brief description for AI context |
| `packagePattern` | string | No | Monorepo package pattern (e.g., `@happyvertical/*`) |
| `packageExamples` | string[] | No | Example package names for AI guidance |
| `projectEnabled` | boolean | No | Enable GitHub Projects V2 integration |
| `projectId` | string | If project | Project V2 ID |
| `statusFieldId` | string | If project | Status field ID |
| `statusOptions` | object | If project | Status name to option ID mapping |

## Programmatic API

### Issue Triage

```typescript
import { triageIssue } from '@happyvertical/github-actions';

const result = await triageIssue({
  token: process.env.GITHUB_TOKEN!,
  owner: 'happyvertical',
  repo: 'sdk',
  issueNumber: 123,
  issueTitle: 'Add Redis cache support',
  issueBody: 'We need distributed caching...',
  issueAuthor: 'username',
  config: {
    repoDescription: 'TypeScript monorepo for AI agent development',
    packagePattern: '@happyvertical/*',
    projectEnabled: false,
  },
});
```

Triage analyzes the issue with AI (GitHub Models API), applies type/priority/size labels, searches for duplicates, posts a structured comment, and optionally updates the project board.

### Planning

```typescript
import { startPlanning, completePlanning } from '@happyvertical/github-actions';

// Generate an AI implementation plan and post it as a comment
const planResult = await startPlanning(context);

// Validate Definition of Ready and move to Ready status
const completeResult = await completePlanning(context);
```

### Label Management

```typescript
import {
  getAllStandardLabels,
  getLabelsByCategory,
  migrateLabel,
} from '@happyvertical/github-actions';

const allLabels = getAllStandardLabels(); // type, priority, size, status, agent
const bugLabels = getLabelsByCategory('type');
const newName = migrateLabel('enhancement'); // → 'type: feature'
```

### Shared Utilities

```typescript
import {
  createRepository,
  createProject,
  getAICompletion,
  parseAIJson,
} from '@happyvertical/github-actions';

// Adapter factories for @happyvertical/repos and @happyvertical/projects
const repo = await createRepository(token, 'happyvertical', 'sdk');
const project = await createProject(token, projectId, statusFieldId, statusOptions);

// AI completion with auto-provider selection (GitHub Models → OpenAI → Anthropic)
const response = await getAICompletion([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Analyze this issue...' },
]);
```

## Architecture

- **`triage/`** — Issue triage: AI analysis, labeling, duplicate detection, project board updates
- **`planning/`** — Implementation planning: AI plan generation, Definition of Ready validation
- **`shared/`** — AI client (GitHub Models, OpenAI, Anthropic), GitHub API helpers, label definitions, project utilities, adapter factories
- **`cli.ts`** — CLI entry point (`triage`, `labels` commands)

## License

MIT
