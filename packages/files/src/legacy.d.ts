/**
 * Legacy compatibility functions
 *
 * These functions maintain backward compatibility with the existing @have/files API
 * while internally using the new standardized interface.
 */
import { statSync } from 'node:fs';
/**
 * Checks if a path is a file
 *
 * @param file - Path to check
 * @returns File stats if the path is a file, false otherwise
 */
export declare const isFile: (file: string) => false | ReturnType<typeof statSync>;
/**
 * Checks if a path is a directory
 *
 * @param dir - Path to check
 * @returns True if the path is a directory, false if it doesn't exist
 * @throws Error if the path exists but is not a directory
 */
export declare const isDirectory: (dir: string) => boolean;
/**
 * Creates a directory if it doesn't exist
 *
 * @param dir - Directory path to create
 * @returns Promise that resolves when the directory exists or has been created
 */
export declare const ensureDirectoryExists: (dir: string) => Promise<void>;
/**
 * Uploads data to a URL using PUT method
 *
 * @param url - URL to upload data to
 * @param data - String or Buffer data to upload
 * @returns Promise that resolves with the Response object
 * @throws Error if the upload fails
 */
export declare const upload: (url: string, data: string | Buffer) => Promise<Response>;
/**
 * Downloads a file from a URL and saves it to a local file
 *
 * @param url - URL to download from
 * @param filepath - Local file path to save to
 * @returns Promise that resolves when the download is complete
 * @throws Error if the download fails
 */
export declare function download(url: string, filepath: string): Promise<void>;
/**
 * Downloads a file with caching support
 *
 * @param url - URL to download from
 * @param targetPath - Optional custom target path
 * @returns Promise that resolves with the path to the downloaded file
 */
export declare const downloadFileWithCache: (url: string, targetPath?: string | null) => Promise<string>;
/**
 * Options for listing files in a directory
 */
interface ListFilesOptions {
    /**
     * Optional regular expression to filter files by name
     */
    match?: RegExp;
}
/**
 * Lists files in a directory with optional filtering
 *
 * @param dirPath - Directory path to list files from
 * @param options - Filtering options
 * @returns Promise that resolves with an array of file names
 */
export declare const listFiles: (dirPath: string, options?: ListFilesOptions) => Promise<string[]>;
/**
 * Gets data from cache if available and not expired
 *
 * @param file - Cache file identifier
 * @param expiry - Cache expiry time in milliseconds
 * @returns Promise that resolves with the cached data or undefined if not found/expired
 */
export declare function getCached(file: string, expiry?: number): Promise<string>;
/**
 * Sets data in cache
 *
 * @param file - Cache file identifier
 * @param data - Data to cache
 * @returns Promise that resolves when the data is cached
 */
export declare function setCached(file: string, data: string): Promise<void>;
/**
 * Gets the MIME type for a file or URL based on its extension
 *
 * @param fileOrUrl - File path or URL to get MIME type for
 * @returns MIME type string, defaults to 'application/octet-stream' if not found
 */
export declare function getMimeType(fileOrUrl: string): string;
export {};
//# sourceMappingURL=legacy.d.ts.map