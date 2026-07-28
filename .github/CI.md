# SDK continuous integration

SDK routes portable CI for trusted repository work through the provider-neutral
`arc-happyvertical` broker alias. No validation family is removed: pull
requests run affected closures after the rollout flag is enabled, while merge
groups run the exhaustive build, typecheck, lint, test, optional-adapter,
documentation, package, and PostgreSQL suites.

## Runner selection

- `arc-happyvertical` is the sole workflow-facing selector for portable,
  repository-owned Linux CI. Runner-pool policy chooses its backing capacity;
  workflows must not name a provider-specific backing label.
- Matrix-native jobs such as `build-json-native.yml` retain their hosted OS
  runners.
- The public `shared-direct-publish.yml` reusable workflow remains hosted so
  arbitrary external callers are never routed into HappyVertical capacity.

Each brokered runner keeps the workspace and pnpm store isolated from
concurrent jobs; safe caches may survive sequential jobs on a warm host.

The runner workspace and the pnpm store derived by `pnpm store path` must share
a filesystem. The smoke workflow verifies matching device IDs, confirms that
installed dependency files have hardlink counts above one, and validates the
digest-pinned PostgreSQL/pgvector service contract. The persistent store is
never restored through GitHub Actions.

## Trusted-base public pull requests

The brokered PR, lifecycle, and Dependabot workflows use
`pull_request_target`, so GitHub loads runner selection from the trusted base
branch rather than contributor-controlled merge YAML. Only a same-repository
PR explicitly checks out `github.event.pull_request.head.sha`; that SHA is
passed into reusable validation workflows as `checkout_ref`. Merge groups use
their synthetic `github.sha` normally.

An external fork never gets an `arc-happyvertical` job: each job is guarded by
the same-repository test before GitHub allocates a runner, and fork code is
never checked out in this path. Broker-side admission independently denies fork
events before reservation. This boundary is intentional; do not replace it
with a job-level guard in an ordinary `pull_request` workflow.

## Turbo cache behavior

GitHub Actions does not upload or download `.turbo`. The internal Turbo remote
cache, when configured by the runner, is optional acceleration. An unavailable
remote cache must produce warnings and a cold local build, not fail a job.
Validation seed builds use `TURBO_FORCE=true` where exercising the current
commit is required.

## Vitest configuration

Root test commands load `vitest.config.ts`. Package-local commands must pass
`--config ../../vitest.package.config.ts`; the package config preserves the
package's Vite config and any local `vitest.config.ts`, then applies the shared
timeouts and worker limits from `vitest.shared.ts`. This prevents package tests
from silently using Vitest's 5-second default on a contended runner.

`pnpm test:ci-scripts` enforces this command boundary and resolves representative
plain and locally overridden package configs. Add package-specific discovery or
coverage rules to a package `vitest.config.ts`, not to its test command.

## Pull requests, merge groups, and Required CI

`CI_MERGE_QUEUE_ENABLED` stages the cutover:

- Unset/false: pull requests retain the exhaustive suite and publish dry run.
- `true`: pull requests use Turbo's affected package/dependency closure. The
  merge group runs the complete release-confidence suite and publish dry run.

`Required CI` is always present for trusted PR and merge-group work. It rejects
failed, cancelled, or unexpectedly skipped jobs using an explicit job set.
`pull_request_target` runs cancel superseded commits; merge-group runs do not
cancel each other.

Observe `Required CI` alongside the existing required checks for ten successful
representative pull requests before changing repository rules. The
repository-settings cutover is manual:

1. Enable `CI_MERGE_QUEUE_ENABLED=true`.
2. Require only `Required CI` after the observation window.
3. Enable a single-entry merge queue for `main`.
4. Prove one queued merge and its release before removing the prior contexts.

When merge-queue mode is enabled, the post-merge orchestrator skips validation
already proven by the merge group and performs release/deployment work only.

## External fork pull requests

A pull request opened from a fork receives no validation of its code, by
design, and `Required CI` can never pass on one. Every protected job is guarded
by the same-repository test described under "Trusted-base public pull
requests", so on a fork pull request all of them skip; `required-ci` is a
hosted `always()` fan-in that rejects a skipped result, so it fails. The runner
target contract independently fixes `public_fork_pull_requests: "deny"` as a
schema constant — not a tunable default — so untrusted fork code is never
admitted to the root-capable pool even if a job-level guard were removed. The
contract ships in the agent-policy artifact as
`contracts/runner-target-contract-v2.json`.

`Required CI` is the fork guard, and it is the check that fails here.
`lifecycle`, the other required check, is hosted, triggers on plain
`pull_request`, and is deliberately not guarded, so it still runs on a fork
pull request — but it validates claim and pull-request lifecycle state rather
than the code, so it is no part of the fork guard and ordinarily passes. If it
does fail, read it on its own terms: most often a commit message carries a
closing keyword the pull request body does not declare, or the change edits
managed policy files. Its message says what to correct.

A red `Required CI` here is the policy working as intended, not a CI fault. Do
not report it as broken infrastructure, and do not weaken the guard to make it
pass. Two things look like workarounds and are not:

- "Allow edits by maintainers" does not help. Pushing to the contributor's
  fork branch leaves `github.event.pull_request.head.repo.full_name` pointing
  at the fork, so the pull request is still a fork pull request and the
  same-repository test still excludes it.
- Admin bypass is not the answer. Merging past the required check lands fork
  code that nothing has built, tested, or scanned, which is precisely what the
  required check exists to prevent.

The supported route is to bring an accepted outside change into this
repository, where it is no longer untrusted:

1. Review the fork diff as ordinary content, and tell the contributor that the
   failing check is policy rather than a defect in their change.
2. Open and claim a tracker issue, as `AGENTS.md` requires for any other
   implementation work in this repository.
3. Re-create the branch inside `happyvertical/sdk` — push the reviewed commits
   to a repository branch, rewording or squashing them to satisfy
   `validate-commits` — or re-author the change.
4. Credit the original author with a `Co-authored-by:` trailer on any commit
   whose original authorship the rewording would otherwise drop.
5. Add the changeset the change needs, or apply `skip-changeset`; an outside
   contributor will usually not have supplied one.
6. Open the in-repo pull request, which validates normally, then close the
   fork pull request with a pointer to it.

If external contributions are ever wanted with automation attached, the
follow-on is a maintainer-triggered re-validation path: a label or
`workflow_dispatch` that validates one specific, reviewed fork SHA, still
resolving workflow definitions from the trusted base ref. That keeps trusting a
commit an explicit maintainer action rather than an automatic consequence of
opening a pull request, and it is why the invariant above is scoped to the fork
pull-request event rather than to fork commits in general. That path does not
exist today; until it does, in-repo re-creation is the only supported option.

## PostgreSQL isolation

PostgreSQL-sensitive packages register one `test:postgres` script. The wrapper
reads `CI_POSTGRES_BASE_URL` (or its runner-mounted file), creates a unique
`sdk_ci_<epoch>_<run>_<attempt>_<package>_<pid>` database, exports the normal
SDK/SQLOO/libpq variables, and force-drops the database in `finally`.
PostgreSQL Turbo tasks are uncached and the workflow limits concurrency to two.
The nightly workflow runs the complete registry and removes abandoned SDK CI
databases older than six hours.

The shared credential must be a least-privilege CI role able to create/drop
only disposable CI databases and unable to connect to production databases.
The manual `service-container` workflow option is the rollback path and runs
through the broker, whose selected capacity must support service containers.

Set `CI_POSTGRES_ENABLED=true` only after a shared-backend manual run succeeds.
Clear it to remove the lane from the required set without weakening the normal
SQLite/unit suites.

## Release artifact provenance

Changesets calculates versions and changelogs. The release workflow then:

1. clean-builds the versioned workspace;
2. packs each public package exactly once;
3. records package name, version, expected filename, and SHA-256 in a
   schema-versioned shard manifest;
4. rejects missing/duplicate packages, mixed versions, unexpected filenames,
   and hash mismatches;
5. sequentially publishes those verified tarballs; and
6. verifies every manifest entry on npm before pushing the release commit/tag
   and creating the GitHub release.

Retries skip versions already present and publish only missing entries. For the
first two successful artifact releases, manual dispatch may select the
`changesets` emergency fallback. Remove that option after both releases and
downstream install checks succeed. The native JSON platform-artifact workflow
remains independent and unchanged.

## Measurement and rollback

For every rollout phase, record ten successful baseline and ten successful
post-change runs. Capture setup time, wall time, queue time, self-hosted
runner-minutes, peak Node-runner memory, and retries/flakes in the table below.

| Phase | Window | Runs | Setup p50/p95 | Queue p95 | Runner min/PR | Memory p95/max | Retries |
| --- | --- | ---: | --- | --- | ---: | --- | ---: |
| Node runner | baseline | 10 | | | | | |
| Node runner | post | 10 | | | | | |
| PostgreSQL | baseline | 10 | | | | | |
| PostgreSQL | post | 10 | | | | | |
| Affected PR | baseline | 10 | | | | | |
| Affected PR | post | 10 | | | | | |
| Required CI | baseline | 10 | | | | | |
| Required CI | post | 10 | | | | | |

Stop or roll back if setup p95 exceeds 45 seconds, memory exceeds 8 GiB,
required contexts disappear, or failure/retry rates increase. Targets are setup
p50 below 30 seconds, queue p95 below two minutes, memory p95 below 5 GiB, and
at least 30% fewer self-hosted runner-minutes per pull request.

Rollback order:

1. Clear `CI_MERGE_QUEUE_ENABLED` and `CI_POSTGRES_ENABLED` as needed.
2. Restore the previous required-context list and disable the merge queue.
3. Use the PostgreSQL service-container fallback if the shared service is the
   failing phase.
4. Use manual `publish-mode=changesets` only when artifact publication itself
   is the failing phase.
