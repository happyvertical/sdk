/**
 * @happyvertical/files - Unified filesystem interface with provider pattern
 *
 * Provides a consistent API for file operations across storage backends.
 * Each provider implements {@link FilesystemInterface}, allowing code to work
 * with files regardless of the underlying storage system.
 *
 * Implemented providers:
 * - **Local**: Node.js filesystem via `fs/promises`
 * - **S3**: AWS S3 and S3-compatible services such as MinIO
 * - **Google Drive**: Google Drive API v3 (OAuth2, service account, access token)
 *
 * Also exports rate-limited fetch utilities and legacy compatibility functions.
 *
 * @example
 * ```typescript
 * import { getFilesystem } from '@happyvertical/files';
 *
 * const fs = await getFilesystem({ type: 'local', basePath: '/app/data' });
 * await fs.write('config.json', JSON.stringify({ key: 'value' }));
 * const content = await fs.read('config.json');
 * ```
 *
 * @packageDocumentation
 */

export type {
  FetchToFileOptions,
  WriteResponseToFileOptions,
} from './fetch';
// Re-export fetch utilities with rate limiting
export {
  addRateLimit,
  fetchBuffer,
  fetchJSON,
  fetchText,
  fetchToFile,
  getRateLimit,
  writeResponseToFile,
} from './fetch';
// Re-export existing filesystem adapter classes for compatibility
export * from './filesystem';
// Re-export legacy functions for backward compatibility
export {
  download,
  downloadFileWithCache,
  ensureDirectoryExists,
  getCached,
  getMimeType,
  isDirectory,
  isFile,
  listFiles,
  setCached,
  upload,
} from './legacy';
// Export provider classes for direct instantiation if needed
export { LocalFilesystemProvider } from './node/local';
export { GoogleDriveProvider } from './providers/gdrive';
export { S3FilesystemProvider } from './providers/s3';
// Export main factory function and types
export {
  getAvailableProviders,
  getFilesystem,
  getProviderInfo,
  initializeProviders,
  isProviderAvailable,
  registerProvider,
} from './shared/factory';
export * from './shared/types';

// Initialize providers on module load
// This ensures providers are available immediately after import
import('./shared/factory.js').then(({ initializeProviders }) => {
  initializeProviders().catch(() => {
    // Silently ignore initialization errors - individual providers will fail when used
    // This allows the module to load even if some providers can't be initialized
  });
});

// Default export provides the factory functions for convenience
import * as factory from './shared/factory';

/**
 * Default export containing all factory functions
 * @deprecated Use named imports instead for better tree-shaking
 */
export default factory;

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
