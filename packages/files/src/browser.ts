/**
 * @have/files browser entry point
 * 
 * This entry point provides file operations for browser environments using:
 * - IndexedDB for app storage (default)
 * - S3-compatible providers for cloud storage  
 * - WebDAV providers for remote storage
 * - Google Drive for cloud storage
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

// Export browser-specific provider
export { BrowserStorageProvider } from './browser/storage.js';

/**
 * Initialize browser-compatible providers
 */
export async function initializeProviders(): Promise<void> {
  const { registerProvider } = await import('./shared/factory.js');
  
  // Register browser storage provider (default in browser)
  registerProvider('browser-storage', async () => {
    const { BrowserStorageProvider } = await import('./browser/storage.js');
    return BrowserStorageProvider;
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