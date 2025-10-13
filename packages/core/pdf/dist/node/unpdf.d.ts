import { BasePDFReader } from '../shared/base';
import { DependencyCheckResult, ExtractTextOptions, PDFCapabilities, PDFImage, PDFInfo, PDFMetadata, PDFSource } from '../shared/types';
/**
 * PDF reader implementation using unpdf library for Node.js
 *
 * This provider handles:
 * - Text extraction from PDF files
 * - Image extraction from PDF files
 * - Basic metadata extraction
 */
export declare class UnpdfProvider extends BasePDFReader {
    protected name: string;
    private unpdf;
    /**
     * Lazy load unpdf dependencies
     */
    private loadUnpdf;
    /**
     * Override normalizeSource to handle file reading in Node.js
     */
    protected normalizeSource(source: PDFSource): Promise<Buffer>;
    /**
     * Extract text content from a PDF using unpdf
     */
    extractText(source: PDFSource, options?: ExtractTextOptions): Promise<string | null>;
    /**
     * Extract metadata from a PDF using unpdf
     */
    extractMetadata(source: PDFSource): Promise<PDFMetadata>;
    /**
     * No conversion needed! Direct RGB data is now supported by the new ONNX provider.
     * This is the optimal path for OCR processing from unpdf.
     */
    private processRawRGBData;
    /**
     * Extract images from a PDF using unpdf
     */
    extractImages(source: PDFSource): Promise<PDFImage[]>;
    /**
     * Check the capabilities of the unpdf provider
     */
    checkCapabilities(): Promise<PDFCapabilities>;
    /**
     * Check if unpdf dependencies are available
     */
    checkDependencies(): Promise<DependencyCheckResult>;
    /**
     * Get quick information about a PDF document
     */
    getInfo(source: PDFSource): Promise<PDFInfo>;
}
//# sourceMappingURL=unpdf.d.ts.map