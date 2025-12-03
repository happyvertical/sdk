/**
 * S3 cache provider implementation
 * Stores cache entries in S3 for persistence across CI runs
 */

import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import type {
  CacheEntry,
  CacheProvider,
  CacheStats,
  S3Options,
} from '../shared/types';
import {
  CacheError,
  CacheKeyError,
  CacheSerializationError,
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

// Dynamic imports for AWS SDK (lazy loaded)
let S3Client: any;
let GetObjectCommand: any;
let PutObjectCommand: any;
let DeleteObjectCommand: any;
let DeleteObjectsCommand: any;
let ListObjectsV2Command: any;
let HeadObjectCommand: any;

async function loadS3SDK() {
  if (!S3Client) {
    const sdk = await import('@aws-sdk/client-s3');
    S3Client = sdk.S3Client;
    GetObjectCommand = sdk.GetObjectCommand;
    PutObjectCommand = sdk.PutObjectCommand;
    DeleteObjectCommand = sdk.DeleteObjectCommand;
    DeleteObjectsCommand = sdk.DeleteObjectsCommand;
    ListObjectsV2Command = sdk.ListObjectsV2Command;
    HeadObjectCommand = sdk.HeadObjectCommand;
  }
}

/**
 * Converts a readable stream to a buffer
 */
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * S3 cache provider implementation
 * Stores cache entries as S3 objects with optional compression
 */
export class S3Provider implements CacheProvider {
  private client: any;
  private bucket: string;
  private prefix: string;
  private namespace?: string;
  private defaultTTL?: number;
  private compression: boolean;
  private compressionThreshold: number;
  private region: string;
  private initialized: boolean = false;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
  };

  constructor(options: S3Options) {
    this.bucket = options.bucket;
    this.prefix = options.prefix || 'cache/';
    this.namespace = options.namespace;
    this.defaultTTL = options.defaultTTL;
    this.compression = options.compression ?? true; // Default ON for S3 (reduces egress costs)
    this.compressionThreshold = options.compressionThreshold ?? 1024; // 1KB
    this.region = options.region || process.env.AWS_REGION || 'us-east-1';
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Lazily initialize the S3 client
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await loadS3SDK();

    // Use explicit credentials from environment if available
    // This ensures credentials work even when bundled by Vite
    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined;

    this.client = new S3Client({
      region: this.region,
      credentials,
    });
    this.initialized = true;
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 's3');
    }

    await this.ensureInitialized();

    const s3Key = this.getS3Key(key);

    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
        }),
      );

      // Get body as buffer
      const bodyBuffer = await streamToBuffer(response.Body);

      // Check if compressed from metadata
      const isCompressed = response.Metadata?.['compressed'] === 'true';

      let data: Buffer;
      if (isCompressed) {
        data = await gunzipAsync(bodyBuffer);
      } else {
        data = bodyBuffer;
      }

      const entry: CacheEntry<T> = deserialize(data.toString('utf-8'));

      // Check if expired
      if (isExpired(entry.expiresAt)) {
        this.stats.misses++;
        // Optionally delete expired entry (fire and forget)
        this.delete(key).catch(() => {});
        return undefined;
      }

      this.stats.hits++;
      return entry.value;
    } catch (error: any) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        this.stats.misses++;
        return undefined;
      }
      throw new CacheError(
        `Failed to read S3 cache entry: ${error.message}`,
        'READ_ERROR',
        's3',
      );
    }
  }

  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 's3');
    }

    await this.ensureInitialized();

    const s3Key = this.getS3Key(key);
    const expiresAt = calculateExpiration(ttl ?? this.defaultTTL);

    const entry: CacheEntry<T> = {
      value,
      createdAt: Date.now(),
      expiresAt,
      size: calculateSize(value),
      hits: 0,
      metadata: {
        compressed: false, // Will be set below if compressed
        namespace: this.namespace,
      },
    };

    let data: Buffer = Buffer.from(serialize(entry), 'utf-8');
    let isCompressed = false;

    // Compress if enabled and data exceeds threshold
    if (this.compression && data.length > this.compressionThreshold) {
      data = (await gzipAsync(data)) as Buffer;
      isCompressed = true;
    }

    const metadata: Record<string, string> = {
      'created-at': entry.createdAt.toString(),
      compressed: isCompressed.toString(),
    };

    if (expiresAt) {
      metadata['expires-at'] = expiresAt.toString();
    }

    if (this.namespace) {
      metadata['namespace'] = this.namespace;
    }

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: data,
          Metadata: metadata,
          ContentType: 'application/json',
        }),
      );
    } catch (error: any) {
      throw new CacheSerializationError(
        `Failed to write S3 cache entry: ${error.message}`,
        's3',
      );
    }
  }

  async has(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 's3');
    }

    await this.ensureInitialized();

    const s3Key = this.getS3Key(key);

    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
        }),
      );

      // Check expiration from metadata
      const expiresAt = response.Metadata?.['expires-at'];
      if (expiresAt && Date.now() >= parseInt(expiresAt, 10)) {
        return false;
      }

      return true;
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw new CacheError(
        `Failed to check S3 cache entry: ${error.message}`,
        'CHECK_ERROR',
        's3',
      );
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 's3');
    }

    await this.ensureInitialized();

    const s3Key = this.getS3Key(key);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
        }),
      );
      return true;
    } catch (error: any) {
      // S3 DeleteObject doesn't error if key doesn't exist
      // It just succeeds silently
      return true;
    }
  }

  async clear(namespace?: string): Promise<void> {
    await this.ensureInitialized();

    const targetNamespace = namespace || this.namespace;
    const prefix = targetNamespace
      ? `${this.prefix}${this.sanitizeKey(`${targetNamespace}:`)}`
      : this.prefix;

    try {
      // List all objects with prefix
      let continuationToken: string | undefined;
      do {
        const listResponse = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        if (listResponse.Contents && listResponse.Contents.length > 0) {
          // Delete in batches of 1000 (S3 limit)
          const objects = listResponse.Contents.map((obj: any) => ({
            Key: obj.Key,
          }));

          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: objects },
            }),
          );
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);

      // Reset stats
      this.stats.hits = 0;
      this.stats.misses = 0;
      this.stats.evictions = 0;
    } catch (error: any) {
      throw new CacheError(
        `Failed to clear S3 cache: ${error.message}`,
        'CLEAR_ERROR',
        's3',
      );
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    await this.ensureInitialized();

    const keys: string[] = [];
    let continuationToken: string | undefined;

    try {
      do {
        const listResponse = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: this.prefix,
            ContinuationToken: continuationToken,
          }),
        );

        if (listResponse.Contents) {
          for (const obj of listResponse.Contents) {
            // Extract key from S3 key
            const s3Key = obj.Key as string;
            if (!s3Key.endsWith('.cache')) continue;

            // Remove prefix and .cache extension
            const rawKey = s3Key
              .slice(this.prefix.length)
              .replace(/\.cache$/, '');

            const desanitized = this.desanitizeKey(rawKey);
            const extractedKey = extractKey(this.namespace, desanitized);

            keys.push(extractedKey);
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      throw new CacheError(
        `Failed to list S3 cache keys: ${error.message}`,
        'LIST_ERROR',
        's3',
      );
    }

    // Apply pattern filter if provided
    if (pattern) {
      return keys.filter((key) => matchesPattern(pattern, key));
    }

    return keys;
  }

  async getMany<T = any>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    // S3 doesn't have batch get, so fetch in parallel
    const results = await Promise.allSettled(
      keys.map(async (key) => {
        const value = await this.get<T>(key);
        return { key, value };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.value !== undefined) {
        result.value;
      }
    }

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.value !== undefined) {
        result.set(r.value.key, r.value.value);
      }
    }

    return result;
  }

  async setMany<T = any>(
    entries: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    // S3 doesn't have batch put, so write in parallel
    await Promise.all(
      entries.map((entry) => this.set(entry.key, entry.value, entry.ttl)),
    );
  }

  async deleteMany(keys: string[]): Promise<number> {
    await this.ensureInitialized();

    if (keys.length === 0) return 0;

    const s3Keys = keys.map((key) => ({
      Key: this.getS3Key(key),
    }));

    try {
      // Delete in batches of 1000
      let deleted = 0;
      for (let i = 0; i < s3Keys.length; i += 1000) {
        const batch = s3Keys.slice(i, i + 1000);
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch },
          }),
        );
        deleted += response.Deleted?.length || 0;
      }
      return deleted;
    } catch (error: any) {
      throw new CacheError(
        `Failed to delete S3 cache entries: ${error.message}`,
        'DELETE_ERROR',
        's3',
      );
    }
  }

  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    let entries = 0;
    let totalSize = 0;
    let continuationToken: string | undefined;

    try {
      do {
        const listResponse = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: this.prefix,
            ContinuationToken: continuationToken,
          }),
        );

        if (listResponse.Contents) {
          for (const obj of listResponse.Contents) {
            entries++;
            totalSize += obj.Size || 0;
          }
        }

        continuationToken = listResponse.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      // If we can't list, return empty stats
      entries = 0;
      totalSize = 0;
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
        type: 's3',
        bucket: this.bucket,
        prefix: this.prefix,
        region: this.region,
        compression: this.compression,
      },
    };
  }

  async touch(key: string, ttl: number): Promise<boolean> {
    if (!isValidKey(key)) {
      throw new CacheKeyError(key, 's3');
    }

    // For S3, we need to read the object, update TTL, and write it back
    const value = await this.get(key);
    if (value === undefined) {
      return false;
    }

    await this.set(key, value, ttl);
    return true;
  }

  async close(): Promise<void> {
    // S3 client doesn't need explicit cleanup
    // Just destroy the client if it exists
    if (this.client?.destroy) {
      this.client.destroy();
    }
    this.initialized = false;
  }

  /**
   * Gets the S3 key for a cache key
   */
  private getS3Key(key: string): string {
    const fullKey = formatKey(this.namespace, key);
    const sanitized = this.sanitizeKey(fullKey);
    return `${this.prefix}${sanitized}.cache`;
  }

  /**
   * Sanitizes a key for use as an S3 key
   * S3 keys can contain most characters, but we sanitize for consistency
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_:-]/g, '_');
  }

  /**
   * Desanitizes an S3 key back to the original format
   */
  private desanitizeKey(sanitized: string): string {
    // This is a simple implementation
    // In practice, we might need a more sophisticated mapping
    return sanitized;
  }
}
