import { getMimeType } from '@happyvertical/files';
import { scrapeDocument } from '@happyvertical/spider';
import { PDFProcessor } from './processors/pdf';
import type { Document, FetchDocumentOptions } from './types';

/**
 * Available document processors
 */
const processors = [new PDFProcessor()];

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
export async function fetchDocument(
  url: string,
  options: FetchDocumentOptions = {},
): Promise<Document> {
  // For web URLs (http/https), use spider package to detect special cases
  // (WordPress Download Manager, CivicWeb, DocuShare, etc.)
  const isWebUrl = url.startsWith('http://') || url.startsWith('https://');

  if (isWebUrl && !options.type) {
    try {
      // Use spider to detect WordPress, CivicWeb, DocuShare, and other document management systems
      const scraped = await scrapeDocument(url, {
        scraper: options.scraper || 'basic',
        spider: options.spider || 'dom',
        cache: options.cache,
        cacheExpiry: options.cacheExpiry,
        headers: options.headers,
        timeout: options.timeout,
        maxDuration: options.maxDuration,
        maxInteractions: options.maxInteractions,
      });

      // Check if spider detected a document management system with PDF link
      const hasDocLink =
        scraped.metadata.strategy === 'wordpress-pdf-link' ||
        scraped.metadata.strategy === 'civicweb-pdf-link' ||
        scraped.metadata.strategy === 'docushare-pdf-link';

      if (hasDocLink && scraped.metadata.isPdf && !scraped.metadata.complete) {
        // Spider detected a document management page and extracted the PDF URL
        // Use the extracted URL for PDF processing
        url = scraped.url;
        options.type = 'application/pdf';
      }
    } catch (error) {
      // If spider fails, continue with direct download
      // This ensures backward compatibility
      console.warn(
        `Spider detection failed for ${url}, falling back to direct download:`,
        error,
      );
    }
  }

  // Determine type - check URL extension first, then MIME type
  // This handles servers that return incorrect Content-Type headers (e.g., application/octet-stream for PDFs)
  let type = options.type;

  if (!type) {
    // Extract file extension from URL
    const urlLower = url.toLowerCase();

    // Check for common document extensions in URL
    if (
      urlLower.endsWith('.pdf') ||
      urlLower.includes('.pdf?') ||
      urlLower.includes('.pdf#')
    ) {
      type = 'application/pdf';
    } else {
      // Fall back to MIME type detection
      type = getMimeType(url) || '';
    }
  }

  // Find appropriate processor
  const processor = processors.find((p) => p.supports(type));

  if (!processor) {
    throw new Error(
      `No processor available for document type: ${type}. Supported types: PDF (.pdf, application/pdf)`,
    );
  }

  // Process document
  return processor.process(url, options);
}

export default fetchDocument;
