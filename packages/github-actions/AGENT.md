# @happyvertical/github-actions

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Reusable GitHub Actions utilities for issue triage, PR validation, and workflow automation

## Package Map
- Package: `@happyvertical/github-actions`
- Hierarchy path: `@happyvertical/sdk > packages > github-actions`
- Workspace position: `13 of 30` local packages
- Internal dependencies: `@happyvertical/projects`, `@happyvertical/repos`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/github-actions build
pnpm --filter @happyvertical/github-actions test
pnpm --filter @happyvertical/github-actions clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/projects build`, `pnpm --filter @happyvertical/repos build`) and then rerun `pnpm --filter @happyvertical/github-actions build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/github-actions clean` followed by `pnpm --filter @happyvertical/github-actions build` and `pnpm --filter @happyvertical/github-actions test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Reusable GitHub Actions utilities for issue triage, PR validation, and workflow automation
- Implements: none
- Requires: @happyvertical/projects, @happyvertical/repos
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

