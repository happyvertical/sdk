# @happyvertical/sdk-mcp

<!-- BEGIN AGENT:GENERATED -->
## Purpose
MCP server for HAVE SDK - Routes queries to package experts using AGENT.md files

## Package Map
- Package: `@happyvertical/sdk-mcp`
- Hierarchy path: `@happyvertical/sdk > packages > sdk-mcp`
- Workspace position: `23 of 30` local packages
- Internal dependencies: `@happyvertical/ai`, `@happyvertical/files`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/sdk-mcp build
pnpm --filter @happyvertical/sdk-mcp test
pnpm --filter @happyvertical/sdk-mcp clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/ai build`, `pnpm --filter @happyvertical/files build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/sdk-mcp build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/sdk-mcp clean` followed by `pnpm --filter @happyvertical/sdk-mcp build` and `pnpm --filter @happyvertical/sdk-mcp test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: MCP server for HAVE SDK - Routes queries to package experts using AGENT.md files
- Implements: none
- Requires: @happyvertical/ai, @happyvertical/files, @happyvertical/utils, @modelcontextprotocol/sdk
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

