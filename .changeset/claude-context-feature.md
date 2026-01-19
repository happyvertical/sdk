---
"@happyvertical/accounting": minor
"@happyvertical/ai": minor
"@happyvertical/analytics": minor
"@happyvertical/auth": minor
"@happyvertical/cache": minor
"@happyvertical/documents": minor
"@happyvertical/email": minor
"@happyvertical/encryption": minor
"@happyvertical/files": minor
"@happyvertical/geo": minor
"@happyvertical/github-actions": minor
"@happyvertical/graphql": minor
"@happyvertical/images": minor
"@happyvertical/jobs": minor
"@happyvertical/languages": minor
"@happyvertical/logger": minor
"@happyvertical/projects": minor
"@happyvertical/repos": minor
"@happyvertical/sdk-mcp": minor
"@happyvertical/secrets": minor
"@happyvertical/sql": minor
"@happyvertical/translator": minor
"@happyvertical/utils": minor
"@happyvertical/weather": minor
---

Add Claude Code context installation CLI for each package

Each SDK package now ships with Claude Code context files that can be installed into downstream projects:

- **CLI command**: Run `npx have-{pkgname}-context` (e.g., `npx have-ai-context`)
- **CLAUDE.md**: Full documentation for AI-assisted development
- **.claude-meta.json**: Concise metadata with key exports, patterns, and pitfalls

Files are installed to the downstream project's `.claude/` directory as `have-{pkgname}.md` and `have-{pkgname}.meta.json`.
