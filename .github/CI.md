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

## PostgreSQL isolation

`postgres-tests.yml` provisions its own PostgreSQL for every run: a
digest-pinned `pgvector/pgvector:pg17` service container on the brokered
runner, reached over `localhost` with throwaway `postgres`/`postgres`
credentials. There is exactly one backend, so the workflow offers no backend
choice and has no fallback lane.

The container is created and destroyed with the job, and that is the entire
data-retention model. Nothing outlives the run, so there is no shared
credential to scope, no long-lived database reachable from CI, and no
abandoned-database cleanup to schedule. The `postgres`/`postgres` credentials
are public constants checked into the workflow, not secrets: they grant
superuser inside that one throwaway container and are worth nothing as a secret.
Because a service container is now the only backend, the runner capacity the
broker selects must support service containers.

PostgreSQL-sensitive packages register one `test:postgres` script. The wrapper
takes the maintenance connection from `CI_POSTGRES_BASE_URL`, creates a unique
`sdk_ci_<epoch>_<run>_<attempt>_<package>_<pid>` database, exports the normal
SDK/SQLOO/libpq variables, and force-drops it in `finally`. The unique name is
what keeps concurrent suites off each other's data — they all connect as the
same superuser, so this is namespacing, not privilege separation. The drop
merely reclaims, is not a retention control (the container goes away either
way), and if it fails it only writes to stderr — no Actions annotation, and the
suite still passes — so a leak shows up in the raw log body and nowhere else.
PostgreSQL Turbo tasks are uncached and the workflow limits concurrency to two.

`CI_POSTGRES_BASE_URL` is the only managed source. The wrapper otherwise
accepts an unmanaged `DATABASE_URL`, used exactly as given with no database
created or dropped, so point it only at a disposable local server. There is no
runner-mounted-credential fallback: a silent fallback to a shared server would
leak `sdk_ci_*` databases that nothing reclaims. The wrapper masks both URLs in
Actions logs, though for CI that is cosmetic — the connection string is a
literal in the workflow.

Every trigger runs the complete registry; this lane has no affected-closure
mode, so `postgres-scope` only decides whether a skipped result is forgiven,
never which suites execute.

`CI_POSTGRES_ENABLED` gates the reusable call and the nightly schedule alike, so
while it is unset the lane never runs automatically and `Required CI` accepts
its skipped result. Set it to `true` only after a manual `workflow_dispatch`
run succeeds; dispatch runs the lane regardless of the variable. Clear it to
remove the lane from the required set without weakening the normal SQLite/unit
suites.

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

1. Clear `CI_MERGE_QUEUE_ENABLED` and `CI_POSTGRES_ENABLED` as needed. Clearing
   `CI_POSTGRES_ENABLED` stops every automatic PostgreSQL run — pull request,
   merge group, and nightly — and there is no alternate backend to fail over
   to. Manual `workflow_dispatch` still runs the lane, as does the
   dispatch-only brokered runner smoke test.
2. Restore the previous required-context list and disable the merge queue.
3. Use manual `publish-mode=changesets` only when artifact publication itself
   is the failing phase.
