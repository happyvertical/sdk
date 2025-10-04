/**
 * Redis cache provider implementation
 */

import { createClient, type RedisClientType } from 'redis';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { CacheStats, ICacheProvider, RedisOptions } from '../shared/types';
import {
  CacheConnectionError,
  CacheError,
  CacheKeyError,
  CacheSerializationError,
} from '../shared/types';
import {
  calculateSize,
  deserialize,
  formatKey,
  isValidKey,
  matchesPattern,
  serialize,
} from '../shared/utils';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Redis cache provider implementation
 * Uses official redis client with optional compression
 */
export class RedisProvider implements ICacheProvider {
  private client: RedisClientType;
  private namespace?: string;
  private defaultTTL?: number;
  private enableCompression: boolean;
  private compressionThreshold: number;
  private stats: {
    hits: number;
    misses: number;
  };
  private connected: boolean = false;

  constructor(private options: RedisOptions) {
    this.namespace = options.namespace || options.keyPrefix;
    this.defaultTTL = options.defaultTTL;
    this.enableCompression = options.enableCompression ?? false;
    this.compressionThreshold = options.compressionThreshold || 1024;
    this.stats = {
      hits: 0,
      misses: 0,
    };

    // Create Redis client
    this.client = createClient({
      socket: {
        host: options.host || 'localhost',
        port: options.port || 6379,
        connectTimeout: options.connectTimeout || 5000,
      },
      password: options.password,
      database: options.db || 0,
      commandsQueueMaxLength: 1000,
    }) as RedisClientType;

    // Setup error handling
    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.client.on('connect', () => {
      this.connected = true;
    });

    this.client.on('end', () => {
      this.connected = false;
    });
  }

  /**
   * Ensures the client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      try {
        await this.client.connect();
        this.connected = true;
      } catch (error: any) {
        throw new CacheConnectionError(
          `Failed to connect to Redis: ${error.message}`,
          'redis',
        );
      }
    }
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'redis');
    }

    await this.ensureConnected();

    const fullKey = formatKey(this.namespace, key);

    try {
      const value = await this.client.get(fullKey);

      if (value === null) {
        this.stats.misses++;
        return undefined;
      }

      this.stats.hits++;

      // Decompress if needed (check for compression marker)
      let data = value;
      if (this.enableCompression && value.startsWith('gzip:')) {
        const compressed = Buffer.from(value.slice(5), 'base64');
        const decompressed = await gunzipAsync(compressed);
        data = decompressed.toString('utf-8');
      }

      return deserialize<T>(data);
    } catch (error: any) {
      throw new CacheError(
        `Failed to get cache entry: ${error.message}`,
        'GET_ERROR',
        'redis',
      );
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'redis');
    }

    await this.ensureConnected();

    const fullKey = formatKey(this.namespace, key);

    try {
      let data = serialize(value);

      // Compress if enabled and value is large enough
      if (this.enableCompression && data.length > this.compressionThreshold) {
        const compressed = await gzipAsync(Buffer.from(data, 'utf-8'));
        data = 'gzip:' + compressed.toString('base64');
      }

      const effectiveTTL = ttl ?? this.defaultTTL;

      if (effectiveTTL !== undefined && effectiveTTL > 0) {
        await this.client.setEx(fullKey, effectiveTTL, data);
      } else {
        await this.client.set(fullKey, data);
      }
    } catch (error: any) {
      if (error.message?.includes('serialize')) {
        throw new CacheSerializationError(
          `Failed to serialize value: ${error.message}`,
          'redis',
        );
      }
      throw new CacheError(
        `Failed to set cache entry: ${error.message}`,
        'SET_ERROR',
        'redis',
      );
    }
  }

  async has(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'redis');
    }

    await this.ensureConnected();

    const fullKey = formatKey(this.namespace, key);

    try {
      const exists = await this.client.exists(fullKey);
      return exists === 1;
    } catch (error: any) {
      throw new CacheError(
        `Failed to check cache entry: ${error.message}`,
        'EXISTS_ERROR',
        'redis',
      );
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'redis');
    }

    await this.ensureConnected();

    const fullKey = formatKey(this.namespace, key);

    try {
      const deleted = await this.client.del(fullKey);
      return deleted === 1;
    } catch (error: any) {
      throw new CacheError(
        `Failed to delete cache entry: ${error.message}`,
        'DELETE_ERROR',
        'redis',
      );
    }
  }

  async clear(namespace?: string): Promise<void> {
    await this.ensureConnected();

    try {
      if (namespace) {
        // Clear specific namespace
        const pattern = `${namespace}:*`;
        let cursor = '0';

        do {
          const reply = await this.client.scan(cursor, {
            MATCH: pattern,
            COUNT: 100,
          });

          cursor = reply.cursor;

          if (reply.keys.length > 0) {
            await this.client.del(reply.keys);
          }
        } while (cursor !== '0');
      } else {
        // Clear all keys (use with caution!)
        await this.client.flushDb();
        this.stats.hits = 0;
        this.stats.misses = 0;
      }
    } catch (error: any) {
      throw new CacheError(
        `Failed to clear cache: ${error.message}`,
        'CLEAR_ERROR',
        'redis',
      );
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    await this.ensureConnected();

    try {
      const searchPattern = pattern
        ? formatKey(this.namespace, pattern)
        : formatKey(this.namespace, '*');

      const keys: string[] = [];
      let cursor = '0';

      do {
        const reply = await this.client.scan(cursor, {
          MATCH: searchPattern,
          COUNT: 100,
        });

        cursor = reply.cursor;
        keys.push(...reply.keys);
      } while (cursor !== '0');

      // Remove namespace prefix if present
      if (this.namespace) {
        const prefix = `${this.namespace}:`;
        return keys.map((key) =>
          key.startsWith(prefix) ? key.slice(prefix.length) : key,
        );
      }

      return keys;
    } catch (error: any) {
      throw new CacheError(
        `Failed to get cache keys: ${error.message}`,
        'KEYS_ERROR',
        'redis',
      );
    }
  }

  async getMany<T = any>(keys: string[]): Promise<Map<string, T>> {
    if (keys.length === 0) {
      return new Map();
    }

    await this.ensureConnected();

    const fullKeys = keys.map((key) => formatKey(this.namespace, key));

    try {
      const values = await this.client.mGet(fullKeys);
      const result = new Map<string, T>();

      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        if (value !== null) {
          // Decompress if needed
          let data = value;
          if (this.enableCompression && value.startsWith('gzip:')) {
            const compressed = Buffer.from(value.slice(5), 'base64');
            const decompressed = await gunzipAsync(compressed);
            data = decompressed.toString('utf-8');
          }

          result.set(keys[i], deserialize<T>(data));
          this.stats.hits++;
        } else {
          this.stats.misses++;
        }
      }

      return result;
    } catch (error: any) {
      throw new CacheError(
        `Failed to get multiple cache entries: ${error.message}`,
        'MGET_ERROR',
        'redis',
      );
    }
  }

  async setMany<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await this.ensureConnected();

    try {
      // Use pipeline for efficiency
      const pipeline = this.client.multi();

      for (const entry of entries) {
        const fullKey = formatKey(this.namespace, entry.key);
        let data = serialize(entry.value);

        // Compress if enabled and value is large enough
        if (this.enableCompression && data.length > this.compressionThreshold) {
          const compressed = await gzipAsync(Buffer.from(data, 'utf-8'));
          data = 'gzip:' + compressed.toString('base64');
        }

        const effectiveTTL = entry.ttl ?? this.defaultTTL;

        if (effectiveTTL !== undefined && effectiveTTL > 0) {
          pipeline.setEx(fullKey, effectiveTTL, data);
        } else {
          pipeline.set(fullKey, data);
        }
      }

      await pipeline.exec();
    } catch (error: any) {
      throw new CacheError(
        `Failed to set multiple cache entries: ${error.message}`,
        'MSET_ERROR',
        'redis',
      );
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    await this.ensureConnected();

    const fullKeys = keys.map((key) => formatKey(this.namespace, key));

    try {
      const deleted = await this.client.del(fullKeys);
      return deleted;
    } catch (error: any) {
      throw new CacheError(
        `Failed to delete multiple cache entries: ${error.message}`,
        'MDEL_ERROR',
        'redis',
      );
    }
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureConnected();

    try {
      // Get Redis INFO stats
      const info = await this.client.info('stats');
      const dbInfo = await this.client.info('keyspace');

      // Parse keyspace info to get entry count
      const dbMatch = dbInfo.match(/db\d+:keys=(\d+)/);
      const entries = dbMatch ? parseInt(dbMatch[1], 10) : 0;

      // Parse stats info
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);
      const redisHits = hitsMatch ? parseInt(hitsMatch[1], 10) : 0;
      const redisMisses = missesMatch ? parseInt(missesMatch[1], 10) : 0;

      const totalHits = this.stats.hits + redisHits;
      const totalMisses = this.stats.misses + redisMisses;
      const totalAccesses = totalHits + totalMisses;
      const hitRate = totalAccesses > 0 ? totalHits / totalAccesses : 0;

      return {
        entries,
        totalSize: 0, // Redis doesn't easily expose total memory per keyspace
        hits: totalHits,
        misses: totalMisses,
        hitRate,
        evictions: 0, // Would need to parse evicted_keys from stats
        backend: {
          type: 'redis',
          host: this.options.host || 'localhost',
          port: this.options.port || 6379,
          db: this.options.db || 0,
          compression: this.enableCompression,
        },
      };
    } catch (error: any) {
      throw new CacheError(
        `Failed to get cache stats: ${error.message}`,
        'STATS_ERROR',
        'redis',
      );
    }
  }

  async touch(key: string, ttl: number): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'redis');
    }

    await this.ensureConnected();

    const fullKey = formatKey(this.namespace, key);

    try {
      const result = await this.client.expire(fullKey, ttl);
      return result === 1;
    } catch (error: any) {
      throw new CacheError(
        `Failed to touch cache entry: ${error.message}`,
        'TOUCH_ERROR',
        'redis',
      );
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      try {
        await this.client.quit();
        this.connected = false;
      } catch (error: any) {
        // Force disconnect if graceful quit fails
        await this.client.disconnect();
        this.connected = false;
      }
    }
  }
}
