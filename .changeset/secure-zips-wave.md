---
"@happyvertical/files": patch
---

Add a bounded, zero-decompression `inspectZipManifest()` API with normalized file and directory metadata, typed malformed/unsafe/limit/unsupported-feature failures, configurable entry and size limits, and explicit rejection of traversal paths, symlinks, NUL bytes, non-portable Windows names, path aliases, alternate filename encodings, creator-OS metadata conflicts, unverifiable compressed data descriptors, hidden local entries, ZIP64, encrypted, and multi-disk archives while preserving leading UTF-8 BOMs in inspected names.
