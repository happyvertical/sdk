/**
 * Shared GitHub API Utilities
 */

export interface GitHubContext {
  token: string;
  owner: string;
  repo: string;
}

/**
 * Make a GitHub REST API request
 */
export async function githubRequest(
  context: GitHubContext,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const url = `https://api.github.com${path}`;
  const headers = {
    Authorization: `Bearer ${context.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}\n${error}`,
    );
  }

  return response.json();
}

/**
 * Make a GitHub GraphQL API request
 */
export async function githubGraphQL(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `GitHub GraphQL error: ${response.status} ${response.statusText}\n${error}`,
    );
  }

  const result = (await response.json()) as {
    data?: unknown;
    errors?: { message: string }[];
  };

  if (result.errors) {
    throw new Error(
      `GitHub GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`,
    );
  }

  return result.data;
}

/**
 * Add labels to an issue
 */
export async function addLabels(
  context: GitHubContext,
  issueNumber: number,
  labels: string[],
): Promise<void> {
  await githubRequest(
    context,
    'POST',
    `/repos/${context.owner}/${context.repo}/issues/${issueNumber}/labels`,
    { labels },
  );
}

/**
 * Remove a label from an issue
 */
export async function removeLabel(
  context: GitHubContext,
  issueNumber: number,
  label: string,
): Promise<void> {
  const encodedLabel = encodeURIComponent(label);
  await githubRequest(
    context,
    'DELETE',
    `/repos/${context.owner}/${context.repo}/issues/${issueNumber}/labels/${encodedLabel}`,
  );
}

/**
 * Post a comment on an issue
 */
export async function postComment(
  context: GitHubContext,
  issueNumber: number,
  body: string,
): Promise<void> {
  await githubRequest(
    context,
    'POST',
    `/repos/${context.owner}/${context.repo}/issues/${issueNumber}/comments`,
    { body },
  );
}

/**
 * Assign users to an issue
 */
export async function assignIssue(
  context: GitHubContext,
  issueNumber: number,
  assignees: string[],
): Promise<void> {
  await githubRequest(
    context,
    'POST',
    `/repos/${context.owner}/${context.repo}/issues/${issueNumber}/assignees`,
    { assignees },
  );
}

/**
 * Create or update a repository label
 */
export async function createOrUpdateLabel(
  context: GitHubContext,
  name: string,
  color: string,
  description: string,
): Promise<void> {
  try {
    // Try to update existing label
    await githubRequest(
      context,
      'PATCH',
      `/repos/${context.owner}/${context.repo}/labels/${encodeURIComponent(name)}`,
      { color, description },
    );
  } catch (error) {
    // If label doesn't exist, create it
    if ((error as Error).message.includes('404')) {
      await githubRequest(
        context,
        'POST',
        `/repos/${context.owner}/${context.repo}/labels`,
        { name, color, description },
      );
    } else {
      throw error;
    }
  }
}

/**
 * Get issue details
 */
export async function getIssue(
  context: GitHubContext,
  issueNumber: number,
): Promise<{
  number: number;
  title: string;
  body: string;
  state: string;
  labels: { name: string }[];
  assignees: { login: string }[];
}> {
  return (await githubRequest(
    context,
    'GET',
    `/repos/${context.owner}/${context.repo}/issues/${issueNumber}`,
  )) as {
    number: number;
    title: string;
    body: string;
    state: string;
    labels: { name: string }[];
    assignees: { login: string }[];
  };
}
