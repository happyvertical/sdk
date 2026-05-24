# HappyVertical Workflow Standardization

This document describes the current GitHub Actions workflow standards for SDK-managed repositories.

## Overview

The CI setup is intentionally small:

- Pull requests run validation, documentation freshness checks, tests, and docs build checks.
- Main branch merges run the test/build/publish pipeline.
- Issue lifecycle workflows only sync GitHub Projects status.
- CI does not run agentic implementation, AI triage, AI planning, Claude, Copilot, or auto-fix workflows.

## Standard Workflows

Repository workflows:

- `on-issue-opened.yml` adds a new issue to the configured GitHub Project and sets status to `New`.
- `on-issue-closed.yml` sets the configured GitHub Project status to `Done`.
- `on-merge-main.yml` runs the normal merge pipeline.
- `on-pull-request.yml` runs normal PR validation.
- `test.yml`, `build.yml`, and `publish.yml` remain repository-specific CI/release workflows.

Reusable workflows:

- `shared-project-sync.yml` performs deterministic GitHub Projects V2 sync.
- `shared-merge-orchestrator.yml`, `shared-direct-publish.yml`, and other release/build workflows support the normal CI pipeline.

## Project Sync Configuration

Project sync reads `.github/triage-config.json`. The filename is retained for compatibility, but CI only uses the project fields:

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

If project sync is disabled or required project fields are missing, the workflow logs the reason and exits without changing the project.

Project sync also requires a repository secret named `PROJECT_SYNC_TOKEN`. The default `GITHUB_TOKEN` is repository-scoped and is not sufficient for GitHub Projects V2 GraphQL updates. Use a fine-grained token or GitHub App token with access to the target project and permission to read and write project items.

## Standard Labels

The standardization script manages these label categories:

- `type:*` for bug, feature, docs, maintenance, research, and question.
- `priority:*` for critical, high, medium, low, and icebox.
- `size:*` for xs, s, m, l, and xl.
- `status:*` for blocked, help-wanted, and good-first-issue.
- `area:*` labels are repository-specific.

Agent labels are no longer part of the standard CI setup.

## Standardizing A Repository

Use the standardization script to apply labels, project config, and workflow templates:

```bash
bun scripts/standardize-repo.ts \
  --repo owner/repo \
  --path /path/to/repo \
  --description "Repository description" \
  --areas "area1,area2,area3"
```

With GitHub Projects sync:

```bash
bun scripts/standardize-repo.ts \
  --repo owner/repo \
  --path /path/to/repo \
  --description "Repository description" \
  --areas "area1,area2,area3" \
  --project-id "PVT_kwDOB9Y8ns4A8-TY" \
  --status-field-id "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY" \
  --status-new-id "3d8ca82c" \
  --status-done-id "03c76b2e"
```

`--status-new-id` and `--status-done-id` are required because the project sync workflow looks up `statusOptions["New"]` and `statusOptions["Done"]` before updating GitHub Projects V2. Get these option IDs with:

```bash
gh project field-list <project-number> --owner <owner> --format json
```

After standardization, configure `PROJECT_SYNC_TOKEN`, review the generated `.github/` changes, and test by creating and closing an issue.
