# @happyvertical/graphql

## Purpose and Responsibilities

The graphql package provides a GitHub GraphQL client for SDK packages, offering a type-safe interface to GitHub's GraphQL API.

## Key Features

- **GitHub GraphQL Client**: Execute GraphQL queries and mutations
- **Type-Safe**: TypeScript interfaces for common operations
- **Error Handling**: Structured error classes for API failures
- **Factory Pattern**: Easy client instantiation

## Architecture Overview

```
@happyvertical/graphql/
├── client.ts   # GraphQL client implementation
├── factory.ts  # Client factory function
├── types.ts    # TypeScript type definitions
└── errors.ts   # Error classes
```

## Key APIs

### Creating a Client

```typescript
import { getGraphQLClient } from '@happyvertical/graphql';

const client = getGraphQLClient({
  token: process.env.GITHUB_TOKEN
});
```

### Executing Queries

```typescript
// Execute a query
const result = await client.query<RepositoryData>(`
  query GetRepository($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      name
      description
    }
  }
`, {
  owner: 'happyvertical',
  name: 'sdk'
});

console.log(result.repository.name);
```

### Executing Mutations

```typescript
// Create an issue
const result = await client.mutate<CreateIssueResult>(`
  mutation CreateIssue($input: CreateIssueInput!) {
    createIssue(input: $input) {
      issue {
        id
        number
        title
      }
    }
  }
`, {
  input: {
    repositoryId: 'repo-id',
    title: 'New Issue',
    body: 'Issue description'
  }
});

console.log(result.createIssue.issue.number);
```

## Dependencies

- **Internal**: None
- **External**: None (uses native fetch)

## Development Guidelines

- Always use GraphQL variables, never string interpolation
- Handle rate limits gracefully
- Use pagination for large result sets
- Check for GraphQL-specific errors in response

## Expert Agent Expertise

When working with graphql:

1. **Authentication**: Use Personal Access Token or GitHub App
2. **Rate Limits**: GitHub has separate rate limits for GraphQL
3. **Pagination**: Use cursor-based pagination for lists
4. **Errors**: GraphQL returns 200 with errors array, not HTTP error codes
5. **Schema**: Reference GitHub's GraphQL API Explorer for schema

## Related Packages

- **@happyvertical/repos**: Uses this for repository operations
- **@happyvertical/projects**: Uses this for GitHub Projects V2
