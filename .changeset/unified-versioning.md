---
"@happyvertical/ai": patch
"@happyvertical/cache": patch
"@happyvertical/documents": patch
"@happyvertical/encryption": patch
"@happyvertical/files": patch
"@happyvertical/geo": patch
"@happyvertical/github-actions": patch
"@happyvertical/logger": patch
"@happyvertical/messages": patch
"@happyvertical/ocr": patch
"@happyvertical/pdf": patch
"@happyvertical/projects": patch
"@happyvertical/repos": patch
"@happyvertical/sdk-mcp": patch
"@happyvertical/spider": patch
"@happyvertical/sql": patch
"@happyvertical/translator": patch
"@happyvertical/utils": patch
"@happyvertical/weather": patch
---

Enable fixed versioning for all @happyvertical packages

All packages in the SDK monorepo now share the same version number. This simplifies version management and makes it easier to understand which packages work together.

**Changes:**
- Updated `.changeset/config.json` to enable fixed versioning for all `@happyvertical/*` packages
- All packages will now be bumped together to the same version
- Future changesets will automatically synchronize versions across all packages

**Migration:**
- All packages will be synchronized to the same version on the next release
- The root `package.json` version will be kept in sync with all packages
