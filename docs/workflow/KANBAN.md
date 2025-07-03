# Kanban CI/CD Workflow Specification

This document specifies the end-to-end workflow for managing issues within a Kanban system, from initial creation through to deployment. An "issue" represents any single unit of work, such as a feature, bug fix, or enhancement.

The flow is designed to ensure that work is properly vetted, prioritized, and developed with high quality, leveraging automation wherever possible. Each lane in the Kanban board has a distinct purpose and a defined set of actions to guide the process.

## Project Setup and Automation

To implement this workflow effectively in a tool like GitHub, specific setup is required for the repository and its associated project board. This section outlines the necessary labels, board configuration, and automation rules that enable the workflow.

### Label Conventions

A consistent labeling strategy is crucial for categorization.

**Type Labels:**
These labels provide metadata about the nature of the work.

* `type:bug`
* `type:feature`
* `type:enhancement`
* `type:tech-debt`
* `type:epic`

**Status Management:**
Instead of using custom `status:*` labels, this workflow leverages GitHub Projects' built-in **Status field** for tracking issue progress. This provides better integration with GitHub's native automation and eliminates the need for custom label management.

### Project Board Configuration

The project board uses GitHub Projects v2 with the built-in Status field for tracking issue progress.

1. Create a new Project and select the **Board** layout.
2. Configure the board's columns to be grouped by the **Status** field.
3. Configure custom Status options for the 8-stage workflow:
   - **Fresh**: Newly created items requiring triage
   - **Icebox**: Low priority items for future consideration  
   - **Backlog**: Prioritized items waiting for development
   - **To Do**: Items ready for immediate development (meet Definition of Ready)
   - **Developing**: Items currently being actively developed
   - **Quality Assurance**: Items under review and testing
   - **Deploying**: Items approved and currently being deployed
   - **Done**: Completed and deployed items

This comprehensive workflow provides clear visibility into work progress while maintaining proper quality gates.

### Automation Workflows

GitHub Projects v2 provides built-in automation that eliminates the need for custom workflows.

**Built-in Project Automation:**
* **Manual Updates**: Dragging cards between columns automatically updates the Status field
* **Default Status**: Configure automatic assignment of "Todo" status when items are added to the project
* **Status Sync**: The Status field is the single source of truth for issue progress

**Recommended Project Workflows:**
1. **Auto-add items**: Set up the built-in workflow to automatically add new issues to the project with "Todo" status
2. **PR automation**: Configure automatic status changes when PRs are opened/merged

This native approach provides better reliability and requires no custom GitHub Actions maintenance.

## Workflow Stages

The 8-stage workflow provides comprehensive tracking from initial issue creation through final deployment.

### Fresh

The entry point for all work items. Fresh issues require initial triage to determine validity and priority:
- **Validation**: Confirm issue is clear, actionable, and within project scope
- **Duplicate Check**: Ensure no similar issues already exist
- **Initial Classification**: Add appropriate type and priority labels
- **Assignment**: Route to appropriate team member or keep unassigned for later triage

Issues should not remain in "Fresh" long - they move quickly to either Icebox, Backlog, or are closed.

### Icebox

Low priority items that may be addressed in the future but are not currently planned:
- **Future Consideration**: Valid ideas that aren't current priorities
- **Needs More Info**: Issues requiring additional research or clarification
- **Low Priority**: Work that's useful but not urgent
- **Parking Lot**: Items to revisit during planning cycles

Items in Icebox are reviewed periodically (quarterly) to determine if they should move to Backlog or be closed.

### Backlog

Prioritized work that will be addressed but hasn't been refined enough to start development:
- **Prioritized**: Items have been ranked in order of importance
- **Refined**: Issues have sufficient detail for estimation
- **Dependent Work**: Items waiting for other work to complete
- **Ready for Planning**: Will be refined to meet Definition of Ready

The Backlog serves as the funnel for upcoming development work.

### To Do  

Issues that meet the Definition of Ready and are prepared for immediate development:
- **Definition of Ready Complete**: All acceptance criteria, technical requirements, and implementation gameplan are clear
- **No Blockers**: All dependencies resolved, resources available
- **Assigned**: Clear ownership established
- **Estimated**: Effort and complexity understood

Work should only enter "To Do" when a developer can immediately begin implementation.

### Developing

Active development work in progress:
- **Implementation**: Writing code according to acceptance criteria
- **Testing**: Creating and running tests for the functionality  
- **Documentation**: Updating relevant documentation
- **Pull Request Creation**: Opening PRs when ready for review

Issues remain in "Developing" throughout the entire development cycle until work is ready for review.

### Quality Assurance

Work under review and testing before deployment:
- **Code Review**: Peer review of implementation and tests
- **CI/CD Validation**: Automated testing and quality checks
- **Manual Testing**: User acceptance testing when appropriate
- **Documentation Review**: Ensuring all documentation is complete and accurate

Items move through Quality Assurance when all review feedback is addressed and tests pass.

### Deploying

Approved work currently being deployed to production:
- **Review Complete**: All code review feedback addressed
- **Tests Passing**: Full CI/CD pipeline success
- **Documentation Updated**: All relevant docs reflect the changes
- **Deployment Approved**: Ready for production release

This stage allows for batching deployments and final validation before release.

### Done

Completed work that has been successfully deployed to production:
- **Live in Production**: Feature/fix is available to end users
- **Post-Deploy Validation**: Confirming functionality works as expected
- **Monitoring**: Tracking metrics and error rates post-deployment
- **Issue Closure**: Original issue can be closed as complete

Done items serve as a historical record and can be archived periodically to keep the board clean.