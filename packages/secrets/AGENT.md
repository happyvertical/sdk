# @happyvertical/secrets

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Envelope encryption for per-tenant secret management with pluggable backends

## Package Map
- Package: `@happyvertical/secrets`
- Hierarchy path: `@happyvertical/sdk > packages > secrets`
- Workspace position: `24 of 32` local packages
- Internal dependencies: `@happyvertical/sql`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/secrets build
pnpm --filter @happyvertical/secrets test
pnpm --filter @happyvertical/secrets typecheck
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/sql build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/secrets build`.
- If you hit type-only regressions, run `pnpm --filter @happyvertical/secrets typecheck` before rerunning the package build or tests to isolate the failing surface.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Envelope encryption for per-tenant secret management with pluggable backends
- Implements: none
- Requires: @happyvertical/sql, @happyvertical/utils
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

