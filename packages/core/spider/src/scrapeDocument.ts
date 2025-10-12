import { getScraper } from './shared/scraper-factory';
import type { ScrapeOptions } from './shared/types';

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
 * Detect if a URL is a WordPress Download Manager page and extract the actual download URL
 *
 * WordPress Download Manager (WPDM) uses URLs like:
 * - https://example.com/download/file-name/?wpdmdl=12345&refresh=hash
 * - https://example.com/download/file-name/
 *
 * @param url - The URL to check
 * @param html - The HTML content of the page
 * @returns The actual download URL if detected, null otherwise
 */
function extractWordPressDownloadUrl(url: string, html: string): string | null {
  // Check if this looks like a WordPress download manager page
  const isWpdmPage =
    url.includes('/download/') ||
    html.includes('wpdmdl=') ||
    html.includes('wpdm-download-link') ||
    html.includes('wpdm_view_count');

  if (!isWpdmPage) {
    return null;
  }

  // Try to find download link with wpdmdl parameter
  // Pattern: <a href="url?wpdmdl=ID&refresh=hash">
  const wpdmLinkMatch = html.match(
    /href=["']([^"']*wpdmdl=\d+[^"']*)["']/i
  );

  if (wpdmLinkMatch) {
    const downloadUrl = wpdmLinkMatch[1];
    // Make absolute if relative
    if (downloadUrl.startsWith('/')) {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${downloadUrl}`;
    }
    return downloadUrl;
  }

  // Try to find direct PDF links in the page
  const pdfLinkMatch = html.match(
    /href=["']([^"']*\.pdf[^"']*)["']/i
  );

  if (pdfLinkMatch) {
    const pdfUrl = pdfLinkMatch[1];
    // Make absolute if relative
    if (pdfUrl.startsWith('/')) {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${pdfUrl}`;
    }
    return pdfUrl;
  }

  return null;
}

/**
 * Convenience function to scrape and extract document content from a URL
 *
 * This function intelligently handles different document types:
 * - HTML pages: Extracts main content and metadata
 * - PDF links: Detects and flags for PDF processing (requires @have/pdf)
 * - Download pages: Detects links to downloadable documents
 * - WordPress Download Manager: Automatically extracts actual download URLs
 *
 * For full document processing with PDF support, use @have/content's Document class.
 * This function provides the foundation for document discovery and basic extraction.
 *
 * @param url - The URL of the document to scrape
 * @param options - Optional scrape configuration
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
 */
export async function scrapeDocument(
  url: string,
  options?: ScrapeOptions,
): Promise<DocumentResult> {
  // Use basic scraper with DOM spider for better content extraction
  const scraper = await getScraper({
    scraper: 'basic',
    spider: 'dom',
  });

  let result = await scraper.scrape(url, options);
  let actualUrl = url;

  // Check if this is a WordPress Download Manager page
  const wpDownloadUrl = extractWordPressDownloadUrl(url, result.content);
  if (wpDownloadUrl) {
    // WordPress Download Manager URLs either have wpdmdl parameter or .pdf extension
    // In both cases, they trigger file downloads, so we shouldn't re-scrape them
    // Just return the URL for later processing with fetchDocument
    return {
      url: wpDownloadUrl,
      type: 'application/pdf',
      text: '',
      html: undefined,
      metadata: {
        title: undefined,
        description: undefined,
        isPdf: true,
        complete: false,  // Indicate PDF needs separate processing
        strategy: 'wordpress-pdf-link',
      },
    };
  }

  // Detect if URL points to a PDF
  const isPdf =
    url.toLowerCase().endsWith('.pdf') ||
    result.content.includes('application/pdf') ||
    result.content.includes('%PDF-');

  // Extract basic metadata from HTML
  let title: string | undefined;
  let description: string | undefined;

  if (!isPdf && result.content) {
    // Extract title
    const titleMatch = result.content.match(
      /<title[^>]*>([^<]+)<\/title>/i,
    );
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Extract meta description
    const descMatch = result.content.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    );
    if (descMatch) {
      description = descMatch[1].trim();
    }
  }

  // Extract text content (strip HTML tags for basic text extraction)
  let text = result.content;
  if (!isPdf) {
    // Remove script and style tags
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Strip HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
  }

  return {
    url: actualUrl, // Use the actual download URL if redirected from WordPress
    type: isPdf ? 'application/pdf' : 'text/html',
    text,
    html: !isPdf ? result.content : undefined,
    metadata: {
      title,
      description,
      isPdf,
      complete: result.metrics.complete,
      strategy: result.strategy.type,
    },
  };
}

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
export async function findDocumentLinks(
  url: string,
  options?: DocumentLinkOptions,
): Promise<string[]> {
  const extensions = options?.extensions || [
    '.pdf',
    '.doc',
    '.docx',
    '.txt',
    '.md',
    '.rtf',
  ];

  // Scrape the index page for links
  const scraper = await getScraper({
    scraper: 'basic',
    spider: 'simple',
  });

  const result = await scraper.scrape(url);

  // Filter links to find document URLs
  const documentLinks = result.links
    .filter((link) => {
      const href = link.href.toLowerCase();
      return extensions.some((ext) => href.endsWith(ext));
    })
    .map((link) => link.href);

  // Remove duplicates
  return [...new Set(documentLinks)];
}
