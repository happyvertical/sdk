/**
 * @have/files - Standardized filesystem interface with multi-provider support
 *
 * This package provides a unified interface for file operations across different
 * storage backends including local filesystem, S3-compatible services, Google Drive,
 * and Nextcloud.
 */
export { getFilesystem, initializeProviders, getAvailableProviders, getProviderInfo, isProviderAvailable } from './shared/factory.js';
export * from './shared/types.js';
export { LocalFilesystemProvider } from './node/local.js';
export { isFile, isDirectory, ensureDirectoryExists, upload, download, downloadFileWithCache, listFiles, getCached, setCached, getMimeType } from './legacy.js';
export * from './fetch.js';
export * from './filesystem.js';
import * as factory from './shared/factory.js';
export default factory;
//# sourceMappingURL=index.d.ts.map