/**
 * GitHub Project Board Management (Refactored to use @have/projects)
 */

import { createProject, createRepository } from '../shared/adapters.js';
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

  try {
    const repo = await createRepository(
      context.token,
      context.owner,
      context.repo,
    );

    const project = await createProject(
      context.token,
      context.config.projectId,
      context.config.statusFieldId,
      context.config.statusOptions,
    );

    // Get issue node ID
    const issue = await repo.getIssue(context.issueNumber);

    // Try to find existing project item
    const items = await project.listItems();
    let itemId = items.find(
      (item: { contentId: string; id: string }) => item.contentId === issue.id,
    )?.id;

    // Add to project if not already there
    if (!itemId) {
      console.log('Issue not in project, adding...');
      const item = await project.addItem(issue.id);
      itemId = item.id;
    }

    // Update status
    await project.updateItemStatus(itemId, statusName);
    console.log(`Updated project status to: ${statusName}`);
  } catch (error) {
    console.error('Error updating project status:', (error as Error).message);
    throw error;
  }
}
