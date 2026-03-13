# @happyvertical/directory

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Unified directory services with adapter-based architecture (Kanidm, Stalwart, PostgreSQL, AWS)

## Package Map
- Package: `@happyvertical/directory`
- Hierarchy path: `@happyvertical/sdk > packages > directory`
- Workspace position: `7 of 29` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/directory build
pnpm --filter @happyvertical/directory test
pnpm --filter @happyvertical/directory typecheck
pnpm --filter @happyvertical/directory clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/directory build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/directory clean` followed by `pnpm --filter @happyvertical/directory build` and `pnpm --filter @happyvertical/directory test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Unified directory services with adapter-based architecture (Kanidm, Stalwart, PostgreSQL, AWS)
- Implements: none
- Requires: @happyvertical/utils, @aws-sdk/client-iam, @aws-sdk/client-organizations, pg
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

