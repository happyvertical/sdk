# @happyvertical/analytics

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Unified analytics interface for Google Analytics 4, Plausible, and more

## Package Map
- Package: `@happyvertical/analytics`
- Hierarchy path: `@happyvertical/sdk > packages > analytics`
- Workspace position: `3 of 31` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/analytics build
pnpm --filter @happyvertical/analytics test
pnpm --filter @happyvertical/analytics clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/analytics build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/analytics clean` followed by `pnpm --filter @happyvertical/analytics build` and `pnpm --filter @happyvertical/analytics test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Unified analytics interface for Google Analytics 4, Plausible, and more
- Implements: none
- Requires: @happyvertical/utils, googleapis
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

