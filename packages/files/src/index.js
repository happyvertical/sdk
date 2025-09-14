/**
 * @have/files - Standardized filesystem interface with multi-provider support
 *
 * This package provides a unified interface for file operations across different
 * storage backends including local filesystem, S3-compatible services, Google Drive,
 * and Nextcloud.
 */
// Export main factory function and types
export { getFilesystem, initializeProviders, getAvailableProviders, getProviderInfo, isProviderAvailable } from './shared/factory.js';
export * from './shared/types.js';
// Export provider classes for direct instantiation if needed
export { LocalFilesystemProvider } from './node/local.js';
// Note: S3, GoogleDrive, WebDAV providers moved to shared/ and currently backed up
// They will be available when external dependencies are restored
// Re-export legacy functions for backward compatibility
export { isFile, isDirectory, ensureDirectoryExists, upload, download, downloadFileWithCache, listFiles, getCached, setCached, getMimeType } from './legacy.js';
// Re-export fetch utilities
export * from './fetch.js';
// Re-export existing filesystem adapter classes for compatibility
export * from './filesystem.js';
// Initialize providers on module load
import('./shared/factory.js').then(({ initializeProviders }) => {
    initializeProviders().catch(() => {
        // Ignore initialization errors - providers will fail when used
    });
});
// Default export for convenience - using star import to avoid dependency issues
import * as factory from './shared/factory.js';
export default factory;
//# sourceMappingURL=index.js.map