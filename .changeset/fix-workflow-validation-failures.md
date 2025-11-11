---
"@happyvertical/github-actions": patch
---

Fix workflow validation failures by removing incompatible push triggers from shared workflows. GitHub Actions does not allow combining workflow_call with required inputs AND push triggers.
