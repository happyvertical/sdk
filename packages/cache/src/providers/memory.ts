/**
 * Memory cache provider implementation with LRU eviction
 */

import type {
  CacheEntry,
  CacheStats,
  CacheProvider,
  MemoryOptions,
} from '../shared/types';
import { CacheKeyError, CacheSizeError } from '../shared/types';
import {
  calculateExpiration,
  calculateSize,
  extractKey,
  formatKey,
  isExpired,
  isValidKey,
  matchesPattern,
} from '../shared/utils';

/**
 * Memory cache provider implementation
 * Stores cache entries in memory with LRU eviction
 */
export class MemoryProvider implements CacheProvider {
  private cache: Map<string, CacheEntry>;
  private namespace?: string;
  private defaultTTL?: number;
  private maxSize: number;
  private maxEntries: number;
  private evictionPolicy: 'lru' | 'lfu' | 'fifo';
  private checkPeriod: number;
  private checkInterval?: NodeJS.Timeout;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  constructor(options: MemoryOptions) {
    this.cache = new Map();
    this.namespace = options.namespace;
    this.defaultTTL = options.defaultTTL;
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default
    this.maxEntries = options.maxEntries || 10000; // 10k entries default
    this.evictionPolicy = options.evictionPolicy || 'lru';
    this.checkPeriod = options.checkPeriod || 60000; // 1 minute default
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };

    // Start background expiration check
    this.startExpirationCheck();
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'memory');
    }

    const fullKey = formatKey(this.namespace, key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (isExpired(entry.expiresAt)) {
      this.cache.delete(fullKey);
      this.stats.misses++;
      return undefined;
    }

    // Update access statistics for LRU/LFU
    entry.hits++;

    // For LRU, move to end of map (most recently used)
    if (this.evictionPolicy === 'lru') {
      this.cache.delete(fullKey);
      this.cache.set(fullKey, entry);
    }

    this.stats.hits++;
    return entry.value as T;
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'memory');
    }

    const fullKey = formatKey(this.namespace, key);
    const size = calculateSize(value);
    const expiresAt = calculateExpiration(ttl ?? this.defaultTTL);

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt,
      size,
      hits: 0,
      metadata: {
        namespace: this.namespace,
      },
    };

    // Check if we need to evict entries
    await this.evictIfNeeded(size);

    this.cache.set(fullKey, entry);
  }

  async has(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'memory');
    }

    const fullKey = formatKey(this.namespace, key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (isExpired(entry.expiresAt)) {
      this.cache.delete(fullKey);
      return false;
    }

    return true;
  }

  async delete(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'memory');
    }

    const fullKey = formatKey(this.namespace, key);
    return this.cache.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      // Clear specific namespace
      const prefix = `${namespace}:`;
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all entries
      this.cache.clear();
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.evictions = 0;
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());

    // Filter out expired entries and extract keys without namespace
    const validKeys: string[] = [];
    for (const key of allKeys) {
      const entry = this.cache.get(key);
      if (entry && !isExpired(entry.expiresAt)) {
        validKeys.push(extractKey(this.namespace, key));
      }
    }

    // Apply pattern filter if provided (pattern is applied to the extracted key, not the full key)
    if (pattern) {
      return validKeys.filter((key) => matchesPattern(pattern, key));
    }

    return validKeys;
  }

  async getMany<T = any>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }

  async setMany<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;

    for (const key of keys) {
      const wasDeleted = await this.delete(key);
      if (wasDeleted) {
        deleted++;
      }
    }

    return deleted;
  }

  async getStats(): Promise<CacheStats> {
    // Calculate current cache size
    let totalSize = 0;
    let entries = 0;

    for (const entry of this.cache.values()) {
      if (!isExpired(entry.expiresAt)) {
        totalSize += entry.size;
        entries++;
      }
    }

    const totalAccesses = this.stats.hits + this.stats.misses;
    const hitRate = totalAccesses > 0 ? this.stats.hits / totalAccesses : 0;

    return {
      entries,
      totalSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions,
      backend: {
        type: 'memory',
        evictionPolicy: this.evictionPolicy,
        maxSize: this.maxSize,
        maxEntries: this.maxEntries,
      },
    };
  }

  async touch(key: string, ttl: number): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'memory');
    }

    const fullKey = formatKey(this.namespace, key);
    const entry = this.cache.get(fullKey);

    if (!entry || isExpired(entry.expiresAt)) {
      return false;
    }

    entry.expiresAt = calculateExpiration(ttl);
    return true;
  }

  async close(): Promise<void> {
    // Stop expiration check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    // Clear cache
    this.cache.clear();
  }

  /**
   * Evicts entries if size or count limits are exceeded
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    const stats = await this.getStats();

    // Check if we need to evict based on entry count
    if (stats.entries >= this.maxEntries) {
      await this.evict(1);
    }

    // Check if we need to evict based on size
    while (
      stats.totalSize + newEntrySize > this.maxSize &&
      this.cache.size > 0
    ) {
      await this.evict(1);
      const updatedStats = await this.getStats();
      if (updatedStats.totalSize + newEntrySize <= this.maxSize) {
        break;
      }
    }

    // Final check - if still too large, throw error
    const finalStats = await this.getStats();
    if (finalStats.totalSize + newEntrySize > this.maxSize) {
      throw new CacheSizeError(
        `Cannot cache entry: would exceed max size of ${this.maxSize} bytes`,
        'memory',
      );
    }
  }

  /**
   * Evicts entries based on eviction policy
   */
  private async evict(count: number): Promise<void> {
    if (this.cache.size === 0) {
      return;
    }

    const entries = Array.from(this.cache.entries());

    switch (this.evictionPolicy) {
      case 'lru': {
        // LRU: Remove oldest (first in map, since we move accessed items to end)
        for (let i = 0; i < count && i < entries.length; i++) {
          this.cache.delete(entries[i][0]);
          this.stats.evictions++;
        }
        break;
      }

      case 'lfu': {
        // LFU: Remove least frequently used
        const sorted = entries.sort((a, b) => a[1].hits - b[1].hits);
        for (let i = 0; i < count && i < sorted.length; i++) {
          this.cache.delete(sorted[i][0]);
          this.stats.evictions++;
        }
        break;
      }

      case 'fifo': {
        // FIFO: Remove oldest by creation time
        const sorted = entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
        for (let i = 0; i < count && i < sorted.length; i++) {
          this.cache.delete(sorted[i][0]);
          this.stats.evictions++;
        }
        break;
      }
    }
  }

  /**
   * Starts background task to remove expired entries
   */
  private startExpirationCheck(): void {
    this.checkInterval = setInterval(() => {
      this.removeExpiredEntries();
    }, this.checkPeriod);

    // Don't block process exit
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }

  /**
   * Removes all expired entries from the cache
   */
  private removeExpiredEntries(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
