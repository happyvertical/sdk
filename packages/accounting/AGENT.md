# @happyvertical/accounting

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Multi-provider accounting integration for AR/AP sync and audit with QuickBooks, Stripe, and more

## Package Map
- Package: `@happyvertical/accounting`
- Hierarchy path: `@happyvertical/sdk > packages > accounting`
- Workspace position: `1 of 32` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/accounting build
pnpm --filter @happyvertical/accounting test
pnpm --filter @happyvertical/accounting clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/accounting build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/accounting clean` followed by `pnpm --filter @happyvertical/accounting build` and `pnpm --filter @happyvertical/accounting test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Multi-provider accounting integration for AR/AP sync and audit with QuickBooks, Stripe, and more
- Implements: none
- Requires: @happyvertical/utils, intuit-oauth
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

