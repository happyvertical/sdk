# @happyvertical/projects

## Purpose and Responsibilities

The projects package provides a standardized interface for project management across GitHub Projects, Jira, ZenHub, and Linear.

## Key Features

- **Multi-Provider Support**: GitHub Projects V2, Jira, ZenHub, Linear
- **Unified API**: Same interface regardless of provider
- **Column/Status Management**: Move items between columns
- **Field Updates**: Update custom fields on project items

## Architecture Overview

```
@happyvertical/projects/
├── providers/
│   ├── github.ts     # GitHub Projects V2
│   ├── jira.ts       # Jira (planned)
│   ├── zenhub.ts     # ZenHub (planned)
│   └── linear.ts     # Linear (planned)
└── factory.ts        # Provider factory
```

## Key APIs

### Creating a Provider

```typescript
import { getProjectsProvider } from '@happyvertical/projects';

// GitHub Projects
const provider = await getProjectsProvider({
  type: 'github',
  token: process.env.GITHUB_TOKEN
});
```

### Project Operations

```typescript
// List projects
const projects = await provider.listProjects({
  owner: 'happyvertical',
  type: 'organization' // or 'user'
});

// Get project details
const project = await provider.getProject({
  owner: 'happyvertical',
  projectNumber: 1
});

// List items in project
const items = await provider.listItems({
  projectId: project.id
});
```

### Item Management

```typescript
// Add issue to project
await provider.addItem({
  projectId: 'project-id',
  contentId: 'issue-id'
});

// Move item to column
await provider.moveItem({
  projectId: 'project-id',
  itemId: 'item-id',
  columnName: 'In Progress'
});

// Update custom field
await provider.updateField({
  projectId: 'project-id',
  itemId: 'item-id',
  fieldName: 'Priority',
  value: 'High'
});
```

## Dependencies

- **Internal**:
  - `@happyvertical/graphql` - GitHub GraphQL client
  - `@happyvertical/repos` - Repository utilities

## Development Guidelines

- GitHub Projects V2 uses GraphQL exclusively
- Field IDs are required for updates (fetch project first)
- Column names are case-sensitive
- Rate limits apply per provider

## Expert Agent Expertise

When working with projects:

1. **GitHub V2**: Uses GraphQL, not REST
2. **Field IDs**: Get from project schema before updates
3. **Permissions**: Needs project:write scope
4. **Pagination**: Large projects need cursor pagination
5. **Single Select Fields**: Values must match exactly

## Related Packages

- **@happyvertical/graphql**: Underlying GraphQL client
- **@happyvertical/repos**: Repository operations
- **@happyvertical/github-actions**: Uses this for workflow automation
