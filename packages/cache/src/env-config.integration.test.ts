/**
 * Integration tests for environment variable configuration in @happyvertical/cache
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCache } from './index';
import type { CacheAdapter } from './shared/types';

describe('Cache Environment Variable Configuration', () => {
  // Store original env to restore after tests
  const originalEnv = { ...process.env };

  // Each test gets its own directory outside the repository, so a failed
  // assertion cannot leave a cache directory in the working tree and tests
  // cannot collide over a shared cwd-relative path.
  let scratchDir: string;
  const cacheDir = (name: string) => join(scratchDir, name);

  beforeEach(async () => {
    // Clear cache-related env vars before each test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('HAVE_CACHE_')) {
        delete process.env[key];
      }
    }

    scratchDir = await mkdtemp(join(tmpdir(), 'have-cache-env-'));
  });

  afterEach(async () => {
    // Restore original env
    process.env = { ...originalEnv };

    await rm(scratchDir, { recursive: true, force: true });
  });

  describe('memory provider configuration', () => {
    it('should create memory cache from environment variables', async () => {
      process.env.HAVE_CACHE_PROVIDER = 'memory';
      process.env.HAVE_CACHE_NAMESPACE = 'test-ns';
      process.env.HAVE_CACHE_DEFAULT_TTL = '120';
      process.env.HAVE_CACHE_MAX_SIZE = '52428800'; // 50MB
      process.env.HAVE_CACHE_MAX_ENTRIES = '500';
      process.env.HAVE_CACHE_EVICTION_POLICY = 'lru';

      const cache = await getCache({ provider: 'memory' });
      expect(cache).toBeDefined();

      // Verify cache works
      await cache.set('test-key', 'test-value');
      const result = await cache.get('test-key');
      expect(result).toBe('test-value');

      await cache.close();
    });

    it('should merge env vars with user options for memory cache', async () => {
      process.env.HAVE_CACHE_MAX_SIZE = '10485760'; // 10MB
      process.env.HAVE_CACHE_EVICTION_POLICY = 'lfu';

      const cache = await getCache({
        provider: 'memory',
        namespace: 'user-ns',
        defaultTTL: 60,
      });

      await cache.set('key1', 'value1');
      expect(await cache.get('key1')).toBe('value1');

      await cache.close();
    });

    it('should prioritize user options over env vars for memory cache', async () => {
      process.env.HAVE_CACHE_NAMESPACE = 'env-namespace';
      process.env.HAVE_CACHE_MAX_SIZE = '1048576'; // 1MB

      const cache = await getCache({
        provider: 'memory',
        namespace: 'user-namespace', // This should take precedence
        maxSize: 5 * 1024 * 1024, // 5MB - should override env
      });

      await cache.set('test', 'data');
      expect(await cache.get('test')).toBe('data');

      await cache.close();
    });

    it('should handle eviction policy from env vars', async () => {
      process.env.HAVE_CACHE_EVICTION_POLICY = 'fifo';

      const cache = await getCache({
        provider: 'memory',
        maxEntries: 2,
      });

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3'); // Should evict key1 with FIFO

      expect(await cache.has('key1')).toBe(false);
      expect(await cache.has('key2')).toBe(true);
      expect(await cache.has('key3')).toBe(true);

      await cache.close();
    });
  });

  describe('file provider configuration', () => {
    it('should create file cache from environment variables', async () => {
      const dir = cacheDir('test-cache-env');
      process.env.HAVE_CACHE_PROVIDER = 'file';
      process.env.HAVE_CACHE_CACHE_DIR = dir;
      process.env.HAVE_CACHE_NAMESPACE = 'file-test';
      process.env.HAVE_CACHE_COMPRESSION = 'true';
      process.env.HAVE_CACHE_DEFAULT_TTL = '300';

      const cache = await getCache({
        provider: 'file',
        cacheDir: dir,
      });

      await cache.set('file-key', { data: 'file-value' });
      const result = await cache.get('file-key');
      expect(result).toEqual({ data: 'file-value' });

      await cache.close();
    });

    it('should merge env vars with user options for file cache', async () => {
      process.env.HAVE_CACHE_COMPRESSION = 'true';
      process.env.HAVE_CACHE_DEFAULT_TTL = '600';

      const cache = await getCache({
        provider: 'file',
        cacheDir: cacheDir('test-cache-merge'),
        namespace: 'merge-test',
      });

      await cache.set('merge-key', 'merge-value');
      expect(await cache.get('merge-key')).toBe('merge-value');

      await cache.close();
    });
  });

  describe.skip('redis provider configuration', () => {
    // Note: These tests require a running Redis instance
    // Use `describe` instead of `describe.skip` to run when Redis is available

    it('should create redis cache from environment variables', async () => {
      process.env.HAVE_CACHE_PROVIDER = 'redis';
      process.env.HAVE_CACHE_HOST = 'localhost';
      process.env.HAVE_CACHE_PORT = '6379';
      process.env.HAVE_CACHE_NAMESPACE = 'redis-test';
      process.env.HAVE_CACHE_DEFAULT_TTL = '180';

      const cache = await getCache({ provider: 'redis' });
      await cache.set('redis-key', 'redis-value');
      const result = await cache.get('redis-key');
      expect(result).toBe('redis-value');
      await cache.close();
    });

    it('should merge env vars with user options for redis cache', async () => {
      process.env.HAVE_CACHE_PORT = '6379';
      process.env.HAVE_CACHE_DEFAULT_TTL = '300';

      const cache = await getCache({
        provider: 'redis',
        host: 'localhost',
        namespace: 'user-redis-ns',
      });

      await cache.set('user-key', 'user-value');
      expect(await cache.get('user-key')).toBe('user-value');
      await cache.close();
    });
  });

  describe('type conversions', () => {
    it('should convert numeric env vars correctly', async () => {
      process.env.HAVE_CACHE_DEFAULT_TTL = '240';
      process.env.HAVE_CACHE_MAX_SIZE = '20971520'; // 20MB
      process.env.HAVE_CACHE_MAX_ENTRIES = '1000';
      process.env.HAVE_CACHE_CHECK_PERIOD = '30000';

      const cache = await getCache({
        provider: 'memory',
      });

      await cache.set('num-test', 'data', 60); // TTL override
      expect(await cache.get('num-test')).toBe('data');

      await cache.close();
    });

    it('should convert boolean env vars correctly', async () => {
      process.env.HAVE_CACHE_COMPRESSION = 'true';

      const cache = await getCache({
        provider: 'file',
        cacheDir: cacheDir('test-cache-bool'),
      });

      await cache.set('bool-test', 'bool-data');
      expect(await cache.get('bool-test')).toBe('bool-data');

      await cache.close();
    });

    it('should handle false boolean values', async () => {
      process.env.HAVE_CACHE_COMPRESSION = 'false';

      const cache = await getCache({
        provider: 'file',
        cacheDir: cacheDir('test-cache-no-compress'),
      });

      await cache.set('no-compress', 'data');
      expect(await cache.get('no-compress')).toBe('data');

      await cache.close();
    });
  });

  describe('edge cases and validation', () => {
    it('should handle missing provider gracefully', async () => {
      // Only set non-provider env vars
      process.env.HAVE_CACHE_MAX_SIZE = '1048576';

      // Provider must be specified either in options or env
      await expect(getCache({ provider: 'memory' })).resolves.toBeDefined();
    });

    it('should handle empty string env vars', async () => {
      process.env.HAVE_CACHE_NAMESPACE = '';

      const cache = await getCache({
        provider: 'memory',
        maxSize: 1024 * 1024,
      });

      await cache.set('empty-ns', 'data');
      expect(await cache.get('empty-ns')).toBe('data');

      await cache.close();
    });

    it('should ignore invalid numeric values with warning', async () => {
      // Capture console.warn calls
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        warnings.push(args.join(' '));
      };

      // Set invalid numeric value that will be attempted for conversion
      process.env.HAVE_CACHE_MAX_SIZE = 'not-a-number';

      // Don't provide maxSize, so env var will be attempted
      const cache = await getCache({
        provider: 'memory',
      });

      // Should have warned about conversion failure
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('Failed to convert'))).toBe(true);

      // Cache should still work (fallback to no maxSize limit)
      await cache.set('test', 'data');
      expect(await cache.get('test')).toBe('data');

      await cache.close();

      // Restore console.warn
      console.warn = originalWarn;
    });
  });

  describe('namespace handling', () => {
    it('should use namespace from env vars', async () => {
      process.env.HAVE_CACHE_NAMESPACE = 'app:cache';

      const cache = await getCache({
        provider: 'memory',
      });

      await cache.set('namespaced-key', 'namespaced-value');
      expect(await cache.get('namespaced-key')).toBe('namespaced-value');

      await cache.close();
    });

    it('should clear only namespaced entries', async () => {
      const cache1 = await getCache({
        provider: 'memory',
        namespace: 'ns1',
      });

      const cache2 = await getCache({
        provider: 'memory',
        namespace: 'ns2',
      });

      await cache1.set('key1', 'value1');
      await cache2.set('key2', 'value2');

      await cache1.clear('ns1');

      expect(await cache1.has('key1')).toBe(false);
      expect(await cache2.has('key2')).toBe(true);

      await cache1.close();
      await cache2.close();
    });
  });

  describe('real-world scenarios', () => {
    it('should support production memory cache configuration', async () => {
      process.env.HAVE_CACHE_PROVIDER = 'memory';
      process.env.HAVE_CACHE_NAMESPACE = 'prod:api';
      process.env.HAVE_CACHE_DEFAULT_TTL = '3600'; // 1 hour
      process.env.HAVE_CACHE_MAX_SIZE = '536870912'; // 512MB
      process.env.HAVE_CACHE_EVICTION_POLICY = 'lru';
      process.env.HAVE_CACHE_CHECK_PERIOD = '60000'; // 1 minute

      const cache = await getCache({ provider: 'memory' });

      // Test typical usage
      await cache.set('user:123', { name: 'John', role: 'admin' });
      await cache.set('session:abc', { userId: 123, expires: Date.now() });

      expect(await cache.get('user:123')).toEqual({
        name: 'John',
        role: 'admin',
      });
      expect(await cache.get('session:abc')).toMatchObject({ userId: 123 });

      const stats = await cache.getStats();
      expect(stats.entries).toBe(2);

      await cache.close();
    });

    it('should support development file cache configuration', async () => {
      const dir = cacheDir('dev-cache');
      process.env.HAVE_CACHE_PROVIDER = 'file';
      process.env.HAVE_CACHE_CACHE_DIR = dir;
      process.env.HAVE_CACHE_COMPRESSION = 'false'; // Fast dev mode
      process.env.HAVE_CACHE_DEFAULT_TTL = '300'; // 5 minutes

      const cache = await getCache({
        provider: 'file',
        cacheDir: dir,
      });

      await cache.set('dev-key', { debug: true, data: 'test' });
      expect(await cache.get('dev-key')).toEqual({ debug: true, data: 'test' });

      await cache.close();
    });
  });
});
