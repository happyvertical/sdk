/**
 * GraphQL client factory function
 */

import { GraphQLClient } from './client.js';
import { GraphQLError, GraphQLErrorCode } from './errors.js';
import type { GraphQLConfig, IGraphQLClient } from './types.js';

/**
 * Check if value is already a GraphQL client instance
 */
function isGraphQLClientInstance(value: unknown): value is IGraphQLClient {
  return (
    value !== null &&
    typeof value === 'object' &&
    'query' in value &&
    'mutate' in value &&
    typeof (value as IGraphQLClient).query === 'function' &&
    typeof (value as IGraphQLClient).mutate === 'function'
  );
}

/**
 * Get a GraphQL client instance
 *
 * This is the main entry point for creating GraphQL clients.
 * It can accept either a configuration object or an existing client instance.
 *
 * @param options - GraphQL configuration or existing client instance
 * @returns Promise resolving to GraphQL client interface
 *
 * @example
 * ```typescript
 * import { getGraphQLClient } from '@happyvertical/graphql';
 *
 * // Create a GitHub GraphQL client
 * const github = await getGraphQLClient({
 *   endpoint: 'https://api.github.com/graphql',
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * // Create a GitLab GraphQL client
 * const gitlab = await getGraphQLClient({
 *   endpoint: 'https://gitlab.com/api/graphql',
 *   token: process.env.GITLAB_TOKEN
 * });
 *
 * // Custom headers for other APIs
 * const custom = await getGraphQLClient({
 *   endpoint: 'https://api.example.com/graphql',
 *   headers: {
 *     'X-API-Key': 'my-api-key',
 *     'X-Custom-Header': 'value'
 *   }
 * });
 *
 * // Execute a query
 * const result = await github.query<{ viewer: { login: string } }>(`
 *   query {
 *     viewer {
 *       login
 *     }
 *   }
 * `);
 *
 * // Pass existing instance (returns it unchanged)
 * const sameClient = await getGraphQLClient(github);
 * ```
 */
export async function getGraphQLClient(
  options: GraphQLConfig | IGraphQLClient,
): Promise<IGraphQLClient> {
  // If already a client instance, return it
  if (isGraphQLClientInstance(options)) {
    return options;
  }

  // Validate configuration
  if (!options.endpoint) {
    throw new GraphQLError(
      'GraphQL endpoint is required',
      GraphQLErrorCode.VALIDATION_ERROR,
    );
  }

  return new GraphQLClient(options);
}
