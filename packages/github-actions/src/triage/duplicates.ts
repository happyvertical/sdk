/**
 * Duplicate Issue Detection
 */

import { githubAPI } from './github.js';
import type { DuplicateIssue, TriageContext } from './types.js';

/**
 * Search for potential duplicate issues using GitHub Search API.
 *
 * Extracts keywords from the issue title and searches the repository for similar issues.
 * The current issue is excluded from results.
 *
 * @param context - Triage context with issue details and repo info
 * @returns Array of potentially duplicate issues (up to 4)
 */
export async function searchDuplicates(
  context: TriageContext,
): Promise<DuplicateIssue[]> {
  const keywords = context.issueTitle.split(' ').slice(0, 5).join(' ');
  const query = `repo:${context.owner}/${context.repo} is:issue ${keywords}`;
  const path = `/search/issues?q=${encodeURIComponent(query)}&per_page=5`;

  try {
    const result = (await githubAPI(context.token, 'GET', path, null)) as {
      items: DuplicateIssue[];
    };

    // Exclude the current issue from results
    return result.items.filter((issue) => issue.number !== context.issueNumber);
  } catch (error) {
    console.error('Error searching for duplicates:', (error as Error).message);
    return [];
  }
}
