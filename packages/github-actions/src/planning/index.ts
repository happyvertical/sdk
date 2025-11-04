/**
 * Planning Workflow Orchestration
 */

import { createProject, createRepository } from '../shared/adapters.js';
import { analyzePlanning } from './analyze.js';
import {
  postPlanComment,
  postPlanningErrorComment,
  postReadyCheckComment,
} from './comment.js';
import { isReady, validateDefinitionOfReady } from './definition-of-ready.js';
import type { PlanningContext, PlanningResult } from './types.js';

export * from './analyze.js';
export * from './comment.js';
export * from './definition-of-ready.js';
export * from './types.js';

/**
 * Start planning workflow for an issue
 */
export async function startPlanning(
  context: PlanningContext,
): Promise<PlanningResult> {
  console.log(
    `Starting planning for issue #${context.issueNumber}: ${context.issueTitle}`,
  );

  try {
    const repo = await createRepository(
      context.token,
      context.owner,
      context.repo,
    );

    // Add agent: planning label
    await repo.addLabels(context.issueNumber, ['agent: planning']);

    // Generate implementation plan
    console.log('Generating implementation plan...');
    const plan = await analyzePlanning(context);

    // Post plan comment
    await postPlanComment(repo, context.issueNumber, plan);

    console.log('✅ Planning started successfully');

    return {
      success: true,
      plan,
    };
  } catch (error) {
    console.error('❌ Planning failed:', (error as Error).message);

    try {
      const repo = await createRepository(
        context.token,
        context.owner,
        context.repo,
      );
      await postPlanningErrorComment(repo, context.issueNumber, error as Error);
    } catch {
      // Ignore error posting error comment
    }

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Complete planning workflow and move to Ready
 */
export async function completePlanning(
  context: PlanningContext,
): Promise<PlanningResult> {
  console.log(
    `Completing planning for issue #${context.issueNumber}: ${context.issueTitle}`,
  );

  try {
    const repo = await createRepository(
      context.token,
      context.owner,
      context.repo,
    );

    // Get issue details
    const issue = await repo.getIssue(context.issueNumber);

    // Check for plan comment (look for "Implementation Plan" in comments)
    const comments = await repo.listComments(context.issueNumber);
    const hasPlanComment = comments.some((c) =>
      c.body?.includes('Implementation Plan'),
    );

    // Validate Definition of Ready
    const dor = validateDefinitionOfReady(issue, hasPlanComment);

    // Post Definition of Ready check
    await postReadyCheckComment(repo, context.issueNumber, dor);

    if (!isReady(dor)) {
      console.log('⚠️ Issue does not meet Definition of Ready criteria');
      return {
        success: false,
        error: 'Issue does not meet Definition of Ready criteria',
      };
    }

    // Remove agent: planning label
    await repo.removeLabel(context.issueNumber, 'agent: planning');

    // Move to Ready status
    if (
      context.config.projectId &&
      context.config.statusFieldId &&
      context.config.statusOptions
    ) {
      const project = await createProject(
        context.token,
        context.config.projectId,
        context.config.statusFieldId,
        context.config.statusOptions,
      );

      // Get project item
      const items = await project.listItems();
      const itemId = items.find(
        (item: { contentId: string; id: string }) =>
          item.contentId === issue.id,
      )?.id;

      if (itemId) {
        await project.updateItemStatus(itemId, 'Ready');
      }
    }

    console.log('✅ Planning completed, moved to Ready');

    return {
      success: true,
    };
  } catch (error) {
    console.error('❌ Complete planning failed:', (error as Error).message);

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
