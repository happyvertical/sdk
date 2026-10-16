# Frozen QuickBooks readback verification (#1416)

Risk: high — accepting a recovered external invoice or credit ID can authorize
subsequent financial transfers. Verification itself is pure and read-only.

| Boundary | Evidence required |
| --- | --- |
| Public root API verifies the owning exact mapper payload | Public-import focused tests; package build |
| Correct realm/environment and create descriptor | Changed realm, environment, payload hash and credit source refusal |
| Frozen amount/item/tax/date/customer identity | Individually mutated provider facts refuse; exact component basis survives |
| Inclusive and discounted lines | Owning mapper's generated lines checked, no consumer arithmetic |
| Currency precision | Zero/two/three decimal original payloads verified without hardcoded scaling |
| Provider metadata | IDs, revision and reference display metadata accepted; unknown economic lines and FX/deposit semantics refuse |
| Unknown outcomes | No I/O, no absence inference, no interrupted-owner assertion; host must pull within its live authorized connection |
| Read-only provider fetch | Credit memo pull uses the encoded native GET path, rejects a mismatched provider ID; public test with injected request boundary |
| Consumer adoption | Separate TradesChief issue #298 must exercise this API in its native host proof before app delivery; not part of this SDK-only change |

Base regression: the root export does not exist before this change; a consumer
cannot verify the exact owning payload through public API. Existing frozen sync
and transfer contracts remain unchanged. Local verification does not claim live
QuickBooks sandbox certification. UI/accessibility are N/A to this pure SDK API.

Validation: 23 focused public API tests and all 343 accounting tests pass against the released transfer APIs.
Package TypeScript and build pass, including generated public declarations.
Repository CI-script tests (85), agent-context freshness, typecheck and lint pass.
Final repository build and independent exact-head review are recorded in the
external review evidence; hosted Required CI remains a post-publication gate.

Accepted round-one finding: provider-added implicit taxable bases now compare
against the owning mapper's aggregate basis. The public regression checks both
invoice and credit refusal/acceptance and unchanged create descriptor bytes.
