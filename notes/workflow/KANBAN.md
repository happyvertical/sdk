# Kanban Workflow System

## Overview

The HappyVertical Kanban system provides automated issue management across all organization repositories using a 6-lane board structure with AI-powered automation.

## Architecture

The system is built on three foundational packages:

```
@have/repos (Repository abstraction)
    ↓
@have/projects (Project management abstraction)
    ↓
@happyvertical/github-actions (Workflow automation)
```

This architecture provides:
- **Platform-agnostic**: Works with GitHub, GitLab, Bitbucket, Azure DevOps
- **Testable**: Mock implementations for testing
- **Maintainable**: Platform-specific code isolated in adapters
- **Reusable**: Packages can be used independently

## Board Structure

### Swim Lanes (6 lanes)

1. **New** - Newly created issues awaiting triage
2. **Backlog** - Approved issues awaiting planning (includes icebox items via labels)
3. **Planning** - Active planning with agents
4. **Ready** - Fully planned, ready to implement (manual ordering for priority)
5. **In Progress** - Active development
6. **Review** - Testing and code review (substatus shown via labels)
7. **Done** - Merged and closed

### Design Philosophy

- **Minimal lanes** for clarity and simplicity
- **Labels indicate substatus** within lanes
- **Manual ordering** in Ready lane for priority (no separate Queued lane)
- **Review lane combines** testing + code review (labels show which phase)
- **Built-in automation** handles merged PR → Done transition

## Label System

### Label Categories

#### Type Labels
- `type: bug` (red #d73a4a) - Something isn't working
- `type: feature` (blue #0075ca) - New feature or enhancement
- `type: docs` (light blue #0075ca) - Documentation improvements
- `type: maintenance` (gray #6c757d) - Maintenance and refactoring
- `type: research` (purple #a371f7) - Research and investigation
- `type: question` (pink #d876e3) - Question or discussion

#### Priority Labels
- `priority: critical` (dark red #b60205) - Critical priority, immediate attention
- `priority: high` (red #d93f0b) - High priority
- `priority: medium` (orange #fbca04) - Medium priority (default)
- `priority: low` (yellow #fef2c0) - Low priority
- `priority: icebox` (light gray #e1e4e8) - Future consideration, keep in Backlog

#### Size/Effort Labels
- `size: xs` (light green #c2e0c6) - Extra small (< 2 hours)
- `size: s` (green #7bd88f) - Small (2-4 hours)
- `size: m` (medium green #3fb950) - Medium (~1 day)
- `size: l` (dark green #2ea043) - Large (2-3 days)
- `size: xl` (darkest green #1a7f37) - Extra large (> 3 days)

#### Status Labels
- `status: blocked` (red #d73a4a) - Blocked by external dependency
- `status: help-wanted` (green #008672) - Community contributions welcome
- `status: good-first-issue` (purple #7057ff) - Good for newcomers

#### Agent Labels (Substatus)
- `agent: triage` (light blue #bfdadc) - AI triage in progress (New lane)
- `agent: planning` (light blue #bfdadc) - AI planning assistance (Planning lane)
- `agent: implementation` (light blue #bfdadc) - AI implementation (In Progress lane)
- `agent: testing` (light blue #bfdadc) - AI testing in progress (Review lane)
- `agent: review` (light blue #bfdadc) - AI code review in progress (Review lane)

#### Area Labels (Repository-specific)
Examples - customize per repository:
- `area: core` (yellow #fbca04) - Core functionality
- `area: api` (yellow #fbca04) - API-related
- `area: ui` (yellow #fbca04) - User interface
- `area: cli` (yellow #fbca04) - Command-line interface
- `area: docs` (yellow #fbca04) - Documentation
- `area: infra` (yellow #fbca04) - Infrastructure and deployment
- `area: tests` (yellow #fbca04) - Testing infrastructure

## Workflow Stages

### 1. New → Backlog (Triage)

**Trigger**: New issue created

**Automated Process**:
1. Apply `agent: triage` label immediately
2. AI analyzes issue:
   - Determines type (bug, feature, docs, maintenance, research, question)
   - Assigns priority (critical, high, medium, low, icebox)
   - Estimates size/effort (xs, s, m, l, xl)
   - Identifies affected packages
3. Search for duplicate issues
4. Apply type, priority, size labels
5. Apply `priority: icebox` if low priority/future consideration
6. Post triage summary comment with reasoning
7. Remove `agent: triage` label
8. Move to Backlog status

**Configuration Variables**:
```yaml
REPO_DESCRIPTION: "SDK monorepo for building vertical AI agents"
PACKAGE_PATTERN: "@happyvertical/*"
PACKAGE_EXAMPLES: "@happyvertical/ai,@happyvertical/sql,@happyvertical/files"
PROJECT_ENABLED: "true"
PROJECT_ID: "PVT_kwDOB9Y8ns4A8-TY"
STATUS_FIELD_ID: "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY"
STATUS_OPTIONS: >
  {
    "New": "option-id-1",
    "Backlog": "option-id-2",
    "Planning": "option-id-3",
    "Ready": "option-id-4",
    "In Progress": "option-id-5",
    "Review": "option-id-6",
    "Done": "option-id-7"
  }
```

### 2. Backlog → Planning → Ready (Planning)

**Trigger**: User drags issue to Planning (manual)

**Start Planning** (automatic):
1. Apply `agent: planning` label
2. AI analyzes requirements and generates implementation plan:
   - Summary of what needs to be done
   - Step-by-step task breakdown
   - Complexity assessment (simple, moderate, complex)
   - Technical considerations
   - Files likely to be affected
   - Dependencies or blockers
3. Post plan as comment

**Iteration Phase** (manual):
- User and agent discuss in comments
- Agent updates plan based on feedback
- Iterate until plan is solid

**Complete Planning** (manual trigger):
1. Validate Definition of Ready:
   - ✓ Clear, actionable description (> 50 chars)
   - ✓ Type label applied
   - ✓ Priority label applied
   - ✓ Size label applied
   - ✓ Implementation plan documented
   - ✓ No blocking dependencies
2. Post Definition of Ready checklist
3. If all criteria met:
   - Remove `agent: planning` label
   - Move to Ready status
4. If criteria not met:
   - Keep in Planning with feedback

**Manual Workflow Commands**:
```bash
# Start planning
gh workflow run planning.yml -f issue_number=352 -f action=start

# Complete planning (after iteration)
gh workflow run planning.yml -f issue_number=352 -f action=complete
```

### 3. Ready (Queue Management)

**Manual Operation**: Drag issues to reorder priority

**Process**:
- Issues in Ready are manually ordered by business priority
- Top of list = highest priority
- Developers/agents pull from top when available
- No separate "Queued" lane - use manual ordering

### 4. Ready → In Progress (Implementation)

**Trigger**: Developer or agent starts work (manual)

**Process**:
1. Assign self to issue
2. Apply `agent: implementation` label (if agent working)
3. Move to In Progress status
4. Create feature branch following naming convention
5. Implement solution according to plan
6. Post progress updates in comments
7. Write/update tests
8. Update documentation
9. Complete implementation
10. Remove `agent: implementation` label
11. Create pull request
12. Move to Review status

### 5. Review → Done (Testing & Review)

**Trigger**: Issue moved to Review (automatic when PR created or manual)

**Testing Phase**:
1. Apply `agent: testing` label
2. Run test suite automatically via CI/CD
3. Post coverage report as comment
4. If tests fail:
   - Comment with failure details
   - Move back to In Progress
5. If tests pass:
   - Remove `agent: testing` label
   - Proceed to review phase

**Review Phase**:
1. Apply `agent: review` label
2. AI code review checks:
   - Code quality and patterns
   - Security vulnerabilities
   - Documentation completeness
   - Test coverage
3. Post review comments
4. Human review (optional but recommended)
5. If changes needed:
   - Agent or developer addresses feedback
   - Re-run tests
   - Update review
6. If approved:
   - Remove `agent: review` label
   - Approve PR
   - Merge to main

**Completion** (automatic):
- PR merged → Built-in GitHub Projects automation moves to Done
- Issue auto-closed via PR merge

## Definition of Ready

Before moving from Planning to Ready, issues must meet ALL criteria:

- [ ] **Clear Description**: Actionable description with sufficient detail (> 50 chars)
- [ ] **Type Label**: Has type label (bug, feature, docs, maintenance, research, question)
- [ ] **Priority Label**: Has priority label (critical, high, medium, low, icebox)
- [ ] **Size Label**: Has size/effort estimate (xs, s, m, l, xl)
- [ ] **Implementation Plan**: Documented plan exists in comments
- [ ] **No Blockers**: Not blocked by external dependencies (no `status: blocked` label)

## Setup Instructions

### 1. Install GitHub Actions Package

```bash
pnpm add -D @happyvertical/github-actions
```

### 2. Apply Standard Labels

Use the CLI tool to apply standard labels to all repositories:

```bash
# Dry run first to preview changes
npx github-actions labels --owner happyvertical --repo sdk --dry-run

# Apply standard labels
npx github-actions labels --owner happyvertical --repo sdk

# Include custom area labels
npx github-actions labels --owner happyvertical --repo sdk \
  --include-area \
  --area core \
  --area api \
  --area ui \
  --area cli
```

Repeat for all repositories: sdk, smrt, caelus, praeco, bentleyalberta.com

### 3. Create GitHub Project

1. Navigate to GitHub Organization → Projects
2. Create new Project (Board view)
3. Configure 6 status columns using single-select field:
   - **New**
   - **Backlog**
   - **Planning**
   - **Ready**
   - **In Progress**
   - **Review**
   - **Done**

4. Get Project Node ID:
```bash
gh api graphql -f query='
  query {
    organization(login: "happyvertical") {
      projectV2(number: 1) {
        id
      }
    }
  }
'
```

5. Get Status Field ID and Option IDs:
```bash
gh api graphql -f query='
  query {
    node(id: "PVT_xxx") {
      ... on ProjectV2 {
        fields(first: 20) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
'
```

Look for the "Status" field and note:
- Field ID (starts with `PVTSSF_`)
- Option IDs for each status value

### 4. Configure Repository Variables

In each repository, go to Settings → Secrets and variables → Actions → Variables:

```
REPO_DESCRIPTION = "Brief description of repository for AI context"
PACKAGE_PATTERN = "@happyvertical/*"
PACKAGE_EXAMPLES = "@happyvertical/ai,@happyvertical/sql,@happyvertical/files"
PROJECT_ENABLED = "true"
PROJECT_ID = "PVT_kwDOB9Y8ns4A8-TY"
STATUS_FIELD_ID = "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY"
STATUS_OPTIONS = {"New":"id1","Backlog":"id2","Planning":"id3","Ready":"id4","In Progress":"id5","Review":"id6","Done":"id7"}
```

### 5. Add Workflow Files

Create `.github/workflows/triage.yml`:

```yaml
name: Issue Triage

on:
  issues:
    types: [opened]

permissions:
  issues: write
  contents: read

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '24'

      - run: npm install -g @happyvertical/github-actions

      - name: Triage Issue
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
          ISSUE_NUMBER: ${{ github.event.issue.number }}
          ISSUE_TITLE: ${{ github.event.issue.title }}
          ISSUE_BODY: ${{ github.event.issue.body }}
          ISSUE_AUTHOR: ${{ github.event.issue.user.login }}
          CONFIG: |
            {
              "repoDescription": "${{ vars.REPO_DESCRIPTION }}",
              "packagePattern": "${{ vars.PACKAGE_PATTERN }}",
              "packageExamples": "${{ vars.PACKAGE_EXAMPLES }}".split(","),
              "projectEnabled": true,
              "projectId": "${{ vars.PROJECT_ID }}",
              "statusFieldId": "${{ vars.STATUS_FIELD_ID }}",
              "statusOptions": ${{ vars.STATUS_OPTIONS }}
            }
        run: github-actions triage
```

Create `.github/workflows/planning.yml`:

```yaml
name: Planning Workflow

on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number'
        required: true
        type: number
      action:
        description: 'Action (start/complete)'
        required: true
        type: choice
        options:
          - start
          - complete

permissions:
  issues: write
  contents: read

jobs:
  planning:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '24'

      - run: npm install -g @happyvertical/github-actions

      - name: Planning Workflow
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ACTION: ${{ inputs.action }}
          ISSUE_NUMBER: ${{ inputs.issue_number }}
        run: |
          # TODO: Implement planning CLI command
          echo "Planning workflow for issue $ISSUE_NUMBER with action $ACTION"
```

### 6. Test Automation

1. Create a test issue in the repository
2. Verify triage automation runs within 1 minute
3. Check that labels are applied correctly
4. Verify issue moves to Backlog status
5. Manually move to Planning and test planning workflow

## Manual Operations

### Apply Labels to All Repositories

```bash
#!/bin/bash
# apply-labels.sh

REPOS=("sdk" "smrt" "caelus" "praeco" "bentleyalberta.com")

for repo in "${REPOS[@]}"; do
  echo "Applying labels to $repo..."
  npx github-actions labels \
    --owner happyvertical \
    --repo "$repo" \
    --include-area \
    --area core \
    --area api \
    --area ui
done
```

### Start Planning for Issue

```bash
gh workflow run planning.yml \
  --repo happyvertical/sdk \
  -f issue_number=352 \
  -f action=start
```

### Complete Planning for Issue

```bash
gh workflow run planning.yml \
  --repo happyvertical/sdk \
  -f issue_number=352 \
  -f action=complete
```

## Best Practices

### For Users

1. **New Issues**: Let triage automation complete first
2. **Backlog**: Review icebox items quarterly
3. **Planning**: Engage with agent, provide clear feedback
4. **Ready Queue**: Manually order by business priority (drag to reorder)
5. **Implementation**: Assign yourself before starting work
6. **Review**: Review AI suggestions, provide human oversight for critical changes

### For Agents

1. **Triage**: Be thorough, search for duplicates, provide reasoning
2. **Planning**: Ask clarifying questions, create detailed plans
3. **Implementation**: Follow plan, post updates, write tests
4. **Testing**: Run full test suite, check coverage
5. **Review**: Focus on security, patterns, quality, documentation

### For Repository Maintainers

1. **Configuration**: Keep repository variables current
2. **Labels**: Maintain standard labels across repos
3. **Projects**: Keep project boards clean and organized
4. **Workflows**: Monitor automation, fix issues promptly
5. **Documentation**: Update process docs as workflow evolves

## Troubleshooting

### Triage Automation Not Running

**Check**:
- Workflow file exists: `.github/workflows/triage.yml`
- Repository variables are set correctly
- GitHub Actions is enabled for repository
- Token has required permissions (issues: write)

**Debug**:
```bash
# View action logs
gh run list --workflow=triage.yml --limit 5
gh run view <run-id> --log
```

### Labels Not Applied

**Check**:
- Labels exist in repository (run label sync)
- Action has permission to write labels
- No typos in label names

**Fix**:
```bash
# Re-apply standard labels
npx github-actions labels --owner happyvertical --repo sdk
```

### Project Not Updating

**Check**:
- PROJECT_ID is correct node ID (starts with `PVT_`)
- STATUS_FIELD_ID is correct (starts with `PVTSSF_`)
- STATUS_OPTIONS JSON is valid
- Token has `project` write scope
- Issue is actually in the project

**Debug**:
```bash
# Verify project configuration
gh api graphql -f query='
  query {
    node(id: "PVT_xxx") {
      ... on ProjectV2 {
        title
        fields(first: 20) {
          nodes {
            ... on ProjectV2SingleSelectField {
              name
              options { name id }
            }
          }
        }
      }
    }
  }
'
```

### Planning Workflow Stuck

**Check Definition of Ready**:
- Issue has clear description
- All required labels applied
- Implementation plan documented in comments
- No `status: blocked` label

**Manual Override**:
```bash
# Manually move to Ready
gh api graphql -f query='
  mutation {
    updateProjectV2ItemFieldValue(input: {
      projectId: "PVT_xxx"
      itemId: "ITEM_ID"
      fieldId: "FIELD_ID"
      value: { singleSelectOptionId: "READY_OPTION_ID" }
    }) {
      projectV2Item { id }
    }
  }
'
```

## Migration from Previous Workflow

If migrating from 8-lane or other workflow:

1. **Map Old Statuses** to new 6-lane structure:
   - Fresh → New
   - Icebox → Backlog (with `priority: icebox` label)
   - Backlog → Backlog
   - To Do → Ready
   - Developing → In Progress
   - Quality Assurance → Review
   - Deploying → Review (or Done if already deployed)
   - Done → Done

2. **Update Labels**:
   - Run label sync to add new standard labels
   - Map old labels to new standard (see `LABEL_MIGRATIONS` in code)

3. **Update Project Board**:
   - Create new 6-column board or reconfigure existing
   - Archive old status values not in use

4. **Train Team**:
   - Share this documentation
   - Run through example workflow
   - Update internal SOPs

## Package Documentation

For detailed API documentation:
- [@have/repos](../../packages/repos/README.md) - Repository abstraction
- [@have/projects](../../packages/projects/README.md) - Project management abstraction
- [@happyvertical/github-actions](../../packages/github-actions/README.md) - Workflow automation

## References

- [GitHub Projects API](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
- [GitHub Actions](https://docs.github.com/en/actions)
- [Definition of Ready](./DEFINITION_OF_READY.md)
- [Definition of Done](./DEFINITION_OF_DONE.md)
- [Workflow Standards](./WORKFLOW.md)
