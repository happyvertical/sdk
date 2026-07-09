# @happyvertical/logger

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Structured logging for HAVE SDK with signal adapter

## Package Map
- Package: `@happyvertical/logger`
- Hierarchy path: `@happyvertical/sdk > packages > logger`
- Workspace position: `18 of 31` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: `@happyvertical/comfyui`, `@happyvertical/email`, `@happyvertical/encryption`, `@happyvertical/messages`, `@happyvertical/social`, `@happyvertical/video`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/logger build
pnpm --filter @happyvertical/logger test
pnpm --filter @happyvertical/logger typecheck
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/logger build`.
- If you hit type-only regressions, run `pnpm --filter @happyvertical/logger typecheck` before rerunning the package build or tests to isolate the failing surface.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Structured logging for HAVE SDK with signal adapter
- Implements: none
- Requires: @happyvertical/utils, @sentry/node
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

