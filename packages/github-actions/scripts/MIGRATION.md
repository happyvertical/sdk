# Project Board Migration Guide

This guide walks through migrating an existing GitHub Project V2 board from the old 8-lane structure to the new 6-lane kanban structure.

## Prerequisites

1. **GitHub Token with Project Scopes**

   Create a Personal Access Token (Classic) at https://github.com/settings/tokens with these scopes:
   - `read:project` - Read project data
   - `project` - Write project data
   - `repo` - Add labels to issues

   Save the token as an environment variable:
   ```bash
   export GITHUB_TOKEN="ghp_your_token_here"
   ```

2. **Node.js 24+ or Bun 1.0+**

   The migration script requires a modern JavaScript runtime.

## Migration Overview

### Old Structure (8 lanes)
- Fresh
- Icebox
- Backlog
- To Do
- Developing
- Quality Assurance
- Deploying
- Done

### New Structure (6 lanes)
- New
- Backlog
- Planning
- Ready
- In Progress
- Review
- Done

### Status Mapping

| Old Status | New Status | Notes |
|------------|------------|-------|
| Fresh | New | |
| Icebox | Backlog | Adds `priority: icebox` label |
| Backlog | Backlog | |
| To Do | Ready | |
| Developing | In Progress | |
| Quality Assurance | Review | |
| Deploying | Review | Or Done if fully deployed |
| Done | Done | |

## Step 1: Create New Status Options

Before running the migration script, you need to add the new status options to your project board.

### Option A: Using GitHub UI (Recommended)

1. Go to your project board: https://github.com/orgs/happyvertical/projects/7
2. Click the ⚙️ Settings icon (top right)
3. Find the "Status" field
4. Add these new options if they don't exist:
   - New
   - Planning

The other statuses (Backlog, Ready, In Progress, Review, Done) should already exist in some form.

### Option B: Using GraphQL API

You can also create status options programmatically. See the GraphQL query examples in `KANBAN.md` for details.

## Step 2: Run Dry Run

Before making any changes, run a dry run to see what will happen:

```bash
cd packages/github-actions
export GITHUB_TOKEN="ghp_your_token_here"
tsx scripts/migrate-project.ts --org happyvertical --project 7 --dry-run
```

This will show:
- Current project configuration
- Current status distribution
- Planned migrations
- Items that will be moved and labeled

Review the output carefully to ensure the migration plan looks correct.

## Step 3: Execute Migration

Once you're satisfied with the dry run results, execute the actual migration:

```bash
tsx scripts/migrate-project.ts --org happyvertical --project 7
```

The script will:
1. Get project and status field details
2. Load all project items
3. Migrate each item to the new status
4. Add labels where needed (e.g., `priority: icebox`)
5. Report progress and any errors

## Step 4: Post-Migration Tasks

### 1. Apply Standard Labels

Apply the standard label set to all repositories in the organization:

```bash
# For sdk repository
npx github-actions labels --owner happyvertical --repo sdk

# For other repositories
npx github-actions labels --owner happyvertical --repo <repo-name>
```

Or use the `--dry-run` flag first to preview:

```bash
npx github-actions labels --owner happyvertical --repo sdk --dry-run
```

### 2. Update Repository Variables

Each repository needs these variables configured for automation to work:

```bash
# Get the status option IDs from your project
# (The migration script outputs these)

# Set repository variables
gh variable set PROJECT_ID --body "PVT_xxx" --repo happyvertical/sdk
gh variable set STATUS_FIELD_ID --body "PVTSSF_xxx" --repo happyvertical/sdk

# Set status options as JSON
gh variable set STATUS_OPTIONS --body '{
  "New": "option_id_1",
  "Backlog": "option_id_2",
  "Planning": "option_id_3",
  "Ready": "option_id_4",
  "In Progress": "option_id_5",
  "Review": "option_id_6",
  "Done": "option_id_7"
}' --repo happyvertical/sdk
```

### 3. Add Workflow Files

Copy the workflow templates to each repository:

```bash
# From the sdk repository
cp packages/github-actions/workflows/triage.yml .github/workflows/
cp packages/github-actions/workflows/planning.yml .github/workflows/
```

Edit each workflow file to customize for your repository (e.g., repo description, package patterns).

### 4. Archive Old Status Options

Once all items are migrated, you can archive the old unused status options:

1. Go to project Settings
2. Find the Status field
3. For each old status (Fresh, Icebox, To Do, Developing, Quality Assurance, Deploying):
   - Click the "..." menu
   - Select "Archive option"

**Note**: Don't delete the options, as this may cause issues with historical data. Archiving hides them from the UI but preserves data integrity.

### 5. Test Automation

Test the automation workflows:

1. **Test Triage**:
   - Create a new issue in a repository with automation enabled
   - Wait ~30 seconds for the workflow to run
   - Check that the issue was:
     - Added to the project in "New" status
     - Labeled with type, priority, size
     - Commented with triage analysis

2. **Test Planning**:
   - Move an issue from "New" to "Planning"
   - Wait ~30 seconds for the workflow to run
   - Check that the issue received:
     - `agent: planning` label
     - Comment with implementation plan

3. **Test Ready Validation**:
   - Add comment `/ready` to an issue in Planning
   - Wait ~30 seconds
   - Check that the issue:
     - Was validated against Definition of Ready
     - Moved to "Ready" if criteria met
     - Received comment with validation results

## Troubleshooting

### Issue: "Status option not found"

**Cause**: The new status options don't exist in the project.

**Fix**: Follow Step 1 to create the missing status options.

### Issue: "Your token has not been granted the required scopes"

**Cause**: GitHub token doesn't have project scopes.

**Fix**: Create a new token with `read:project` and `project` scopes.

### Issue: "Project not found"

**Cause**: Project number is incorrect or you don't have access.

**Fix**: Verify the project number at https://github.com/orgs/happyvertical/projects

### Issue: Migration completes but items aren't visible

**Cause**: Items may be filtered in the project view.

**Fix**: Clear all filters in the project board UI.

## Rollback

If something goes wrong during migration:

1. **Manual Rollback**: You can manually move items back to their original statuses in the GitHub UI
2. **Scripted Rollback**: Create a reverse mapping and run the migration script in reverse (would need to be implemented)
3. **Restore from Backup**: GitHub doesn't provide project backups, so prevention is key (use dry run!)

## Manual Migration (Alternative)

If you prefer not to use the script, you can migrate manually:

1. Create new status options (Step 1 above)
2. In the project board, select all items with old status
3. Bulk update to new status using the project UI
4. Manually add labels where needed
5. Archive old status options

This is slower but gives you more control over the migration.

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the KANBAN.md documentation
3. File an issue at https://github.com/happyvertical/sdk/issues

## See Also

- [KANBAN.md](../notes/workflow/KANBAN.md) - Complete kanban system documentation
- [Setup Guide](../notes/workflow/KANBAN.md#setup) - Initial setup for new projects
- [Label System](../src/shared/labels.ts) - Standard label definitions
