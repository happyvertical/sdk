#!/usr/bin/env bash

# HAppy VErtical Project Board Setup Script
# Creates a GitHub Project with board view and workflow columns

set -e

# Check if gh CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check authentication and project scope
echo "Checking authentication..."
if ! gh auth status 2>/dev/null | grep -q "project"; then
    echo "Error: Missing 'project' scope in GitHub CLI authentication"
    echo "Run: gh auth refresh -s project"
    exit 1
fi

# Get repository owner and name
echo "Getting repository info..."
REPO_INFO=$(gh repo view --json owner,name)
echo "Repo info: $REPO_INFO"
OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO_NAME=$(echo "$REPO_INFO" | jq -r '.name')

echo "Setting up project board for $OWNER/$REPO_NAME"

# Get owner ID - try organization first
echo "Getting owner ID for $OWNER..."
OWNER_RESPONSE=$(gh api graphql -f query='
  query($login: String!) {
    organization(login: $login) {
      id
    }
  }' -F login="$OWNER" 2>/dev/null)

OWNER_ID=$(echo "$OWNER_RESPONSE" | jq -r '.data.organization.id')

# If organization lookup failed, try as user
if [ "$OWNER_ID" = "null" ] || [ -z "$OWNER_ID" ]; then
    echo "Organization not found, trying as user..."
    OWNER_RESPONSE=$(gh api graphql -f query='
      query($login: String!) {
        user(login: $login) {
          id
        }
      }' -F login="$OWNER")
    OWNER_ID=$(echo "$OWNER_RESPONSE" | jq -r '.data.user.id')
fi

echo "Owner ID: $OWNER_ID"

if [ "$OWNER_ID" = "null" ]; then
    echo "Error: Could not find owner ID for $OWNER"
    exit 1
fi

# Create the project
echo "Creating project..."
PROJECT_RESPONSE=$(gh api graphql -f query='
  mutation($ownerId: ID!, $title: String!) {
    createProjectV2(input: {
      ownerId: $ownerId
      title: $title
    }) {
      projectV2 {
        id
        title
        number
      }
    }
  }' -F ownerId="$OWNER_ID" -F title="Development Workflow")

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.data.createProjectV2.projectV2.id')
PROJECT_NUMBER=$(echo "$PROJECT_RESPONSE" | jq -r '.data.createProjectV2.projectV2.number')

if [ "$PROJECT_ID" = "null" ]; then
    echo "Error creating project"
    echo "$PROJECT_RESPONSE"
    exit 1
fi

echo "Created project #$PROJECT_NUMBER with ID: $PROJECT_ID"

# Note: GitHub Projects automatically has a Status field when using board view
# We'll focus on configuring the project for board view instead
echo "Configuring project for board view..."

# Get the existing Status field (GitHub creates this automatically)
STATUS_FIELD_RESPONSE=$(gh api graphql -f query='
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        field(name: "Status") {
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
  }' -F projectId="$PROJECT_ID")

STATUS_FIELD_ID=$(echo "$STATUS_FIELD_RESPONSE" | jq -r '.data.node.field.id')

if [ "$STATUS_FIELD_ID" = "null" ]; then
    # Create a basic Status field if it doesn't exist
    echo "Creating Status field..."
    STATUS_FIELD_RESPONSE=$(gh api graphql -f query='
      mutation($projectId: ID!) {
        createProjectV2Field(input: {
          projectId: $projectId
          dataType: SINGLE_SELECT
          name: "Status"
        }) {
          projectV2Field {
            ... on ProjectV2SingleSelectField {
              id
              name
            }
          }
        }
      }' -F projectId="$PROJECT_ID")
    
    STATUS_FIELD_ID=$(echo "$STATUS_FIELD_RESPONSE" | jq -r '.data.createProjectV2Field.projectV2Field.id')
fi

if [ "$STATUS_FIELD_ID" = "null" ]; then
    echo "Error creating Status field"
    echo "$STATUS_FIELD_RESPONSE"
    exit 1
fi

echo "Created Status field with ID: $STATUS_FIELD_ID"

# Get the default view ID
echo "Getting project views..."
VIEWS_RESPONSE=$(gh api graphql -f query='
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        views(first: 10) {
          nodes {
            id
            name
            layout
          }
        }
      }
    }
  }' -F projectId="$PROJECT_ID")

# Find the first view (usually the default one)
VIEW_ID=$(echo "$VIEWS_RESPONSE" | jq -r '.data.node.views.nodes[0].id')

if [ "$VIEW_ID" = "null" ]; then
    echo "Error: Could not find project view"
    echo "$VIEWS_RESPONSE"
    exit 1
fi

# Configure Status field with workflow options
echo "Configuring Status field with workflow options..."
STATUS_CONFIG_RESPONSE=$(gh api graphql -f query='
mutation {
  updateProjectV2Field(input: {
    fieldId: "'$STATUS_FIELD_ID'"
    singleSelectOptions: [
      {name: "New Issues", color: YELLOW, description: "New issue requiring triage"},
      {name: "Icebox", color: BLUE, description: "Valid but not current priority"},
      {name: "Backlog", color: ORANGE, description: "Prioritized work waiting for development"},
      {name: "To Do", color: GREEN, description: "Ready for development (meets Definition of Ready)"},
      {name: "In Progress", color: YELLOW, description: "Currently being developed"},
      {name: "Review & Testing", color: ORANGE, description: "Under peer review and CI testing"},
      {name: "Ready for Deployment", color: GREEN, description: "Approved and ready for production"},
      {name: "Deployed", color: PURPLE, description: "Live in production"}
    ]
  }) {
    projectV2Field {
      ... on ProjectV2SingleSelectField {
        id
        name
        options {
          id
          name
          color
        }
      }
    }
  }
}')

if echo "$STATUS_CONFIG_RESPONSE" | jq -e '.errors' > /dev/null; then
    echo "Warning: Could not configure Status field options"
    echo "$STATUS_CONFIG_RESPONSE"
else
    echo "✅ Status field configured with workflow columns"
fi

echo ""
echo "Board view setup:"
echo "- Visit the project URL below"
echo "- Switch to Board view (may be automatic with Status field configured)"
echo "- The Status field should now show as columns with your workflow lanes"

# Link the project to the repository
echo "Linking project to repository..."
REPO_ID=$(gh repo view --json id | jq -r '.id')

LINK_RESPONSE=$(gh api graphql -f query='
  mutation($projectId: ID!, $repositoryId: ID!) {
    linkProjectV2ToRepository(input: {
      projectId: $projectId
      repositoryId: $repositoryId
    }) {
      repository {
        name
      }
    }
  }' -F projectId="$PROJECT_ID" -F repositoryId="$REPO_ID")

if echo "$LINK_RESPONSE" | jq -e '.errors' > /dev/null; then
    echo "Warning: Could not link project to repository"
    echo "$LINK_RESPONSE"
else
    echo "Linked project to repository"
fi

echo ""
echo "✅ Project board setup complete!"
echo ""
echo "Project URL: https://github.com/orgs/$OWNER/projects/$PROJECT_NUMBER"
echo ""
echo "The project board is now configured with columns matching the workflow lanes."
echo ""
echo "⚠️  IMPORTANT: GitHub Actions workflow required for label sync"
echo ""
echo "To enable automatic label-to-column synchronization, create this workflow:"
echo "File: .github/workflows/project-automation.yml"
echo ""
cat << 'EOF'
name: Project Board Automation

on:
  issues:
    types: [opened, labeled, unlabeled]
  pull_request:
    types: [opened, labeled, unlabeled]

jobs:
  sync-to-project:
    runs-on: ubuntu-latest
    steps:
      - name: Sync labels to project columns
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const projectNumber = <PROJECT_NUMBER>; // Replace with your project number
            
            // Get the issue or PR
            const item = context.payload.issue || context.payload.pull_request;
            if (!item) return;
            
            // Map status labels to column names
            const labelToColumn = {
              'status:new-issue': 'New Issues',
              'status:icebox': 'Icebox',
              'status:backlog': 'Backlog',
              'status:to-do': 'To Do',
              'status:in-progress': 'In Progress',
              'status:review-testing': 'Review & Testing',
              'status:ready-for-deployment': 'Ready for Deployment',
              'status:deployed': 'Deployed'
            };
            
            // Find the current status label
            const statusLabel = item.labels.find(label => label.name.startsWith('status:'));
            if (!statusLabel) return;
            
            const columnName = labelToColumn[statusLabel.name];
            if (!columnName) return;
            
            // Update the project item
            // This requires GraphQL API calls to:
            // 1. Find the project
            // 2. Find the item in the project
            // 3. Update the Status field
            console.log(`Would move item to column: ${columnName}`);
EOF
echo ""
echo "Replace <PROJECT_NUMBER> with: $PROJECT_NUMBER"
echo ""
echo "For a complete implementation, see:"
echo "https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project"