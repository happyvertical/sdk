# HappyVertical SDK — Claude / Agent Notes

This file is read by Claude Code and other LLM agents (Codex CLI, Copilot
CLI) when working in the SDK monorepo. For machine-readable workspace
shape (package list, build commands, dependency graph), see `AGENT.md`
at the repo root and per-package `AGENT.md` files — those are
generator-managed by `pnpm agent:sync`. **This file is hand-written and
covers things the generator doesn't.**

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
  of truth for allowed scopes is `commitlint.config.js` at the repo
  root (validated by both the lefthook `commit-msg` hook locally and
  the `validate-commits` job in `.github/workflows/on-pull-request.yml`
  on CI).
- Multi-scope (`fix(a,b):`) and scoped-package (`feat(@happyvertical/sql):`)
  forms are NOT currently accepted — `commitlint.config.js` uses
  `@commitlint/config-conventional`'s default grammar. If you need
  those forms, look at have-config's hardened regex in
  `.github/workflows/commitlint.yml` for the upgrade pattern.
- Adding a new package to `packages/<name>` requires adding `<name>`
  to the `scope-enum` in `commitlint.config.js`. Otherwise the first
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
