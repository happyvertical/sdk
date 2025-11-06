---
"@happyvertical/github-actions": patch
---

Complete dependency cascade system with auto-merge and devDependencies fix

- Fixed cascade handler to prevent .npmrc with auth token from being committed
- Added auto-merge for changesets version PRs when CI passes
- Fixed cascade handler to install devDependencies after pnpm update
- Fixed cascade dispatch to include published packages information
- Fixed cascade handler grep failure when no package.json changes occur
