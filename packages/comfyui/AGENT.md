# @happyvertical/comfyui

<!-- BEGIN AGENT:GENERATED -->
## Purpose
ComfyUI API client for workflow orchestration and video generation

## Package Map
- Package: `@happyvertical/comfyui`
- Hierarchy path: `@happyvertical/sdk > packages > comfyui`
- Workspace position: `6 of 31` local packages
- Internal dependencies: `@happyvertical/logger`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/comfyui build
pnpm --filter @happyvertical/comfyui test
pnpm --filter @happyvertical/comfyui clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/logger build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/comfyui build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/comfyui clean` followed by `pnpm --filter @happyvertical/comfyui build` and `pnpm --filter @happyvertical/comfyui test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: ComfyUI API client for workflow orchestration and video generation
- Implements: none
- Requires: @happyvertical/logger, @happyvertical/utils
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

