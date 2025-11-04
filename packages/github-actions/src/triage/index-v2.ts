/**
 * Issue Triage Orchestration (Refactored to use @have/repos and @have/projects)
 */

import { analyzeIssue } from './analyze.js';
import { postErrorComment, postTriageComment } from './comment.js';
import { searchDuplicates } from './duplicates.js';
import {
  applyLabels,
  getAgentLabel,
  getPriorityLabel,
  getSizeLabel,
  getTypeLabel,
  removeAgentLabel,
} from './label-v2.js';
import { updateProjectStatus } from './project-v2.js';
import type { TriageContext, TriageResult } from './types.js';

export { analyzeIssue } from './analyze.js';
export { postErrorComment, postTriageComment } from './comment.js';
export { searchDuplicates } from './duplicates.js';
export {
  applyLabels,
  getAgentLabel,
  getPriorityLabel,
  getSizeLabel,
  getTypeLabel,
  removeAgentLabel,
} from './label-v2.js';
export { updateProjectStatus } from './project-v2.js';
export * from './types.js';

export async function triageIssue(
  context: TriageContext,
): Promise<TriageResult> {
  console.log(`Triaging issue #${context.issueNumber}: ${context.issueTitle}`);

  try {
    // Apply agent: triage label
    await applyLabels(context, [getAgentLabel('triage')]);

    // Get AI analysis
    console.log('Calling AI for analysis...');
    const analysis = await analyzeIssue(context);
    console.log('AI Analysis:', JSON.stringify(analysis, null, 2));

    // Search for duplicates
    console.log('Searching for potential duplicates...');
    const duplicates = await searchDuplicates(context);
    console.log(`Found ${duplicates.length} potential duplicates`);

    // Apply type, priority, and size labels
    const labels: string[] = [
      getTypeLabel(analysis.type),
      getPriorityLabel(analysis.priority),
      getSizeLabel(analysis.size),
    ];

    await applyLabels(context, labels);

    // Post triage comment
    await postTriageComment(context, analysis, duplicates);

    // Remove agent: triage label
    await removeAgentLabel(context, 'triage');

    // Move to Backlog status
    if (context.config.projectEnabled) {
      console.log('Moving issue to Backlog...');
      await updateProjectStatus(context, 'Backlog');
    }

    console.log('✅ Triage complete!');

    return {
      success: true,
      analysis,
      duplicates,
    };
  } catch (error) {
    console.error('❌ Triage failed:', (error as Error).message);
    console.error((error as Error).stack);

    // Post error comment
    await postErrorComment(context, error as Error);

    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
