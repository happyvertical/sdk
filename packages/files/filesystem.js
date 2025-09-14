import path from 'path';
import os from 'os';
import { mkdir } from 'fs/promises';
import { getCached, setCached } from './index.js';
/**
 * Base class for filesystem adapters providing common functionality
 */
export class FilesystemAdapter {
    /**
     * Configuration options
     */
    options;
    /**
     * Cache directory path
     */
    cacheDir;
    /**
     * Creates a new FilesystemAdapter instance
     *
     * @param options - Configuration options
     */
    constructor(options) {
        this.options = options;
        this.cacheDir =
            options.cacheDir || path.join(os.tmpdir(), 'have-sdk', '.cache');
    }
    /**
     * Factory method to create and initialize a FilesystemAdapter
     *
     * @param options - Configuration options
     * @returns Promise resolving to an initialized FilesystemAdapter
     */
    static async create(options) {
        const fs = new FilesystemAdapter(options);
        await fs.initialize();
        return fs;
    }
    /**
     * Initializes the adapter by creating the cache directory
     */
    async initialize() {
        await mkdir(this.cacheDir, { recursive: true });
    }
    /**
     * Downloads a file from a URL
     *
     * @param url - URL to download from
     * @param options - Download options
     * @param options.force - Whether to force download even if cached
     * @returns Promise resolving to the path of the downloaded file
     */
    async download(url, options = {
        force: false,
    }) {
        return '';
    }
    /**
     * Checks if a file or directory exists
     *
     * @param path - Path to check
     * @returns Promise resolving to boolean indicating existence
     */
    async exists(path) {
        // Dummy implementation
        return false;
    }
    /**
     * Reads a file's contents
     *
     * @param path - Path to the file
     * @returns Promise resolving to the file contents as a string
     */
    async read(path) {
        // Dummy implementation
        return '';
    }
    /**
     * Writes content to a file
     *
     * @param path - Path to the file
     * @param content - Content to write
     * @returns Promise that resolves when the write is complete
     */
    async write(path, content) {
        // Dummy implementation
    }
    /**
     * Deletes a file or directory
     *
     * @param path - Path to delete
     * @returns Promise that resolves when the deletion is complete
     */
    async delete(path) {
        // Dummy implementation
    }
    /**
     * Lists files in a directory
     *
     * @param path - Directory path to list
     * @returns Promise resolving to an array of file names
     */
    async list(path) {
        // Dummy implementation
        return [];
    }
    /**
     * Gets data from cache if available and not expired
     *
     * @param file - Cache file identifier
     * @param expiry - Cache expiry time in milliseconds
     * @returns Promise resolving to the cached data or undefined if not found/expired
     */
    async getCached(file, expiry = 300000) {
        return getCached(file, expiry);
    }
    /**
     * Sets data in cache
     *
     * @param file - Cache file identifier
     * @param data - Data to cache
     * @returns Promise that resolves when the data is cached
     */
    async setCached(file, data) {
        return setCached(file, data);
    }
}
//# sourceMappingURL=filesystem.js.map