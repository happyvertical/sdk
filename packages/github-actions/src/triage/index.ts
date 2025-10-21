/**
 * Issue Triage Orchestration
 */

import { analyzeIssue } from './analyze.js';
import { postErrorComment, postTriageComment } from './comment.js';
import { searchDuplicates } from './duplicates.js';
import { applyLabels, getTypeLabel } from './label.js';
import { updateProjectStatus } from './project.js';
import type { TriageContext, TriageResult } from './types.js';

export { analyzeIssue } from './analyze.js';
export { postErrorComment, postTriageComment } from './comment.js';
export { searchDuplicates } from './duplicates.js';
export { applyLabels, getTypeLabel } from './label.js';
export { updateProjectStatus } from './project.js';
export * from './types.js';

export async function triageIssue(
  context: TriageContext,
): Promise<TriageResult> {
  console.log(`Triaging issue #${context.issueNumber}: ${context.issueTitle}`);

  try {
    // Get AI analysis
    console.log('Calling GitHub Models API for analysis...');
    const analysis = await analyzeIssue(context);
    console.log('AI Analysis:', JSON.stringify(analysis, null, 2));

    // Search for duplicates
    console.log('Searching for potential duplicates...');
    const duplicates = await searchDuplicates(context);
    console.log(`Found ${duplicates.length} potential duplicates`);

    // Apply labels
    const labels: string[] = [];
    if (analysis.type) {
      labels.push(getTypeLabel(analysis.type));
    }

    if (labels.length > 0) {
      await applyLabels(context, labels);
    }

    // Post triage comment
    await postTriageComment(context, analysis, duplicates);

    // Update project status if urgent
    if (analysis.urgency === 'urgent') {
      console.log('Issue marked as urgent, moving to "To Do" status...');
      await updateProjectStatus(context, 'To Do');
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
