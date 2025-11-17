import { getScraper } from './shared/scraper-factory';
import type { ScrapeOptions } from './shared/types';

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
 * Detect if a URL is a WordPress Download Manager page and extract the actual download URL
 *
 * WordPress Download Manager (WPDM) uses URLs like:
 * - https://example.com/download/file-name/?wpdmdl=12345&refresh=hash
 * - https://example.com/download/file-name/
 *
 * IMPORTANT: This function only detects WordPress DOWNLOAD PAGES (HTML pages that link to downloads).
 * It does NOT guarantee the extracted URL will return a PDF - that URL might still return HTML
 * (e.g., tracking page, authentication page, etc.). Callers should validate content type after fetching.
 *
 * @param url - The URL to check
 * @param html - The HTML content of the page
 * @returns The actual download URL if detected, null otherwise
 */
function extractWordPressDownloadUrl(url: string, html: string): string | null {
  // Check if this looks like a WordPress download manager page
  // NOTE: We're conservative here - only detect pages that are clearly WordPress download pages
  // Don't detect pages that already have wpdmdl in the URL (those might be cached responses)
  const hasWpdmInUrl = url.includes('wpdmdl=');
  const isWpdmPage =
    url.includes('/download/') ||
    html.includes('wpdm-download-link') ||
    html.includes('wpdm_view_count');

  // If the URL already has wpdmdl parameter, this is likely a download URL that returned HTML
  // In this case, we should NOT treat it as a WordPress page to avoid infinite loops
  if (hasWpdmInUrl) {
    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.warn(
        `[spider] WordPress detection: URL already has wpdmdl parameter, skipping detection to avoid loop: ${url}`,
      );
    }
    return null;
  }

  if (!isWpdmPage) {
    return null;
  }

  // Try to find download link with wpdmdl parameter
  // Pattern: <a href="url?wpdmdl=ID&refresh=hash">
  const wpdmLinkMatch = html.match(/href=["']([^"']*wpdmdl=\d+[^"']*)["']/i);

  if (wpdmLinkMatch) {
    let downloadUrl = wpdmLinkMatch[1];
    // Decode HTML entities (&amp; → &, &quot; → ", etc.)
    downloadUrl = downloadUrl
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    // Make absolute if relative
    if (downloadUrl.startsWith('/')) {
      const urlObj = new URL(url);
      downloadUrl = `${urlObj.protocol}//${urlObj.host}${downloadUrl}`;
    }

    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.log(
        `[spider] WordPress detection: Found wpdmdl link: ${downloadUrl}`,
      );
    }

    return downloadUrl;
  }

  // Try to find direct PDF links in the page
  const pdfLinkMatch = html.match(/href=["']([^"']*\.pdf[^"']*)["']/i);

  if (pdfLinkMatch) {
    let pdfUrl = pdfLinkMatch[1];
    // Decode HTML entities (&amp; → &, &quot; → ", etc.)
    pdfUrl = pdfUrl
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    // Make absolute if relative
    if (pdfUrl.startsWith('/')) {
      const urlObj = new URL(url);
      pdfUrl = `${urlObj.protocol}//${urlObj.host}${pdfUrl}`;
    }

    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.log(
        `[spider] WordPress detection: Found direct PDF link: ${pdfUrl}`,
      );
    }

    return pdfUrl;
  }

  if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
    console.warn(
      `[spider] WordPress detection: Page looks like WordPress but no download link found: ${url}`,
    );
  }

  return null;
}

/**
 * Detect if a URL is a CivicWeb preview page and extract the actual PDF URL
 *
 * CivicWeb document management system (used by school boards and municipalities
 * across Canada) uses preview pages like:
 * - https://example.civicweb.net/filepro/documents/?preview=12345
 *
 * The actual PDF is embedded in the preview page:
 * - https://example.civicweb.net/filepro/document/12345/filename.pdf
 *
 * @param url - The URL to check
 * @param html - The HTML content of the page
 * @returns The actual PDF URL if detected, null otherwise
 */
function extractCivicWebDocumentUrl(url: string, html: string): string | null {
  // Check if this looks like a CivicWeb preview page
  const isCivicWebPreview =
    url.includes('/filepro/documents/?preview=') ||
    (url.includes('civicweb.net') && url.includes('/filepro/documents'));

  if (!isCivicWebPreview) {
    return null;
  }

  // Extract document ID from preview URL
  const previewMatch = url.match(/\?preview=(\d+)/);
  if (!previewMatch) return null;

  const _docId = previewMatch[1];

  // Look for the actual document URL in the HTML
  // Pattern: /filepro/document/{ID}/{filename}.pdf
  const docLinkMatch = html.match(
    /href=["'](\/filepro\/document\/\d+\/[^"']+\.pdf)["']/i,
  );

  if (docLinkMatch) {
    let docUrl = docLinkMatch[1];
    // Decode HTML entities (&amp; → &, &quot; → ", etc.)
    docUrl = docUrl
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    // Make absolute URL
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }

  return null;
}

/**
 * Detect if a URL is a DocuShare document page and extract the actual download URL
 *
 * DocuShare document management system (used by municipalities and organizations)
 * uses document pages that link to downloadable files. Common patterns:
 * - https://example.com/docushare/dsweb/Get/Document-12345
 * - https://example.com/docushare/dsweb/View/Collection-12345
 *
 * The actual download link is embedded in the page:
 * - https://example.com/docushare/dsweb/Get/Document-12345/filename.pdf
 * - https://example.com/docushare/dsweb/ServicesLib/Document-12345/filename.pdf
 *
 * @param url - The URL to check
 * @param html - The HTML content of the page
 * @returns The actual download URL if detected, null otherwise
 */
function extractDocuShareDocumentUrl(url: string, html: string): string | null {
  // Check if this looks like a DocuShare page
  const isDocuSharePage =
    url.includes('/docushare/dsweb/') ||
    url.includes('DocuShare') ||
    html.includes('DocuShare') ||
    html.includes('/dsweb/Get/') ||
    html.includes('/dsweb/ServicesLib/');

  if (!isDocuSharePage) {
    return null;
  }

  // Try to find direct download links for various file types
  // Pattern 1: /dsweb/Get/Document-ID/filename.ext
  const getMatch = html.match(
    /href=["'](\/dsweb\/Get\/Document-\d+\/[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i,
  );

  if (getMatch) {
    let docUrl = getMatch[1];
    // Decode HTML entities
    docUrl = docUrl
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    // Make absolute URL
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }

  // Pattern 2: /dsweb/ServicesLib/Document-ID/filename.ext
  const servicesMatch = html.match(
    /href=["'](\/dsweb\/ServicesLib\/Document-\d+\/[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i,
  );

  if (servicesMatch) {
    let docUrl = servicesMatch[1];
    // Decode HTML entities
    docUrl = docUrl
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    // Make absolute URL
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }

  // Pattern 3: Direct link to any document file in DocuShare paths
  const directMatch = html.match(
    /href=["'](\/[^"']*(?:docushare|dsweb)[^"']+\.(pdf|doc|docx|xls|xlsx|ppt|pptx))["']/i,
  );

  if (directMatch) {
    let docUrl = directMatch[1];
    // Decode HTML entities
    docUrl = docUrl
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    // Make absolute URL
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}${docUrl}`;
  }

  return null;
}

/**
 * Convenience function to scrape and extract document content from a URL
 *
 * This function intelligently handles different document types:
 * - HTML pages: Extracts main content and metadata
 * - PDF links: Detects and flags for PDF processing (requires @happyvertical/pdf)
 * - Download pages: Detects links to downloadable documents
 * - WordPress Download Manager: Automatically extracts actual download URLs
 * - CivicWeb preview pages: Extracts actual PDF URLs from preview pages
 * - DocuShare document pages: Extracts direct download links for documents
 *
 * For full document processing with PDF support, use @happyvertical/content's Document class.
 * This function provides the foundation for document discovery and basic extraction.
 *
 * @param url - The URL of the document to scrape
 * @param options - Optional scrape configuration including scraper/spider selection
 * @returns Promise resolving to document content and metadata
 *
 * @example Basic HTML page
 * ```typescript
 * import { scrapeDocument } from '@happyvertical/spider';
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
 *   console.log('PDF detected, use @happyvertical/content or @happyvertical/pdf for extraction');
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
export async function scrapeDocument(
  url: string,
  options?: DocumentScrapeOptions,
): Promise<DocumentResult> {
  // Normalize URL for WordPress detection: ensure /download/ paths have trailing slash
  // This fixes issue #454 where WordPress detection fails without trailing slash
  // WordPress servers return different content for URLs with/without trailing slashes
  let normalizedUrl = url;
  if (url.includes('/download/') && !url.includes('?') && !url.endsWith('/')) {
    normalizedUrl = url + '/';
  }

  // Use provided scraper config or defaults (basic + dom)
  const scraperType = options?.scraper || 'basic';
  const spiderType = options?.spider || 'dom';

  const scraper = await getScraper({
    scraper: scraperType,
    spider: spiderType,
  } as any);

  const result = await scraper.scrape(normalizedUrl, options);
  const actualUrl = normalizedUrl;

  // Defensive check: If result.content looks like HTML (starts with <!DOCTYPE, <html>, etc.),
  // we should be very careful about marking it as a PDF
  const looksLikeHtml =
    result.content.trimStart().startsWith('<!DOCTYPE') ||
    result.content.trimStart().startsWith('<html') ||
    result.content.includes('<head>') ||
    result.content.includes('<body>');

  // Check if this is a WordPress Download Manager page
  const wpDownloadUrl = extractWordPressDownloadUrl(
    normalizedUrl,
    result.content,
  );
  if (wpDownloadUrl) {
    // IMPORTANT: WordPress Download Manager URLs often return HTML tracking pages
    // before redirecting to the actual PDF. We detect the download page but
    // mark the result as incomplete so the caller knows to fetch the URL separately.
    //
    // If the current content is clearly HTML, we're on the download page (correct).
    // The wpDownloadUrl should be fetched separately to get the actual PDF.
    if (process.env.HAVE_DEBUG === 'true' || process.env.DEBUG === 'spider') {
      console.log(
        `[spider] WordPress download page detected. Content is ${looksLikeHtml ? 'HTML' : 'unknown'}, extracted URL: ${wpDownloadUrl}`,
      );
    }

    return {
      url: wpDownloadUrl,
      type: 'application/pdf',
      text: '',
      html: undefined,
      metadata: {
        title: undefined,
        description: undefined,
        isPdf: true,
        complete: false, // Indicate PDF needs separate processing
        strategy: 'wordpress-pdf-link',
      },
    };
  }

  // Check if this is a CivicWeb preview page
  const civicWebUrl = extractCivicWebDocumentUrl(url, result.content);
  if (civicWebUrl) {
    // CivicWeb preview pages embed PDF links that need separate processing
    // Return the actual PDF URL for fetchDocument to process
    return {
      url: civicWebUrl,
      type: 'application/pdf',
      text: '',
      html: undefined,
      metadata: {
        title: undefined,
        description: undefined,
        isPdf: true,
        complete: false, // Indicate PDF needs separate processing
        strategy: 'civicweb-pdf-link',
      },
    };
  }

  // Check if this is a DocuShare document page
  const docuShareUrl = extractDocuShareDocumentUrl(url, result.content);
  if (docuShareUrl) {
    // DocuShare pages embed direct download links
    // Determine document type from extension
    const isPdf = docuShareUrl.toLowerCase().endsWith('.pdf');
    const docType = isPdf ? 'application/pdf' : 'application/octet-stream';

    return {
      url: docuShareUrl,
      type: docType,
      text: '',
      html: undefined,
      metadata: {
        title: undefined,
        description: undefined,
        isPdf,
        complete: false, // Indicate document needs separate processing
        strategy: 'docushare-doc-link',
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
    const titleMatch = result.content.match(/<title[^>]*>([^<]+)<\/title>/i);
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
    text = text.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      '',
    );
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
 * import { findDocumentLinks, scrapeDocument } from '@happyvertical/spider';
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
