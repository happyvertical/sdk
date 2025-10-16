import { Document, FetchDocumentOptions } from './types';
/**
 * Fetch a document from a URL with automatic format detection
 *
 * This factory function:
 * 1. Detects the document format (PDF, HTML, Markdown, etc.)
 * 2. Selects the appropriate processor
 * 3. Processes the document into structured parts
 * 4. Returns a Document object with hierarchical content
 *
 * @param url - Document URL or file path (file://, http://, https://)
 * @param options - Fetch and processing options
 * @returns Promise resolving to structured Document
 *
 * @example
 * ```typescript
 * // Fetch a PDF with image extraction and OCR
 * const doc = await fetchDocument('https://example.com/report.pdf', {
 *   extractImages: true,
 *   runOcr: true
 * });
 *
 * // Access document parts
 * for (const part of doc.parts) {
 *   console.log(part.title);
 *   console.log(part.content);
 *
 *   // Check for images
 *   if (part.images) {
 *     for (const image of part.images) {
 *       console.log(image.url);
 *       console.log(image.ocrText); // Text extracted via OCR
 *     }
 *   }
 * }
 * ```
 */
export declare function fetchDocument(url: string, options?: FetchDocumentOptions): Promise<Document>;
export default fetchDocument;
//# sourceMappingURL=factory.d.ts.map