# @happyvertical/geo

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Standardized geographical information interface supporting Google Maps and OpenStreetMap

## Package Map
- Package: `@happyvertical/geo`
- Hierarchy path: `@happyvertical/sdk > packages > geo`
- Workspace position: `12 of 31` local packages
- Internal dependencies: `@happyvertical/cache`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/geo build
pnpm --filter @happyvertical/geo test
pnpm --filter @happyvertical/geo clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/cache build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/geo build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/geo clean` followed by `pnpm --filter @happyvertical/geo build` and `pnpm --filter @happyvertical/geo test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Standardized geographical information interface supporting Google Maps and OpenStreetMap
- Implements: none
- Requires: @happyvertical/cache, @happyvertical/utils, @googlemaps/google-maps-services-js
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

