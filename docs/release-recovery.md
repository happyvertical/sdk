# Partial SDK release recovery

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

The reservation does nothing for later candidates or the existing committed-release
recovery path. Repeating preparation from the old base is safe while the target
remains unused. If `0.101.1` becomes partially occupied before the release commit
lands, preparation stops: investigate the artifacts and obtain another reviewed
recovery rather than changing the reservation or forcing publication ad hoc.
