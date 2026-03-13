# @happyvertical/social

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Social platform adapters for publishing to YouTube, Threads, X, and Bluesky

## Package Map
- Package: `@happyvertical/social`
- Hierarchy path: `@happyvertical/sdk > packages > social`
- Workspace position: `24 of 29` local packages
- Internal dependencies: `@happyvertical/logger`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/social build
pnpm --filter @happyvertical/social test
pnpm --filter @happyvertical/social clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/logger build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/social build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/social clean` followed by `pnpm --filter @happyvertical/social build` and `pnpm --filter @happyvertical/social test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Social platform adapters for publishing to YouTube, Threads, X, and Bluesky
- Implements: none
- Requires: @happyvertical/logger, @happyvertical/utils
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

