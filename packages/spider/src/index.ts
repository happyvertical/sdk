import { fetchText, getCached, setCached } from '@have/files';
import {
  getLogger,
  isUrl,
  NetworkError,
  ParsingError,
  urlFilename,
  urlPath,
  ValidationError,
} from '@have/utils';
import * as cheerio from 'cheerio';
import { Window } from 'happy-dom';
import path from 'path';
import { request } from 'undici';

/**
 * Configuration options for fetching a web page's source code
 *
 * @interface FetchPageSourceOptions
 * @example
 * ```typescript
 * // Simple fast fetch with caching
 * const options: FetchPageSourceOptions = {
 *   url: 'https://example.com',
 *   cheap: true,
 *   cache: true,
 *   cacheExpiry: 300000 // 5 minutes
 * };
 *
 * // DOM-processed fetch with custom headers
 * const domOptions: FetchPageSourceOptions = {
 *   url: 'https://api.example.com/data',
 *   cheap: false,
 *   headers: { 'Authorization': 'Bearer token' },
 *   timeout: 60000 // 1 minute
 * };
 * ```
 */
export interface FetchPageSourceOptions {
  /**
   * The URL to fetch content from. Must be a valid HTTP or HTTPS URL.
   *
   * @example 'https://example.com/page.html'
   */
  url: string;

  /**
   * Whether to use a simple HTTP fetch instead of DOM processing.
   *
   * - `true`: Fast HTTP request using undici, ideal for simple HTML extraction
   * - `false`: Full DOM processing with happy-dom, handles complex HTML but slower
   *
   * @default true
   * @example
   * // Fast fetch for simple content extraction
   * { cheap: true }
   *
   * // DOM processing for complex HTML manipulation
   * { cheap: false }
   */
  cheap: boolean;

  /**
   * Whether to use cached content if available. When enabled, responses are cached
   * to disk and reused within the cache expiry period.
   *
   * @default true
   * @example
   * // Use caching (recommended for production)
   * { cache: true }
   *
   * // Bypass cache for fresh content
   * { cache: false }
   */
  cache?: boolean;

  /**
   * Cache expiry time in milliseconds. Cached content older than this will be refetched.
   *
   * @default 300000 (5 minutes)
   * @example
   * // Cache for 1 hour
   * { cacheExpiry: 3600000 }
   *
   * // Cache for 30 seconds (for rapidly changing content)
   * { cacheExpiry: 30000 }
   */
  cacheExpiry?: number;

  /**
   * Custom HTTP headers to include with the request. These will be merged with
   * default headers, with custom headers taking precedence.
   *
   * @example
   * {
   *   headers: {
   *     'User-Agent': 'MyBot/1.0',
   *     'Authorization': 'Bearer token123',
   *     'Accept-Language': 'en-US,en;q=0.9'
   *   }
   * }
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds. The request will fail if it takes longer than this.
   *
   * @default 30000 (30 seconds)
   * @example
   * // Short timeout for fast APIs
   * { timeout: 5000 }
   *
   * // Long timeout for slow endpoints
   * { timeout: 120000 }
   */
  timeout?: number;
}

/**
 * Fetches the HTML source of a web page using either a simple HTTP request or DOM processing.
 *
 * This function provides two modes of operation:
 * - **Cheap mode** (`cheap: true`): Fast HTTP fetch using undici, ideal for simple content extraction
 * - **DOM mode** (`cheap: false`): Full DOM processing with happy-dom, handles complex HTML structures
 *
 * Both modes support intelligent caching to improve performance and reduce server load.
 *
 * @param options - Configuration options for the fetch operation
 * @returns Promise resolving to the HTML content of the page as a string
 *
 * @throws {ValidationError} When the URL is invalid, empty, or malformed
 * @throws {NetworkError} When there are HTTP failures, timeouts, or connectivity issues
 *
 * @example
 * ```typescript
 * // Simple fast fetch with caching (recommended for most use cases)
 * const html = await fetchPageSource({
 *   url: 'https://example.com/article.html',
 *   cheap: true,
 *   cache: true,
 *   cacheExpiry: 300000 // 5 minutes
 * });
 *
 * // DOM processing for complex HTML (slower but more robust)
 * const processedHtml = await fetchPageSource({
 *   url: 'https://complex-site.com/app',
 *   cheap: false,
 *   headers: {
 *     'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot)'
 *   },
 *   timeout: 60000
 * });
 *
 * // Extract content with cheerio after fetching
 * const $ = cheerio.load(html);
 * const title = $('title').text();
 * const content = $('article').text();
 * ```
 *
 * @see {@link parseIndexSource} for extracting links from fetched HTML
 * @see {@link processHtml} for additional HTML processing with happy-dom
 */
export async function fetchPageSource(
  options: FetchPageSourceOptions,
): Promise<string> {
  const {
    url,
    cheap = true,
    cache = true,
    cacheExpiry = 300000,
    headers = {},
    timeout = 30000,
  } = options;

  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new ValidationError('URL is required and must be a string', { url });
  }

  if (!isUrl(url)) {
    throw new ValidationError('Invalid URL format', { url });
  }

  if (cheap) {
    const cachedFile = path.join(urlPath(url), '.cheap', urlFilename(url));

    if (cache) {
      const cached = await getCached(cachedFile, cacheExpiry);
      if (cached) {
        getLogger().info('Using cached page source', {
          url,
          cacheFile: cachedFile,
        });
        return cached;
      }
    }

    const content = await fetchText(url);

    if (cache) {
      await setCached(cachedFile, content);
    }

    return content;
  }

  const cachedFile = path.join(urlPath(url), urlFilename(url));

  if (cache) {
    const cached = await getCached(cachedFile, cacheExpiry);
    if (cached) {
      getLogger().info('Using cached page source', {
        url,
        cacheFile: cachedFile,
      });
      return cached;
    }
  }

  try {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; HAppyVertical Spider/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      DNT: '1',
      Connection: 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...headers,
    };

    const response = await request(url, {
      method: 'GET',
      headers: defaultHeaders,
      headersTimeout: timeout,
      bodyTimeout: timeout,
    });

    if (response.statusCode >= 400) {
      throw new NetworkError(
        `HTTP ${response.statusCode}: ${response.headers['status'] || 'Request failed'}`,
        { url, statusCode: response.statusCode, headers: response.headers },
      );
    }

    const content = await response.body.text();

    // Try to process the HTML with happy-dom to ensure it's well-formed
    // Some HTML with event handlers may cause issues in happy-dom
    let processedContent = content;
    try {
      const window = new Window();
      const document = window.document;
      document.documentElement.innerHTML = content;
      processedContent = document.documentElement.outerHTML;
    } catch (domError) {
      // If happy-dom fails (e.g., with event attribute parsing), use raw HTML
      getLogger().warn('happy-dom failed to parse HTML, using raw content', {
        url,
        error: domError instanceof Error ? domError.message : String(domError),
      });
    }

    if (cache) {
      await setCached(cachedFile, processedContent);
    }

    return processedContent;
  } catch (error) {
    if (error instanceof Error) {
      throw new NetworkError(`Failed to fetch page source: ${error.message}`, {
        url,
        error: error.message,
        stack: error.stack,
      });
    }
    throw error;
  }
}

/**
 * Parses an HTML page to extract links from anchor tags using cheerio.
 *
 * This function analyzes the HTML structure and extracts href attributes from all
 * anchor (`<a>`) elements. It's particularly useful for crawling index pages or
 * discovering related content.
 *
 * @param indexSource - The HTML source code to parse. Must be a valid string containing HTML.
 * @returns Promise resolving to an array of URLs (href values) extracted from anchor tags
 *
 * @throws {ValidationError} When the HTML source is null, undefined, or not a string
 * @throws {ParsingError} When cheerio fails to parse the HTML content
 *
 * @example
 * ```typescript
 * // Extract links from a fetched page
 * const html = await fetchPageSource({ url: 'https://example.com', cheap: true });
 * const links = await parseIndexSource(html);
 * console.log(links); // ['/page1.html', '/page2.html', 'https://external.com']
 *
 * // Parse HTML string directly
 * const htmlContent = `
 *   <html>
 *     <body>
 *       <a href="/home">Home</a>
 *       <a href="/about">About</a>
 *       <a href="https://external.com">External</a>
 *     </body>
 *   </html>
 * `;
 * const extractedLinks = await parseIndexSource(htmlContent);
 * // Result: ['/home', '/about', 'https://external.com']
 *
 * // Process links for further crawling
 * const baseUrl = 'https://example.com';
 * const absoluteLinks = extractedLinks.map(link =>
 *   link.startsWith('http') ? link : new URL(link, baseUrl).href
 * );
 * ```
 *
 * @see {@link fetchPageSource} for fetching HTML content to parse
 */
export async function parseIndexSource(indexSource: string): Promise<string[]> {
  if (!indexSource || typeof indexSource !== 'string') {
    throw new ValidationError('HTML source is required and must be a string', {
      indexSource,
    });
  }

  try {
    const $ = cheerio.load(indexSource);

    const items: string[] = [];

    // Extract all href attributes from anchor tags
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        items.push(href);
      }
    });

    return items;
  } catch (error) {
    if (error instanceof Error) {
      throw new ParsingError(`Failed to parse HTML source: ${error.message}`, {
        error: error.message,
        stack: error.stack,
      });
    }
    throw error;
  }
}

/**
 * Creates a new happy-dom Window instance for server-side DOM manipulation.
 *
 * This function provides a lightweight DOM environment that can be used for HTML
 * processing, document manipulation, and content extraction without the overhead
 * of a full browser. Perfect for server-side rendering and content processing.
 *
 * @returns A new Window instance with document, DOM APIs, and HTML parsing capabilities
 *
 * @example
 * ```typescript
 * // Create a window and manipulate DOM
 * const window = createWindow();
 * const document = window.document;
 *
 * // Set HTML content
 * document.body.innerHTML = '<div id="content">Hello World</div>';
 *
 * // Query and manipulate elements
 * const contentDiv = document.getElementById('content');
 * console.log(contentDiv?.textContent); // "Hello World"
 *
 * // Create new elements
 * const newParagraph = document.createElement('p');
 * newParagraph.textContent = 'Added via DOM';
 * document.body.appendChild(newParagraph);
 *
 * // Extract final HTML
 * const finalHtml = document.documentElement.outerHTML;
 * ```
 *
 * @example
 * ```typescript
 * // Process fetched HTML with DOM manipulation
 * const html = await fetchPageSource({ url: 'https://example.com', cheap: true });
 * const window = createWindow();
 * window.document.documentElement.innerHTML = html;
 *
 * // Remove unwanted elements
 * const scripts = window.document.querySelectorAll('script');
 * scripts.forEach(script => script.remove());
 *
 * // Extract clean content
 * const cleanHtml = window.document.documentElement.outerHTML;
 * ```
 *
 * @see {@link processHtml} for a convenience function that processes HTML with happy-dom
 */
export function createWindow(): Window {
  return new Window();
}

/**
 * Processes HTML content using happy-dom to ensure proper DOM structure and formatting.
 *
 * This function takes raw HTML content and processes it through happy-dom's parser
 * to normalize the structure, fix malformed HTML, and ensure proper nesting. It's
 * particularly useful for cleaning up HTML from various sources before further processing.
 *
 * @param html - The HTML content to process. Can be partial or complete HTML.
 * @returns Promise resolving to the processed and normalized HTML string
 *
 * @throws {ParsingError} When happy-dom fails to parse the HTML content due to severe malformation
 *
 * @example
 * ```typescript
 * // Fix malformed HTML
 * const malformedHtml = '<div><p>Unclosed paragraph<div>Nested incorrectly</div>';
 * const cleanHtml = await processHtml(malformedHtml);
 * console.log(cleanHtml); // Properly nested and closed HTML
 *
 * // Normalize HTML structure
 * const partialHtml = '<h1>Title</h1><p>Content</p>';
 * const fullHtml = await processHtml(partialHtml);
 * // Result includes proper html, head, body structure
 *
 * // Process fetched content
 * const fetchedHtml = await fetchPageSource({
 *   url: 'https://example.com',
 *   cheap: true
 * });
 * const normalizedHtml = await processHtml(fetchedHtml);
 * ```
 *
 * @example
 * ```typescript
 * // Error handling for severely malformed HTML
 * try {
 *   const result = await processHtml('<div><span><p></div>');
 *   console.log('Processed successfully:', result);
 * } catch (error) {
 *   if (error instanceof ParsingError) {
 *     console.error('HTML too malformed to process:', error.message);
 *     // Fall back to using raw HTML or alternative processing
 *   }
 * }
 * ```
 *
 * @see {@link createWindow} for direct access to the happy-dom Window instance
 * @see {@link fetchPageSource} for fetching HTML content with optional DOM processing
 */
export async function processHtml(html: string): Promise<string> {
  try {
    const window = new Window();
    const document = window.document;
    document.documentElement.innerHTML = html;

    return document.documentElement.outerHTML;
  } catch (error) {
    if (error instanceof Error) {
      throw new ParsingError(`Failed to process HTML: ${error.message}`, {
        error: error.message,
        stack: error.stack,
      });
    }
    throw error;
  }
}

export default {
  fetchPageSource,
  parseIndexSource,
  createWindow,
  processHtml,
};
