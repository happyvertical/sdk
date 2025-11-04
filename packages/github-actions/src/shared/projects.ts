/**
 * GitHub Projects V2 API Utilities
 *
 * Handles interaction with GitHub Projects V2 via GraphQL API.
 */

import { githubGraphQL } from './github.js';

export interface ProjectConfig {
  /** GitHub Project V2 ID (e.g., "PVT_kwDOB9Y8ns4A8-TY") */
  projectId: string;
  /** Status field ID (e.g., "PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY") */
  statusFieldId: string;
  /** Map of status names to option IDs */
  statusOptions: Record<string, string>;
}

/**
 * Add an issue to a project
 */
export async function addIssueToProject(
  token: string,
  projectId: string,
  issueId: string,
): Promise<string> {
  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId
        contentId: $contentId
      }) {
        item {
          id
        }
      }
    }
  `;

  const result = (await githubGraphQL(token, mutation, {
    projectId,
    contentId: issueId,
  })) as {
    addProjectV2ItemById: {
      item: {
        id: string;
      };
    };
  };

  return result.addProjectV2ItemById.item.id;
}

/**
 * Update project item status
 */
export async function updateProjectItemStatus(
  token: string,
  projectId: string,
  itemId: string,
  statusFieldId: string,
  statusOptionId: string,
): Promise<void> {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: $value
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await githubGraphQL(token, mutation, {
    projectId,
    itemId,
    fieldId: statusFieldId,
    value: {
      singleSelectOptionId: statusOptionId,
    },
  });
}

/**
 * Get issue's node ID (required for adding to project)
 */
export async function getIssueNodeId(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<string> {
  const query = `
    query($owner: String!, $repo: String!, $issueNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issueNumber) {
          id
        }
      }
    }
  `;

  const result = (await githubGraphQL(token, query, {
    owner,
    repo,
    issueNumber,
  })) as {
    repository: {
      issue: {
        id: string;
      };
    };
  };

  return result.repository.issue.id;
}

/**
 * Get project item ID for an issue (if it exists in the project)
 */
export async function getProjectItemId(
  token: string,
  projectId: string,
  issueId: string,
): Promise<string | null> {
  const query = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          items(first: 100) {
            nodes {
              id
              content {
                ... on Issue {
                  id
                }
              }
            }
          }
        }
      }
    }
  `;

  const result = (await githubGraphQL(token, query, {
    projectId,
  })) as {
    node: {
      items: {
        nodes: {
          id: string;
          content: {
            id: string;
          };
        }[];
      };
    };
  };

  const item = result.node.items.nodes.find(
    (node) => node.content.id === issueId,
  );
  return item ? item.id : null;
}

/**
 * Move issue to a specific status in the project
 */
export async function moveIssueToStatus(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  config: ProjectConfig,
  statusName: string,
): Promise<void> {
  const statusOptionId = config.statusOptions[statusName];
  if (!statusOptionId) {
    throw new Error(
      `Status "${statusName}" not found in project configuration. Available: ${Object.keys(config.statusOptions).join(', ')}`,
    );
  }

  console.log(`Moving issue #${issueNumber} to status "${statusName}"...`);

  // Get issue node ID
  const issueId = await getIssueNodeId(token, owner, repo, issueNumber);

  // Check if issue is already in project
  let itemId = await getProjectItemId(token, config.projectId, issueId);

  // Add to project if not already there
  if (!itemId) {
    console.log('Issue not in project, adding...');
    itemId = await addIssueToProject(token, config.projectId, issueId);
  }

  // Update status
  console.log(`Updating status to "${statusName}"...`);
  await updateProjectItemStatus(
    token,
    config.projectId,
    itemId,
    config.statusFieldId,
    statusOptionId,
  );

  console.log(`✅ Issue moved to "${statusName}"`);
}
