---
'@happyvertical/utils': patch
'@happyvertical/email': patch
---

Cut cold-start import cost. `@happyvertical/utils` now imports `date-fns` by subpath instead of the barrel, which linked ~300 modules (~330 ms) on every fresh Node process for every package that depends on utils. `@happyvertical/email` loads `googleapis` on first Gmail connect instead of at module scope (~215 ms).
