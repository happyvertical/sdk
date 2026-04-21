---
'@happyvertical/files': patch
---

Add a shared `writeResponseToFile()` helper for streaming an existing fetch `Response` to disk with the same temp-file, metadata-preserving, and `maxBytes` safeguards used by `fetchToFile()`.
