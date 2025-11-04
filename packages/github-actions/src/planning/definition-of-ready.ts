/**
 * Definition of Ready validation
 */

import type { Issue } from '@have/repos';
import type { DefinitionOfReady } from './types.js';

/**
 * Check if an issue meets the Definition of Ready criteria
 */
export function validateDefinitionOfReady(
  issue: Issue,
  hasPlanComment: boolean,
): DefinitionOfReady {
  const labels = issue.labels.map((l) => (typeof l === 'string' ? l : l.name));

  return {
    hasClearDescription: !!issue.body && issue.body.trim().length > 50,
    hasTypeLabel: labels.some((l) => l.startsWith('type:')),
    hasPriorityLabel: labels.some((l) => l.startsWith('priority:')),
    hasSizeLabel: labels.some((l) => l.startsWith('size:')),
    hasPlan: hasPlanComment,
    noBlockers: !labels.some((l) => l === 'status: blocked'),
  };
}

/**
 * Check if issue is ready (all criteria met)
 */
export function isReady(dor: DefinitionOfReady): boolean {
  return (
    dor.hasClearDescription &&
    dor.hasTypeLabel &&
    dor.hasPriorityLabel &&
    dor.hasSizeLabel &&
    dor.hasPlan &&
    dor.noBlockers
  );
}

/**
 * Format Definition of Ready as markdown checklist
 */
export function formatDefinitionOfReady(dor: DefinitionOfReady): string {
  const checkbox = (checked: boolean) => (checked ? '[x]' : '[ ]');

  return `## Definition of Ready

${checkbox(dor.hasClearDescription)} Clear, actionable description
${checkbox(dor.hasTypeLabel)} Type label applied
${checkbox(dor.hasPriorityLabel)} Priority label applied
${checkbox(dor.hasSizeLabel)} Size label applied
${checkbox(dor.hasPlan)} Implementation plan documented
${checkbox(dor.noBlockers)} No blocking dependencies

${isReady(dor) ? '✅ **This issue is ready for implementation!**' : "⚠️ **This issue needs more work before it's ready.**"}`;
}
