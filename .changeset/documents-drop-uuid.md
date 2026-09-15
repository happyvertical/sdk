---
'@happyvertical/documents': patch
---

Replace the `uuid` dependency with `crypto.randomUUID()`; one fewer dependency and ~20 fewer modules on every cold start of `@happyvertical/documents`.
