# @happyvertical/github-actions

GitHub Actions utilities for CI/CD automation across HappyVertical repositories.

## Features

- **AI-Powered Issue Triage**: Automatically analyze, label, and triage GitHub issues using AI
- **Duplicate Detection**: Search for similar existing issues
- **Project Board Integration**: Update GitHub Projects V2 status automatically
- **Configurable**: Adapt to different repository structures and workflows
- **TypeScript**: Type-safe operations with full TypeScript support

## Installation

### For GitHub Actions Workflows

This package is published to GitHub Packages and designed to be used directly in GitHub Actions workflows via `npx`.

```yaml
# .github/workflows/on-issue-opened.yml
name: AI Issue Triage

on:
  issues:
    types: [opened, reopened]

permissions:
  issues: write
  contents: read

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Run triage
        env:
          GITHUB_TOKEN: ${{ secrets.GH_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
          ISSUE_BODY: ${{ github.event.issue.body }}
          ISSUE_AUTHOR: ${{ github.event.issue.user.login }}
          CONFIG: .github/triage-config.json
        run: |
          echo "@have:registry=https://npm.pkg.github.com" >> ~/.npmrc
          echo "//npm.pkg.github.com/:_authToken=${{ secrets.GITHUB_TOKEN }}" >> ~/.npmrc
          npx --yes @happyvertical/github-actions@latest triage
```

### As a Reusable Composite Action

See `.github/actions/issue-triage/` in the SDK repository for a complete composite action example.

## Configuration

Create a `.github/triage-config.json` file in your repository:

### Minimal Configuration

```json
{
  "repoDescription": "Brief description of your repository for AI context",
  "projectEnabled": false
}
```

### Full Configuration (Monorepo with Project Board)

```json
{
  "repoDescription": "TypeScript monorepo for AI agent development",
  "packagePattern": "@happyvertical/*",
  "packageExamples": ["@happyvertical/ai", "@happyvertical/sql", "@happyvertical/files"],
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

### Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repoDescription` | string | Yes | Brief description for AI context |
| `packagePattern` | string | No | Pattern for monorepo packages (e.g., `@happyvertical/*`) |
| `packageExamples` | string[] | No | Example package names for AI guidance |
| `projectEnabled` | boolean | No | Enable GitHub Projects V2 integration (default: `false`) |
| `projectId` | string | Conditional | Project ID (required if `projectEnabled: true`) |
| `statusFieldId` | string | Conditional | Status field ID (required if `projectEnabled: true`) |
| `statusOptions` | object | Conditional | Status name to option ID mapping (required if `projectEnabled: true`) |

## CLI Usage

The package provides a `triage` command for use in GitHub Actions:

```bash
# Environment variables required:
# - GITHUB_TOKEN: GitHub token with issues:write permission
# - GITHUB_REPOSITORY: Repository in format "owner/repo"
# - ISSUE_NUMBER: Issue number to triage
# - ISSUE_TITLE: Issue title
# - ISSUE_BODY: Issue body (optional)
# - ISSUE_AUTHOR: Issue author username
# - CONFIG: Path to triage-config.json or JSON string

npx @happyvertical/github-actions triage
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub token with `issues:write` and `contents:read` permissions |
| `GITHUB_REPOSITORY` | Yes | Repository in format `owner/repo` |
| `ISSUE_NUMBER` | Yes | Issue number to triage |
| `ISSUE_TITLE` | Yes | Issue title |
| `ISSUE_BODY` | No | Issue body content |
| `ISSUE_AUTHOR` | Yes | GitHub username of issue author |
| `CONFIG` | Yes | Path to config file or JSON string |

## What It Does

When an issue is opened or reopened, the triage automation:

1. **AI Analysis**: Uses GitHub Models API (GPT-4o-mini) to analyze the issue
2. **Auto-Labeling**: Applies type labels (`type:bug`, `type:feature`, etc.) and priority labels
3. **Duplicate Detection**: Searches for similar existing issues using keyword matching
4. **Triage Comment**: Posts a structured comment with AI analysis and recommendations
5. **Project Board** (optional): Updates issue status to "To Do" for urgent issues

### Example Triage Comment

```markdown
## 🤖 AI Triage

**Type**: `feature`
**Priority**: `high`
**Urgency**: `normal`

**Affected Packages**: @happyvertical/sql, @happyvertical/cache

**Analysis**: This issue requests Redis cache provider support, which would
add a new caching backend to the SDK. The request is well-defined with clear
use cases for distributed caching across multiple instances.

### ⚠️ Potential Duplicates

- #45: Add Redis support to cache package
- #78: Distributed cache implementation
```

## Programmatic Usage

While designed for GitHub Actions, the package can also be used programmatically:

```typescript
import { triageIssue } from '@happyvertical/github-actions';

const result = await triageIssue({
  token: process.env.GITHUB_TOKEN!,
  owner: 'happyvertical',
  repo: 'sdk',
  issueNumber: 291,
  issueTitle: 'Centralize issue triage automation',
  issueBody: 'We should centralize the triage logic...',
  issueAuthor: 'willthefirst',
  config: {
    repoDescription: 'TypeScript monorepo for AI agent development',
    packagePattern: '@happyvertical/*',
    projectEnabled: true,
    projectId: 'PVT_...',
    statusFieldId: 'PVTSSF_...',
    statusOptions: {
      'To Do': 'c0c9ab27',
      'In Progress': 'ce670088',
    },
  },
});

console.log('Triage result:', result);
```

## Architecture

The package is organized into modular components:

- **`analyze.ts`**: AI-powered issue analysis via GitHub Models API
- **`label.ts`**: Auto-labeling logic (type, priority)
- **`duplicates.ts`**: Duplicate issue detection via GitHub Search API
- **`project.ts`**: GitHub Projects V2 integration via GraphQL
- **`comment.ts`**: Triage comment formatting and posting
- **`github.ts`**: Shared GitHub API helper
- **`types.ts`**: TypeScript type definitions
- **`index.ts`**: Main orchestration and public API
- **`cli.ts`**: CLI entry point for GitHub Actions

## Getting Project Board IDs

To enable project board integration, you need to find your project and field IDs:

### 1. Get Project ID

```bash
gh api graphql -f query='
  query($org: String!) {
    organization(login: $org) {
      projectsV2(first: 10) {
        nodes {
          id
          title
        }
      }
    }
  }
' -f org=happyvertical
```

### 2. Get Status Field ID

```bash
gh api graphql -f query='
  query($org: String!, $number: Int!) {
    organization(login: $org) {
      projectV2(number: $number) {
        fields(first: 20) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
' -f org=happyvertical -F number=7
```

## Examples

### Single Package Repository

```json
{
  "repoDescription": "SMRT framework for building AI agents",
  "projectEnabled": false
}
```

### Monorepo Without Project Board

```json
{
  "repoDescription": "Weather data aggregation service",
  "packagePattern": null,
  "projectEnabled": false
}
```

### Monorepo With Project Board

```json
{
  "repoDescription": "TypeScript monorepo for AI agent development",
  "packagePattern": "@happyvertical/*",
  "packageExamples": ["@happyvertical/ai", "@happyvertical/sql", "@happyvertical/files", "@happyvertical/utils"],
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

## Requirements

- Node.js 24+
- GitHub token with `issues:write` and `contents:read` permissions
- GitHub Models API access (available for all GitHub users)

## License

MIT

## Related

- [SDK Repository](https://github.com/happyvertical/sdk) - Reference implementation
- [GitHub Models](https://github.com/marketplace/models) - AI models via GitHub
- [GitHub Projects V2](https://docs.github.com/en/issues/planning-and-tracking-with-projects) - Project management
