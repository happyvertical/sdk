# @happyvertical/messages

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Unified multi-channel messaging with adapter-based architecture (Slack, Twitter, Email)

## Package Map
- Package: `@happyvertical/messages`
- Hierarchy path: `@happyvertical/sdk > packages > messages`
- Workspace position: `19 of 29` local packages
- Internal dependencies: `@happyvertical/email`, `@happyvertical/logger`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/messages build
pnpm --filter @happyvertical/messages test
pnpm --filter @happyvertical/messages typecheck
pnpm --filter @happyvertical/messages clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/email build`, `pnpm --filter @happyvertical/logger build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/messages build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/messages clean` followed by `pnpm --filter @happyvertical/messages build` and `pnpm --filter @happyvertical/messages test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Unified multi-channel messaging with adapter-based architecture (Slack, Twitter, Email)
- Implements: none
- Requires: @happyvertical/email, @happyvertical/logger, @happyvertical/utils, @slack/web-api
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

