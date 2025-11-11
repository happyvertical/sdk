---
"@happyvertical/github-actions": patch
---

Fix permissions in on-merge-main workflow to allow publishing

The on-merge-main workflow needs write permissions for contents, packages, pages, and id-token to allow the publish job to create version PRs and publish packages.
