# Incomplete SDK release recovery

## Occupied 0.103.0 (SDK #1391)

[Run 37977913268](https://github.com/happyvertical/sdk/actions/runs/37977913268)
attempt 2 published all 33 SDK family packages at `0.103.0`, then failed its
release-commit push non-fast-forward after the DuckDB conflict-key repair
[#1390](https://github.com/happyvertical/sdk/pull/1390) merged as
`a6b5141b06d41387f71d3f8fc72fcb23af7903a0`. There is no `v0.103.0`
repository release. Registry SQL `0.103.0` SHA-1
`5b7c2c71255ff30e629365ebadf90ff18fbed815` is the old artifact, while the
fixed candidate is `828fdab43c743558046933cf826a996440ff5552`; the other 32
family artifacts agree. Immutable publication therefore cannot repair
`0.103.0` by retrying it.

The explicit reservation applies only when ordinary Changesets preparation
selects `0.103.0`. It rechecks each of the 33 publishable family targets at
`0.103.1`; only an explicit E404 permits the ordinary recovery patch pass.
The recovery retains pending Laya and DuckDB notes, uses Changesets to update
fixed-family dependencies, and then continues normal verification, immutable
publication, commit, and tag steps. The 2026-10-09 registry receipt recorded
all 33 `0.103.1` endpoints as absent; the workflow repeats that check to avoid
relying on the receipt during a race.

Do not manually version, tag, republish, or overwrite `0.103.0`. If any
`0.103.1` target is occupied or cannot be looked up, stop for a newly reviewed
reservation. Historical reservations remain bounded and unchanged.

## Occupied 0.101.2 (SDK #1350)

[Run 37264164839](https://github.com/happyvertical/sdk/actions/runs/37264164839)
published all 32 SDK packages at `0.101.2` from OAuth fix
[#1348](https://github.com/happyvertical/sdk/pull/1348) (merge
`ac8204dcfb91f49a35930c12238c7e8d61c02ecf`). Its release commit push failed
non-fast-forward after currency-rounding fix
[#1349](https://github.com/happyvertical/sdk/pull/1349) merged as
`bcd6a1ac1ded6ece63b820513621c07082559fc3`. The registry publication exists;
the corresponding repository release did not complete.

[Run 37264185583](https://github.com/happyvertical/sdk/actions/runs/37264185583)
then selected `0.101.2` again and correctly rejected the changed Accounting
tarball before publishing: registry SHA-1
`5d161bf8568a2f2773750bb187cee0ccbe83b40d`, candidate SHA-1
`41280acbb5c97a491ca8452c0f3d6ce9e6a510f9`. The existing Accounting tarball
contains the OAuth packaging fix but lacks the currency-rounding fix.

The second explicit reservation applies only when normal Changesets preparation
selects `0.101.2`: check every publishable family member for an absent `0.101.3`,
then run the ordinary recovery patch pass. Registry metadata for all 32 existing
`0.101.2` packages was verified against publication integrity receipts on
2026-10-05; all 32 `0.101.3` version endpoints returned HTTP 404. These are
point-in-time receipts, not permission to overwrite a version. Preparation
rechecks absence using the same fail-closed guard described below.

The recovery preserves both merged fixes and earlier release notes. It never
rewrites manifests manually, republishes different bytes under `0.101.2`, moves
tags, or bypasses the normal immutable publisher. If `0.101.3` becomes occupied,
stop for a newly reviewed reservation. The prior `0.101.0` reservation is retained
for historical reproducibility; unrelated candidates remain untouched.

## Historical occupied 0.101.0 (SDK #1342)

The primary registry contains a partial SDK `0.101.0` publication whose
artifacts differ from the current source. The normal release for speech fix
[#1340](https://github.com/happyvertical/sdk/pull/1340) failed the immutable
artifact check in [run 37237977423](https://github.com/happyvertical/sdk/actions/runs/37237977423).
There is no completed `v0.101.0` repository release. In particular, the existing
speech tarball does not contain merge `4ffc5e664e8c9764ba689e18abad3aec1ff57ec2`.
Never overwrite those artifacts or create a tag implying they came from this head.

The reviewed reservation in `scripts/recover-partial-release.mjs` applies only
when ordinary Changesets preparation computes `0.101.0`. It checks that the
whole publishable family has that version and that `0.101.1` is absent for every
package on the recorded primary registry. Only an explicit registry E404 counts
as absence; lookup errors and any occupied target stop preparation. The helper
then adds a recovery patch changeset and runs ordinary Changesets versioning a
second time. This produces `0.101.1` with coherent fixed-family versions and
internal dependencies. The earlier `0.101.0` changelog sections retain the pending
feature notes; they describe the reserved, incomplete candidate, not a completed
release. The `0.101.1` note explicitly records that distinction and the failed run.

No new dispatch flag is required. Build, artifact verification, immutable publish
checks, release commit/tag creation, and best-effort npmjs mirroring continue
through the normal Publish workflow. Registry contents, existing tags, and
credentials are untouched by preparation. A race after the absence check still
fails at the existing immutable artifact guard unless the artifact is identical.

Each reservation does nothing for unlisted candidates or the existing committed-release
recovery path. Repeating preparation from the old base is safe while the target
remains unused. If `0.101.1` becomes partially occupied before the release commit
lands, preparation stops: investigate the artifacts and obtain another reviewed
recovery rather than changing the reservation or forcing publication ad hoc.

## Validation for the 0.103.0 reservation

The actor is the normal release workflow operating on its local candidate tree;
there is no database transaction or production authentication change. The
external boundary is the recorded primary npm registry. Tests use the supported
Node runtime and the installed Changesets CLI, with registry responses injected.

| Trigger / invariant | Positive and failure evidence |
| --- | --- |
| Normal preparation selects occupied `0.103.0` | Real Changesets second pass yields `0.103.1`, retains Laya and DuckDB repair notes and exact internal dependency versions; the base helper cannot reserve this candidate. |
| Target must be absent before local mutation | Every family member is checked; occupied or failed lookups produce no recovery note or version mutation. Wrong registry and inconsistent family versions are rejected. |
| Reservation stays bounded | Historical `0.101.0` and `0.101.2` recoveries remain covered; completed targets and unrelated candidates perform no lookup or versioning. |
| Mutation and retries fail closed | Existing tests cover failed Changesets execution, unexpected target, and a pre-existing recovery note; ordinary immutable publication still rejects different occupied artifacts. |

Focused command: `node --test scripts/recover-partial-release.test.mjs scripts/release-registry.test.mjs scripts/publish-validated-artifacts.test.mjs`.
Release workflow CI remains a required post-PR gate; these tests do not publish.
