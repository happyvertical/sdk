# @happyvertical/repos

Standardized repository interface for issue, PR, label, and branch operations. Factory: `getRepository(config)`.

## Adapters

- **github** -- Full implementation using `@happyvertical/graphql` (REST + GraphQL)
- **gitlab** -- Stubbed (throws "not yet implemented")
- **bitbucket** -- Stubbed (throws "not yet implemented")
- **azure** -- Stubbed (throws "not yet implemented")

## Key patterns

- `IRepository` interface covers issues, PRs, labels, comments, branches, workflows, and file content
- Issue template parsing via `parseIssueBody` / `renderIssueBody` (YAML front-matter)
- Node ID resolution for GitHub Projects V2 integration
- Factory accepts an existing `IRepository` instance (passthrough) or a `RepositoryConfig`

## Gotchas

- Only GitHub adapter is implemented; other types throw at runtime
- Requires a `token` in config; no env-var auto-loading (pass `GITHUB_TOKEN` yourself)
- `getIssueNodeId` / `getPRNodeId` are GitHub-specific but on the shared interface
- `baseUrl` in config is for self-hosted GitHub Enterprise instances
