# SDK continuous integration

SDK separates hosted metadata/security checks from Node workspace validation.
No validation family is removed: pull requests run affected closures after the
rollout flag is enabled, while merge groups run the exhaustive build,
typecheck, lint, test, optional-adapter, documentation, package, and PostgreSQL
suites.

## Runner selection

- `ubuntu-latest` runs commit/workflow policy, naming, secret scanning, scope
  detection, and result-only aggregation. These jobs do not install
  the workspace.
- `arc-happyvertical-node` runs Node-only builds, tests, documentation, and
  package validation. It provides Node 24.18.0, pnpm 11.13.0, native build
  prerequisites, PostgreSQL client tools, and an 8 GiB memory limit. It does
  not provide Docker or deployment tooling.
- `arc-happyvertical` remains the compatibility runner for Docker service
  containers and as the rollout fallback.
- Matrix-native jobs such as `build-json-native.yml` retain their hosted OS
  runners.

Set `CI_NODE_RUNNER_ENABLED=true` only after the node-runner smoke workflow
passes. Clearing the variable immediately routes ordinary Node jobs back to
`arc-happyvertical`. Compatibility runners use a cold, job-isolated pnpm store
so pnpm 11's SQLite store index is never shared by concurrent fallback pods.

The runner workspace and `PNPM_STORE_DIR` must share a filesystem. The smoke
workflow verifies matching device IDs and confirms that installed dependency
files have hardlink counts above one. The persistent store is never restored
through GitHub Actions; hosted runners may use an Actions-backed pnpm store.

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

`Required CI` is always present. It rejects failed, cancelled, or unexpectedly
skipped jobs, using a different explicit job set for `pull_request` and
`merge_group`. Pull-request runs cancel superseded commits; merge-group runs do
not cancel each other.

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

PostgreSQL-sensitive packages register one `test:postgres` script. The wrapper
reads `CI_POSTGRES_BASE_URL` (or its runner-mounted file), creates a unique
`sdk_ci_<epoch>_<run>_<attempt>_<package>_<pid>` database, exports the normal
SDK/SQLOO/libpq variables, and force-drops the database in `finally`.
PostgreSQL Turbo tasks are uncached and the workflow limits concurrency to two.
The nightly workflow runs the complete registry and removes abandoned SDK CI
databases older than six hours.

The shared credential must be a least-privilege CI role able to create/drop
only disposable CI databases and unable to connect to production databases.
The manual `service-container` workflow option is the rollback path and stays
on `arc-happyvertical`, where Docker is available.

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

1. Clear `CI_MERGE_QUEUE_ENABLED`, `CI_POSTGRES_ENABLED`, and
   `CI_NODE_RUNNER_ENABLED` as needed.
2. Restore the previous required-context list and disable the merge queue.
3. Use the PostgreSQL service-container fallback if the shared service is the
   failing phase.
4. Use manual `publish-mode=changesets` only when artifact publication itself
   is the failing phase.
