# HAVE SDK

<!-- BEGIN AGENT:GENERATED -->
## Purpose
<!-- BEGIN AGENT:GENERATED -->

## Workspace Map
- Package docs standard: `AGENT.md`
- Local workspace packages: `29`
- External catalog packages: `@happyvertical/ocr`, `@happyvertical/pdf`, `@happyvertical/spider`
- Generated manifest: `ecosystem-manifest.json`
- Top-level package order: `accounting`, `ai`, `analytics`, `auth`, `cache`, `comfyui`, `directory`, `documents`, `email`, `encryption`, `files`, `geo`, `github-actions`, `graphql`, `images`, `jobs`, `json`, `logger`, `messages`, `projects`, `repos`, `sdk-mcp`, `secrets`, `social`, `sql`, `translator`, `utils`, `video`, `weather`

## Build & Test
```bash
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
pnpm agent:sync
```

## Agent Correction Loops
- If workspace packages or dependency edges change, run `pnpm agent:sync` to refresh `AGENT.md`, `metadata.json`, and `ecosystem-manifest.json` before committing.
- If Turborepo or package filters report stale graph/input errors after package manifest edits, run `pnpm install` and then `pnpm build` from the repo root.
- If package-scoped work fails because a dependency is not built yet, fall back to a root `pnpm build` once, then rerun the filtered package command.
<!-- END AGENT:GENERATED -->
