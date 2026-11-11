# @happyvertical/files

<!-- BEGIN AGENT:GENERATED -->
## Purpose
File system utilities for local and remote file operations

## Package Map
- Package: `@happyvertical/files`
- Hierarchy path: `@happyvertical/sdk > packages > files`
- Workspace position: `11 of 34` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: `@happyvertical/documents`, `@happyvertical/sdk-mcp`, `@happyvertical/spreadsheets`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/files build
pnpm --filter @happyvertical/files test
pnpm --filter @happyvertical/files clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/files build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/files clean` followed by `pnpm --filter @happyvertical/files build` and `pnpm --filter @happyvertical/files test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: File system utilities for local and remote file operations, Browser-safe ZIP manifest inspection via @happyvertical/files/archive
- Implements: none
- Requires: @happyvertical/utils, @aws-sdk/client-s3, google-auth-library, googleapis
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->


## Browser-safe archive entry

Use `@happyvertical/files/archive` for ZIP metadata inspection in browsers. This
standalone entry imports no Node builtins; the Node root retains its existing
exports. Build the package before running the full files suite, which bundles
and executes the published archive entry in a browser-like VM.

Signed and unsigned descriptors are checked at the exact centrally declared
payload boundary, never found by scanning payloads. Manifest inspection does
not inflate bodies or verify their actual CRC: consumers must enforce actual
inflated-byte limits and CRC checks themselves.
