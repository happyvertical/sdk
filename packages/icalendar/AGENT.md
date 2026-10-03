# @happyvertical/icalendar

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Bounded RFC 5545 iCalendar parsing facade

## Package Map
- Package: `@happyvertical/icalendar`
- Hierarchy path: `@happyvertical/sdk > packages > icalendar`
- Workspace position: `15 of 33` local packages
- Internal dependencies: none
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/icalendar build
pnpm --filter @happyvertical/icalendar test
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/icalendar build`.
- If a change only affects runtime behavior, rerun `pnpm --filter @happyvertical/icalendar test` after rebuilding the package to confirm the failure is local.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Bounded RFC 5545 iCalendar parsing facade
- Implements: none
- Requires: ical.js
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->
