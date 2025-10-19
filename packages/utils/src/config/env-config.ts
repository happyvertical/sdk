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
export function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to SCREAMING_SNAKE_CASE
 * @param str - Camel case string
 * @returns Screaming snake case string
 * @example
 * toScreamingSnakeCase('maxRetries') → 'MAX_RETRIES'
 * toScreamingSnakeCase('apiKey') → 'API_KEY'
 */
export function toScreamingSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toUpperCase()
    .replace(/^_/, '');
}

/**
 * Convert string value to specified type
 * @param value - String value from environment variable
 * @param type - Target type for conversion
 * @returns Converted value
 * @throws Error if JSON parsing fails
 */
export function convertType(
  value: string,
  type: 'string' | 'number' | 'boolean' | 'json',
): any {
  switch (type) {
    case 'number': {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Cannot convert "${value}" to number: result is NaN`);
      }
      return num;
    }
    case 'boolean':
      return (
        value.toLowerCase() === 'true' ||
        value === '1' ||
        value.toLowerCase() === 'yes'
      );
    case 'json':
      try {
        return JSON.parse(value);
      } catch (error) {
        throw new Error(
          `Cannot parse "${value}" as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    default:
      return value;
  }
}

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
export function loadEnvConfig<T extends Record<string, any>>(
  userOptions: Partial<T> = {},
  options: ConfigOptions<T> = {},
): T {
  const {
    prefix = 'HAVE',
    packageName,
    schema = {},
    transform = {},
    allowUnknown = true,
  } = options;

  // Build environment variable prefix
  const envPrefix =
    packageName && prefix
      ? `${prefix}_${packageName.toUpperCase()}_`
      : prefix
        ? `${prefix}_`
        : '';

  // Start with user options (highest precedence)
  const config: Record<string, any> = { ...userOptions };

  // Determine which fields to scan for
  const fieldsToScan = allowUnknown
    ? // Scan all env vars if allowUnknown is true
      new Set([
        ...Object.keys(schema),
        // Also scan environment for any matching vars
        ...Object.keys(process.env)
          .filter((key) => envPrefix && key.startsWith(envPrefix))
          .map((key) => {
            const fieldName = key.slice(envPrefix.length);
            return toCamelCase(fieldName);
          }),
      ])
    : // Only scan schema fields if allowUnknown is false
      new Set(Object.keys(schema));

  // Scan environment for each field
  for (const fieldName of fieldsToScan) {
    // Skip if user explicitly provided this field
    if (fieldName in userOptions) {
      continue;
    }

    // Convert field name to env var name
    const envVarName = envPrefix
      ? envPrefix + toScreamingSnakeCase(fieldName)
      : fieldName;

    const envValue = process.env[envVarName];

    // Skip if env var not set
    if (envValue === undefined) {
      continue;
    }

    // Apply transform function if provided
    if (transform[fieldName as keyof T]) {
      try {
        config[fieldName] = transform[fieldName as keyof T]?.(envValue);
      } catch (error) {
        console.warn(
          `Failed to transform ${envVarName}="${envValue}":`,
          error instanceof Error ? error.message : error,
        );
      }
      continue;
    }

    // Apply schema type conversion if defined
    const fieldType = schema[fieldName as keyof T];
    if (fieldType) {
      try {
        config[fieldName] = convertType(envValue, fieldType);
      } catch (error) {
        console.warn(
          `Failed to convert ${envVarName}="${envValue}" to ${fieldType}:`,
          error instanceof Error ? error.message : error,
        );
      }
      continue;
    }

    // Default to string if no schema or transform
    config[fieldName] = envValue;
  }

  return config as T;
}
