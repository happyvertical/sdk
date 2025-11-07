# Project Migration Quickstart

## TL;DR - Commands to Run

```bash
# 1. Create GitHub token with project scopes
# Go to: https://github.com/settings/tokens
# Create token with: read:project, project, repo

# 2. Set token
export GITHUB_TOKEN="ghp_your_token_here"

# 3. Navigate to github-actions package
cd packages/github-actions

# 4. Create new status options in project (do this in GitHub UI)
# Go to: https://github.com/orgs/happyvertical/projects/7
# Settings → Status field → Add options:
#   - New
#   - Planning

# 5. Run dry run
npm run migrate -- --org happyvertical --project 7 --dry-run

# 6. Execute migration
npm run migrate -- --org happyvertical --project 7

# 7. Apply labels to sdk repo
npx github-actions labels --owner happyvertical --repo sdk

# 8. Get status option IDs from migration output, then set variables
gh variable set PROJECT_ID --body "PVT_xxx" --repo happyvertical/sdk
gh variable set STATUS_FIELD_ID --body "PVTSSF_xxx" --repo happyvertical/sdk
gh variable set STATUS_OPTIONS --body '{...json...}' --repo happyvertical/sdk

# 9. Copy workflow files
cp workflows/triage.yml ../../.github/workflows/
cp workflows/planning.yml ../../.github/workflows/

# 10. Test by creating a new issue
```

## What This Does

1. **Migrates** your existing project board from 8 lanes to 6 lanes
2. **Maps** old statuses to new ones:
   - Fresh → New
   - Icebox → Backlog (+ priority: icebox label)
   - Backlog → Backlog
   - To Do → Ready
   - Developing → In Progress
   - Quality Assurance → Review
   - Deploying → Review
   - Done → Done

3. **Sets up** automation workflows for:
   - Automatic issue triage (type, priority, size labels)
   - AI-powered planning with Definition of Ready validation
   - Status updates and project board integration

## Detailed Instructions

See [MIGRATION.md](./MIGRATION.md) for complete step-by-step instructions with troubleshooting.

## Expected Timeline

- Step 1-2 (Token setup): 2 minutes
- Step 4 (Create status options): 2 minutes
- Step 5 (Dry run): 1 minute
- Step 6 (Migration): 2-5 minutes (depends on number of items)
- Step 7 (Labels): 1 minute per repository
- Step 8 (Variables): 3 minutes
- Step 9 (Workflows): 1 minute
- Step 10 (Testing): 2 minutes

**Total: ~15-20 minutes**

## What You'll Get

After migration, you'll have:

- ✅ 6-lane kanban board (New → Backlog → Planning → Ready → In Progress → Review → Done)
- ✅ Automated issue triage with AI analysis
- ✅ Planning workflow with Definition of Ready validation
- ✅ Standardized label system across repositories
- ✅ Project board automation triggered by issue events

## Next Steps After Migration

1. Review migrated items in project board
2. Test automation by creating a new issue
3. Document any custom area labels for your team
4. Optionally archive old unused status options
5. Roll out to other repositories in the organization

## Need Help?

- **Full documentation**: [MIGRATION.md](./MIGRATION.md)
- **Kanban system docs**: [KANBAN.md](../notes/workflow/KANBAN.md)
- **Issues**: https://github.com/happyvertical/sdk/issues
