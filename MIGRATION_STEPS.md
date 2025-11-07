# Project Board Migration - Step-by-Step Guide

## Current State Analysis

Your project board (https://github.com/orgs/happyvertical/projects/7) currently has:
- **320 total items**
- **172 items**: No Status
- **148 items**: Deployed

**Existing status options** (can be kept or renamed):
- New Issues (rename to "New")
- Icebox (archive - use `priority: icebox` label instead)
- Backlog (keep)
- To Do (rename to "Ready")
- In Progress (keep)
- Review & Testing (rename to "Review")
- Ready for Deployment (archive - merge into Review)
- Deployed (rename to "Done")

**New status needed**:
- Planning

## Target: 6-Lane Kanban Structure

We want to migrate to:
1. **New** - Newly created issues
2. **Backlog** - Prioritized work queue
3. **Planning** - Issues being analyzed and planned
4. **Ready** - Issues that meet Definition of Ready
5. **In Progress** - Active development
6. **Review** - Code review and testing
7. **Done** - Completed and deployed

## Step 1: Rename and Add Status Options (Manual - 5 minutes)

You need to modify the status options in the GitHub UI. The GraphQL API doesn't support this operation.

1. Go to https://github.com/orgs/happyvertical/projects/7
2. Click the **⚙️ Settings** icon (top right)
3. Find the **"Status"** field in the list
4. Click to edit it

5. **Rename existing options**:
   - "New Issues" → "New"
   - "To Do" → "Ready"
   - "Review & Testing" → "Review"
   - "Deployed" → "Done"

6. **Add new option**:
   - **Planning** (color: yellow)

7. **Keep as-is** (for now):
   - Backlog
   - In Progress
   - Icebox
   - Ready for Deployment

8. After renaming, **DO NOT delete options yet** - we'll archive unused ones later

## Step 2: Get the New Status Option IDs

After creating the status options, run this command to get their IDs:

```bash
cd /Users/will/Work/happyvertical/repos/sdk

gh api graphql -f query='
{
  organization(login: "happyvertical") {
    projectV2(number: 7) {
      id
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
}' | grep -A 30 '"name":"Status"'
```

This will show you all status options and their IDs. Copy the output - you'll need it for the next steps.

## Step 3: Verify the Migration (1 minute)

After renaming "Deployed" to "Done" in Step 1, the 148 items should automatically have the "Done" status now.

Verify by running:

```bash
cd /Users/will/Work/happyvertical/repos/sdk

# This will show the status distribution
npx tsx /tmp/count-statuses.ts
```

You should see:
- No Status: 172 items
- Done: 148 items (automatically updated when you renamed "Deployed")

**No migration script needed!** Renaming a status option automatically updates all items with that status.

## Step 4: Archive Old Unused Status Options

After migration, archive these old unused statuses:
- New Issues
- Icebox
- To Do
- Review & Testing
- Ready for Deployment

**To archive**:
1. Go back to project Settings → Status field
2. For each old status:
   - Click the "..." menu next to it
   - Select "Archive option"

**Important**: Don't delete them - archiving preserves historical data while hiding from the UI.

## Step 5: Set Up Repository Variables

After you have the status option IDs from Step 2, set these variables for automation:

```bash
# Project and field IDs (get from Step 2 output)
gh variable set PROJECT_ID --body "PVT_kwDOB9Y8ns4A8-TY" --repo happyvertical/sdk
gh variable set STATUS_FIELD_ID --body "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY" --repo happyvertical/sdk

# Status options JSON (replace with actual IDs from Step 2)
gh variable set STATUS_OPTIONS --body '{
  "New": "YOUR_NEW_OPTION_ID",
  "Backlog": "80b5dd44",
  "Planning": "YOUR_PLANNING_OPTION_ID",
  "Ready": "YOUR_READY_OPTION_ID",
  "In Progress": "ce670088",
  "Review": "YOUR_REVIEW_OPTION_ID",
  "Done": "YOUR_DONE_OPTION_ID"
}' --repo happyvertical/sdk
```

## Step 6: Apply Standard Labels

Apply the kanban label system to the sdk repository:

```bash
cd /Users/will/Work/happyvertical/repos/sdk/packages/github-actions
npx github-actions labels --owner happyvertical --repo sdk
```

This adds:
- **Type labels**: `type: feature`, `type: bug`, `type: docs`, etc.
- **Priority labels**: `priority: critical`, `priority: high`, `priority: medium`, `priority: low`, `priority: icebox`
- **Size labels**: `size: xs`, `size: s`, `size: m`, `size: l`, `size: xl`
- **Status labels**: `status: blocked`, `status: needs-info`, `status: duplicate`
- **Agent labels**: `agent: triage`, `agent: planning`

## Step 7: Add Workflow Files

Copy the automation workflows to your repository:

```bash
cd /Users/will/Work/happyvertical/repos/sdk

# Copy workflow templates
cp packages/github-actions/workflows/triage.yml .github/workflows/
cp packages/github-actions/workflows/planning.yml .github/workflows/

# Commit and push
git add .github/workflows/*.yml
git commit -m "feat: add kanban automation workflows"
git push
```

## Step 8: Test the Automation

Create a test issue to verify everything works:

1. Go to https://github.com/happyvertical/sdk/issues/new
2. Create an issue with title and description
3. Wait ~30 seconds
4. Check that:
   - Issue was added to project with "New" status
   - Type, priority, and size labels were added
   - AI triage comment was added

5. Move the issue to "Planning"
6. Wait ~30 seconds
7. Check that:
   - `agent: planning` label was added
   - AI planning comment with implementation plan was added

## Expected Timeline

- **Step 1**: 5 minutes (manual UI work)
- **Step 2**: 1 minute (run command, copy output)
- **Step 3**: 2-3 minutes (script will process 148 items)
- **Step 4**: 2 minutes (archive old statuses)
- **Step 5**: 3 minutes (set variables)
- **Step 6**: 1 minute (apply labels)
- **Step 7**: 1 minute (copy workflows)
- **Step 8**: 2 minutes (test)

**Total**: ~15-20 minutes

## What You'll Get

After completing these steps:

✅ 6-lane kanban board (New → Backlog → Planning → Ready → In Progress → Review → Done)
✅ 148 items migrated from "Deployed" to "Done"
✅ 172 items with "No Status" (will be automatically triaged when worked on)
✅ Old unused statuses archived
✅ Standardized label system
✅ Automated triage workflow
✅ AI-powered planning workflow
✅ Definition of Ready validation

## Next Steps

Once everything is working:

1. Roll out to other repositories in the organization
2. Document any repository-specific area labels
3. Train team on new workflow
4. Monitor and adjust automation rules as needed

## Need Help?

- **Detailed docs**: See `packages/github-actions/scripts/MIGRATION.md`
- **Kanban system**: See `notes/workflow/KANBAN.md`
- **Issues**: https://github.com/happyvertical/sdk/issues
