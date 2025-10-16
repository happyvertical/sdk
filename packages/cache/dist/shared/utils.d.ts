/**
 * Utility functions for cache operations
 */
/**
 * Validates a cache key
 * @param key - The cache key to validate
 * @returns True if the key is valid
 */
export declare function isValidKey(key: string): boolean;
/**
 * Calculates the size of a value in bytes (approximate)
 * @param value - The value to measure
 * @returns Size in bytes
 */
export declare function calculateSize(value: any): number;
/**
 * Checks if a pattern matches a string (glob-style)
 * @param pattern - The glob pattern (supports * wildcard)
 * @param str - The string to test
 * @returns True if the pattern matches
 */
export declare function matchesPattern(pattern: string, str: string): boolean;
/**
 * Formats a namespace and key into a full key
 * @param namespace - Optional namespace
 * @param key - The cache key
 * @returns Formatted key with namespace prefix if provided
 */
export declare function formatKey(namespace: string | undefined, key: string): string;
/**
 * Extracts the original key from a namespaced key
 * @param namespace - Optional namespace
 * @param fullKey - The full key with namespace
 * @returns Original key without namespace
 */
export declare function extractKey(namespace: string | undefined, fullKey: string): string;
/**
 * Checks if an entry has expired
 * @param expiresAt - Expiration timestamp (undefined means no expiration)
 * @returns True if the entry has expired
 */
export declare function isExpired(expiresAt: number | undefined): boolean;
/**
 * Calculates expiration timestamp from TTL
 * @param ttl - Time-to-live in seconds (undefined means no expiration)
 * @returns Expiration timestamp in milliseconds, or undefined
 */
export declare function calculateExpiration(ttl: number | undefined): number | undefined;
/**
 * Serializes a value to JSON string
 * @param value - The value to serialize
 * @returns JSON string
 * @throws Error if serialization fails
 */
export declare function serialize(value: any): string;
/**
 * Deserializes a JSON string to a value
 * @param json - The JSON string
 * @returns Deserialized value
 * @throws Error if deserialization fails
 */
export declare function deserialize<T = any>(json: string): T;
//# sourceMappingURL=utils.d.ts.map