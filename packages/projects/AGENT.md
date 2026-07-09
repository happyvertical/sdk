# @happyvertical/projects

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Standardized project management interface for GitHub Projects, Jira, ZenHub, and Linear

## Package Map
- Package: `@happyvertical/projects`
- Hierarchy path: `@happyvertical/sdk > packages > projects`
- Workspace position: `21 of 31` local packages
- Internal dependencies: `@happyvertical/graphql`, `@happyvertical/repos`
- Internal dependents: `@happyvertical/github-actions`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/projects build
pnpm --filter @happyvertical/projects test
pnpm --filter @happyvertical/projects clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/graphql build`, `pnpm --filter @happyvertical/repos build`) and then rerun `pnpm --filter @happyvertical/projects build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/projects clean` followed by `pnpm --filter @happyvertical/projects build` and `pnpm --filter @happyvertical/projects test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Standardized project management interface for GitHub Projects, Jira, ZenHub, and Linear
- Implements: none
- Requires: @happyvertical/graphql, @happyvertical/repos
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

