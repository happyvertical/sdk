# @happyvertical/repos

Standardized repository interface for GitHub, GitLab, Bitbucket, and Azure DevOps.

## Installation

```bash
pnpm add @happyvertical/repos
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-repos-context
```

This copies the package's `CLAUDE.md` documentation and `.claude-meta.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Usage

```typescript
import { getRepository } from '@happyvertical/repos';

// Create a GitHub repository client
const repo = await getRepository({
  type: 'github',
  owner: 'happyvertical',
  repo: 'sdk',
  token: process.env.GITHUB_TOKEN
});

// Get issue
const issue = await repo.getIssue(352);

// Add labels
await repo.addLabels(352, ['type: feature', 'priority: high', 'size: xl']);

// Post comment
await repo.addComment(352, '## 🤖 AI Triage\n\n**Type**: feature...');

// Search for duplicates
const duplicates = await repo.searchIssues('kanban automation', {
  state: 'open',
  labels: ['type: feature'],
});
```

## Features

- **Platform-agnostic**: Works with GitHub, GitLab, Bitbucket, Azure DevOps
- **Type-safe**: Full TypeScript support
- **Consistent API**: Same interface across all platforms
- **Factory pattern**: Simple `getRepository()` function
- **Comprehensive**: Issues, PRs, labels, comments, assignments, search

## API

### Issues

- `getIssue(number)` - Get issue details
- `createIssue(data)` - Create new issue
- `updateIssue(number, data)` - Update issue
- `closeIssue(number)` - Close issue

### Labels

- `addLabels(issueNumber, labels)` - Add labels to issue
- `removeLabel(issueNumber, label)` - Remove label from issue
- `createLabel(label)` - Create repository label
- `updateLabel(name, label)` - Update existing label
- `listLabels()` - List all repository labels

### Comments

- `addComment(issueNumber, body)` - Add comment to issue
- `updateComment(commentId, body)` - Update existing comment
- `deleteComment(commentId)` - Delete comment
- `listComments(issueNumber)` - List all comments on issue

### Assignments

- `assignIssue(issueNumber, assignees)` - Assign users to issue
- `unassignIssue(issueNumber, assignees)` - Unassign users from issue

### Pull Requests

- `getPullRequest(number)` - Get PR details
- `createPullRequest(data)` - Create new PR
- `mergePullRequest(number, method)` - Merge PR

### Search

- `searchIssues(query, filters)` - Search issues with filters

### Node IDs (for Projects V2)

- `getIssueNodeId(issueNumber)` - Get GraphQL node ID for issue
- `getPRNodeId(prNumber)` - Get GraphQL node ID for PR

## Supported Platforms

- ✅ **GitHub** - Full support
- ⏳ **GitLab** - Coming soon
- ⏳ **Bitbucket** - Coming soon
- ⏳ **Azure DevOps** - Coming soon

## License

MIT
