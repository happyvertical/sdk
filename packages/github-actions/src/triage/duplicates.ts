/**
 * Duplicate Issue Detection
 */

import { githubAPI } from './github.js';
import type { DuplicateIssue, TriageContext } from './types.js';

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
