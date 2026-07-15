# @happyvertical/signatures

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Provider-neutral e-signature workflows with a BoldSign adapter

## Package Map
- Package: `@happyvertical/signatures`
- Hierarchy path: `@happyvertical/sdk > packages > signatures`
- Workspace position: `25 of 32` local packages
- Internal dependencies: none
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/signatures build
pnpm --filter @happyvertical/signatures test
pnpm --filter @happyvertical/signatures typecheck
pnpm --filter @happyvertical/signatures clean
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/signatures build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/signatures clean` followed by `pnpm --filter @happyvertical/signatures build` and `pnpm --filter @happyvertical/signatures test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Provider-neutral e-signature workflows with a BoldSign adapter
- Implements: BoldSign
- Requires: none
- Stability: experimental (Marked as preview or experimental in package guidance.)
<!-- END AGENT:GENERATED -->


## Package Status

Experimental while the first downstream agreement workflow validates the provider-neutral contract.

## Adapters

- BoldSign (`type: 'boldsign'`) uses the regional v1 document API, HMAC-verified webhooks, and PDF artifact endpoints.

## Security Boundaries

- Construct one adapter per tenant credential and webhook secret set.
- Preserve the raw webhook request body until HMAC verification completes.
- Persist provider event IDs and creation idempotency keys under durable unique constraints; BoldSign does not advertise provider-enforced send idempotency.
- Download signed documents and audit trails only after the normalized request reaches `completed`, consume each single-use stream into immutable storage, then await and persist its SHA-256 digest.
