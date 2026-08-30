---
'@happyvertical/sql': minor
---

Add a portable, case-sensitive `contains` WHERE operator for literal text
substrings. `like` now emits an explicit backslash escape character on every
adapter while preserving `%` and `_` as pattern wildcards.
