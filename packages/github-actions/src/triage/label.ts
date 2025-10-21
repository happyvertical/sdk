/**
 * Issue Labeling
 */

import { githubAPI } from './github.js';
import type { TriageContext } from './types.js';

export async function applyLabels(
  context: TriageContext,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) {
    console.log('No labels to apply');
    return;
  }

  const path = `/repos/${context.owner}/${context.repo}/issues/${context.issueNumber}/labels`;

  try {
    await githubAPI(context.token, 'POST', path, { labels });
    console.log(`Applied labels: ${labels.join(', ')}`);
  } catch (error) {
    console.error('Error applying labels:', (error as Error).message);
    throw error;
  }
}

export function getTypeLabel(type: string): string {
  return `type:${type}`;
}
