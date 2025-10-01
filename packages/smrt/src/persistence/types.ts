/**
 * Types and interfaces for the SMRT persistence abstraction layer
 */

/**
 * Filter for loading a single object
 * Can be:
 * - string: UUID (id) or slug (if looks like UUID, treated as id, otherwise slug with empty context)
 * - object: Custom filter with id, slug+context, or arbitrary fields
 */
export type LoadFilter =
  | string
  | {
      id?: string;
      slug?: string;
      context?: string;
      [key: string]: any;
    };

/**
 * Options for listing multiple objects
 */
export interface ListOptions {
  /**
   * Filter conditions
   * Keys can include operators: 'field op' where op is one of: =, >, <, >=, <=, !=, in, like
   * Default operator is '='
   *
   * @example
   * ```typescript
   * {
   *   'price >': 100,
   *   'status': 'active',
   *   'category in': ['electronics', 'books'],
   *   'name like': '%shirt%'
   * }
   * ```
   */
  where?: Record<string, any>;

  /**
   * Maximum number of records to return
   */
  limit?: number;

  /**
   * Number of records to skip
   */
  offset?: number;

  /**
   * Field(s) to order results by, with optional direction
   * Can be a single string or array of strings
   *
   * @example
   * ```typescript
   * 'created_at DESC'
   * ['price ASC', 'created_at DESC']
   * ```
   */
  orderBy?: string | string[];

  /**
   * Relationships to eagerly load (avoids N+1 query problem)
   * SQL adapters will use JOIN queries for optimal performance
   * REST adapters will use batched queries
   *
   * @example
   * ```typescript
   * // Load orders with their customers and products pre-loaded
   * const orders = await orderCollection.list({
   *   include: ['customerId', 'productId']
   * });
   * // Access customer without additional query
   * console.log(orders[0].getRelated('customerId'));
   * ```
   */
  include?: string[];
}

/**
 * Options for counting objects
 */
export interface CountOptions {
  /**
   * Filter conditions (same format as ListOptions.where)
   */
  where?: Record<string, any>;
}

/**
 * Result of a save operation
 */
export interface SaveResult {
  /**
   * Whether this was an insert (true) or update (false)
   */
  inserted: boolean;

  /**
   * Number of rows affected
   */
  affected: number;
}

/**
 * SQL persistence configuration
 */
export interface SqlPersistenceConfig {
  type: 'sql';

  /**
   * Database connection URL
   */
  url?: string;

  /**
   * Database type (auto-detected from URL if not provided)
   */
  dbType?: 'sqlite' | 'postgres';

  /**
   * Authentication token for remote databases (e.g., Turso)
   */
  authToken?: string;

  /**
   * Additional database-specific options
   */
  [key: string]: any;
}

/**
 * REST persistence configuration
 */
export interface RestPersistenceConfig {
  type: 'rest';

  /**
   * Base URL for the REST API
   * Object-specific endpoints will be appended to this
   *
   * @example 'https://api.example.com/v1'
   */
  baseUrl: string;

  /**
   * Authentication configuration
   */
  auth?:
    | {
        type: 'bearer';
        token: string;
      }
    | {
        type: 'basic';
        username: string;
        password: string;
      }
    | {
        type: 'header';
        name: string;
        value: string;
      };

  /**
   * Custom headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Retry policy for failed requests
   */
  retryPolicy?: {
    /**
     * Maximum number of retry attempts
     * @default 3
     */
    maxRetries?: number;

    /**
     * Backoff strategy
     * @default 'exponential'
     */
    backoff?: 'exponential' | 'linear' | 'fixed';

    /**
     * Initial delay in milliseconds
     * @default 1000
     */
    initialDelay?: number;
  };

  /**
   * Use PATCH instead of PUT for updates
   * PATCH is more appropriate for partial updates
   * @default false
   */
  usePatchForUpdates?: boolean;

  /**
   * Custom endpoint paths (overrides defaults)
   */
  endpoints?: {
    create?: string; // Default: POST /
    update?: string; // Default: PUT /:id (or PATCH /:id if usePatchForUpdates is true)
    get?: string; // Default: GET /:id
    list?: string; // Default: GET /
    delete?: string; // Default: DELETE /:id
    count?: string; // Default: GET /count
  };
}

/**
 * Union of all persistence configuration types
 */
export type PersistenceConfig = SqlPersistenceConfig | RestPersistenceConfig;

/**
 * Metadata about a persistence adapter
 */
export interface AdapterMetadata {
  /**
   * Adapter type identifier
   */
  type: 'sql' | 'rest';

  /**
   * Whether this adapter supports database transactions
   */
  supportsTransactions: boolean;

  /**
   * Whether this adapter supports schema generation
   */
  supportsSchemaGeneration: boolean;

  /**
   * Whether this adapter supports batch operations
   */
  supportsBatchOperations: boolean;
}
