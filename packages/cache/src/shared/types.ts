/**
 * Core types and interfaces for the Cache library
 */

/**
 * Standardized cache entry structure (internal use)
 */
export interface CacheEntry<T = any> {
  /**
   * The cached value
   */
  value: T;

  /**
   * When this entry was created (Unix timestamp in milliseconds)
   */
  createdAt: number;

  /**
   * When this entry will expire (Unix timestamp in milliseconds)
   * undefined means no expiration
   */
  expiresAt?: number;

  /**
   * Size in bytes (for memory/disk management)
   */
  size: number;

  /**
   * Number of times this entry has been accessed
   */
  hits: number;

  /**
   * Additional metadata
   */
  metadata?: {
    compressed?: boolean;
    serialized?: boolean;
    namespace?: string;
  };
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /**
   * Total number of cached entries
   */
  entries: number;

  /**
   * Total size in bytes
   */
  totalSize: number;

  /**
   * Cache hit count
   */
  hits: number;

  /**
   * Cache miss count
   */
  misses: number;

  /**
   * Hit rate (hits / (hits + misses))
   */
  hitRate: number;

  /**
   * Number of evictions (entries removed due to size/TTL)
   */
  evictions: number;

  /**
   * Backend-specific statistics
   */
  backend?: {
    type: 'memory' | 'file' | 'redis';
    [key: string]: any;
  };
}

/**
 * Cache provider interface - all providers must implement this
 */
export interface CacheProvider {
  /**
   * Retrieves a value from the cache by key
   * @param key - The cache key
   * @returns Promise resolving to the cached value, or undefined if not found or expired
   */
  get<T = any>(key: string): Promise<T | undefined>;

  /**
   * Stores a value in the cache with an optional time-to-live
   * @param key - The cache key
   * @param value - The value to cache
   * @param ttl - Optional time-to-live in seconds
   * @returns Promise resolving when the value is cached
   */
  set<T = any>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Checks if a key exists in the cache and is not expired
   * @param key - The cache key
   * @returns Promise resolving to true if the key exists and is valid
   */
  has(key: string): Promise<boolean>;

  /**
   * Removes a value from the cache
   * @param key - The cache key
   * @returns Promise resolving to true if the key was deleted, false if it didn't exist
   */
  delete(key: string): Promise<boolean>;

  /**
   * Clears all entries from the cache, or all entries in a namespace if specified
   * @param namespace - Optional namespace to clear
   * @returns Promise resolving when the cache is cleared
   */
  clear(namespace?: string): Promise<void>;

  /**
   * Gets all keys in the cache, optionally filtered by a pattern
   * @param pattern - Optional glob-style pattern to filter keys
   * @returns Promise resolving to an array of matching keys
   */
  keys(pattern?: string): Promise<string[]>;

  /**
   * Retrieves multiple values from the cache
   * @param keys - An array of cache keys
   * @returns Promise resolving to a map of key-value pairs
   */
  getMany<T = any>(keys: string[]): Promise<Map<string, T>>;

  /**
   * Stores multiple key-value pairs in the cache
   * @param entries - An array of {key, value, ttl?} objects
   * @returns Promise resolving when all values are cached
   */
  setMany<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void>;

  /**
   * Removes multiple values from the cache
   * @param keys - An array of cache keys
   * @returns Promise resolving to the number of keys deleted
   */
  deleteMany(keys: string[]): Promise<number>;

  /**
   * Gets cache statistics
   * @returns Promise resolving to cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Updates the TTL for an existing cache entry
   * @param key - The cache key
   * @param ttl - New time-to-live in seconds
   * @returns Promise resolving to true if TTL was updated, false if key doesn't exist
   */
  touch(key: string, ttl: number): Promise<boolean>;

  /**
   * Closes the cache connection/cleanup resources
   * @returns Promise resolving when cleanup is complete
   */
  close(): Promise<void>;
}

/**
 * Cache adapter interface (structurally identical to CacheProvider)
 */
export interface CacheAdapter extends CacheProvider {}

/**
 * Memory cache options
 */
export interface MemoryOptions {
  provider: 'memory';
  namespace?: string;
  defaultTTL?: number;
  maxSize?: number;
  maxEntries?: number;
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
  checkPeriod?: number;
}

/**
 * File cache options
 */
export interface FileOptions {
  provider: 'file';
  cacheDir: string;
  namespace?: string;
  defaultTTL?: number;
  maxSize?: number;
  compression?: boolean;
  fileExtension?: string;
  checkPeriod?: number;
}

/**
 * Redis cache options
 */
export interface RedisOptions {
  provider: 'redis';
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  namespace?: string;
  keyPrefix?: string;
  defaultTTL?: number;
  enableCompression?: boolean;
  compressionThreshold?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  retryStrategy?: (times: number) => number | null;
}

/**
 * Discriminated union of all cache adapter options
 */
export type CacheAdapterOptions = MemoryOptions | FileOptions | RedisOptions;

/**
 * Base cache error class
 */
export class CacheError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

/**
 * Invalid cache key error
 */
export class CacheKeyError extends CacheError {
  constructor(
    public key: string,
    provider: string,
  ) {
    super(`Invalid cache key: ${key}`, 'INVALID_KEY', provider);
    this.name = 'CacheKeyError';
  }
}

/**
 * Cache connection error
 */
export class CacheConnectionError extends CacheError {
  constructor(message: string, provider: string) {
    super(message, 'CONNECTION_ERROR', provider);
    this.name = 'CacheConnectionError';
  }
}

/**
 * Cache size limit exceeded error
 */
export class CacheSizeError extends CacheError {
  constructor(message: string, provider: string) {
    super(message, 'SIZE_EXCEEDED', provider);
    this.name = 'CacheSizeError';
  }
}

/**
 * Cache serialization error
 */
export class CacheSerializationError extends CacheError {
  constructor(message: string, provider: string) {
    super(message, 'SERIALIZATION_ERROR', provider);
    this.name = 'CacheSerializationError';
  }
}
