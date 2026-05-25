# @happyvertical/repos

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Standardized repository interface for GitHub, GitLab, Bitbucket, and Azure DevOps

## Package Map
- Package: `@happyvertical/repos`
- Hierarchy path: `@happyvertical/sdk > packages > repos`
- Workspace position: `22 of 30` local packages
- Internal dependencies: `@happyvertical/graphql`
- Internal dependents: `@happyvertical/github-actions`, `@happyvertical/projects`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/repos build
pnpm --filter @happyvertical/repos test
pnpm --filter @happyvertical/repos clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/graphql build`) and then rerun `pnpm --filter @happyvertical/repos build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/repos clean` followed by `pnpm --filter @happyvertical/repos build` and `pnpm --filter @happyvertical/repos test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Standardized repository interface for GitHub, GitLab, Bitbucket, and Azure DevOps
- Implements: none
- Requires: @happyvertical/graphql, js-yaml
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

