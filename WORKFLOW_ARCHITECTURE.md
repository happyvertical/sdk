# HappyVertical Standard Workflow Architecture

## Overview

This document defines the standard workflow architecture for all HappyVertical repositories. All workflows follow consistent naming conventions, use reusable patterns, and are maintained centrally in the SDK repository.

## Design Principles

1. **Centralized Logic**: All workflow logic lives in reusable workflows in the SDK
2. **Simple Callers**: Repository workflows are lightweight callers (20-30 lines)
3. **Event-Based Naming**: Workflows named `on-[event].yml` for clarity
4. **Consistent Patterns**: All repositories use identical workflow structure
5. **Easy Updates**: Update workflow logic once, applies everywhere automatically

## Workflow Naming Conventions

### Repository Workflows (Callers)
Located in each repository's `.github/workflows/` directory:

- `on-issue-opened.yml` - When an issue is created
- `on-label-changed.yml` - When a label is added or removed
- `on-issue-closed.yml` - When an issue is closed
- `on-pr-opened.yml` - When a PR is created
- `on-pr-labeled.yml` - When a PR is labeled
- `on-pr-merged.yml` - When a PR is merged
- `on-push-main.yml` - When code is pushed to main

### Reusable Workflows (Library)
Located in SDK's `.github/workflows/` directory:

- `triage-reusable.yml` - Issue triage logic
- `label-handler-reusable.yml` - Label change handling
- `agent-orchestrator-reusable.yml` - Agentic coder orchestration
- `issue-closer-reusable.yml` - Issue closing automation
- `pr-handler-reusable.yml` - Pull request automation
- `merge-handler-reusable.yml` - Post-merge automation

### Workflow Templates (Copy to Repos)
Located in SDK's `.github/workflows/` directory:

- `on-issue-opened-template.yml` → `on-issue-opened.yml`
- `on-label-changed-template.yml` → `on-label-changed.yml`
- etc.

## Standard Workflow Set

Every HappyVertical repository should have these workflows:

### Core Workflows (Required)

#### 1. Issue Opened (`on-issue-opened.yml`)
**Triggers**: `issues.opened`
**Purpose**: Automated triage when issues are created
**Reusable**: `triage-reusable.yml`
**Actions**:
- Add issue to project board with "New" status
- Apply `agent: triage` label
- AI-powered label suggestions
- Initial issue validation

#### 2. Label Changed (`on-label-changed.yml`)
**Triggers**: `issues.labeled`, `issues.unlabeled`
**Purpose**: React to label changes and maintain consistency
**Reusable**: `label-handler-reusable.yml`
**Actions**:
- Sync labels with project board status
- Enforce label rules (one priority, one size, one type)
- Trigger agent orchestration based on agent labels
- Update issue fields based on labels

#### 3. Issue Closed (`on-issue-closed.yml`)
**Triggers**: `issues.closed`
**Purpose**: Clean up and finalize closed issues
**Reusable**: `issue-closer-reusable.yml`
**Actions**:
- Move to "Done" lane in project board
- Remove agent labels
- Update metrics
- Trigger post-issue cleanup

### Agent Orchestration Workflows

#### 4. Agent Labels
**Purpose**: Control which agentic coders work on issues
**Labels**:
- `claude` - Claude Code should work on this issue
- `cursor` - Cursor AI should work on this issue (future)
- `copilot` - GitHub Copilot should work on this issue (future)
- `manual` - Human developer only, no AI assistance

**Behavior**:
When agent label added:
- Validate issue is in correct state (Ready, In Progress)
- Create agent assignment comment
- Update project board status
- Notify relevant systems

When agent label removed:
- Remove assignment
- Add comment explaining removal
- Update status

### Optional Workflows

#### 5. PR Opened (`on-pr-opened.yml`)
**Triggers**: `pull_request.opened`
**Purpose**: Automated PR handling
**Actions**:
- Link to related issues
- Apply PR labels
- Add to project board
- Request reviewers

#### 6. PR Merged (`on-pr-merged.yml`)
**Triggers**: `pull_request.closed` (if merged)
**Purpose**: Post-merge automation
**Actions**:
- Close linked issues
- Update project board
- Trigger downstream workflows
- Update documentation

## Label-Based Automation

### Agent Labels

#### Claude Label (`claude`)
**Color**: `0E8A16` (green)
**Description**: Claude Code is assigned to work on this issue

**Workflow Logic**:
```yaml
on:
  issues:
    types: [labeled, unlabeled]

jobs:
  handle-agent-label:
    if: github.event.label.name == 'claude' || (github.event.action == 'unlabeled' && github.event.label.name == 'claude')
    uses: happyvertical/sdk/.github/workflows/agent-orchestrator-reusable.yml@main
    with:
      agent: claude
      action: ${{ github.event.action }}
      issue_number: ${{ github.event.issue.number }}
      # ... other params
```

**Actions on Add**:
1. Validate issue is ready for work
2. Check issue has required labels (type, priority, size)
3. Move to "In Progress" if in "Ready"
4. Add comment: "🤖 Claude Code has been assigned to this issue"
5. Update project board

**Actions on Remove**:
1. Add comment: "🤖 Claude Code has been unassigned from this issue"
2. Keep issue in current lane (don't move back)
3. Update project board

### Status Labels → Project Board Sync

When status-related labels change, automatically update project board:

| Label Added | Project Status |
|-------------|----------------|
| `agent: planning` | → Planning |
| `agent: implementation` | → In Progress |
| `agent: review` | → Review |
| `status: blocked` | → Add blocked indicator |

### Label Enforcement Rules

**One Label Per Category**:
- Only one `priority:*` label allowed
- Only one `size:*` label allowed
- Only one `type:*` label allowed
- Multiple `area:*` labels allowed
- Multiple `agent:*` labels allowed (for now)

**Automatic Cleanup**:
When new label in category added → remove old label in same category

## Workflow Library Structure

```
sdk/.github/workflows/
├── # Reusable Workflows (Library)
├── triage-reusable.yml
├── label-handler-reusable.yml
├── agent-orchestrator-reusable.yml
├── issue-closer-reusable.yml
├── pr-handler-reusable.yml
├── merge-handler-reusable.yml
│
├── # Templates (Copied to Repos)
├── on-issue-opened-template.yml
├── on-label-changed-template.yml
├── on-issue-closed-template.yml
├── on-pr-opened-template.yml
├── on-pr-merged-template.yml
│
├── # SDK's Own Workflows
├── on-issue-opened.yml
├── on-label-changed.yml
└── on-issue-closed.yml
```

## Repository Workflow Structure

```
repo/.github/workflows/
├── on-issue-opened.yml      # Calls triage-reusable.yml
├── on-label-changed.yml     # Calls label-handler-reusable.yml
├── on-issue-closed.yml      # Calls issue-closer-reusable.yml
└── [other repo-specific workflows]
```

## Deployment Strategy

### Initial Rollout

1. **Create reusable workflows in SDK**
   - Implement core logic
   - Test thoroughly
   - Document inputs/outputs

2. **Create workflow templates**
   - Simple callers for each event
   - Standardized naming
   - Minimal customization needed

3. **Update standardization script**
   - Copy all standard workflows
   - Create required labels
   - Configure project integration

4. **Deploy to repositories**
   - Run standardization script
   - Test workflows
   - Document any repo-specific configs

### Updating Workflows

**To update logic**:
1. Edit reusable workflow in SDK
2. Commit and push to `main`
3. All repos automatically use new version

**To add new workflow**:
1. Create reusable workflow in SDK
2. Create template caller
3. Update standardization script
4. Run script on all repos

## Agent Orchestration Architecture

### Current State
- Single `claude` label triggers Claude Code assignment
- Manual addition/removal by users

### Future State (Extensible)
- Multiple agent labels: `claude`, `cursor`, `copilot`
- Agent preference per repository
- Agent assignment based on issue type/size
- Multi-agent collaboration (one issue, multiple agents)
- Agent hand-off workflows

### Integration Points

**Issue Creation**:
```
Issue Created → Triage → Labels Applied → Agent Auto-Assigned (Optional)
```

**Issue Ready**:
```
Issue in "Ready" → User adds `claude` label → Agent notified → Moves to "In Progress"
```

**Issue Completion**:
```
PR Merged → Issue Closed → Agent label removed → Moved to "Done"
```

## Configuration

### Repository Config (`.github/workflow-config.json`)
```json
{
  "workflows": {
    "triage": {
      "enabled": true,
      "autoAssignAgent": false
    },
    "labelHandler": {
      "enabled": true,
      "enforceOnePerCategory": true,
      "syncProjectBoard": true
    },
    "agentOrchestration": {
      "enabled": true,
      "preferredAgent": "claude",
      "autoAssignOnReady": false
    }
  },
  "labels": {
    "agentLabels": ["claude", "cursor", "copilot"]
  }
}
```

## Metrics and Monitoring

Track workflow effectiveness:
- Time from "New" to "Ready"
- Time from "Ready" to "In Progress" (with agent)
- Time from "In Progress" to "Review"
- Agent assignment success rate
- Label consistency violations

## Future Enhancements

1. **Multi-Agent Orchestration**
   - Parallel work on different aspects
   - Agent specialization by area
   - Hand-off between agents

2. **Advanced Label Logic**
   - Dependency labels (blocked-by)
   - Milestone labels
   - Customer labels

3. **Workflow Analytics**
   - Cycle time dashboards
   - Agent effectiveness metrics
   - Bottleneck identification

4. **Integration Workflows**
   - Slack notifications
   - Email alerts
   - External system webhooks

## Related Documentation

- [WORKFLOW_SETUP.md](./WORKFLOW_SETUP.md) - Current triage setup
- [Kanban Process](./notes/workflow/KANBAN.md) - Kanban workflow
- [Label Taxonomy](./packages/github-actions/src/shared/labels.ts) - Standard labels

---

*This architecture is designed to scale as the organization grows and as new agentic coding tools emerge.*
