/**
 * Issue Labeling
 */

import { addLabels, removeLabel } from '../shared/github.js';
import type { TriageContext } from './types.js';

/**
 * Apply labels to an issue using the raw GitHub API.
 * @deprecated Use the v2 export which uses `@happyvertical/repos`.
 */
export async function applyLabels(
  context: TriageContext,
  labels: string[],
): Promise<void> {
  if (labels.length === 0) {
    console.log('No labels to apply');
    return;
  }

  try {
    await addLabels(context, context.issueNumber, labels);
    console.log(`Applied labels: ${labels.join(', ')}`);
  } catch (error) {
    console.error('Error applying labels:', (error as Error).message);
    throw error;
  }
}

/**
 * Remove an `agent: <type>` label from an issue. Silently ignores 404 errors.
 * @deprecated Use the v2 export which uses `@happyvertical/repos`.
 */
export async function removeAgentLabel(
  context: TriageContext,
  agentType: string,
): Promise<void> {
  const label = `agent: ${agentType}`;
  try {
    await removeLabel(context, context.issueNumber, label);
    console.log(`Removed label: ${label}`);
  } catch (error) {
    // Ignore if label doesn't exist
    if (!(error as Error).message.includes('404')) {
      console.error('Error removing label:', (error as Error).message);
    }
  }
}

export function getTypeLabel(type: string): string {
  return `type: ${type}`;
}

export function getPriorityLabel(priority: string): string {
  return `priority: ${priority}`;
}

export function getSizeLabel(size: string): string {
  return `size: ${size}`;
}

export function getAgentLabel(agentType: string): string {
  return `agent: ${agentType}`;
}
