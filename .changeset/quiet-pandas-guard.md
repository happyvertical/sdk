---
'@happyvertical/secrets': minor
---

Add provider-neutral fail-closed credential custody orchestration with explicit
ephemeral and durable modes, opaque secret material, attributable non-secret
receipts, rotation and reconciliation history, bounded environment injection,
bounded child-process injection and cleanup, structured errors, and token
redaction. Receipts carry required Ed25519 attestations bound to the submitted
credential and complete canonical custody locator.
Issuance also requires a staged prepare/commit/abort finalizer with a durable
recovery identity, keeping downstream activation inside the rollback boundary.
