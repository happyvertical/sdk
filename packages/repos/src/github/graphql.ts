/**
 * GitHub GraphQL API client
 */

import { RepositoryError } from '../errors.js';

export interface GitHubGraphQLConfig {
  token: string;
}

/**
 * GitHub GraphQL API client
 */
export class GitHubGraphQL {
  private token: string;

  constructor(config: GitHubGraphQLConfig) {
    this.token = config.token;
  }

  /**
   * Execute GraphQL query
   */
  async query(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw RepositoryError.fromHTTPStatus(
        response.status,
        `GitHub GraphQL error: ${response.statusText}\n${error}`,
        error,
      );
    }

    const result = (await response.json()) as {
      data?: unknown;
      errors?: { message: string }[];
    };

    if (result.errors) {
      throw new RepositoryError(
        `GitHub GraphQL errors: ${result.errors.map((e) => e.message).join(', ')}`,
        RepositoryError.fromHTTPStatus(400, 'GraphQL Error').code,
      );
    }

    return result.data;
  }
}
