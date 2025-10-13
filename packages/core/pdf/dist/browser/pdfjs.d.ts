import { BasePDFReader } from '../shared/base';
import { DependencyCheckResult, ExtractTextOptions, PDFCapabilities, PDFImage, PDFMetadata, PDFSource } from '../shared/types';
/**
 * PDF reader implementation using PDF.js for browser environments
 *
 * This provider handles:
 * - Text extraction from PDF files in the browser
 * - Basic metadata extraction
 * - Limited image extraction capabilities
 */
export declare class PDFJSProvider extends BasePDFReader {
    protected name: string;
    private pdfjs;
    /**
     * Lazy load PDF.js dependencies
     */
    private loadPDFJS;
    /**
     * Extract text content from a PDF using PDF.js
     */
    extractText(source: PDFSource, options?: ExtractTextOptions): Promise<string | null>;
    /**
     * Extract metadata from a PDF using PDF.js
     */
    extractMetadata(source: PDFSource): Promise<PDFMetadata>;
    /**
     * Extract images from a PDF using PDF.js
     * Note: PDF.js has limited image extraction capabilities compared to unpdf
     */
    extractImages(source: PDFSource): Promise<PDFImage[]>;
    /**
     * Check the capabilities of the PDF.js provider
     */
    checkCapabilities(): Promise<PDFCapabilities>;
    /**
     * Check if PDF.js dependencies are available
     */
    checkDependencies(): Promise<DependencyCheckResult>;
    /**
     * Get quick information about a PDF document
     */
    getInfo(source: PDFSource): Promise<import('../shared/types.js').PDFInfo>;
}
//# sourceMappingURL=pdfjs.d.ts.map