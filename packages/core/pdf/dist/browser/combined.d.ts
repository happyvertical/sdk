import { BasePDFReader } from '../shared/base';
import { DependencyCheckResult, ExtractTextOptions, OCROptions, OCRResult, PDFCapabilities, PDFImage, PDFInfo, PDFMetadata, PDFSource } from '../shared/types';
/**
 * Combined PDF reader for browser environments that integrates PDF.js and Web OCR
 *
 * This provider:
 * - Uses PDF.js for text and metadata extraction
 * - Falls back to web OCR when direct text extraction yields no results
 * - Combines capabilities of both underlying providers
 */
export declare class CombinedBrowserProvider extends BasePDFReader {
    protected name: string;
    private pdfjsProvider;
    private ocrFactory;
    constructor();
    /**
     * Extract text content from a PDF with web OCR fallback
     */
    extractText(source: PDFSource, options?: ExtractTextOptions): Promise<string | null>;
    /**
     * Extract metadata from a PDF using PDF.js
     */
    extractMetadata(source: PDFSource): Promise<PDFMetadata>;
    /**
     * Extract images from a PDF using PDF.js
     */
    extractImages(source: PDFSource): Promise<PDFImage[]>;
    /**
     * Perform OCR on image data using web OCR
     */
    performOCR(images: PDFImage[], options?: OCROptions): Promise<OCRResult>;
    /**
     * Check the combined capabilities of both providers
     */
    checkCapabilities(): Promise<PDFCapabilities>;
    /**
     * Check dependencies for both providers
     */
    checkDependencies(): Promise<DependencyCheckResult>;
    /**
     * Get quick information about a PDF document
     */
    getInfo(source: PDFSource): Promise<PDFInfo>;
}
//# sourceMappingURL=combined.d.ts.map