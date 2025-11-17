---
'@happyvertical/spider': patch
---

Fix WordPress detection for URLs without trailing slashes (#454)

WordPress Download Manager detection now works consistently regardless of trailing slashes. URLs like `/download/meeting` and `/download/meeting/` are now both properly detected as WordPress download pages.

This fixes an issue where WordPress servers return different HTML content for URLs with and without trailing slashes, causing detection to fail for URLs without slashes.
