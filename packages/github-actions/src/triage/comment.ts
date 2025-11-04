/**
 * Issue Comment Posting
 */

import { githubAPI } from './github.js';
import type { AIAnalysis, DuplicateIssue, TriageContext } from './types.js';

export async function postTriageComment(
  context: TriageContext,
  analysis: AIAnalysis,
  duplicates: DuplicateIssue[],
): Promise<void> {
  const comment = buildTriageComment(context, analysis, duplicates);
  const path = `/repos/${context.owner}/${context.repo}/issues/${context.issueNumber}/comments`;

  try {
    await githubAPI(context.token, 'POST', path, { body: comment });
    console.log('Posted triage comment');
  } catch (error) {
    console.error('Error posting comment:', (error as Error).message);
    throw error;
  }
}

export async function postErrorComment(
  context: TriageContext,
  error: Error,
): Promise<void> {
  const comment = `## 🤖 AI Triage Failed\n\nAutomated triage encountered an error:\n\`\`\`\n${error.message}\n\`\`\`\n\nPlease triage this issue manually.`;
  const path = `/repos/${context.owner}/${context.repo}/issues/${context.issueNumber}/comments`;

  try {
    await githubAPI(context.token, 'POST', path, { body: comment });
  } catch (err) {
    console.error('Error posting error comment:', (err as Error).message);
  }
}

function buildTriageComment(
  context: TriageContext,
  analysis: AIAnalysis,
  duplicates: DuplicateIssue[],
): string {
  let comment = `## 🤖 AI Triage\n\n`;
  comment += `**Type**: \`${analysis.type}\`\n`;
  comment += `**Priority**: \`${analysis.priority}\`\n`;
  comment += `**Size**: \`${analysis.size}\`\n\n`;

  if (analysis.affected_packages && analysis.affected_packages.length > 0) {
    const packages = analysis.affected_packages
      .map((p) => `\`${p}\``)
      .join(', ');
    comment += `**Affected Packages**: ${packages}\n\n`;
  }

  comment += `**Analysis**: ${analysis.reasoning}\n\n`;

  if (duplicates.length > 0) {
    comment += `### ⚠️ Potential Duplicates\n\n`;
    duplicates.forEach((dup) => {
      comment += `- #${dup.number}: ${dup.title}\n`;
    });
    comment += `\n`;
  }

  comment += `---\n`;
  comment += `*This triage was performed automatically using GitHub Models API. Please review and adjust labels as needed.*`;

  return comment;
}
