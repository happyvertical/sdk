# @happyvertical/translator

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Standardized translation interface supporting Google Translate, DeepL, and LibreTranslate

## Package Map
- Package: `@happyvertical/translator`
- Hierarchy path: `@happyvertical/sdk > packages > translator`
- Workspace position: `28 of 31` local packages
- Internal dependencies: `@happyvertical/cache`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/translator build
pnpm --filter @happyvertical/translator test
pnpm --filter @happyvertical/translator clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/cache build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/translator build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/translator clean` followed by `pnpm --filter @happyvertical/translator build` and `pnpm --filter @happyvertical/translator test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Standardized translation interface supporting Google Translate, DeepL, and LibreTranslate
- Implements: none
- Requires: @happyvertical/cache, @happyvertical/utils, @google-cloud/translate, deepl-node
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

