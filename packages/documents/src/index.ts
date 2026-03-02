/**
 * @happyvertical/documents - Document processing with multi-part structure
 *
 * Provides document processing for PDFs with support for:
 * - Hierarchical document parts
 * - Automatic format detection from URL or MIME type
 * - Document management system detection (WordPress, CivicWeb, DocuShare)
 * - File caching for performance
 *
 * @example
 * ```typescript
 * import { fetchDocument } from '@happyvertical/documents';
 *
 * const doc = await fetchDocument('https://example.com/report.pdf');
 *
 * for (const part of doc.parts) {
 *   console.log(part.title);
 *   console.log(part.content);
 * }
 * ```
 */

// Base classes
export { Document } from './document';
// Main factory function
export { fetchDocument } from './factory';

// Processors
export { PDFProcessor } from './processors/pdf';
// Types
export type {
  Document as DocumentType,
  DocumentImage,
  DocumentPart,
  DocumentProcessor,
  FetchDocumentOptions,
} from './types';
// Utilities
export { getTitleFromUrl } from './utils';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
