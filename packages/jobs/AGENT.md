# @happyvertical/jobs

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Job queue abstraction with multiple backend adapters (SQLite, PostgreSQL, Bull, SQS)

## Package Map
- Package: `@happyvertical/jobs`
- Hierarchy path: `@happyvertical/sdk > packages > jobs`
- Workspace position: `16 of 32` local packages
- Internal dependencies: `@happyvertical/sql`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/jobs build
pnpm --filter @happyvertical/jobs test
pnpm --filter @happyvertical/jobs clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/sql build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/jobs build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/jobs clean` followed by `pnpm --filter @happyvertical/jobs build` and `pnpm --filter @happyvertical/jobs test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Job queue abstraction with multiple backend adapters (SQLite, PostgreSQL, Bull, SQS)
- Implements: none
- Requires: @happyvertical/sql, @happyvertical/utils, @aws-sdk/client-sqs, @google-cloud/tasks, bull, bullmq
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

