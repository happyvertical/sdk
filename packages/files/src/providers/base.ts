import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { 
  FilesystemInterface, 
  BaseProviderOptions, 
  FilesystemCapabilities,
  CacheOptions,
  FilesystemError
} from '../types.js';

/**
 * Base class for all filesystem providers
 */
export abstract class BaseFilesystemProvider implements FilesystemInterface {
  protected basePath: string;
  protected cacheDir: string;
  protected createMissing: boolean;

  constructor(options: BaseProviderOptions = {}) {
    this.basePath = options.basePath || '';
    this.cacheDir = options.cacheDir || join(tmpdir(), 'have-sdk', 'files-cache');
    this.createMissing = options.createMissing ?? true;
  }

  /**
   * Normalize path by removing leading/trailing slashes and resolving relative paths
   */
  protected normalizePath(path: string): string {
    if (!path) return '';
    
    // Remove leading slash for consistency
    let normalized = path.startsWith('/') ? path.slice(1) : path;
    
    // Combine with base path if configured
    if (this.basePath) {
      normalized = join(this.basePath, normalized);
    }
    
    return normalized;
  }

  /**
   * Validate that a path is safe (no directory traversal)
   */
  protected validatePath(path: string): void {
    if (!path) {
      throw new FilesystemError('Path cannot be empty', 'EINVAL', path);
    }
    
    // Check for directory traversal attempts
    if (path.includes('..') || path.includes('~')) {
      throw new FilesystemError(
        'Path contains invalid characters (directory traversal)',
        'EINVAL',
        path
      );
    }
  }

  /**
   * Get cache key for a given path
   */
  protected getCacheKey(path: string): string {
    return `${this.constructor.name}-${path}`;
  }

  /**
   * Abstract methods that must be implemented by providers
   */
  abstract exists(path: string): Promise<boolean>;
  abstract read(path: string, options?: any): Promise<string | Buffer>;
  abstract write(path: string, content: string | Buffer, options?: any): Promise<void>;
  abstract delete(path: string): Promise<void>;
  abstract copy(sourcePath: string, destPath: string): Promise<void>;
  abstract move(sourcePath: string, destPath: string): Promise<void>;
  abstract createDirectory(path: string, options?: any): Promise<void>;
  abstract list(path: string, options?: any): Promise<any[]>;
  abstract getStats(path: string): Promise<any>;
  abstract getMimeType(path: string): Promise<string>;
  abstract getCapabilities(): Promise<FilesystemCapabilities>;

  /**
   * Default implementations for upload/download (may be overridden)
   */
  async upload(localPath: string, remotePath: string, options: any = {}): Promise<void> {
    throw new FilesystemError(
      'Upload not supported by this provider',
      'ENOTSUP',
      remotePath
    );
  }

  async download(remotePath: string, localPath?: string, options: any = {}): Promise<string> {
    throw new FilesystemError(
      'Download not supported by this provider',
      'ENOTSUP',
      remotePath
    );
  }

  async downloadWithCache(remotePath: string, options: CacheOptions = {}): Promise<string> {
    const cacheKey = this.getCacheKey(remotePath);
    
    // Check cache first
    if (!options.force) {
      const cached = await this.cache.get(cacheKey, options.expiry);
      if (cached) {
        return cached;
      }
    }
    
    // Download and cache
    const localPath = await this.download(remotePath, undefined, options);
    await this.cache.set(cacheKey, localPath);
    
    return localPath;
  }

  /**
   * Cache implementation using the existing cache functions
   */
  cache = {
    get: async (key: string, expiry?: number): Promise<string | undefined> => {
      try {
        const { getCached } = await import('../index.js');
        return await getCached(key, expiry);
      } catch (error) {
        return undefined;
      }
    },

    set: async (key: string, data: string): Promise<void> => {
      try {
        const { setCached } = await import('../index.js');
        await setCached(key, data);
      } catch (error) {
        // Ignore cache errors
      }
    },

    clear: async (key?: string): Promise<void> => {
      // This function is currently a no-op and does not clear the cache.
      // Cache clearing is not supported at this time. Future implementations
      // may depend on the specific cache backend being used.
    }
  };
}