import { Document, DocumentProcessor, FetchDocumentOptions } from '../types';
/**
 * PDF Document Processor
 *
 * Handles PDF documents with support for:
 * - Text extraction from PDF content
 * - Image extraction from PDF pages
 * - OCR processing for scanned pages
 * - Multi-page document structuring
 */
export declare class PDFProcessor implements DocumentProcessor {
    /**
     * Check if this processor supports the given type
     */
    supports(type: string): boolean;
    /**
     * Process a PDF document
     *
     * Extracts text and optionally images/OCR from the PDF, structuring
     * it into hierarchical document parts.
     *
     * @param url - PDF URL or file path
     * @param options - Processing options
     * @returns Promise resolving to structured Document
     */
    process(url: string, options?: FetchDocumentOptions): Promise<Document>;
    /**
     * Extract images from PDF
     *
     * This is a placeholder for future image extraction functionality.
     * Will use @have/pdf's image extraction capabilities when available.
     *
     * @param filePath - Local PDF file path
     * @param runOcr - Whether to run OCR on extracted images
     * @returns Promise resolving to array of DocumentImages
     */
    private extractImages;
}
export default PDFProcessor;
//# sourceMappingURL=pdf.d.ts.map