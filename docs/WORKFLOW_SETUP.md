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

---

# HappyVertical Workflow Standardization Guide

This document describes the standardized workflow system implemented across HappyVertical repositories to enable consistent issue management, automated triage, and kanban board tracking.

## Overview

The HappyVertical workflow system provides:
- **6-lane kanban board** for issue tracking
- **Automated triage** with AI-powered analysis
- **Standard labels** across all repositories
- **Consistent workflow** for issue lifecycle management

## Workflow Structure

### 6-Lane Kanban Board

Issues flow through these lanes:

1. **New** - Newly created issues awaiting triage
2. **Backlog** - Triaged issues awaiting planning
3. **Planning** - Active AI-assisted planning phase
4. **Ready** - Fully planned and ready for implementation
5. **In Progress** - Active development
6. **Review** - Testing and code review
7. **Done** - Merged and closed

### Standard Labels

All repositories use these label categories:

#### Type Labels (6)
- `type: bug` - Something isn't working
- `type: feature` - New feature or enhancement
- `type: docs` - Documentation improvements
- `type: maintenance` - Maintenance and refactoring
- `type: research` - Research and investigation
- `type: question` - Question or discussion

#### Priority Labels (5)
- `priority: critical` - Critical priority, needs immediate attention
- `priority: high` - High priority
- `priority: medium` - Medium priority (default)
- `priority: low` - Low priority
- `priority: icebox` - Future consideration, keep in Backlog

#### Size Labels (5)
- `size: xs` - Extra small (< 2 hours)
- `size: s` - Small (2-4 hours)
- `size: m` - Medium (~1 day)
- `size: l` - Large (2-3 days)
- `size: xl` - Extra large (> 3 days)

#### Status Labels (3)
- `status: blocked` - Blocked by external dependency
- `status: help-wanted` - Community contributions welcome
- `status: good-first-issue` - Good for newcomers

#### Agent Labels (5)
- `agent: triage` - AI triage in progress
- `agent: planning` - AI planning assistance
- `agent: implementation` - AI implementation in progress
- `agent: testing` - AI testing in progress
- `agent: review` - AI code review in progress

#### Area Labels (Repository-specific)
Each repository defines custom area labels based on its architecture:
- SDK: `area: core`, `area: ai`, `area: database`, `area: files`, etc.
- SMRT: `area: core`, `area: agents`, `area: templates`, `area: mcp`, etc.
- Praeco: `area: scraping`, `area: content`, `area: analysis`, etc.
- Caelus: `area: core`, `area: agent`, `area: ui`, `area: api`, etc.

## Automated Triage Workflow

The triage workflow uses a **reusable workflow** pattern for consistency across repositories:

**Reusable Workflow**: `happyvertical/sdk/.github/workflows/triage-reusable.yml@main`
- Contains all triage logic
- Maintained centrally in SDK repository
- Uses `@happyvertical/github-actions` package

**Repository Workflow**: `.github/workflows/triage.yml`
- Simple caller that references the reusable workflow
- Passes issue details and repository context
- Automatically copied by standardization script

**Workflow Steps**:
1. Issue is created
2. Triage workflow triggers
3. Issue is added to project board with "New" status
4. `agent: triage` label is applied
5. AI analyzes issue and suggests labels (requires 'models' permission)
6. Issue moves through workflow lanes based on labels and activity

**Benefits of Reusable Workflow**:
- **Consistency**: All repositories use identical triage logic
- **Maintainability**: Update logic once in SDK, applies everywhere
- **Simplicity**: Repository workflows are just 25 lines
- **Version Control**: Workflow updates are centralized

### Configuration

Each repository has a `.github/triage-config.json` file:

```json
{
  "repoDescription": "Repository description for AI context",
  "projectEnabled": true,
  "projectId": "PVT_kwDOB9Y8ns4A8-TY",
  "statusFieldId": "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY",
  "statusOptions": {
    "New": "3d8ca82c",
    "Backlog": "c89a2a65",
    "Planning": "7e1bd6b7",
    "Ready": "e3aa2525",
    "In Progress": "c126de7e",
    "Review": "30a150bf",
    "Done": "03c76b2e"
  }
}
```

## Standardizing a New Repository

Use the provided standardization script to apply workflow to any repository:

```bash
bun scripts/standardize-repo.ts \
  --repo owner/repo \
  --path /path/to/repo \
  --description "Repository description" \
  --areas "area1,area2,area3"
```

### With Project Board

If you have a GitHub Project board configured:

```bash
bun scripts/standardize-repo.ts \
  --repo owner/repo \
  --path /path/to/repo \
  --description "Repository description" \
  --areas "area1,area2,area3" \
  --project-id "PVT_kwDOB9Y8ns4A8-TY" \
  --status-field-id "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY"
```

### Script Actions

The standardization script:
1. Creates/updates all standard labels in the repository
2. Creates custom area labels
3. Generates `.github/triage-config.json`
4. Copies `.github/workflows/triage.yml` (caller workflow that references reusable workflow)
5. Prepares repository for automated workflow

**Note**: The copied `triage.yml` is a simple caller that references the reusable workflow in the SDK repository (`happyvertical/sdk/.github/workflows/triage-reusable.yml@main`). This means:
- All triage logic is centralized in the SDK
- Updates to triage logic automatically apply to all repositories
- Repository workflows remain simple and maintainable

### After Standardization

1. Review changes: `git status`
2. Commit: `git add .github/ && git commit -m "feat(ci): add workflow standardization"`
3. Push: `git push`
4. Test by creating an issue

## Project Board Setup

### Creating a Project Board

1. Go to GitHub organization/repository
2. Click "Projects" tab
3. Create new project (Projects V2)
4. Add "Status" field with these options:
   - New
   - Backlog
   - Planning
   - Ready
   - In Progress
   - Review
   - Done

### Getting Project IDs

Use GitHub CLI to get project and field IDs:

```bash
# List projects
gh project list --owner happyvertical

# Get project field details
gh project field-list <project-number> --owner happyvertical --format json
```

### Updating Configuration

Add IDs to `.github/triage-config.json`:

```json
{
  "projectEnabled": true,
  "projectId": "YOUR_PROJECT_ID",
  "statusFieldId": "YOUR_STATUS_FIELD_ID",
  "statusOptions": {
    "New": "option_id_1",
    "Backlog": "option_id_2",
    "Planning": "option_id_3",
    "Ready": "option_id_4",
    "In Progress": "option_id_5",
    "Review": "option_id_6",
    "Done": "option_id_7"
  }
}
```

## Enhanced AI Triage (Optional)

The default triage workflow has limited AI capabilities due to GitHub token permissions. For full AI-powered triage:

### Option 1: Personal Access Token

1. Create GitHub PAT with `models` scope
2. Add as repository secret: `TRIAGE_TOKEN`
3. Update workflow to use `secrets.TRIAGE_TOKEN`

### Option 2: GitHub App

1. Create GitHub App with `models` permission
2. Install app on organization/repository
3. Update workflow to authenticate with app

## Standardized Repositories

Current repositories with workflow standardization:

- ✅ **SDK** - TypeScript monorepo for AI agent development
- ✅ **SMRT** - SMRT framework for building AI agents
- ✅ **Praeco** - Local news agent
- ✅ **Caelus** - AI agent/application

## Maintenance

### Updating Labels

To update labels across all repositories:

```bash
# Apply labels to specific repo
bun scripts/apply-labels.ts owner/repo
```

### Updating Workflows

The reusable workflow pattern makes updates simple:

**To update triage logic**:
1. Edit `.github/workflows/triage-reusable.yml` in SDK
2. Commit and push to `main` branch
3. All repositories automatically use the updated workflow on next trigger
4. No need to update individual repositories

**To update the caller workflow template**:
1. Edit `.github/workflows/triage-template.yml` in SDK
2. Run standardization script on target repos to copy new template
3. Commit and push changes in each repository

**To update the @happyvertical/github-actions package version**:
1. Edit version in `.github/workflows/triage-reusable.yml`
2. Commit and push to `main` branch
3. All repositories automatically use the new version

### Syncing Configuration

When project board structure changes:
1. Get new field/option IDs
2. Update `.github/triage-config.json`
3. Test with new issue
4. Document changes

## Troubleshooting

### Triage Workflow Not Running

- Check workflow file exists: `.github/workflows/triage.yml`
- Verify workflow is enabled in repository settings
- Check workflow run logs for errors

### Issues Not Added to Project

- Verify `projectId` and `statusFieldId` in config
- Check project permissions
- Ensure project is linked to repository

### Labels Not Applied

- Verify labels exist in repository
- Check GitHub token permissions
- Review workflow logs for API errors

### AI Analysis Not Working

- Requires `models` permission (not in default GITHUB_TOKEN)
- Configure PAT or GitHub App for full AI capabilities
- Workflow still functions without AI (applies basic labels)

## Best Practices

1. **Consistent Labeling**: Always use standard labels for issue categorization
2. **Size Estimation**: Add size labels during planning phase
3. **Area Assignment**: Assign area labels to help routing and expertise
4. **Status Updates**: Move issues through workflow lanes as work progresses
5. **Documentation**: Update triage config when project structure changes

## Resources

- **SDK Repository**: https://github.com/happyvertical/sdk
- **Workflow Documentation**: See `/Users/will/Work/happyvertical/repos/sdk/notes/workflow/`
- **Issue Tracker**: https://github.com/happyvertical/sdk/issues
- **Standardization Script**: `/Users/will/Work/happyvertical/repos/sdk/scripts/standardize-repo.ts`

## Future Enhancements

- [ ] Automated label migration for existing issues
- [ ] Workflow automation for status transitions
- [ ] Integration with code review automation
- [ ] Analytics dashboard for workflow metrics
- [ ] Multi-repository project board views

---

*Last updated: November 2025*
*Maintained by: HappyVertical Organization*
