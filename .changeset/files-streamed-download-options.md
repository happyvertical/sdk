---
'@happyvertical/files': patch
---

Add streamed `fetchToFile()` options for timeout, request headers, and transport `maxBytes` so large document downloads can stay out of application-level PDF handling logic. The fetch helpers now also reject non-2xx responses consistently across text, JSON, buffer, and file downloads.
