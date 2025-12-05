/**
 * Generic GraphQL client
 */

import { GraphQLError } from './errors.js';
import type {
  GraphQLConfig,
  GraphQLErrorDetail,
  IGraphQLClient,
} from './types.js';

/**
 * Generic GraphQL client implementation
 *
 * Works with any GraphQL endpoint - GitHub, GitLab, Shopify, custom APIs, etc.
 */
export class GraphQLClient implements IGraphQLClient {
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor(config: GraphQLConfig) {
    if (!config.endpoint) {
      throw new GraphQLError(
        'GraphQL endpoint is required',
        GraphQLError.fromHTTPStatus(400, 'Missing endpoint').code,
      );
    }

    this.endpoint = config.endpoint;

    // Build headers - start with defaults
    this.headers = {
      'Content-Type': 'application/json',
    };

    // Add Authorization if token provided
    if (config.token) {
      this.headers.Authorization = `Bearer ${config.token}`;
    }

    // Merge custom headers (can override defaults)
    if (config.headers) {
      Object.assign(this.headers, config.headers);
    }
  }

  /**
   * Execute a GraphQL query
   */
  async query<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return this.execute<T>(query, variables);
  }

  /**
   * Execute a GraphQL mutation
   */
  async mutate<T>(
    mutation: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    return this.execute<T>(mutation, variables);
  }

  /**
   * Execute GraphQL operation
   */
  private async execute<T>(
    operation: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ query: operation, variables }),
      });
    } catch (error) {
      throw GraphQLError.networkError(
        `Failed to connect to GraphQL API: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw GraphQLError.fromHTTPStatus(
        response.status,
        `GraphQL error: ${response.statusText}\n${errorText}`,
        errorText,
      );
    }

    const result = (await response.json()) as {
      data?: T;
      errors?: GraphQLErrorDetail[];
    };

    if (result.errors && result.errors.length > 0) {
      throw GraphQLError.fromGraphQLErrors(result.errors);
    }

    if (!result.data) {
      throw new GraphQLError(
        'GraphQL response contained no data',
        GraphQLError.fromHTTPStatus(500, 'No data').code,
      );
    }

    return result.data;
  }
}
