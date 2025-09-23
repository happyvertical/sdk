/**
 * @have/pdf - unpdf provider for Node.js PDF processing
 */

import { promises as fs } from 'fs';
import { BasePDFReader } from '../shared/base.js';
import type {
  PDFSource,
  ExtractTextOptions,
  PDFMetadata,
  PDFImage,
  PDFCapabilities,
  DependencyCheckResult,
  PDFInfo,
} from '../shared/types.js';
import { PDFDependencyError } from '../shared/types.js';

/**
 * PDF reader implementation using unpdf library for Node.js
 *
 * This provider handles:
 * - Text extraction from PDF files
 * - Image extraction from PDF files
 * - Basic metadata extraction
 */
export class UnpdfProvider extends BasePDFReader {
  protected name = 'unpdf';
  private unpdf: any = null;

  constructor() {
    super();
  }

  /**
   * Lazy load unpdf dependencies
   */
  private async loadUnpdf() {
    if (this.unpdf) {
      return this.unpdf;
    }

    try {
      this.unpdf = await import('unpdf');
      return this.unpdf;
    } catch (error) {
      throw new PDFDependencyError('unpdf', (error as Error).message);
    }
  }

  /**
   * Override normalizeSource to handle file reading in Node.js
   */
  protected async normalizeSource(source: PDFSource): Promise<Buffer> {
    if (typeof source === 'string') {
      try {
        const buffer = await fs.readFile(source);
        return buffer;
      } catch (error) {
        throw new Error(`Failed to read PDF file: ${(error as Error).message}`);
      }
    } else if (source instanceof Buffer) {
      return source;
    } else if (source instanceof Uint8Array) {
      return Buffer.from(source);
    } else {
      throw new Error(
        'Invalid PDF source: must be file path, Buffer, or Uint8Array',
      );
    }
  }

  /**
   * Extract text content from a PDF using unpdf
   */
  async extractText(
    source: PDFSource,
    options?: ExtractTextOptions,
  ): Promise<string | null> {
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);

      if (!this.validatePDFData(buffer)) {
        throw new Error('Invalid PDF data');
      }

      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const totalPages = pdf.numPages;

      // Normalize pages to extract
      const pagesToExtract = this.normalizePages(options?.pages, totalPages);

      if (pagesToExtract.length === 0) {
        return null;
      }

      // Extract text from specified pages
      const pageTexts: string[] = [];

      for (const pageNum of pagesToExtract) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();

          // Combine text items into a single string
          const pageText = textContent.items
            .map((item: any) => item.str || '')
            .join(' ')
            .trim();

          pageTexts.push(pageText);
        } catch (pageError) {
          console.warn(
            `Failed to extract text from page ${pageNum}:`,
            pageError,
          );
          pageTexts.push(''); // Add empty string to maintain page order
        }
      }

      // Merge page texts according to options
      const mergedText = this.mergePageTexts(pageTexts, options?.mergePages);

      return mergedText || null;
    } catch (error) {
      console.error('unpdf text extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract metadata from a PDF using unpdf
   */
  async extractMetadata(source: PDFSource): Promise<PDFMetadata> {
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);

      if (!this.validatePDFData(buffer)) {
        throw new Error('Invalid PDF data');
      }

      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const metadata = await pdf.getMetadata();

      return {
        pageCount: pdf.numPages,
        title: metadata?.info?.Title || undefined,
        author: metadata?.info?.Author || undefined,
        subject: metadata?.info?.Subject || undefined,
        keywords: metadata?.info?.Keywords || undefined,
        creationDate: metadata?.info?.CreationDate
          ? new Date(metadata.info.CreationDate)
          : undefined,
        modificationDate: metadata?.info?.ModDate
          ? new Date(metadata.info.ModDate)
          : undefined,
        version: metadata?.info?.PDFFormatVersion || undefined,
        creator: metadata?.info?.Creator || undefined,
        producer: metadata?.info?.Producer || undefined,
        encrypted: metadata?.info?.Encrypted === 'Yes',
      };
    } catch (error) {
      console.error('unpdf metadata extraction failed:', error);
      // Return default metadata with at least page count if possible
      try {
        const unpdf = await this.loadUnpdf();
        const buffer = await this.normalizeSource(source);
        const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
        return this.createDefaultMetadata(pdf.numPages);
      } catch {
        return this.createDefaultMetadata(0);
      }
    }
  }

  /**
   * No conversion needed! Direct RGB data is now supported by the new ONNX provider.
   * This is the optimal path for OCR processing from unpdf.
   */
  private processRawRGBData(
    rgbData: Buffer,
    width: number,
    height: number,
  ): Buffer {
    // Return raw RGB data directly - no conversion overhead!
    return rgbData;
  }

  /**
   * Extract images from a PDF using unpdf
   */
  async extractImages(source: PDFSource): Promise<PDFImage[]> {
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);

      if (!this.validatePDFData(buffer)) {
        throw new Error('Invalid PDF data');
      }

      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const allImages: PDFImage[] = [];

      // Extract from all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          const images = await unpdf.extractImages(pdf, pageNum);

          // Convert unpdf image format to our PDFImage format with BMP conversion
          for (const image of images) {
            const rawData =
              image.data instanceof Buffer
                ? image.data
                : Buffer.from(image.data);

            // Direct RGB data processing - optimal path for OCR
            let processedData = rawData;
            let format = image.format || 'unknown';

            // If we have raw RGB data (3 channels), keep it as raw RGB
            if (image.channels === 3 && image.width && image.height) {
              const expectedSize = image.width * image.height * 3;
              if (rawData.length === expectedSize) {
                processedData = this.processRawRGBData(
                  rawData,
                  image.width,
                  image.height,
                );
                format = 'rgb'; // Mark as raw RGB for OCR to recognize optimal path
              }
            }

            allImages.push({
              data: processedData,
              width: image.width,
              height: image.height,
              channels: image.channels,
              format: format,
              pageNumber: pageNum,
            });
          }
        } catch (pageError) {
          console.warn(
            `Failed to extract images from page ${pageNum}:`,
            pageError,
          );
        }
      }

      return allImages;
    } catch (error) {
      console.error('unpdf image extraction failed:', error);
      return [];
    }
  }

  /**
   * Check the capabilities of the unpdf provider
   */
  async checkCapabilities(): Promise<PDFCapabilities> {
    const deps = await this.checkDependencies();

    return {
      canExtractText: deps.available,
      canExtractMetadata: deps.available,
      canExtractImages: deps.available,
      canPerformOCR: false, // unpdf doesn't do OCR
      supportedFormats: ['pdf'],
      maxFileSize: undefined, // No explicit limit
      ocrLanguages: undefined,
    };
  }

  /**
   * Check if unpdf dependencies are available
   */
  async checkDependencies(): Promise<DependencyCheckResult> {
    try {
      await this.loadUnpdf();
      return {
        available: true,
        details: {
          unpdf: true,
        },
      };
    } catch (error) {
      return {
        available: false,
        error: `unpdf dependency not available: ${(error as Error).message}`,
        details: {
          unpdf: false,
        },
      };
    }
  }

  /**
   * Get quick information about a PDF document
   */
  async getInfo(source: PDFSource): Promise<PDFInfo> {
    try {
      const unpdf = await this.loadUnpdf();
      const buffer = await this.normalizeSource(source);

      if (!this.validatePDFData(buffer)) {
        throw new Error('Invalid PDF data');
      }

      const pdf = await unpdf.getDocumentProxy(new Uint8Array(buffer));
      const metadata = await pdf.getMetadata();

      // Quick analysis of document structure
      const pageCount = pdf.numPages;
      let hasEmbeddedText = false;
      let hasImages = false;
      let estimatedTextLength = 0;

      // Sample first few pages to determine content type
      const pagesToSample = Math.min(3, pageCount);
      for (let i = 1; i <= pagesToSample; i++) {
        try {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();

          if (content.items && content.items.length > 0) {
            hasEmbeddedText = true;
            // Estimate text length based on sample
            const pageTextLength = content.items.reduce(
              (len: number, item: any) => {
                return len + (item.str ? item.str.length : 0);
              },
              0,
            );
            estimatedTextLength += pageTextLength;
          }

          // Check for images (simplified check for rendering operations)
          const ops = await page.getOperatorList();
          if (
            ops.fnArray &&
            ops.fnArray.some((op: number) => op === 82 || op === 85)
          ) {
            // paintImageXObject operations
            hasImages = true;
          }
        } catch (pageError) {
          // Skip problematic pages
          console.warn(`Failed to analyze page ${i}:`, pageError);
        }
      }

      // Scale estimated text length to full document
      if (estimatedTextLength > 0 && pageCount > pagesToSample) {
        estimatedTextLength = Math.round(
          (estimatedTextLength / pagesToSample) * pageCount,
        );
      }

      // Determine processing strategy
      let recommendedStrategy: 'text' | 'ocr' | 'hybrid';
      let ocrRequired = false;

      if (hasEmbeddedText) {
        if (hasImages && estimatedTextLength < 500) {
          // Has embedded text but very little - might need OCR for images
          recommendedStrategy = 'hybrid';
          ocrRequired = false;
        } else {
          // Sufficient embedded text
          recommendedStrategy = 'text';
          ocrRequired = false;
        }
      } else {
        // No embedded text found - likely image-based PDF
        recommendedStrategy = 'ocr';
        ocrRequired = true;
      }

      // Estimate processing times
      const estimatedProcessingTime = {
        textExtraction: hasEmbeddedText
          ? ((estimatedTextLength > 50000 ? 'medium' : 'fast') as
              | 'fast'
              | 'medium'
              | 'slow')
          : ('fast' as 'fast' | 'medium' | 'slow'),
        ocrProcessing:
          hasImages || ocrRequired
            ? ((pageCount > 10 ? 'slow' : pageCount > 3 ? 'medium' : 'fast') as
                | 'fast'
                | 'medium'
                | 'slow')
            : undefined,
      };

      return {
        pageCount,
        fileSize: buffer.length,
        version: metadata?.info?.PDFFormatVersion || undefined,
        encrypted: metadata?.info?.Encrypted === 'Yes',
        hasEmbeddedText,
        hasImages,
        estimatedTextLength:
          estimatedTextLength > 0 ? estimatedTextLength : undefined,
        recommendedStrategy,
        ocrRequired,
        estimatedProcessingTime,
        title: metadata?.info?.Title || undefined,
        author: metadata?.info?.Author || undefined,
        creationDate: metadata?.info?.CreationDate
          ? new Date(metadata.info.CreationDate)
          : undefined,
        creator: metadata?.info?.Creator || undefined,
        producer: metadata?.info?.Producer || undefined,
      };
    } catch (error) {
      console.error('unpdf getInfo failed:', error);

      // Return minimal info with error handling
      return {
        pageCount: 0,
        encrypted: false,
        hasEmbeddedText: false,
        hasImages: false,
        recommendedStrategy: 'hybrid',
        ocrRequired: false,
        estimatedProcessingTime: {
          textExtraction: 'fast',
        },
      };
    }
  }
}
