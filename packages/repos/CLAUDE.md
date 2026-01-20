# @happyvertical/repos

## Purpose and Responsibilities

The repos package provides a standardized interface for repository operations across GitHub, GitLab, Bitbucket, and Azure DevOps.

## Key Features

- **Multi-Provider Support**: GitHub, GitLab, Bitbucket, Azure DevOps
- **Issue Management**: Create, update, list issues
- **Label Management**: Create and manage labels
- **Repository Info**: Get repository details and metadata

## Architecture Overview

```
@happyvertical/repos/
├── providers/
│   ├── github.ts      # GitHub REST/GraphQL
│   ├── gitlab.ts      # GitLab (planned)
│   ├── bitbucket.ts   # Bitbucket (planned)
│   └── azure.ts       # Azure DevOps (planned)
└── factory.ts         # Provider factory
```

## Key APIs

### Creating a Provider

```typescript
import { getReposProvider } from '@happyvertical/repos';

// GitHub provider
const provider = await getReposProvider({
  type: 'github',
  token: process.env.GITHUB_TOKEN
});
```

### Repository Operations

```typescript
// Get repository info
const repo = await provider.getRepository({
  owner: 'happyvertical',
  repo: 'sdk'
});

console.log(repo.defaultBranch);
console.log(repo.description);
```

### Issue Operations

```typescript
// List issues
const issues = await provider.listIssues({
  owner: 'happyvertical',
  repo: 'sdk',
  state: 'open',
  labels: ['bug']
});

// Get single issue
const issue = await provider.getIssue({
  owner: 'happyvertical',
  repo: 'sdk',
  number: 123
});

// Create issue
await provider.createIssue({
  owner: 'happyvertical',
  repo: 'sdk',
  title: 'New Issue',
  body: 'Description',
  labels: ['enhancement']
});

// Update issue
await provider.updateIssue({
  owner: 'happyvertical',
  repo: 'sdk',
  number: 123,
  state: 'closed',
  labels: ['resolved']
});
```

### Label Operations

```typescript
// List labels
const labels = await provider.listLabels({
  owner: 'happyvertical',
  repo: 'sdk'
});

// Create label
await provider.createLabel({
  owner: 'happyvertical',
  repo: 'sdk',
  name: 'urgent',
  color: 'ff0000',
  description: 'Urgent issues'
});
```

## Dependencies

- **Internal**:
  - `@happyvertical/graphql` - GitHub GraphQL client

- **External**:
  - `js-yaml` - YAML parsing for repository config files

## Development Guidelines

- GitHub provider uses both REST and GraphQL APIs
- Check rate limits before bulk operations
- Use pagination for large result sets
- Handle 404 errors gracefully for non-existent resources

## Expert Agent Expertise

When working with repos:

1. **API Choice**: REST for simple ops, GraphQL for complex queries
2. **Permissions**: Needs repo scope for private repositories
3. **Rate Limits**: 5000 req/hour for authenticated requests
4. **Pagination**: Use per_page and page params for lists
5. **Labels**: Color without # prefix

## Related Packages

- **@happyvertical/graphql**: Underlying GraphQL client
- **@happyvertical/projects**: Uses repos for issue integration
- **@happyvertical/github-actions**: Uses repos for triage
