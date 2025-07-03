# Claude Issue Commands

Simple, powerful issue management that automatically advances issues through the complete workflow.

## Individual Issue Command

### `/issue <issue_number>`

**Claude automatically analyzes and executes the appropriate workflow action.**

This command intelligently advances issues through the workflow by detecting the current state and performing the next appropriate action:

**Workflow Progression:**
- **New Issue/No Status** → Triages (search duplicates, assess clarity, move to backlog/icebox)
- **Icebox** → Reviews relevance, moves to backlog or closes if stale
- **Backlog** → Checks Definition of Ready, requests info or moves to todo
- **To-Do** → Assigns self, creates branch, starts implementation
- **In Progress** → Implements solution or creates PR when ready
- **Code Review** → Handles feedback or merges when approved
- **Testing** → Monitors CI/CD, fixes failures or advances
- **Ready for Deploy** → Triggers deployment if automated
- **Deployed** → Monitors for issues, closes when stable

**Re-run Behavior:**
When run again on the same issue, Claude checks for new comments/feedback and acts accordingly.

## Examples

```
/issue 1    # Analyze and advance issue #1
/issue 22   # Work on issue #22
```

## Lane Commands

Process all issues assigned to you in a specific workflow stage:

### `/issues-new [notes]`
Processes all "New Issues" - performs triage, checks for duplicates, moves to backlog/icebox

### `/issues-icebox [notes]`
Processes all "Icebox" issues - reviews relevance, promotes to backlog or closes stale

### `/issues-backlog [notes]`
Processes all "Backlog" issues - applies Definition of Ready, moves ready items to "To Do"

### `/issues-todo [notes]`
Processes all "To Do" issues - creates branches, starts implementation, moves to "In Progress"

### `/issues-progress [notes]`
Processes all "In Progress" issues - continues development, creates PRs when ready

### `/issues-review [notes]`
Processes all "Review & Testing" issues - handles feedback, merges approved PRs

### `/issues-deploy [notes]`
Processes all "Ready for Deployment" issues - merges and deploys to production

### `/issues-close [notes]`
Processes all "Deployed" issues - monitors stability, closes completed work

## Notes Parameter
All lane commands accept optional notes to guide processing:
- `"all in the same pr"` - Group multiple issues in single PR
- `"prioritize security"` - Focus on security-related issues first
- `"quick triage"` - Fast processing with minimal analysis

## Setup

These commands automatically follow the workflow defined in `docs/workflow/KANBAN.md` and require:
- GitHub CLI (`gh`) authenticated
- Git repository with proper remote configuration
- Appropriate permissions to manage issues and create PRs