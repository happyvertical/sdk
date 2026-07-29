/**
 * File cache provider implementation with compression
 */

import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type {
  CacheEntry,
  CacheProvider,
  CacheStats,
  FileOptions,
} from '../shared/types';
import {
  CacheError,
  CacheKeyError,
  CacheSerializationError,
  CacheSizeError,
} from '../shared/types';
import {
  calculateExpiration,
  calculateSize,
  deserialize,
  extractKey,
  formatKey,
  isExpired,
  isValidKey,
  matchesPattern,
  serialize,
} from '../shared/utils';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * File cache provider implementation
 * Stores cache entries as files with optional compression
 */
export class FileProvider implements CacheProvider {
  private cacheDir: string;
  private namespace?: string;
  private defaultTTL?: number;
  private maxSize: number;
  private compression: boolean;
  private fileExtension: string;
  private checkPeriod: number;
  private checkInterval?: NodeJS.Timeout;
  private cacheDirReady?: Promise<void>;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  constructor(options: FileOptions) {
    this.cacheDir = resolve(options.cacheDir);
    this.namespace = options.namespace;
    this.defaultTTL = options.defaultTTL;
    this.maxSize = options.maxSize || 500 * 1024 * 1024; // 500MB default
    this.compression = options.compression ?? false;
    this.fileExtension = options.fileExtension || '.cache';
    this.checkPeriod = options.checkPeriod || 300000; // 5 minutes default
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };

    // Start creating the cache directory now so the first operation rarely has
    // to wait. Every filesystem operation still awaits it, because the
    // constructor cannot.
    this.ensureCacheDir();

    // Start background cleanup
    this.startCleanup();
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'file');
    }

    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);

    try {
      const fileContent = await readFile(filePath);
      let data: Buffer;

      // Decompress if needed
      if (this.compression) {
        data = await gunzipAsync(fileContent);
      } else {
        data = fileContent;
      }

      const entry: CacheEntry<T> = deserialize(data.toString('utf-8'));

      // Check if expired
      if (isExpired(entry.expiresAt)) {
        await rm(filePath, { force: true });
        this.stats.misses++;
        return undefined;
      }

      // Update hit count
      entry.hits++;
      this.stats.hits++;

      // Write back updated entry (for hit tracking)
      await this.writeEntry(filePath, entry);

      return entry.value;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.stats.misses++;
        return undefined;
      }
      throw new CacheError(
        `Failed to read cache entry: ${error.message}`,
        'READ_ERROR',
        'file',
      );
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'file');
    }

    // The only operation that creates a file from nothing, so the only one
    // that can outrun directory creation. Reads tolerate a missing directory,
    // and the write-backs in get()/touch() only run after a successful read,
    // which already proves the directory exists. Any new operation that writes
    // without reading first must await this too.
    //
    // This settles initialization, not the directory's continued existence:
    // once creation has succeeded the memo is fulfilled, so a directory
    // deleted externally afterwards is not recreated here.
    await this.ensureCacheDir();

    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);
    const expiresAt = calculateExpiration(ttl ?? this.defaultTTL);

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt,
      size: calculateSize(value),
      hits: 0,
      metadata: {
        compressed: this.compression,
        namespace: this.namespace,
      },
    };

    // Check if we need to evict files
    await this.evictIfNeeded(entry.size);

    // Write entry to file
    await this.writeEntry(filePath, entry);
  }

  async has(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'file');
    }

    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);

    try {
      const fileContent = await readFile(filePath);
      let data: Buffer;

      if (this.compression) {
        data = await gunzipAsync(fileContent);
      } else {
        data = fileContent;
      }

      const entry: CacheEntry = deserialize(data.toString('utf-8'));

      // Check if expired
      if (isExpired(entry.expiresAt)) {
        await rm(filePath, { force: true });
        return false;
      }

      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw new CacheError(
        `Failed to check cache entry: ${error.message}`,
        'CHECK_ERROR',
        'file',
      );
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'file');
    }

    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);

    try {
      await rm(filePath);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw new CacheError(
        `Failed to delete cache entry: ${error.message}`,
        'DELETE_ERROR',
        'file',
      );
    }
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      // Clear specific namespace
      const prefix = this.sanitizeKey(`${namespace}:`);
      const files = await this.getAllFiles();

      for (const file of files) {
        if (file.startsWith(prefix)) {
          await rm(join(this.cacheDir, file), { force: true });
        }
      }
    } else {
      // Clear all cache files
      try {
        await rm(this.cacheDir, { recursive: true, force: true });

        // The directory this provider memoized no longer exists, so drop the
        // memo and create it again rather than awaiting the settled promise.
        this.cacheDirReady = undefined;
        await this.ensureCacheDir();
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.evictions = 0;
      } catch (error: any) {
        throw new CacheError(
          `Failed to clear cache: ${error.message}`,
          'CLEAR_ERROR',
          'file',
        );
      }
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    const files = await this.getAllFiles();
    const keys: string[] = [];

    for (const file of files) {
      // Remove file extension
      const key = file.replace(this.fileExtension, '');

      // Check if file is expired
      const filePath = join(this.cacheDir, file);
      try {
        const fileContent = await readFile(filePath);
        let data: Buffer;

        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }

        const entry: CacheEntry = deserialize(data.toString('utf-8'));

        if (!isExpired(entry.expiresAt)) {
          const desanitized = this.desanitizeKey(key);
          keys.push(extractKey(this.namespace, desanitized));
        }
      } catch {}
    }

    // Apply pattern filter if provided
    if (pattern) {
      return keys.filter((key) => matchesPattern(pattern, key));
    }

    return keys;
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
    const files = await this.getAllFiles();
    let totalSize = 0;
    let entries = 0;

    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const stats = await stat(filePath);
        totalSize += stats.size;

        // Check if expired
        const fileContent = await readFile(filePath);
        let data: Buffer;

        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }

        const entry: CacheEntry = deserialize(data.toString('utf-8'));

        if (!isExpired(entry.expiresAt)) {
          entries++;
        }
      } catch {}
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
        type: 'file',
        cacheDir: this.cacheDir,
        compression: this.compression,
        maxSize: this.maxSize,
      },
    };
  }

  async touch(key: string, ttl: number): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 'file');
    }

    const fullKey = formatKey(this.namespace, key);
    const filePath = this.getFilePath(fullKey);

    try {
      const fileContent = await readFile(filePath);
      let data: Buffer;

      if (this.compression) {
        data = await gunzipAsync(fileContent);
      } else {
        data = fileContent;
      }

      const entry: CacheEntry = deserialize(data.toString('utf-8'));

      if (isExpired(entry.expiresAt)) {
        return false;
      }

      entry.expiresAt = calculateExpiration(ttl);
      await this.writeEntry(filePath, entry);

      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw new CacheError(
        `Failed to touch cache entry: ${error.message}`,
        'TOUCH_ERROR',
        'file',
      );
    }
  }

  async close(): Promise<void> {
    // Stop cleanup interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Ensures cache directory exists.
   *
   * Creation is started once and memoized, so concurrent operations share a
   * single `mkdir` and every caller awaits the same result. The constructor
   * cannot await, so operations must: otherwise a write issued right after
   * construction can reach `writeFile` before the directory exists and fail
   * with ENOENT.
   */
  private ensureCacheDir(): Promise<void> {
    if (!this.cacheDirReady) {
      this.cacheDirReady = this.createCacheDir();

      // Keep a failed creation from surfacing as an unhandled rejection when
      // the constructor kicks it off, and let a later operation retry it.
      // Callers awaiting this promise still observe the error.
      this.cacheDirReady.catch(() => {
        this.cacheDirReady = undefined;
      });
    }

    return this.cacheDirReady;
  }

  private async createCacheDir(): Promise<void> {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error: any) {
      throw new CacheError(
        `Failed to create cache directory: ${error.message}`,
        'INIT_ERROR',
        'file',
      );
    }
  }

  /**
   * Gets the file path for a cache key
   */
  private getFilePath(key: string): string {
    const sanitizedKey = this.sanitizeKey(key);
    return join(this.cacheDir, `${sanitizedKey}${this.fileExtension}`);
  }

  /**
   * Sanitizes a key for use as a filename
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_:-]/g, '_');
  }

  /**
   * Desanitizes a filename back to the original key
   */
  private desanitizeKey(sanitized: string): string {
    // This is a simple implementation - in practice, you might need
    // a more sophisticated mapping
    return sanitized;
  }

  /**
   * Gets all cache file names
   */
  private async getAllFiles(): Promise<string[]> {
    try {
      const files = await readdir(this.cacheDir);
      return files.filter((file) => file.endsWith(this.fileExtension));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new CacheError(
        `Failed to list cache files: ${error.message}`,
        'LIST_ERROR',
        'file',
      );
    }
  }

  /**
   * Writes an entry to a file
   */
  private async writeEntry(filePath: string, entry: CacheEntry): Promise<void> {
    try {
      let data: Buffer;
      const json = serialize(entry);
      data = Buffer.from(json, 'utf-8');

      // Compress if enabled
      if (this.compression) {
        data = await gzipAsync(data);
      }

      await writeFile(filePath, data);
    } catch (error: any) {
      throw new CacheSerializationError(
        `Failed to write cache entry: ${error.message}`,
        'file',
      );
    }
  }

  /**
   * Evicts files if size limit is exceeded
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    const stats = await this.getStats();

    // Check if we need to evict
    if (stats.totalSize + newEntrySize > this.maxSize) {
      await this.evict();

      // Check again after eviction
      const updatedStats = await this.getStats();
      if (updatedStats.totalSize + newEntrySize > this.maxSize) {
        throw new CacheSizeError(
          `Cannot cache entry: would exceed max size of ${this.maxSize} bytes`,
          'file',
        );
      }
    }
  }

  /**
   * Evicts oldest files based on creation time
   */
  private async evict(): Promise<void> {
    const files = await this.getAllFiles();
    const filesWithStats: Array<{ file: string; createdAt: number }> = [];

    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const fileContent = await readFile(filePath);
        let data: Buffer;

        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }

        const entry: CacheEntry = deserialize(data.toString('utf-8'));
        filesWithStats.push({ file, createdAt: entry.createdAt });
      } catch {}
    }

    // Sort by creation time (oldest first)
    filesWithStats.sort((a, b) => a.createdAt - b.createdAt);

    // Remove oldest 10% of files
    const toRemove = Math.max(1, Math.floor(filesWithStats.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      const filePath = join(this.cacheDir, filesWithStats[i].file);
      await rm(filePath, { force: true });
      this.stats.evictions++;
    }
  }

  /**
   * Starts background cleanup of expired files
   */
  private startCleanup(): void {
    this.checkInterval = setInterval(() => {
      // Background sweep: nothing awaits this, so swallow failures rather than
      // letting them surface as an unhandled rejection in an unrelated caller.
      this.removeExpiredFiles().catch(() => {});
    }, this.checkPeriod);

    // Don't block process exit
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }

  /**
   * Removes expired files
   */
  private async removeExpiredFiles(): Promise<void> {
    const files = await this.getAllFiles();

    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const fileContent = await readFile(filePath);
        let data: Buffer;

        if (this.compression) {
          data = await gunzipAsync(fileContent);
        } else {
          data = fileContent;
        }

        const entry: CacheEntry = deserialize(data.toString('utf-8'));

        if (isExpired(entry.expiresAt)) {
          await rm(filePath, { force: true });
        }
      } catch {}
    }
  }
}
