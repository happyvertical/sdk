# @happyvertical/json

<!-- BEGIN AGENT:GENERATED -->
## Purpose
High-performance JSON parsing and serialization with Rust SIMD acceleration and automatic fallback

## Package Map
- Package: `@happyvertical/json`
- Hierarchy path: `@happyvertical/sdk > packages > json`
- Workspace position: `17 of 32` local packages
- Internal dependencies: none
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/json build
pnpm --filter @happyvertical/json test
pnpm --filter @happyvertical/json typecheck
pnpm --filter @happyvertical/json lint
pnpm --filter @happyvertical/json clean
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/json build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/json clean` followed by `pnpm --filter @happyvertical/json build` and `pnpm --filter @happyvertical/json test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: High-performance JSON parsing and serialization with Rust SIMD acceleration and automatic fallback
- Implements: none
- Requires: none
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

