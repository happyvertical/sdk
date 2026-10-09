---
'@happyvertical/ai': minor
---

Add a native `type: 'laya'` typed-decision provider for self-hosted `laya-serve`
servers, beside the TypeSafe/Jev provider. It maps predicate, choice and score
questions to Laya's `/v1/systemone`, sends `max_len` and a per-request
checkpoint, reports the checkpoint that answered and truncation in
`provenance.details`, and renormalizes Laya's four-decimal-rounded
distributions while keeping the raw values. `DecisionResult.provenance` gains an
optional `details` map; existing providers and capability literals are
unaffected.
