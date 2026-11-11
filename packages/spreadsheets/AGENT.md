# @happyvertical/spreadsheets

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Bounded browser-safe XLSX and CSV adapters with structural workbook profiling

## Package Map
- Package: `@happyvertical/spreadsheets`
- Hierarchy path: `@happyvertical/sdk > packages > spreadsheets`
- Workspace position: `29 of 34` local packages
- Internal dependencies: none
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/spreadsheets build
pnpm --filter @happyvertical/spreadsheets test
pnpm --filter @happyvertical/spreadsheets typecheck
pnpm --filter @happyvertical/spreadsheets lint
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/spreadsheets build`.
- If you hit type-only regressions, run `pnpm --filter @happyvertical/spreadsheets typecheck` before rerunning the package build or tests to isolate the failing surface.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Bounded browser-safe XLSX and CSV adapters with structural workbook profiling
- Implements: none
- Requires: fflate
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->
