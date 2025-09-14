/**
 * @have/pdf - Node.js entry point
 * 
 * This entry point provides PDF processing capabilities specifically for Node.js environments,
 * including unpdf for text/metadata/image extraction and @gutenye/ocr-node for OCR processing.
 */

// Export main factory function and types
export { getPDFReader, getAvailableProviders, isProviderAvailable, getProviderInfo, initializeProviders } from './shared/factory.js';
export * from './shared/types.js';

// Export Node.js specific providers for direct instantiation if needed
export { UnpdfProvider } from './node/unpdf.js';
export { CombinedNodeProvider } from './node/combined.js';

// Re-export base provider for custom implementations
export { BasePDFReader } from './shared/base.js';

// Legacy compatibility exports - re-export existing functions with new names
import { CombinedNodeProvider } from './node/combined.js';

/**
 * Extract text from a PDF file (legacy compatibility)
 * @deprecated Use getPDFReader().extractText() instead
 */
export async function extractTextFromPDF(pdfPath: string): Promise<string | null> {
  const reader = new CombinedNodeProvider();
  return reader.extractText(pdfPath);
}

/**
 * Extract images from all pages of a PDF file (legacy compatibility)
 * @deprecated Use getPDFReader().extractImages() instead
 */
export async function extractImagesFromPDF(pdfPath: string): Promise<any[] | null> {
  const reader = new CombinedNodeProvider();
  const images = await reader.extractImages(pdfPath);
  return images.length > 0 ? images : null;
}

/**
 * Perform OCR on image data (legacy compatibility)
 * @deprecated Use getPDFReader().performOCR() instead
 */
export async function performOCROnImages(images: any[]): Promise<string> {
  const reader = new CombinedNodeProvider();
  const result = await reader.performOCR(images);
  return result.text;
}

/**
 * Check if OCR dependencies are available (legacy compatibility)
 * @deprecated Use getPDFReader().checkDependencies() instead
 */
export async function checkOCRDependencies() {
  const reader = new CombinedNodeProvider();
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