# PR Workflow Command

This command follows the established workflow for managing pull requests according to the project's Kanban workflow with comprehensive CI/CD integration.

## Usage
```
/pr <pr_number>
```

## Description
Manages a pull request through the workflow stages with full CI/CD pipeline integration, GitHub Actions status monitoring, and Definition of Done validation.

## Instructions for Claude

When this command is used with a PR number:

1. **Get PR Information & CI Status**
   - Use `gh pr view <pr_number> --json state,title,body,url,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup` to get comprehensive PR details
   - **CI/CD Status Analysis**: Check GitHub Actions workflow status with `gh pr checks <pr_number>`
   - **Detailed Check Analysis**: For failing checks, use `gh run view <run_id>` to get specific failure details
   - **Test Results**: Parse test output and identify specific failing tests
   - **Conflict Detection**: Check for other open PRs on the same issue
   - **Validate PR State**: Ensure PR is in valid state for workflow progression
   - **Deployment Status**: Monitor deployment progress through GitHub Actions logs

2. **Definition of Done Validation**
   Before any status progression, validate all applicable DoD criteria:
   - **Code Quality**: Verify no linter warnings/errors with `gh pr checks <pr_number>`
   - **Testing**: Ensure all tests pass in CI pipeline
   - **Documentation**: Check if README.md updates are needed
   - **ADR Requirements**: Verify ADR creation for architectural decisions
   - **Security**: Validate no secrets are hard-coded
   - **Review Process**: Confirm peer review approval
   - **Closing Keywords**: Verify PR description includes `closes #123`, `fixes #123`, or `resolves #123`

3. **Follow Workflow Progression**
   Based on current PR state and DoD validation, update the GitHub Project Status field:
   
   - **Draft PR**: Ensure related issue has "In Progress" status
   - **Ready for Review**: Move issue to "Review & Testing" status
   - **Approved PR with passing CI**: Issue remains "Review & Testing" until merge
   - **Merged PR**: Update related issue(s) to "Deployed" status after successful deployment

4. **Update Project Board**
   - Update the Status field for associated issue(s) in the GitHub Project
   - Link PR to related issues if not already linked
   - **Issue Closing**: Ensure PR description uses closing keywords (`closes #123`, `fixes #123`, `resolves #123`) to automatically close issues when merged
   - Use GitHub's built-in automation where possible

5. **Comprehensive CI/CD Integration**
   - **GitHub Actions Status**: Use `gh pr checks <pr_number>` to get detailed check status
   - **Workflow Analysis**: Parse workflow results from `on-merged-master.yaml`, `claude.yaml`, and `on-pr-master-dependabot.yml`
   - **Build Status**: Monitor build process and package compilation
   - **Test Results**: Analyze test failures and provide specific error analysis
   - **Dependency Checks**: Verify `pnpm audit` security scans pass
   - **Deployment Tracking**: Monitor deployment progress through workflow logs
   - **Rollback Procedures**: Provide rollback instructions for failed deployments

6. **Review & Testing Management**
   - If PR needs review and no reviewers assigned, suggest adding reviewers
   - **CI Status Validation**: Check all CI/CD checks before status changes
   - **Review Status Validation**: Verify approval state before progression
   - Verify all conversations are resolved if approved
   - Ensure both review approval AND CI passing before allowing merge
   - **Error Handling**: Provide detailed CI failure analysis and common fixes
   - **DoD Compliance**: Validate all Definition of Done criteria are met

7. **Provide Comprehensive Status Summary**
   Give a detailed summary of:
   - Current PR status and workflow stage
   - CI/CD pipeline status with specific check results
   - Definition of Done compliance status
   - Any Status field updates made
   - Next steps or blockers with specific actions
   - Related issues and their status
   - Deployment status and rollback procedures if needed
   - Error analysis and recommended fixes for failing checks

## Workflow Stage Mapping

| PR State | Project Status | CI Requirements | DoD Validation | Next Action |
|----------|----------------|-----------------|----------------|--------------|
| Draft | In Progress | Basic lint/format | Partial | Complete development |
| Ready for Review | Review & Testing | All checks passing | Full validation | Await review + CI |
| Approved + CI Passing | Review & Testing | All checks passing | Complete | Merge PR |
| Merged | Deployed | Deployment success | Complete | Verify deployment and close issues |

## Validation Safeguards

### PR State Validation
- Verify PR exists and is accessible
- Check PR is not closed or abandoned
- Validate PR author and permissions

### Conflict Detection
- Check for multiple PRs addressing same issue
- Warn about potential merge conflicts
- Validate base branch is up to date

### Enhanced Status Transition Rules
- **In Progress → Review & Testing**: Requires basic CI checks (lint, format) and DoD partial validation
- **Review & Testing → Deployed**: Requires all CI checks passing, peer review approval, and complete DoD validation
- **Deployed**: Only after successful merge AND deployment workflow completion
- **Rollback Procedures**: Clear instructions for reverting deployments if issues arise
- **CI Prerequisites**: All GitHub Actions workflows must pass before status advancement
- **DoD Compliance**: Full Definition of Done validation required before merge
- **Closing Keywords**: Verify PR description includes appropriate closing keywords for related issues
- **Prevent Invalid Transitions**: Block status changes that don't meet workflow requirements

### Enhanced Error Recovery & Analysis
- **CI Failures**: 
  - Parse specific workflow logs from GitHub Actions
  - Identify failing test cases and provide fix suggestions
  - Check for common issues: linting, type errors, dependency conflicts
  - Provide commands to reproduce errors locally
- **Review Blockers**: 
  - List pending reviewers and their status
  - Identify unresolved conversations
  - Check for requested changes
- **Merge Conflicts**: 
  - Guide through resolution with specific commands
  - Suggest rebase vs merge strategies
- **Deployment Failures**: 
  - Monitor deployment workflow progress
  - Parse deployment logs for specific errors
  - Provide rollback procedures with specific commands
  - Check for infrastructure or configuration issues
- **DoD Compliance**: 
  - Identify missing DoD criteria
  - Suggest specific actions to achieve compliance
  - Validate ADR requirements for architectural changes

## CI/CD Commands Integration

### GitHub Actions Status Commands
```bash
# Get comprehensive PR check status
gh pr checks <pr_number>

# View specific workflow run details
gh run view <run_id>

# Get workflow logs for debugging
gh run view <run_id> --log

# Monitor deployment status
gh run list --workflow="Merged to Master" --limit=5
```

### Definition of Done Validation Commands
```bash
# Check linting status
pnpm lint

# Run tests locally
pnpm test

# Security audit
pnpm audit

# Build verification
pnpm build
```

## Example Usage

```
/pr 123
```

This will:
1. **Comprehensive Status Check**: Analyze PR #123 with CI/CD pipeline integration
2. **DoD Validation**: Verify all Definition of Done criteria are met
3. **CI Analysis**: Parse GitHub Actions results and identify specific failures
4. **Deployment Monitoring**: Track deployment progress through workflow logs
5. **Conflict Detection**: Check for merge conflicts and other blocking issues
6. **Project Board Update**: Update GitHub Project Status field based on workflow stage
7. **Error Analysis**: Provide detailed failure analysis and fix recommendations
8. **Rollback Guidance**: Offer rollback procedures if deployment fails
9. **Next Steps**: Clear action items for PR progression or issue resolution