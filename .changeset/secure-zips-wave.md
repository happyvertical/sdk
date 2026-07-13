---
"@happyvertical/files": patch
---

Add a bounded, zero-decompression `inspectZipManifest()` API with normalized file and directory metadata, typed malformed/unsafe/limit/unsupported-feature failures, configurable entry and size limits, and explicit rejection of traversal paths, symlinks, NUL bytes, ZIP64, encrypted, and multi-disk archives.
