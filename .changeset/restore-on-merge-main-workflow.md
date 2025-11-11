---
"@happyvertical/github-actions": patch
---

Restore on-merge-main.yml workflow to SDK repository

The on-merge-main workflow was accidentally removed when workflows were
converted to templates for other repositories. This caused version bumping
and package publishing to stop working for SDK merges to main.

This restores the workflow to call the local shared-merge-orchestrator which
orchestrates test -> build -> publish pipeline.
