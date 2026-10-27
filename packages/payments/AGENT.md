# @happyvertical/payments

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Payment backend abstraction with adapters for Base USDC, BTCPay Server, and Stripe

## Package Map
- Package: `@happyvertical/payments`
- Hierarchy path: `@happyvertical/sdk > packages > payments`
- Workspace position: `21 of 33` local packages
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


## Dispute transport

StripeAdapter verifies dispute webhooks before exposing `event.dispute` and
`event.connect.dispute`. `getDispute(id, { stripeAccount, expectedLivemode })`
is an authoritative scoped GET, preserving account/environment context and
expanded charge/PaymentIntent identities. Root `PaymentDispute` types expose
validated safe minor-unit amounts and balance transaction evidence without raw
parsing. Missing evidence throws; an empty array is valid. Unknown lifecycle
statuses map to `unknown`, unknown dispute event types throw. Never infer money
movement from lifecycle status; consumers own ledger postings, ownership,
durable deduplication, ordering, and recovery. See README dispute documentation.


## Checkout reverse reconciliation

`lookupCheckout({ paymentIntentId?, chargeId?, livemode, stripeAccount?, maxPages? })`
reads existing payment evidence and exhausts filtered Checkout Session pagination.
Root `PaymentCheckoutLookupInput` / `PaymentCheckoutLookupResult` are generic;
Stripe adds `StripeCheckoutLookupInput` account scope. Only `status: no_match`
proves complete absence. `matched` returns validated session/PI/quote identity,
`accountId` and environment, without raw payloads. `indeterminate` reasons are
`pagination_limit`, `ambiguous`, `missing_quote`; never acknowledge these as
unrelated. Provider/identity failures throw. The method is optional on
PaymentBackend, preserving other integrations. Bind quote/account to local owner
records and retain settlement-ordering retries; provider metadata is not
application authorization. See README for exact pagination and identity rules.
