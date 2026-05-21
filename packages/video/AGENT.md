# @happyvertical/video

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Video processing utilities with adapter pattern for composition and transcoding

## Package Map
- Package: `@happyvertical/video`
- Hierarchy path: `@happyvertical/sdk > packages > video`
- Workspace position: `29 of 30` local packages
- Internal dependencies: `@happyvertical/images`, `@happyvertical/logger`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/video build
pnpm --filter @happyvertical/video test
pnpm --filter @happyvertical/video clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/images build`, `pnpm --filter @happyvertical/logger build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/video build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/video clean` followed by `pnpm --filter @happyvertical/video build` and `pnpm --filter @happyvertical/video test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Video processing utilities with adapter pattern for composition and transcoding
- Implements: none
- Requires: @happyvertical/images, @happyvertical/logger, @happyvertical/utils, sharp
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

