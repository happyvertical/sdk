/**
 * Integration tests for File cache provider
 */

import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCache } from './index';
import type { ICacheAdapter } from './shared/types';

describe('File Cache Provider Integration', () => {
  let cache: ICacheAdapter;
  // Kept outside the repository so a failed assertion cannot leave a cache
  // directory in the working tree.
  let testRoot: string;
  let testCacheDir: string;

  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'have-cache-file-'));
    testCacheDir = join(testRoot, 'test-cache');

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
    await rm(testRoot, { recursive: true, force: true });
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

  describe('cache directory initialization', () => {
    it('creates the cache directory before the first write', async () => {
      // The provider cannot await directory creation in its constructor, so a
      // write issued immediately after must still wait for it.
      //
      // The nesting is load-bearing, and not because deeper paths are "slow":
      // mkdir({recursive}) costs one round trip per missing level, while set()
      // costs two before it writes (the readdir under evictIfNeeded, then
      // writeFile). At one level mkdir wins the race and this test passes even
      // with the bug present; at two or more it loses every time. Keep the
      // depth here, or this stops testing anything.
      const nested = join(testRoot, 'a', 'b', 'c', 'dev-cache');

      const provider = await getCache({
        provider: 'file',
        cacheDir: nested,
        compression: false,
      });

      try {
        await provider.set('dev-key', { debug: true, data: 'test' });
        expect(await provider.get('dev-key')).toEqual({
          debug: true,
          data: 'test',
        });
      } finally {
        await provider.close();
      }
    });

    it('surfaces a failed directory creation and retries once it clears', async () => {
      // A path underneath a regular file can never be created (ENOTDIR). The
      // constructor starts that mkdir and nothing awaits it, so without a
      // handler the rejection escapes and Node terminates the process.
      const obstruction = join(testRoot, 'obstruction');
      await writeFile(obstruction, 'not a directory');

      const provider = await getCache({
        provider: 'file',
        cacheDir: join(obstruction, 'cache'),
        compression: false,
      });

      try {
        await expect(provider.set('key', 'value')).rejects.toMatchObject({
          code: 'INIT_ERROR',
        });

        // A failed creation must not latch: once the obstruction is gone the
        // provider has to retry rather than replay the settled rejection.
        await rm(obstruction, { force: true });

        await provider.set('key', 'value');
        expect(await provider.get('key')).toBe('value');
      } finally {
        await provider.close();
      }
    });

    it('resolves a relative cache directory once, at construction', async () => {
      // Every other test passes an absolute path. Round-tripping a value
      // through a relative one is not enough to pin this: fs resolves a
      // relative path against cwd on every call, so it behaves identically
      // until cwd moves. What the constructor's resolve() actually buys is a
      // path that stops depending on cwd, so assert the resolved path itself.
      const dir = join(testRoot, 'relative-cache');

      const provider = await getCache({
        provider: 'file',
        cacheDir: relative(process.cwd(), dir),
        compression: false,
      });

      try {
        await provider.set('relative-key', 'value');
        expect(await provider.get('relative-key')).toBe('value');

        const stats = await provider.getStats();
        expect(stats.backend?.cacheDir).toBe(dir);
      } finally {
        await provider.close();
      }

      // Written through the relative path, readable at the absolute one.
      expect(existsSync(dir)).toBe(true);
    });

    it('recreates the cache directory after clear removes it', async () => {
      const dir = join(testRoot, 'cleared-cache');

      const provider = await getCache({
        provider: 'file',
        cacheDir: dir,
        compression: false,
      });

      try {
        await provider.set('before', 'value');
        await provider.clear();

        // clear() deletes the directory itself, so the provider has to create
        // it again rather than reusing its memoized initialization.
        await provider.set('after', 'value');
        expect(await provider.get('after')).toBe('value');
        expect(await provider.get('before')).toBeUndefined();
      } finally {
        await provider.close();
      }
    });
  });
});
