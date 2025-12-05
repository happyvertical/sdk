/**
 * @happyvertical/graphql - Generic GraphQL client for SDK packages
 *
 * Provides a unified GraphQL client interface for any GraphQL API.
 * GraphQL is a protocol, not a provider - this client works with
 * GitHub, GitLab, Shopify, or any other GraphQL endpoint.
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
 * // Execute query
 * const result = await github.query<{ viewer: { login: string } }>(`
 *   query {
 *     viewer {
 *       login
 *     }
 *   }
 * `);
 *
 * // Execute mutation
 * await github.mutate(`
 *   mutation($input: AddCommentInput!) {
 *     addComment(input: $input) {
 *       commentEdge {
 *         node { id }
 *       }
 *     }
 *   }
 * `, { input: { subjectId, body } });
 * ```
 */

export { GraphQLClient } from './client.js';
export { GraphQLError, GraphQLErrorCode } from './errors.js';
export { getGraphQLClient } from './factory.js';

export type {
  GraphQLConfig,
  GraphQLErrorDetail,
  GraphQLResponse,
  IGraphQLClient,
} from './types.js';
