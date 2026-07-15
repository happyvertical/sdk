# @happyvertical/email

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Low-level email protocol operations with adapter-based architecture

## Package Map
- Package: `@happyvertical/email`
- Hierarchy path: `@happyvertical/sdk > packages > email`
- Workspace position: `9 of 32` local packages
- Internal dependencies: `@happyvertical/logger`, `@happyvertical/utils`
- Internal dependents: `@happyvertical/messages`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/email build
pnpm --filter @happyvertical/email test
pnpm --filter @happyvertical/email typecheck
pnpm --filter @happyvertical/email clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/logger build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/email build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/email clean` followed by `pnpm --filter @happyvertical/email build` and `pnpm --filter @happyvertical/email test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Low-level email protocol operations with adapter-based architecture
- Implements: none
- Requires: @happyvertical/logger, @happyvertical/utils, google-auth-library, googleapis, imapflow, mailparser, node-pop3, nodemailer
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

