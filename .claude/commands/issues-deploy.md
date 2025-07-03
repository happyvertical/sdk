---
name: issues-deploy
description: Process all issues in "Ready for Deployment" status assigned to me
usage: /issues-deploy [notes]
---

# Ready for Deployment Lane Command

Processes all issues in the "Ready for Deployment" status that are assigned to the current user.

## Usage
```
/issues-deploy
/issues-deploy "merge and deploy"
```

## Description
This command:
1. Finds all issues in "Ready for Deployment" status assigned to you
2. Runs `/issue` command on each one
3. Validates deployment readiness
4. Merges approved PRs
5. Moves to "Deployed" status after successful deployment

## Behavior
- Final validation before merge
- Merges approved PRs
- Monitors deployment process
- Updates status to "Deployed"
- Handles any deployment issues

## Notes Parameter
Optional notes guide how to process the issues:
- "merge and deploy" - Execute the deployment process
- "validate deployment" - Check deployment success
- "rollback if needed" - Monitor for issues requiring rollback
- "batch deploy" - Deploy multiple changes together

## Example
```
/issues-deploy "deploy to production"
```