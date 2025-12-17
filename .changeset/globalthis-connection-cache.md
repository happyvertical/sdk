---
"@happyvertical/sql": patch
---

fix(sql): use globalThis for connection cache to fix cross-module lost updates

The JSON adapter's `memoryConnectionCache` was a module-level Map, which caused the "lost update" bug to persist in monorepos where the same package is loaded from different paths (e.g., pnpm store vs workspace symlink). Each module instance had its own cache, so records written through one path were not visible to the other.

This fix uses `globalThis` to store the connection cache, ensuring all module instances share the same cache regardless of how they're loaded.

Fixes #678
