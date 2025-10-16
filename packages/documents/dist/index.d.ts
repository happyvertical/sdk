/**
 * @have/documents - Document processing with multi-part structure
 *
 * This package provides unified document processing for PDFs, HTML,
 * and Markdown documents with support for:
 * - Hierarchical document parts
 * - Image extraction with OCR
 * - Automatic format detection
 * - Caching for performance
 *
 * @example
 * ```typescript
 * import { fetchDocument } from '@have/documents';
 *
 * // Fetch and process a PDF
 * const doc = await fetchDocument('https://example.com/report.pdf', {
 *   extractImages: true,
 *   runOcr: true
 * });
 *
 * // Access structured content
 * for (const part of doc.parts) {
 *   console.log(part.title);
 *   console.log(part.content);
 *
 *   // Check for images with OCR text
 *   if (part.images) {
 *     for (const image of part.images) {
 *       console.log(image.ocrText);
 *     }
 *   }
 * }
 * ```
 */
export { Document } from './document';
export { fetchDocument } from './factory';
export { PDFProcessor } from './processors/pdf';
export type { Document as DocumentType, DocumentImage, DocumentPart, DocumentProcessor, FetchDocumentOptions, } from './types';
export { getTitleFromUrl } from './utils';
//# sourceMappingURL=index.d.ts.map