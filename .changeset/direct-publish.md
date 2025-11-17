---
'@happyvertical/sdk': patch
---

feat(ci): implement direct publish on merge to main

Removes the intermediate "Version Packages" PR step to reduce CI overhead. The workflow now:
- Versions packages directly when merged to main
- Publishes immediately after versioning
- Commits version changes back to main automatically

This reduces test runs from 3 to 2 per PR while maintaining changeset-based versioning and changelog generation.
