---
"@happyvertical/github-actions": patch
---

Fix permissions in shared-merge-orchestrator to allow publishing

The shared-merge-orchestrator workflow was restricting permissions to read-only, which prevented the publish workflow from creating version PRs and publishing packages. Reusable workflows override caller permissions, so the orchestrator needs write permissions.
