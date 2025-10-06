/**
 * Utility functions for cache operations
 */

/**
 * Validates a cache key
 * @param key - The cache key to validate
 * @returns True if the key is valid
 */
export function isValidKey(key: string): boolean {
  return typeof key === 'string' && key.length > 0 && key.length <= 250;
}

/**
 * Calculates the size of a value in bytes (approximate)
 * @param value - The value to measure
 * @returns Size in bytes
 */
export function calculateSize(value: any): number {
  try {
    const json = JSON.stringify(value);
    return new Blob([json]).size;
  } catch {
    // Fallback to rough estimate if stringify fails
    return 0;
  }
}

/**
 * Checks if a pattern matches a string (glob-style)
 * @param pattern - The glob pattern (supports * wildcard)
 * @param str - The string to test
 * @returns True if the pattern matches
 */
export function matchesPattern(pattern: string, str: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(str);
}

/**
 * Formats a namespace and key into a full key
 * @param namespace - Optional namespace
 * @param key - The cache key
 * @returns Formatted key with namespace prefix if provided
 */
export function formatKey(namespace: string | undefined, key: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

/**
 * Extracts the original key from a namespaced key
 * @param namespace - Optional namespace
 * @param fullKey - The full key with namespace
 * @returns Original key without namespace
 */
export function extractKey(
  namespace: string | undefined,
  fullKey: string,
): string {
  if (!namespace) {
    return fullKey;
  }
  const prefix = `${namespace}:`;
  return fullKey.startsWith(prefix) ? fullKey.slice(prefix.length) : fullKey;
}

/**
 * Checks if an entry has expired
 * @param expiresAt - Expiration timestamp (undefined means no expiration)
 * @returns True if the entry has expired
 */
export function isExpired(expiresAt: number | undefined): boolean {
  if (expiresAt === undefined) {
    return false;
  }
  return Date.now() >= expiresAt;
}

/**
 * Calculates expiration timestamp from TTL
 * @param ttl - Time-to-live in seconds (undefined means no expiration)
 * @returns Expiration timestamp in milliseconds, or undefined
 */
export function calculateExpiration(
  ttl: number | undefined,
): number | undefined {
  if (ttl === undefined || ttl <= 0) {
    return undefined;
  }
  return Date.now() + ttl * 1000;
}

/**
 * Serializes a value to JSON string
 * @param value - The value to serialize
 * @returns JSON string
 * @throws Error if serialization fails
 */
export function serialize(value: any): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(
      `Failed to serialize value: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Deserializes a JSON string to a value
 * @param json - The JSON string
 * @returns Deserialized value
 * @throws Error if deserialization fails
 */
export function deserialize<T = any>(json: string): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Failed to deserialize value: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
