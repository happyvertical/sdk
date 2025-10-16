/**
 * Integration tests for Memory cache provider
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCache } from './index';
import type { ICacheAdapter } from './shared/types';

describe('Memory Cache Provider Integration', () => {
  let cache: ICacheAdapter;

  beforeEach(async () => {
    cache = await getCache({
      provider: 'memory',
      namespace: 'test',
      defaultTTL: 60,
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 100,
      evictionPolicy: 'lru',
    });
  });

  afterEach(async () => {
    await cache.close();
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

    it('should return false when deleting non-existent key', async () => {
      expect(await cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.clear();
      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(false);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire entries after TTL', async () => {
      await cache.set('key1', 'value1', 1); // 1 second TTL
      expect(await cache.has('key1')).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(await cache.has('key1')).toBe(false);
      expect(await cache.get('key1')).toBeUndefined();
    });

    it('should update TTL with touch', async () => {
      await cache.set('key1', 'value1', 1);
      await cache.touch('key1', 10); // Extend TTL to 10 seconds

      // Wait 2 seconds (would have expired without touch)
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
      expect(results.has('nonexistent')).toBe(false);
    });

    it('should set many values', async () => {
      await cache.setMany([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2', ttl: 60 },
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

      expect(deleted).toBe(2);
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

  describe('statistics', () => {
    it('should track cache statistics', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      await cache.get('key1'); // Hit
      await cache.get('key1'); // Hit
      await cache.get('nonexistent'); // Miss

      const stats = await cache.getStats();

      expect(stats.entries).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.666, 2);
    });
  });

  describe('data types', () => {
    it('should cache strings', async () => {
      await cache.set('string', 'hello world');
      expect(await cache.get('string')).toBe('hello world');
    });

    it('should cache numbers', async () => {
      await cache.set('number', 42);
      expect(await cache.get('number')).toBe(42);
    });

    it('should cache booleans', async () => {
      await cache.set('bool', true);
      expect(await cache.get('bool')).toBe(true);
    });

    it('should cache objects', async () => {
      const obj = { name: 'John', age: 30, active: true };
      await cache.set('object', obj);
      expect(await cache.get('object')).toEqual(obj);
    });

    it('should cache arrays', async () => {
      const arr = [1, 2, 3, 'four', { five: 5 }];
      await cache.set('array', arr);
      expect(await cache.get('array')).toEqual(arr);
    });
  });
});
