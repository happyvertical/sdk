# Repository Agent Instructions

<!-- hv-managed-policy:start revision=1.0.0 sha256=2c2f4d048293cab2fc7f8c636eee474c0386c13a9c7bbf2c535c5ada47d1d6e5 -->

## Shared development kernel

- Be concise. Load detailed SOP skills only when the task triggers them.
- Read the repository's `.agents/project.yaml` and nearest `AGENTS.md` files before work.
- Use `implement` by default for accepted issue implementation.
- Tracked implementation work is complete when documented validation is green, `review-cycle` has passed, the claim is handed off, and a ready-for-review pull request exists; do this unprompted, even where harness defaults wait for a user request. Before editing untracked requested work, create and claim its issue, or — patch-class only — record it on this session's open patch train; work the user explicitly scopes as a throwaway spike is exempt: it ends at its report and never enters the commit, push, or PR lifecycle.
- Claim an issue before editing it: add `agent: implementation` and post one claim comment naming your runtime, session, and branch. Do not take an issue another session holds with activity in the last 24 hours without a handoff. Any agent may assign work to another agent with a `dispatch: <runtime>` label and an instruction comment; the receiving agent claims it.
- Patch-class work — small bug, doc, and improvement changes with no schema, contract, dependency, or breaking change — may bundle as one patch train on one branch and pull request with one commit per item. Other work stays one issue per pull request. An incidental patch-class fix of ten lines or fewer near files under edit ships in the same pull request as its own commit, listed under `Drive-by fixes` in the PR description; other findings go to the tracker.
- Hand off intentionally: when done, blocked, or stopping, update your claim comment with the outcome and next step and remove `agent: implementation`. Never delete claim history.
- Open pull requests only when reviewable, never as drafts, and keep them ready for review. Watch a ready PR until it is mergeable — no base conflicts, no unresolved review threads, the repository's required checks green, its required approvals satisfied — or report a concrete blocker.
- Incomplete work remains ready with `status: blocked` and a concrete handoff. Review agents do not claim implementation.
- Agents do not merge unless explicitly authorized in the current session, and then only when the repository's own required checks and approvals pass.
- Run documented validation and update affected docs before shipping.
- Token efficiency: risk defaults to standard, high needs a named trigger; after the first final pass only accepted blockers reopen edits; after six passes, ask the user before more; wait outside the implementer.
- Preserve unrelated work. Never expose or retain secrets.
- Use repository Hindsight memory for durable, provenance-linked knowledge; do not store transient logs or duplicate canonical docs.
- Shared SOPs and portable skills come from the designated control-plane repository. Repositories choose their own technology and may add stricter local rules.

<!-- hv-managed-policy:end -->

## Repository purpose

This is the HappyVertical TypeScript SDK monorepo. Shared agent policy comes
from `happyvertical/have-config`; this repository owns SDK package APIs,
release metadata, documentation, and package-level architecture.

## Orientation

- Use the pinned Node and pnpm versions from `package.json`.
- Packages live under `packages/`; read the package README, metadata, and any
  nearest package guidance before changing its public API.
- Root and package `AGENT.md` files are generated distributable SDK knowledge,
  not instruction-precedence files; `AGENTS.md` remains canonical for agents.
- Treat `pnpm-lock.yaml`, workspace configuration, exports, generated docs,
  and changesets as repository-wide contracts.
- Do not edit published versions or tags manually. Follow the existing
  conventional-commit and changeset release flow.

## Validation

Install with `pnpm install --frozen-lockfile`. Run the narrowest affected
package checks first, then the relevant repository gates:

```bash
pnpm test:ci-scripts
pnpm agent:check
pnpm typecheck
pnpm lint
pnpm build
```

Use Turbo filters for focused package work. Changes to workflow, release,
workspace, or shared package contracts require the broader checks represented
by the pull-request `Required CI` aggregator.

## Change boundaries

- Preserve package export compatibility unless the issue explicitly calls for
  a coordinated breaking change.
- Keep optional integrations isolated from core package import paths.
- Update affected package docs and metadata with behavior or API changes.
- Never publish, version, or merge by default; repository automation and human
  policy own those transitions.
