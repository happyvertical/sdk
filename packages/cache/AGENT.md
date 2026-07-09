# @happyvertical/cache

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Standardized caching interface supporting Memory, File, and Redis backends

## Package Map
- Package: `@happyvertical/cache`
- Hierarchy path: `@happyvertical/sdk > packages > cache`
- Workspace position: `5 of 31` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: `@happyvertical/geo`, `@happyvertical/translator`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/cache build
pnpm --filter @happyvertical/cache test
pnpm --filter @happyvertical/cache clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/cache build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/cache clean` followed by `pnpm --filter @happyvertical/cache build` and `pnpm --filter @happyvertical/cache test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Standardized caching interface supporting Memory, File, and Redis backends
- Implements: none
- Requires: @happyvertical/utils, @aws-sdk/client-s3, @aws-sdk/credential-providers, redis
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

