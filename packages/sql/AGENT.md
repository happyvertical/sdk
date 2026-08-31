# @happyvertical/sql

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Database interface with support for SQLite, PostgreSQL, and DuckDB

## Package Map
- Package: `@happyvertical/sql`
- Hierarchy path: `@happyvertical/sdk > packages > sql`
- Workspace position: `28 of 32` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: `@happyvertical/jobs`, `@happyvertical/secrets`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/sql build
pnpm --filter @happyvertical/sql test
pnpm --filter @happyvertical/sql typecheck
pnpm --filter @happyvertical/sql clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/sql build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/sql clean` followed by `pnpm --filter @happyvertical/sql build` and `pnpm --filter @happyvertical/sql test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Database interface with support for SQLite, PostgreSQL, and DuckDB
- Implements: none
- Requires: @happyvertical/utils, @duckdb/node-api, @libsql/client, @russellthehippo/honker-node, @sqliteai/sqlite-vector, pg, sqlite-vss
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

