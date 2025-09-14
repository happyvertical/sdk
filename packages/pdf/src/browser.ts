/**
 * @have/pdf - Browser entry point
 * 
 * This entry point provides PDF processing capabilities specifically for browser environments,
 * including PDF.js for text/metadata extraction and Tesseract.js for OCR processing.
 */

// Export main factory function and types
export { getPDFReader, getAvailableProviders, isProviderAvailable, getProviderInfo, initializeProviders } from './browser/factory.js';
export * from './shared/types.js';

// Export browser specific providers for direct instantiation if needed
export { PDFJSProvider } from './browser/pdfjs.js';
export { CombinedBrowserProvider } from './browser/combined.js';

// Re-export base provider for custom implementations
export { BasePDFReader } from './shared/base.js';

// Initialize providers on module load
import('./browser/factory.js').then(({ initializeProviders }) => {
  initializeProviders().catch(() => {
    // Ignore initialization errors - providers will fail when used
  });
});

// Default export for convenience
import * as factory from './browser/factory.js';
export default factory;