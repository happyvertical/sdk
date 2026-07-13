---
"@happyvertical/files": patch
---

Reject ZIP data descriptors for stored as well as compressed entries because zero-decompression inspection cannot verify their payload boundary.
