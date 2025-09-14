import { FilesystemError } from './types.js';
/**
 * Base class for all filesystem providers
 */
export class BaseFilesystemProvider {
    basePath;
    cacheDir;
    createMissing;
    providerType;
    constructor(options = {}) {
        this.basePath = options.basePath || '';
        // Use a universal cache directory approach - will be context-specific
        this.cacheDir = options.cacheDir || this.getDefaultCacheDir();
        this.createMissing = options.createMissing ?? true;
        this.providerType = this.constructor.name.toLowerCase().replace('filesystemprovider', '');
    }
    /**
     * Get default cache directory for the current context
     */
    getDefaultCacheDir() {
        // In browser, this will need to be handled differently
        // For now, provide a basic path that works in Node.js
        if (typeof process !== 'undefined' && process.versions?.node) {
            try {
                const { tmpdir } = require('node:os');
                const { join } = require('node:path');
                return join(tmpdir(), 'have-sdk', 'files-cache');
            }
            catch {
                return './tmp/have-sdk/files-cache';
            }
        }
        return './tmp/have-sdk/files-cache';
    }
    /**
     * Throw error for unsupported operations
     */
    throwUnsupported(operation) {
        throw new FilesystemError(`Operation '${operation}' not supported by ${this.providerType} provider`, 'ENOTSUP', undefined, this.providerType);
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
            normalized = this.joinPaths(this.basePath, normalized);
        }
        return normalized;
    }
    /**
     * Universal path joining function that works in both Node.js and browser
     */
    joinPaths(...paths) {
        return paths
            .filter(p => p && p.length > 0)
            .map(p => p.replace(/^\/+|\/+$/g, ''))
            .join('/');
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
     * Provider methods with default implementations (may be overridden)
     */
    async upload(localPath, remotePath, options = {}) {
        this.throwUnsupported('upload');
    }
    async download(remotePath, localPath, options = {}) {
        this.throwUnsupported('download');
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
     * Cache implementation - providers can override for their specific storage
     */
    cache = {
        get: async (key, expiry) => {
            // Default implementation - providers should override this
            this.throwUnsupported('cache.get');
        },
        set: async (key, data) => {
            // Default implementation - providers should override this
            this.throwUnsupported('cache.set');
        },
        clear: async (key) => {
            // Default implementation - providers should override this
            this.throwUnsupported('cache.clear');
        }
    };
    // Legacy method implementations - providers can override or use default ENOTSUP errors
    /**
     * Check if a path is a file (legacy)
     */
    async isFile(file) {
        try {
            const stats = await this.getStats(file);
            return stats.isFile ? stats : false;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if a path is a directory (legacy)
     */
    async isDirectory(dir) {
        try {
            const stats = await this.getStats(dir);
            return stats.isDirectory;
        }
        catch {
            return false;
        }
    }
    /**
     * Create a directory if it doesn't exist (legacy)
     */
    async ensureDirectoryExists(dir) {
        if (!(await this.isDirectory(dir))) {
            await this.createDirectory(dir, { recursive: true });
        }
    }
    /**
     * Upload data to a URL using PUT method (legacy)
     */
    async uploadToUrl(url, data) {
        this.throwUnsupported('uploadToUrl');
    }
    /**
     * Download a file from a URL and save it to a local file (legacy)
     */
    async downloadFromUrl(url, filepath) {
        this.throwUnsupported('downloadFromUrl');
    }
    /**
     * Download a file with caching support (legacy)
     */
    async downloadFileWithCache(url, targetPath) {
        this.throwUnsupported('downloadFileWithCache');
    }
    /**
     * List files in a directory with optional filtering (legacy)
     */
    async listFiles(dirPath, options = { match: /.*/ }) {
        const files = await this.list(dirPath);
        const fileNames = files
            .filter(file => !file.isDirectory)
            .map(file => file.name);
        return options.match
            ? fileNames.filter(name => options.match?.test(name))
            : fileNames;
    }
    /**
     * Get data from cache if available and not expired (legacy)
     */
    async getCached(file, expiry = 300000) {
        return await this.cache.get(file, expiry);
    }
    /**
     * Set data in cache (legacy)
     */
    async setCached(file, data) {
        await this.cache.set(file, data);
    }
}
//# sourceMappingURL=base.js.map