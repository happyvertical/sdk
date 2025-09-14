import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilesystemError } from '../types.js';
/**
 * Base class for all filesystem providers
 */
export class BaseFilesystemProvider {
    basePath;
    cacheDir;
    createMissing;
    constructor(options = {}) {
        this.basePath = options.basePath || '';
        this.cacheDir = options.cacheDir || join(tmpdir(), 'have-sdk', 'files-cache');
        this.createMissing = options.createMissing ?? true;
    }
    /**
     * Normalize path by removing leading/trailing slashes and resolving relative paths
     */
    normalizePath(path) {
        if (!path)
            return '';
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
    validatePath(path) {
        if (!path) {
            throw new FilesystemError('Path cannot be empty', 'EINVAL', path);
        }
        // Check for directory traversal attempts
        if (path.includes('..') || path.includes('~')) {
            throw new FilesystemError('Path contains invalid characters (directory traversal)', 'EINVAL', path);
        }
    }
    /**
     * Get cache key for a given path
     */
    getCacheKey(path) {
        return `${this.constructor.name}-${path}`;
    }
    /**
     * Default implementations for upload/download (may be overridden)
     */
    async upload(localPath, remotePath, options = {}) {
        throw new FilesystemError('Upload not supported by this provider', 'ENOTSUP', remotePath);
    }
    async download(remotePath, localPath, options = {}) {
        throw new FilesystemError('Download not supported by this provider', 'ENOTSUP', remotePath);
    }
    async downloadWithCache(remotePath, options = {}) {
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
        get: async (key, expiry) => {
            try {
                const { getCached } = await import('../index.js');
                return await getCached(key, expiry);
            }
            catch (error) {
                return undefined;
            }
        },
        set: async (key, data) => {
            try {
                const { setCached } = await import('../index.js');
                await setCached(key, data);
            }
            catch (error) {
                // Ignore cache errors
            }
        },
        clear: async (key) => {
            // This function is currently a no-op and does not clear the cache.
            // Cache clearing is not supported at this time. Future implementations
            // may depend on the specific cache backend being used.
        }
    };
}
