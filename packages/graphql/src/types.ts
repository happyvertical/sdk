/**
 * GraphQL client types
 */

/**
 * GraphQL client configuration
 *
 * Generic configuration for any GraphQL endpoint.
 * GraphQL is a protocol, not a provider - the client
 * works with any GraphQL API (GitHub, GitLab, Shopify, etc.)
 */
export interface GraphQLConfig {
  /** GraphQL endpoint URL */
  endpoint: string;
  /** Bearer token for Authorization header */
  token?: string;
  /** Custom headers (merged with defaults) */
  headers?: Record<string, string>;
}

/**
 * GraphQL response structure
 */
export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorDetail[];
}

/**
 * GraphQL error detail from API response
 */
export interface GraphQLErrorDetail {
  message: string;
  type?: string;
  path?: string[];
  locations?: Array<{ line: number; column: number }>;
}

/**
 * GraphQL client interface
 */
export interface IGraphQLClient {
  /**
   * Execute a GraphQL query
   */
  query<T>(query: string, variables?: Record<string, unknown>): Promise<T>;

  /**
   * Execute a GraphQL mutation
   */
  mutate<T>(mutation: string, variables?: Record<string, unknown>): Promise<T>;
}
