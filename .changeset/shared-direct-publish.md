---
'@happyvertical/utils': patch
---

feat(ci): create shared direct publish workflow for changesets

Implements true direct publish without intermediate "Version Packages" PRs:
- New shared-direct-publish.yml reusable workflow
- Manually orchestrates changeset version + publish commands
- Commits version changes to main with [skip ci]
- Creates GitHub releases automatically
- Can be reused across all HappyVertical repositories

This eliminates the Version Packages PR workflow and reduces CI runs from 3 to 2 per feature PR cycle.
