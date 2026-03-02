---
"@happyvertical/sql": minor
"@happyvertical/repos": minor
---

Add `requiresSchemaCheck` flag to DatabaseInterface

Adapters that auto-create tables at runtime (JSON, DuckDB) now set
`requiresSchemaCheck: true`. Migration-managed adapters (Postgres, SQLite)
leave it unset, allowing frameworks to skip redundant `tableExists()` calls
during collection initialization.

Add `createRepositoryFromTemplate()` to `GitHubRepository` for creating
new repositories from a template via `POST /repos/{owner}/{repo}/generate`.
