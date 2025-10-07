/**
 * Integration tests for Redis cache provider
 * These tests require a running Redis instance
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCache } from './index';
import type { ICacheAdapter } from './shared/types';

// Skip tests if Redis is not explicitly configured
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const SKIP_REDIS = !process.env.REDIS_HOST;

describe.skipIf(SKIP_REDIS)('Redis Cache Provider Integration', () => {
  let cache: ICacheAdapter;

  beforeEach(async () => {
    try {
      cache = await getCache({
        provider: 'redis',
        host: REDIS_HOST,
        port: REDIS_PORT,
        namespace: 'test',
        defaultTTL: 60,
      });

      // Clear test namespace
      await cache.clear('test');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  });

  afterEach(async () => {
    if (cache) {
      await cache.clear('test');
      await cache.close();
    }
  });

  describe('basic operations', () => {
    it('should set and get a value', async () => {
      await cache.set('key1', { name: 'value1' });
      const result = await cache.get('key1');
      expect(result).toEqual({ name: 'value1' });
    });

    it('should return undefined for non-existent key', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.has('key1')).toBe(true);
      expect(await cache.has('nonexistent')).toBe(false);
    });

    it('should delete a key', async () => {
      await cache.set('key1', 'value1');
      expect(await cache.delete('key1')).toBe(true);
      expect(await cache.has('key1')).toBe(false);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire entries after TTL', async () => {
      await cache.set('key1', 'value1', 1); // 1 second TTL
      expect(await cache.has('key1')).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await cache.has('key1')).toBe(false);
    });

    it('should update TTL with touch', async () => {
      await cache.set('key1', 'value1', 1);
      expect(await cache.touch('key1', 10)).toBe(true);

      // Wait 1.5 seconds (would have expired without touch)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await cache.has('key1')).toBe(true);
    });
  });

  describe('batch operations', () => {
    it('should get many values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const results = await cache.getMany([
        'key1',
        'key2',
        'key3',
        'nonexistent',
      ]);

      expect(results.size).toBe(3);
      expect(results.get('key1')).toBe('value1');
      expect(results.get('key2')).toBe('value2');
      expect(results.get('key3')).toBe('value3');
    });

    it('should set many values', async () => {
      await cache.setMany([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: { data: 'value3' } },
      ]);

      expect(await cache.get('key1')).toBe('value1');
      expect(await cache.get('key2')).toBe('value2');
      expect(await cache.get('key3')).toEqual({ data: 'value3' });
    });

    it('should delete many values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const deleted = await cache.deleteMany(['key1', 'key2', 'nonexistent']);

      expect(deleted).toBeGreaterThanOrEqual(2);
      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(false);
      expect(await cache.has('key3')).toBe(true);
    });
  });

  describe('keys and patterns', () => {
    it('should list all keys', async () => {
      await cache.set('user:1', 'value1');
      await cache.set('user:2', 'value2');
      await cache.set('product:1', 'value3');

      const keys = await cache.keys();

      expect(keys).toHaveLength(3);
      expect(keys).toContain('user:1');
      expect(keys).toContain('user:2');
      expect(keys).toContain('product:1');
    });

    it('should filter keys by pattern', async () => {
      await cache.set('user:1', 'value1');
      await cache.set('user:2', 'value2');
      await cache.set('product:1', 'value3');

      const userKeys = await cache.keys('user:*');

      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
    });
  });

  describe('compression', () => {
    it('should compress large values when enabled', async () => {
      const compressedCache = await getCache({
        provider: 'redis',
        host: REDIS_HOST,
        port: REDIS_PORT,
        namespace: 'test-compressed',
        enableCompression: true,
        compressionThreshold: 100,
      });

      const largeValue = { data: 'x'.repeat(1000) };
      await compressedCache.set('large', largeValue);
      const result = await compressedCache.get('large');

      expect(result).toEqual(largeValue);

      await compressedCache.clear('test-compressed');
      await compressedCache.close();
    });
  });
});
