# Kanban Workflow System

## Overview

The HappyVertical Kanban process uses GitHub Projects for issue tracking and keeps CI automation deterministic.

Current CI behavior:

- New issues are added to the configured project with status `New`.
- Closed issues are moved to status `Done`.
- Pull requests and main-branch merges run normal validation, test, build, and publish workflows.
- CI does not run AI triage, AI planning, Claude/Copilot assignment, auto-fix, or agent review workflows.

## Board Structure

Projects use these statuses:

1. `New` - Newly created issues.
2. `Backlog` - Accepted work not currently planned.
3. `Planning` - Work being shaped manually.
4. `Ready` - Planned work ready for implementation.
5. `In Progress` - Active development.
6. `Review` - Pull request or manual review.
7. `Done` - Closed or merged work.

Only `New` and `Done` are updated by repository CI. Other status changes are manual or handled by GitHub Projects built-in automation.

## Labels

Standard labels:

- `type:*` for bug, feature, docs, maintenance, research, and question.
- `priority:*` for critical, high, medium, low, and icebox.
- `size:*` for xs, s, m, l, and xl.
- `status:*` for blocked, help-wanted, and good-first-issue.
- `area:*` labels are repository-specific.

Agent labels are no longer part of the standard CI setup.

## Project Sync

Project sync reads `.github/triage-config.json`:

```json
{
  "projectEnabled": true,
  "projectId": "PVT_kwDOB9Y8ns4A8-TY",
  "statusFieldId": "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY",
  "statusOptions": {
    "New": "3d8ca82c",
    "Done": "03c76b2e"
  }
}
```

If `projectEnabled` is false, the config is missing, or the requested status option is absent, the workflow logs the reason and exits without changing the project.

## Manual Process

- Humans assign type, priority, size, status, and area labels.
- Humans move issues between Backlog, Planning, Ready, In Progress, and Review.
- PR merge or issue close should end with the issue in `Done`.

## Related Documentation

- [Workflow setup](../../docs/WORKFLOW_SETUP.md)
- [Definition of Ready](./DEFINITION_OF_READY.md)
