# @happyvertical/encryption

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Unified encryption and cryptography operations with adapter-based architecture

## Package Map
- Package: `@happyvertical/encryption`
- Hierarchy path: `@happyvertical/sdk > packages > encryption`
- Workspace position: `10 of 34` local packages
- Internal dependencies: `@happyvertical/logger`, `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/encryption build
pnpm --filter @happyvertical/encryption test
pnpm --filter @happyvertical/encryption typecheck
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/logger build`, `pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/encryption build`.
- If you hit type-only regressions, run `pnpm --filter @happyvertical/encryption typecheck` before rerunning the package build or tests to isolate the failing surface.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Unified encryption and cryptography operations with adapter-based architecture
- Implements: none
- Requires: @happyvertical/logger, @happyvertical/utils, @openpgp/web-stream-tools, openpgp, tweetnacl, tweetnacl-util
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->


## Vault snapshots

Import `sealVaultSnapshot` and `openVaultSnapshot` from
`@happyvertical/encryption/vault-snapshot` for bounded user-key-encrypted bytes. Supply trusted account, device, and sequence context when
opening, and scope the single key lookup to that account. The
[v1 wire specification](./README.md#version-1-wire-format) describes framing,
limits, and Kotlin interoperability vectors.
