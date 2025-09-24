/**
 * @have/pdf - Shared entry point with automatic environment detection
 *
 * This entry point automatically detects the runtime environment and provides
 * the appropriate PDF processing capabilities for both Node.js and browser environments.
 */

// Re-export base provider for custom implementations
export { BasePDFReader } from './shared/base.js';
// Export main factory function and types
export {
  getAvailableProviders,
  getPDFReader,
  getProviderInfo,
  initializeProviders,
  isProviderAvailable,
} from './shared/factory.js';
export * from './shared/types.js';

// Legacy compatibility exports for backward compatibility with existing code
import { getPDFReader } from './shared/factory.js';

/**
 * Extract text from a PDF file (legacy compatibility)
 * @deprecated Use getPDFReader().extractText() instead
 */
export async function extractTextFromPDF(
  pdfPath: string,
): Promise<string | null> {
  const reader = await getPDFReader();
  return reader.extractText(pdfPath);
}

/**
 * Extract images from all pages of a PDF file (legacy compatibility)
 * @deprecated Use getPDFReader().extractImages() instead
 */
export async function extractImagesFromPDF(
  pdfPath: string,
): Promise<any[] | null> {
  const reader = await getPDFReader();
  const images = await reader.extractImages(pdfPath);
  return images.length > 0 ? images : null;
}

/**
 * Perform OCR on image data (legacy compatibility)
 * @deprecated Use getPDFReader().performOCR() instead
 */
export async function performOCROnImages(images: any[]): Promise<string> {
  const reader = await getPDFReader();
  const result = await reader.performOCR(images);
  return result.text;
}

/**
 * Check if OCR dependencies are available (legacy compatibility)
 * @deprecated Use getPDFReader().checkDependencies() instead
 */
export async function checkOCRDependencies() {
  const reader = await getPDFReader();
  return reader.checkDependencies();
}

// Initialize providers on module load
import('./shared/factory.js').then(({ initializeProviders }) => {
  initializeProviders().catch(() => {
    // Ignore initialization errors - providers will fail when used
  });
});

// Default export for convenience
import * as factory from './shared/factory.js';
export default factory;
