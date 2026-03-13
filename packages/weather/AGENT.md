# @happyvertical/weather

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Weather data provider abstraction for HAppyVertical SDK

## Package Map
- Package: `@happyvertical/weather`
- Hierarchy path: `@happyvertical/sdk > packages > weather`
- Workspace position: `29 of 29` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/weather build
pnpm --filter @happyvertical/weather test
pnpm --filter @happyvertical/weather clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/weather build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/weather clean` followed by `pnpm --filter @happyvertical/weather build` and `pnpm --filter @happyvertical/weather test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Weather data provider abstraction for HAppyVertical SDK
- Implements: none
- Requires: @happyvertical/utils
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

