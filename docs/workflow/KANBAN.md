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
3. Use GitHub's standard Status options for simplicity:
   - **Todo**: Items ready to be worked on
   - **In Progress**: Items currently being developed
   - **Done**: Completed items

This approach leverages GitHub's native project automation and eliminates the complexity of custom label management.

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

The simplified three-stage workflow aligns with GitHub's standard project automation.

### Todo

This encompasses all work that needs to be done, including:
- **New Issues**: Initial triage and validation
- **Backlog**: Prioritized and refined work ready for development
- **Ready Items**: Issues meeting the Definition of Ready

All new issues start in "Todo" status and remain there through triage, prioritization, and refinement until development begins.

**Priority Management**: Use GitHub's priority field or labels to distinguish between:
- High priority items ready for immediate development
- Medium priority items in the refined backlog
- Low priority items requiring further analysis

**Icebox Alternative**: For "someday/maybe" items, consider:
- Closing issues with a "future consideration" label
- Using GitHub Discussions for ideas that aren't actionable issues
- Creating an "Ideas" repository for long-term concepts

### In Progress

This is the active development stage where developers:
- Write high-quality code following team standards
- Create comprehensive tests for the functionality
- Open Pull Requests when ready for review
- Respond to review feedback and iterate on the solution

Issues remain "In Progress" throughout the entire development and review cycle until the work is complete and merged.

### Done

Work moves to "Done" when:
- Code has been merged to the main branch
- All automated tests are passing
- The feature/fix is deployed to production (if applicable)
- Any necessary documentation has been updated

The "Done" column serves as a historical record of completed work and can be periodically archived to keep the board clean.

**Deployment Tracking**: For projects requiring deployment tracking, consider:
- Using GitHub Environments to track deployment status
- Adding deployment-specific labels for release management
- Implementing automated deployment status updates through GitHub Actions