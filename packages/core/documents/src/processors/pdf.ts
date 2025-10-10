import { v4 as uuidv4 } from 'uuid';
import { getCached, setCached } from '@have/files';
import { getPDFReader } from '@have/pdf';
import type {
  Document,
  DocumentPart,
  DocumentImage,
  DocumentProcessor,
  FetchDocumentOptions,
} from '../types';
import { Document as BaseDocument } from '../document';

/**
 * PDF Document Processor
 *
 * Handles PDF documents with support for:
 * - Text extraction from PDF content
 * - Image extraction from PDF pages
 * - OCR processing for scanned pages
 * - Multi-page document structuring
 */
export class PDFProcessor implements DocumentProcessor {
  /**
   * Check if this processor supports the given type
   */
  supports(type: string): boolean {
    return (
      type === 'application/pdf' ||
      type.endsWith('.pdf') ||
      type.toLowerCase() === 'pdf'
    );
  }

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
  async process(
    url: string,
    options: FetchDocumentOptions = {},
  ): Promise<Document> {
    // Create and initialize base document
    const baseDoc = await BaseDocument.create(url, options);

    // Check cache for processed document
    const cacheKey = `${baseDoc.localPath}.processed_pdf`;
    const cached = await getCached(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          url: baseDoc.url.toString(),
          type: baseDoc.type,
          parts: parsed.parts,
          metadata: parsed.metadata || {},
        };
      } catch (error) {
        // Cache corrupted, continue with fresh processing
        console.warn('Cached PDF data corrupted, reprocessing', error);
      }
    }

    // Get PDF reader and extract content
    const reader = await getPDFReader();
    const extractedText = await reader.extractText(baseDoc.localPath);

    // Create main document part
    const mainPart: DocumentPart = {
      id: uuidv4(),
      title: this.getTitleFromUrl(url),
      content: extractedText || '',
      type: 'text',
      metadata: {
        source: 'pdf',
        filePath: baseDoc.localPath,
      },
    };

    // Extract images if enabled
    if (options.extractImages === true) {
      mainPart.images = await this.extractImages(
        baseDoc.localPath,
        options.runOcr !== false,
      );
    }

    const document: Document = {
      url: baseDoc.url.toString(),
      type: baseDoc.type,
      parts: [mainPart],
      metadata: {
        processor: 'pdf',
        extractedAt: new Date().toISOString(),
        hasImages: (mainPart.images?.length || 0) > 0,
      },
    };

    // Cache the processed document
    await setCached(cacheKey, JSON.stringify(document));

    return document;
  }

  /**
   * Extract title from URL
   */
  private getTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop() || 'document';
      return filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
    } catch {
      return 'PDF Document';
    }
  }

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
  private async extractImages(
    filePath: string,
    runOcr: boolean,
  ): Promise<DocumentImage[]> {
    // TODO: Implement image extraction using @have/pdf
    // For now, return empty array as placeholder

    // Future implementation will:
    // 1. Use getPDFReader() to extract images from PDF
    // 2. Save images to cache directory
    // 3. If runOcr is true, use @have/ocr to extract text from images
    // 4. Return array of DocumentImage objects with metadata

    return [];
  }
}

export default PDFProcessor;
