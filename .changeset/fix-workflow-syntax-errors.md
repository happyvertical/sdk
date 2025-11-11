---
"@happyvertical/github-actions": patch
---

Fix workflow syntax errors in shared-merge-orchestrator.yml and claude.yml

- Remove hashFiles() calls from shared-merge-orchestrator.yml (not available in workflow_call context)
- Simplify claude.yml prompt expression to avoid format() function issues with curly braces
