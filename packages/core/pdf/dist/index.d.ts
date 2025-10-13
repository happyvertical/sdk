/**
 * @have/pdf - Shared entry point with automatic environment detection
 *
 * This entry point automatically detects the runtime environment and provides
 * the appropriate PDF processing capabilities for both Node.js and browser environments.
 */
export { BasePDFReader } from './shared/base';
export { getAvailableProviders, getPDFReader, getProviderInfo, initializeProviders, isProviderAvailable, } from './shared/factory';
export * from './shared/types';
/**
 * Extract text from a PDF file (legacy compatibility)
 * @deprecated Use getPDFReader().extractText() instead
 */
export declare function extractTextFromPDF(pdfPath: string): Promise<string | null>;
/**
 * Extract images from all pages of a PDF file (legacy compatibility)
 * @deprecated Use getPDFReader().extractImages() instead
 */
export declare function extractImagesFromPDF(pdfPath: string): Promise<any[] | null>;
/**
 * Perform OCR on image data (legacy compatibility)
 * @deprecated Use getPDFReader().performOCR() instead
 */
export declare function performOCROnImages(images: any[]): Promise<string>;
/**
 * Check if OCR dependencies are available (legacy compatibility)
 * @deprecated Use getPDFReader().checkDependencies() instead
 */
export declare function checkOCRDependencies(): Promise<import('packages/core/ocr/dist').DependencyCheckResult>;
import * as factory from './shared/factory';
export default factory;
//# sourceMappingURL=index.d.ts.map