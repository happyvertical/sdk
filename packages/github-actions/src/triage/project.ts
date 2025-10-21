/**
 * GitHub Project Board Management
 */

import { githubAPI } from './github.js';
import type { TriageContext } from './types.js';

export async function updateProjectStatus(
  context: TriageContext,
  statusName: string,
): Promise<void> {
  if (!context.config.projectEnabled) {
    console.log('Project board integration disabled');
    return;
  }

  if (!context.config.projectId || !context.config.statusFieldId) {
    console.log('Project configuration missing');
    return;
  }

  if (
    !context.config.statusOptions ||
    !context.config.statusOptions[statusName]
  ) {
    console.log(`Status "${statusName}" not configured`);
    return;
  }

  const query = `
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          projectItems(first: 10) {
            nodes {
              id
            }
          }
        }
      }
    }
  `;

  try {
    // Get project item ID
    const variables = {
      owner: context.owner,
      repo: context.repo,
      number: context.issueNumber,
    };

    const result = (await githubAPI(context.token, 'POST', '/graphql', {
      query,
      variables,
    })) as {
      data: {
        repository: {
          issue: {
            projectItems: {
              nodes: Array<{ id: string }>;
            };
          };
        };
      };
    };

    const itemId = result.data.repository.issue.projectItems.nodes[0]?.id;

    if (!itemId) {
      console.log('Issue not in project board, skipping status update');
      return;
    }

    // Update status
    const updateQuery = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }
        ) {
          projectV2Item {
            id
          }
        }
      }
    `;

    const updateVars = {
      projectId: context.config.projectId,
      itemId,
      fieldId: context.config.statusFieldId,
      optionId: context.config.statusOptions[statusName],
    };

    await githubAPI(context.token, 'POST', '/graphql', {
      query: updateQuery,
      variables: updateVars,
    });

    console.log(`Updated project status to: ${statusName}`);
  } catch (error) {
    console.error('Error updating project status:', (error as Error).message);
  }
}
