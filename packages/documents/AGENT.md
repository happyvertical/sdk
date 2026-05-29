# @happyvertical/documents

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Multi-part document processing with support for PDF, HTML, and Markdown

## Package Map
- Package: `@happyvertical/documents`
- Hierarchy path: `@happyvertical/sdk > packages > documents`
- Workspace position: `8 of 30` local packages
- Internal dependencies: `@happyvertical/files`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/documents build
pnpm --filter @happyvertical/documents test
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/files build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/documents build`.
- If a change only affects runtime behavior, rerun `pnpm --filter @happyvertical/documents test` after rebuilding the package to confirm the failure is local.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Multi-part document processing with support for PDF, HTML, and Markdown
- Implements: none
- Requires: @happyvertical/files, @happyvertical/utils, @happyvertical/ocr, @happyvertical/pdf, @happyvertical/spider, uuid
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

