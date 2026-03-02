# @happyvertical/github-actions

Reusable GitHub Actions utilities. No factory — direct function exports.

## Key exports

- `triageIssue()` — AI-powered issue triage (labels, duplicates, priority)
- `checkDefinitionOfReady()` — Planning validation
- Two code paths: legacy `index.ts` and v2 `index-v2.ts` (uses `@happyvertical/repos` + `@happyvertical/projects`)

## Gotchas

- v2 triage preferred over legacy
- Requires GITHUB_TOKEN with repo + project scopes
- AI provider lazy-loaded — fails if `HAVE_AI_*` env vars not set
- Duplicate detection uses embedding similarity
