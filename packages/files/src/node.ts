/**
 * @have/files Node.js entry point
 * 
 * This entry point provides full file operations for Node.js environments using:
 * - Local filesystem (default)
 * - S3-compatible providers for cloud storage  
 * - WebDAV providers for remote storage
 * - Google Drive for cloud storage
 * - Full legacy function support
 */

// Export main factory function and utilities
export { 
  getFilesystem, 
  getAvailableProviders, 
  getProviderInfo, 
  isProviderAvailable,
  registerProvider
} from './shared/factory.js';

// Export all types
export * from './shared/types.js';

// Note: S3, WebDAV, and Google Drive providers are available but require external dependencies
// They will be registered dynamically if their dependencies are available

// Export Node.js-specific provider
export { LocalFilesystemProvider } from './node/local.js';

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

/**
 * Initialize Node.js-compatible providers
 */
export async function initializeProviders(): Promise<void> {
  const { registerProvider } = await import('./shared/factory.js');
  
  // Register local provider (default in Node.js)
  registerProvider('local', async () => {
    const { LocalFilesystemProvider } = await import('./node/local.js');
    return LocalFilesystemProvider;
  });

  // Additional providers (S3, WebDAV, Google Drive) can be registered
  // if their dependencies are available by importing them separately
}

// Initialize providers on module load
initializeProviders().catch(() => {
  // Ignore initialization errors - providers will fail when used
});

// Default export for convenience
import { getFilesystem } from './shared/factory.js';
export default { getFilesystem, initializeProviders };