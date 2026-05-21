# @happyvertical/utils

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Foundation utilities for ID generation, date parsing, URL handling, string conversion, error handling, and logging

## Package Map
- Package: `@happyvertical/utils`
- Hierarchy path: `@happyvertical/sdk > packages > utils`
- Workspace position: `28 of 30` local packages
- Internal dependencies: none
- Internal dependents: `@happyvertical/accounting`, `@happyvertical/ai`, `@happyvertical/analytics`, `@happyvertical/auth`, `@happyvertical/cache`, `@happyvertical/comfyui`, `@happyvertical/directory`, `@happyvertical/documents`, `@happyvertical/email`, `@happyvertical/encryption`, `@happyvertical/files`, `@happyvertical/geo`, `@happyvertical/jobs`, `@happyvertical/logger`, `@happyvertical/messages`, `@happyvertical/sdk-mcp`, `@happyvertical/secrets`, `@happyvertical/social`, `@happyvertical/sql`, `@happyvertical/translator`, `@happyvertical/video`, `@happyvertical/weather`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/utils build
pnpm --filter @happyvertical/utils test
pnpm --filter @happyvertical/utils clean
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/utils build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/utils clean` followed by `pnpm --filter @happyvertical/utils build` and `pnpm --filter @happyvertical/utils test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Foundation utilities for ID generation, date parsing, URL handling, string conversion, error handling, and logging
- Implements: none
- Requires: @paralleldrive/cuid2, date-fns, pluralize, uuid
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

