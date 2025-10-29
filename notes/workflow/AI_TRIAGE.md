# AI-Powered Issue Triage

New issues are automatically triaged using GitHub Models API to streamline the initial review process.

## Automated Triage Process

1. **Workflow Trigger**: When an issue is opened or reopened
2. **AI Analysis**: GitHub Models (GPT-4o-mini) analyzes the issue content
3. **Auto-Labeling**: Type labels applied automatically (type:bug, type:feature, etc.)
4. **Duplicate Detection**: Searches for similar existing issues
5. **Triage Comment**: Posts AI analysis with reasoning
6. **Urgent Routing**: Critical bugs/security issues move to "To Do" status automatically

## Triage Comment Format

```markdown
## 🤖 AI Triage

**Type**: `bug|feature|enhancement|tech-debt|epic|documentation|question`
**Priority**: `critical|high|medium|low`
**Urgency**: `urgent|normal`

**Affected Packages**: List of @happyvertical/ packages identified

**Analysis**: Brief explanation of the triage decision

### ⚠️ Potential Duplicates (if found)
- #123: Similar issue title
```

## Overriding AI Decisions

- Labels can be manually adjusted after triage
- Project status can be changed if AI routing is incorrect
- The triage comment serves as a starting point, not a final decision

## Workflow Files

- `.github/workflows/on-issue-opened.yml` - Workflow definition
- `.github/scripts/triage-issue.js` - Triage logic

## See Also

- [Kanban Workflow](./KANBAN.md) for complete issue lifecycle
- [Definition of Ready](./DEFINITION_OF_READY.md) for issue readiness criteria
