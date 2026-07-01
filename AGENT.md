# HAVE SDK

<!-- BEGIN AGENT:GENERATED -->
## Purpose
<!-- BEGIN AGENT:GENERATED -->

## Workspace Map
- Package docs standard: `AGENT.md`
- Local workspace packages: `30`
- External catalog packages: `@happyvertical/ocr`, `@happyvertical/pdf`, `@happyvertical/spider`
- Generated manifest: `ecosystem-manifest.json`
- Top-level package order: `accounting`, `ai`, `analytics`, `auth`, `cache`, `comfyui`, `directory`, `documents`, `email`, `encryption`, `files`, `geo`, `github-actions`, `graphql`, `images`, `jobs`, `json`, `logger`, `messages`, `payments`, `projects`, `repos`, `sdk-mcp`, `secrets`, `social`, `sql`, `translator`, `utils`, `video`, `weather`

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

---

# Hand-written notes for Claude / Codex / Copilot agents

The content below is preserved across `pnpm agent:sync` runs because it lives
outside the `<!-- BEGIN AGENT:GENERATED -->` / `<!-- END AGENT:GENERATED -->`
markers above (the generator preserves any "legacy notes" tail). For
machine-readable workspace shape (package list, build commands, dependency
graph), use the generated section above. This section covers things the
generator doesn't.

## SDK foundation pattern

Every SDK package exposes a `getX(config)` factory rather than `new X()`
constructors. The factory normalizes the config and chooses an adapter
implementation (memory / sqlite / postgres / openai / anthropic /
google / etc.) at runtime. Public surface stays factory-based;
constructors are an internal detail. New packages added to the SDK
should follow this pattern unless there's a documented reason not to.

## Pre-PR review — use the HappyVertical reviewer tooling

The org publishes two slash commands via the `have@have-config`
marketplace:

- **`/have:review-cycle`** runs a 4-reviewer ensemble (codex-cli + a
  claude reviewer (either `claude -p` subprocess or sub-agent fallback)
  + GitHub Copilot CLI + the orchestrator's own checklist pass) against
  the current diff or PR. Defaults to 3 rounds.
- **`/have:ship`** runs `/have:review-cycle` then prepares the work for
  shipping (validation, doc updates, PR creation, CI watching).

Per-repo guidance for those reviews lives in
**`.pr-review/extensions.md`** at this repo's root. That file gets
appended to the shared core checklist when `pr-review`
(<https://github.com/happyvertical/pr-review>) generates the review
prompt. When you spot a pattern reviewers caught more than once on
merged PRs, add it to that extensions file rather than relying on
collective memory.

If you don't have the `have` plugin installed, the slash commands won't
be available — install via `claude plugin install have@have-config`
(check `~/.claude/settings.json` `enabledPlugins` for `have@have-config:
true`).

## Conventional commits + commitlint

- Commit messages MUST follow Conventional Commits. The single source
  of truth for allowed scopes is `commitlint.config.mjs` at the repo
  root (validated by both the lefthook `commit-msg` hook locally and
  the `validate-commits` job in `.github/workflows/on-pull-request.yml`
  on CI).
- Multi-scope commits like `fix(ai,repos):` ARE accepted
  (`@commitlint/config-conventional` parses comma-separated scopes and
  validates each one against `scope-enum`). Scoped-package forms like
  `feat(@happyvertical/sql):` are NOT accepted — the `@` prefix isn't
  in the default scope grammar. If you need scoped-package scopes,
  see the hardened raw-shell regex in `have-config`'s
  `.github/workflows/commitlint.yml`
  (https://github.com/happyvertical/have-config/blob/main/.github/workflows/commitlint.yml)
  for the upgrade pattern — that workflow lives in the have-config
  repo, not this one.
- Adding a new package to `packages/<name>` requires adding `<name>`
  to the `scope-enum` in `commitlint.config.mjs`. Otherwise the first
  `feat(<name>): ...` commit will fail CI.

## Release flow

The release lives in `.github/workflows/shared-direct-publish.yml`
(reusable, called by `publish.yml`). It's a mature direct-publish flow
with bot-identity gating, idempotent tag/release creation, workspace
version sync, and a downstream `sync-smrt` job. **Don't try to unify
this with other repos' release workflows** — it's tuned for the SDK's
specific shape (large monorepo, lockstep versioning via Changesets
`fixed`, downstream SMRT consumer). Authoritative current package
count + dependency graph lives in `AGENT.md`, kept in sync by
`pnpm agent:sync`.

## Vendor SDKs go in `dependencies`, not `peerDependencies`

Foundation packages with multi-provider integrations (`ai`,
`translator`, `geo`, `analytics`) ship vendor SDKs (`@anthropic-ai/sdk`,
`openai`, `@google-cloud/translate`, etc.) as **runtime
`dependencies`**, not optional peers. Consumers `pnpm add
@happyvertical/<pkg>` and the vendor SDK comes along. The optional-peer
pattern (forcing consumers to install vendor SDKs themselves) is the
exception — when used, it MUST be documented in the package README's
Install section with the explicit `pnpm add` command consumers need.

For full convention details + recent PR-mined footguns, see
`.pr-review/extensions.md`.
