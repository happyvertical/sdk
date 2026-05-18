---
"@happyvertical/sql": minor
---

Fix `upsert()` for nullable conflict columns by matching `NULL` values against existing `NULL` values, with a `nullsDistinct` opt-out for native database behavior.
