/**
 * Environment variable configuration loader
 *
 * Provides utilities for loading configuration from environment variables
 * with type conversion, schema validation, and customizable prefixes.
 *
 * @module config/env-config
 */
/**
 * Configuration options for loading environment variables
 */
export interface ConfigOptions<T extends Record<string, any>> {
    /**
     * Prefix for environment variables (default: 'HAVE')
     * @example
     * - 'HAVE' → HAVE_AI_PROVIDER
     * - 'SQLOO' → SQLOO_DATABASE
     * - '' → DATABASE (no prefix)
     */
    prefix?: string;
    /**
     * Package name for HAVE_{PACKAGE}_ pattern
     * If provided, combines with prefix: {prefix}_{packageName}_
     * @example
     * - packageName: 'ai', prefix: 'HAVE' → HAVE_AI_PROVIDER
     * - packageName: 'sql', prefix: 'HAVE' → HAVE_SQL_TYPE
     */
    packageName?: string;
    /**
     * Schema defining expected field types
     * Used for automatic type conversion from string env vars
     */
    schema?: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'json'>>;
    /**
     * Custom transform functions for specific fields
     * Overrides default type conversion from schema
     */
    transform?: Partial<Record<keyof T, (value: string) => any>>;
    /**
     * Allow environment variables not defined in schema
     * If false, only fields in schema will be loaded
     * @default true
     */
    allowUnknown?: boolean;
}
/**
 * Convert snake_case to camelCase
 * @param str - Snake case string
 * @returns Camel case string
 * @example
 * toCamelCase('max_retries') → 'maxRetries'
 * toCamelCase('api_key') → 'apiKey'
 */
export declare function toCamelCase(str: string): string;
/**
 * Convert camelCase to SCREAMING_SNAKE_CASE
 * @param str - Camel case string
 * @returns Screaming snake case string
 * @example
 * toScreamingSnakeCase('maxRetries') → 'MAX_RETRIES'
 * toScreamingSnakeCase('apiKey') → 'API_KEY'
 */
export declare function toScreamingSnakeCase(str: string): string;
/**
 * Convert string value to specified type
 * @param value - String value from environment variable
 * @param type - Target type for conversion
 * @returns Converted value
 * @throws Error if JSON parsing fails
 */
export declare function convertType(value: string, type: 'string' | 'number' | 'boolean' | 'json'): any;
/**
 * Load configuration from environment variables
 *
 * Scans environment variables matching the specified pattern and merges them
 * with user-provided options. User options always take precedence over env vars.
 *
 * @template T - Type of configuration object
 * @param userOptions - User-provided configuration (takes precedence)
 * @param options - Configuration options for env loading
 * @returns Merged configuration with env vars and user options
 *
 * @example
 * ```typescript
 * // Load HAVE_AI_* variables
 * const config = loadEnvConfig({ provider: 'openai' }, {
 *   packageName: 'ai',
 *   schema: {
 *     provider: 'string',
 *     model: 'string',
 *     timeout: 'number',
 *     maxRetries: 'number'
 *   }
 * });
 * // Checks: HAVE_AI_PROVIDER, HAVE_AI_MODEL, HAVE_AI_TIMEOUT, HAVE_AI_MAX_RETRIES
 *
 * // Load SQLOO_* variables (backward compatibility)
 * const sqlConfig = loadEnvConfig({}, {
 *   prefix: 'SQLOO',
 *   schema: {
 *     database: 'string',
 *     host: 'string',
 *     port: 'number'
 *   }
 * });
 * // Checks: SQLOO_DATABASE, SQLOO_HOST, SQLOO_PORT
 *
 * // Load without prefix
 * const customConfig = loadEnvConfig({}, {
 *   prefix: '',
 *   schema: {
 *     OPENAI_API_KEY: 'string'
 *   }
 * });
 * // Checks: OPENAI_API_KEY
 * ```
 */
export declare function loadEnvConfig<T extends Record<string, any>>(userOptions?: Partial<T>, options?: ConfigOptions<T>): T;
//# sourceMappingURL=env-config.d.ts.map