/**
 * @have/files - Standardized filesystem interface with multi-provider support
 * 
 * This package provides a unified interface for file operations across different
 * storage backends including local filesystem, S3-compatible services, Google Drive,
 * and Nextcloud.
 */

// Export main factory function and types
export { getFilesystem, initializeProviders, getAvailableProviders, getProviderInfo, isProviderAvailable } from './factory.js';
export * from './types.js';

// Export provider classes for direct instantiation if needed
export { LocalFilesystemProvider } from './providers/local.js';
export { S3FilesystemProvider } from './providers/s3.js';
export { GoogleDriveFilesystemProvider } from './providers/gdrive.js';
export { WebDAVFilesystemProvider } from './providers/webdav.js';

// Re-export legacy functions for backward compatibility
export {
  isFile,
  isDirectory,
  ensureDirectoryExists,
  upload,
  download,
  downloadFileWithCache,
  listFiles,
  getCached,
  setCached,
  getMimeType
} from './legacy.js';

// Re-export fetch utilities
export * from './fetch.js';

// Re-export existing filesystem adapter classes for compatibility
export * from './filesystem.js';

// Initialize providers on module load
import('./factory.js').then(({ initializeProviders }) => {
  initializeProviders().catch(() => {
    // Ignore initialization errors - providers will fail when used
  });
});

// Default export for convenience - using star import to avoid dependency issues
import * as factory from './factory.js';

export default factory;
