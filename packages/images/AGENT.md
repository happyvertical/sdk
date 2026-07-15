# @happyvertical/images

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Image processing utilities with adapter pattern for scaling from static to enterprise

## Package Map
- Package: `@happyvertical/images`
- Hierarchy path: `@happyvertical/sdk > packages > images`
- Workspace position: `15 of 32` local packages
- Internal dependencies: none
- Internal dependents: `@happyvertical/video`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/images build
pnpm --filter @happyvertical/images test
pnpm --filter @happyvertical/images clean
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/images build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/images clean` followed by `pnpm --filter @happyvertical/images build` and `pnpm --filter @happyvertical/images test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Image processing utilities with adapter pattern for scaling from static to enterprise
- Implements: none
- Requires: @resvg/resvg-js, jimp, satori, sharp
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

