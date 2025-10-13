import { BasePDFReader } from '../shared/base';
import { DependencyCheckResult, ExtractTextOptions, OCROptions, OCRResult, PDFCapabilities, PDFImage, PDFInfo, PDFMetadata, PDFSource } from '../shared/types';
/**
 * Combined PDF reader for Node.js that integrates unpdf and OCR capabilities
 *
 * This provider:
 * - Uses unpdf for text, metadata, and image extraction
 * - Falls back to OCR when direct text extraction yields no results
 * - Combines capabilities of both underlying providers
 */
export declare class CombinedNodeProvider extends BasePDFReader {
    protected name: string;
    private unpdfProvider;
    private ocrFactory;
    constructor();
    /**
     * Extract text content from a PDF with OCR fallback
     */
    extractText(source: PDFSource, options?: ExtractTextOptions): Promise<string | null>;
    /**
     * Extract metadata from a PDF using unpdf
     */
    extractMetadata(source: PDFSource): Promise<PDFMetadata>;
    /**
     * Extract images from a PDF using unpdf
     */
    extractImages(source: PDFSource): Promise<PDFImage[]>;
    /**
     * Perform OCR on image data
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
     * Get quick information about a PDF document combining both unpdf and OCR analysis
     */
    getInfo(source: PDFSource): Promise<PDFInfo>;
}
//# sourceMappingURL=combined.d.ts.map