---
"@happyvertical/email": minor
---

Add protocol-neutral triage write-back (`updateFlags`, `updateLabels`, `archive`, `markSpam`, `createDraft`/`updateDraft`/`deleteDraft`, `listIdentities`, `WriteBackCapabilities`) implemented for JMAP, and JMAP `send()` through `EmailSubmission/set` with identity selection, draft-then-submit and sent-copy. Sending is refused unless the From address belongs to an account identity.
