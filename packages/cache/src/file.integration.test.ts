/**
 * Integration tests for File cache provider
 */

import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCache } from './index';
import type { ICacheAdapter } from './shared/types';

describe('File Cache Provider Integration', () => {
  let cache: ICacheAdapter;
  const testCacheDir = './test-cache';

  beforeEach(async () => {
    // Clean up test directory
    await rm(testCacheDir, { recursive: true, force: true });

    cache = await getCache({
      provider: 'file',
      cacheDir: testCacheDir,
      namespace: 'test',
      defaultTTL: 60,
      compression: false,
    });
  });

  afterEach(async () => {
    await cache.close();
    // Clean up test directory
    await rm(testCacheDir, { recursive: true, force: true });
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

  describe('persistence', () => {
    it('should persist data across cache instances', async () => {
      await cache.set('persistent', 'data');
      await cache.close();

      // Create new instance
      const cache2 = await getCache({
        provider: 'file',
        cacheDir: testCacheDir,
        namespace: 'test',
      });

      const result = await cache2.get('persistent');
      expect(result).toBe('data');

      await cache2.close();
    });
  });

  describe('compression', () => {
    it('should compress large values when enabled', async () => {
      const compressedCache = await getCache({
        provider: 'file',
        cacheDir: `${testCacheDir}-compressed`,
        compression: true,
      });

      const largeValue = { data: 'x'.repeat(10000) };
      await compressedCache.set('large', largeValue);
      const result = await compressedCache.get('large');

      expect(result).toEqual(largeValue);

      await compressedCache.close();
      await rm(`${testCacheDir}-compressed`, { recursive: true, force: true });
    });
  });

  describe('batch operations', () => {
    it('should set and get many values', async () => {
      await cache.setMany([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' },
      ]);

      const results = await cache.getMany(['key1', 'key2', 'key3']);

      expect(results.size).toBe(3);
      expect(results.get('key1')).toBe('value1');
      expect(results.get('key2')).toBe('value2');
      expect(results.get('key3')).toBe('value3');
    });
  });
});
