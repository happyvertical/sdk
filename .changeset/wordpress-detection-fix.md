---
"@happyvertical/spider": patch
---

Add regression tests for WordPress Download Manager detection in vitest

Fixes #449 - Ensures WordPress PDF link detection works consistently in both standalone Node and vitest environments. The fix from #441 (commit 6d6a5d06) resolved this issue by adding defensive checks to prevent infinite loops when WordPress URLs return HTML.

Changes:
- Add comprehensive integration tests (`wordpress-detection.spec.ts`)
- Test WordPress detection with multiple spider strategies (simple, dom)
- Verify WordPress URLs are correctly extracted with `wpdmdl` parameter
- Ensure infinite loop prevention works correctly
