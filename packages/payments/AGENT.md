# @happyvertical/payments

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Payment backend abstraction with adapters for Base USDC, BTCPay Server, and Stripe

## Package Map
- Package: `@happyvertical/payments`
- Hierarchy path: `@happyvertical/sdk > packages > payments`
- Workspace position: `20 of 32` local packages
- Internal dependencies: none
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/payments build
pnpm --filter @happyvertical/payments test
pnpm --filter @happyvertical/payments clean
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/payments build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/payments clean` followed by `pnpm --filter @happyvertical/payments build` and `pnpm --filter @happyvertical/payments test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Payment backend abstraction with adapters for Base USDC, BTCPay Server, and Stripe
- Implements: none
- Requires: @noble/curves, @noble/hashes, @scure/bip32
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->

