---
"@happyvertical/email": minor
"@happyvertical/messages": patch
---

Add a protocol-neutral incremental change feed (`getChanges()` with an opaque resumable cursor and a typed `resync-required` result, optional `subscribeChanges()` push hints), a JMAP (RFC 8620/8621) adapter that implements it, and native thread support through `getThread()`.
