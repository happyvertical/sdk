---
'@happyvertical/utils': patch
---

fix(ci): remove GITHUB_TOKEN from reusable workflow secrets

Remove GITHUB_TOKEN from shared-direct-publish.yml secrets since it's a
reserved system secret that's automatically available. This fixes workflow
failures with "secret name collision" errors.
