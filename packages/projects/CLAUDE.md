# @happyvertical/projects

Project management interface. Factory: `getProject(options): Promise<IProject>`.

## Adapters

GitHub Projects V2 (full). Jira, ZenHub, Linear are stubs (throw "not yet implemented").

## Gotchas

- `statusFieldId` and `statusOptions` (name -> option ID mapping) are required for `updateItemStatus()` but accepted as optional by factory — silent runtime failure if missing
- `ProjectItem.fields` is always empty despite type definition (fields only fetched at project level)
- `updateItemField()` hardcoded to single-select fields only — no warning for text/number/date
- Config discovery (project ID, field ID, option IDs) requires manual `gh api graphql` queries
- Status field lookup is hardcoded to field name "Status"
