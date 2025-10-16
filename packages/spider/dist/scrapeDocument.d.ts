import { ScrapeOptions } from './shared/types';
/**
 * Options for document scraping with scraper configuration
 *
 * Extends ScrapeOptions with scraper/spider selection capabilities,
 * allowing callers to choose between different scraping strategies
 * based on the document source's requirements.
 */
export interface DocumentScrapeOptions extends ScrapeOptions {
    /**
     * Scraper type to use for content extraction
     * - 'basic': Fast, static HTML scraping (default)
     * - 'crawlee': Full browser with JavaScript execution
     *
     * @default 'basic'
     * @example
     * ```typescript
     * // Use crawlee for JavaScript-heavy pages
     * await scrapeDocument(url, { scraper: 'crawlee' });
     * ```
     */
    scraper?: 'basic' | 'crawlee';
    /**
     * Spider adapter for fetching pages
     * - 'simple': Basic HTTP fetch
     * - 'dom': HTML parsing with happy-dom
     * - 'crawlee': Headless browser (requires scraper: 'crawlee')
     *
     * @default 'dom'
     * @example
     * ```typescript
     * // Use simple spider for minimal overhead
     * await scrapeDocument(url, { spider: 'simple' });
     * ```
     */
    spider?: 'simple' | 'dom' | 'crawlee';
}
/**
 * Simple document structure returned by scrapeDocument
 */
export interface DocumentResult {
    /** Original URL */
    url: string;
    /** Detected content type (text/html, application/pdf, etc.) */
    type: string;
    /** Extracted text content */
    text: string;
    /** Full HTML content (if applicable) */
    html?: string;
    /** Additional metadata */
    metadata: {
        /** Content title extracted from page */
        title?: string;
        /** Content description */
        description?: string;
        /** Whether this was a PDF document */
        isPdf: boolean;
        /** Whether content extraction was successful */
        complete: boolean;
        /** Strategy used to scrape the document */
        strategy: string;
    };
}
/**
 * Convenience function to scrape and extract document content from a URL
 *
 * This function intelligently handles different document types:
 * - HTML pages: Extracts main content and metadata
 * - PDF links: Detects and flags for PDF processing (requires @have/pdf)
 * - Download pages: Detects links to downloadable documents
 * - WordPress Download Manager: Automatically extracts actual download URLs
 * - CivicWeb preview pages: Extracts actual PDF URLs from preview pages
 * - DocuShare document pages: Extracts direct download links for documents
 *
 * For full document processing with PDF support, use @have/content's Document class.
 * This function provides the foundation for document discovery and basic extraction.
 *
 * @param url - The URL of the document to scrape
 * @param options - Optional scrape configuration including scraper/spider selection
 * @returns Promise resolving to document content and metadata
 *
 * @example Basic HTML page
 * ```typescript
 * import { scrapeDocument } from '@have/spider';
 *
 * const doc = await scrapeDocument('https://example.com/article');
 * console.log(doc.text); // Extracted text content
 * console.log(doc.metadata.title); // Page title
 * ```
 *
 * @example PDF detection
 * ```typescript
 * const doc = await scrapeDocument('https://example.com/report.pdf');
 * if (doc.metadata.isPdf) {
 *   console.log('PDF detected, use @have/content or @have/pdf for extraction');
 * }
 * ```
 *
 * @example WordPress Download Manager
 * ```typescript
 * // Automatically handles WordPress download pages
 * const doc = await scrapeDocument('https://site.com/download/file/');
 * // Extracts and follows the actual download URL
 * if (doc.metadata.isPdf) {
 *   console.log('PDF downloaded from WordPress Download Manager');
 * }
 * ```
 *
 * @example CivicWeb preview pages
 * ```typescript
 * // Automatically handles CivicWeb preview pages
 * const doc = await scrapeDocument(
 *   'https://example.civicweb.net/filepro/documents/?preview=12345'
 * );
 * // Extracts actual PDF URL from preview page
 * if (doc.metadata.strategy === 'civicweb-pdf-link') {
 *   console.log('PDF extracted from CivicWeb preview page');
 *   console.log(doc.url); // Actual PDF URL
 * }
 * ```
 *
 * @example DocuShare document pages
 * ```typescript
 * // Automatically handles DocuShare document pages
 * const doc = await scrapeDocument(
 *   'https://example.com/docushare/dsweb/Get/Document-12345'
 * );
 * // Extracts direct download link for document
 * if (doc.metadata.strategy === 'docushare-doc-link') {
 *   console.log('Document extracted from DocuShare page');
 *   console.log(doc.url); // Direct download URL
 * }
 * ```
 *
 * @example Custom options
 * ```typescript
 * const doc = await scrapeDocument('https://example.com/article', {
 *   timeout: 60000,
 *   cache: true,
 *   headers: {
 *     'User-Agent': 'MyBot/1.0'
 *   }
 * });
 * ```
 *
 * @example Using crawlee for JavaScript-heavy pages
 * ```typescript
 * // CivicWeb and other systems that generate content with JavaScript
 * const doc = await scrapeDocument(
 *   'https://example.civicweb.net/filepro/documents/?preview=12345',
 *   { scraper: 'crawlee' }  // Executes JavaScript to get dynamic content
 * );
 * ```
 *
 * @example Using simple spider for minimal overhead
 * ```typescript
 * // Fast scraping without DOM processing
 * const doc = await scrapeDocument(
 *   'https://example.com/simple-page.html',
 *   { spider: 'simple' }  // Faster than 'dom' for basic pages
 * );
 * ```
 */
export declare function scrapeDocument(url: string, options?: DocumentScrapeOptions): Promise<DocumentResult>;
/**
 * Options for detecting downloadable documents
 */
export interface DocumentLinkOptions {
    /** File extensions to consider as documents */
    extensions?: string[];
}
/**
 * Helper function to detect document download links in a scraped page
 *
 * This is useful when a URL is a "download page" rather than the document itself.
 * Use this to find the actual document URLs that can be passed to scrapeDocument.
 *
 * @param url - The URL of the page to check for document links
 * @param options - Optional configuration for detection
 * @returns Promise resolving to array of document URLs found
 *
 * @example
 * ```typescript
 * import { findDocumentLinks, scrapeDocument } from '@have/spider';
 *
 * // Find all PDF links on a page
 * const docLinks = await findDocumentLinks('https://example.com/publications');
 * console.log(`Found ${docLinks.length} document links`);
 *
 * // Scrape each document
 * for (const link of docLinks) {
 *   const doc = await scrapeDocument(link);
 *   console.log(`Processing: ${doc.metadata.title}`);
 * }
 * ```
 */
export declare function findDocumentLinks(url: string, options?: DocumentLinkOptions): Promise<string[]>;
//# sourceMappingURL=scrapeDocument.d.ts.map