# @happyvertical/auth

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Unified authentication interface supporting Keycloak, AWS Cognito, and Nostr with OAuth2/OIDC and public key identity

## Package Map
- Package: `@happyvertical/auth`
- Hierarchy path: `@happyvertical/sdk > packages > auth`
- Workspace position: `4 of 30` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/auth build
pnpm --filter @happyvertical/auth test
pnpm --filter @happyvertical/auth clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/auth build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/auth clean` followed by `pnpm --filter @happyvertical/auth build` and `pnpm --filter @happyvertical/auth test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Unified authentication interface supporting Keycloak, AWS Cognito, and Nostr with OAuth2/OIDC and public key identity
- Implements: none
- Requires: @happyvertical/utils, @aws-sdk/client-cognito-identity-provider, jose, nostr-tools
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

