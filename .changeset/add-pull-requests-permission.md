---
"@happyvertical/github-actions": patch
---

Add pull-requests: write permission to allow version PR creation

The changesets action needs pull-requests: write permission to create version PRs. Without it, the workflow fails with "Resource not accessible by integration" when attempting to create the PR.
