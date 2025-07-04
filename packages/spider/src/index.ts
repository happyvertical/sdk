import path from 'path';
import { Window } from 'happy-dom';
import { request } from 'undici';
import { urlFilename, urlPath, getLogger, ValidationError, NetworkError, ParsingError, isUrl } from '@have/utils';
import * as cheerio from 'cheerio';

import { fetchText, getCached, setCached } from '@have/files';

/**
 * Options for fetching a web page's source
 */
interface FetchPageSourceOptions {
  /**
   * URL to fetch
   */
  url: string;
  
  /**
   * Whether to use a simple HTTP fetch instead of DOM processing
   */
  cheap: boolean;
  
  /**
   * Whether to use cached content if available
   */
  cache?: boolean;
  
  /**
   * Cache expiry time in milliseconds
   */
  cacheExpiry?: number;
  
  /**
   * Custom headers to include with the request
   */
  headers?: Record<string, string>;
  
  /**
   * Timeout for the request in milliseconds
   */
  timeout?: number;
}

/**
 * Fetches the HTML source of a web page using either a simple HTTP request or DOM processing
 * 
 * @param options - Configuration options for the fetch operation
 * @returns Promise resolving to the HTML content of the page
 * @throws {ValidationError} if the URL is invalid
 * @throws {NetworkError} if there are network-related failures
 */
export async function fetchPageSource(
  options: FetchPageSourceOptions,
): Promise<string> {
  const { 
    url, 
    cheap = true, 
    cacheExpiry = 300000, 
    headers = {}, 
    timeout = 30000 
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
    const cached = await getCached(cachedFile, cacheExpiry);
    if (cached) {
      getLogger().info('Using cached page source', { url, cacheFile: cachedFile });
      return cached;
    }

    const content = await fetchText(url);
    await setCached(cachedFile, content);
    return content;
  }

  const cachedFile = path.join(urlPath(url), urlFilename(url));
  const cached = await getCached(cachedFile, cacheExpiry);
  if (cached) {
    return cached;
  }

  try {
    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (compatible; HAppyVertical Spider/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...headers
    };

    const response = await request(url, {
      method: 'GET',
      headers: defaultHeaders,
      headersTimeout: timeout,
      bodyTimeout: timeout
    });

    if (response.statusCode >= 400) {
      throw new NetworkError(
        `HTTP ${response.statusCode}: ${response.headers['status'] || 'Request failed'}`,
        { url, statusCode: response.statusCode, headers: response.headers }
      );
    }

    const content = await response.body.text();
    
    // Process the HTML with happy-dom to ensure it's well-formed
    const window = new Window();
    const document = window.document;
    document.documentElement.innerHTML = content;
    
    const processedContent = document.documentElement.outerHTML;
    
    await setCached(cachedFile, processedContent);
    return processedContent;
  } catch (error) {
    if (error instanceof Error) {
      throw new NetworkError(
        `Failed to fetch page source: ${error.message}`,
        { url, error: error.message, stack: error.stack }
      );
    }
    throw error;
  }
}

/**
 * Parses an HTML page to extract links or content
 * 
 * @param indexSource - HTML source to parse
 * @returns Promise resolving to an array of URLs extracted from the page
 * @throws {ValidationError} if the HTML source is invalid
 * @throws {ParsingError} if HTML parsing fails
 */
export async function parseIndexSource(indexSource: string): Promise<string[]> {
  if (!indexSource || typeof indexSource !== 'string') {
    throw new ValidationError('HTML source is required and must be a string', { indexSource });
  }

  try {
    const $ = cheerio.load(indexSource);

    const items: string[] = [];
    let content: string = '';

    // Check if it's an index page by looking for multiple items
    if ($('a').length > 1) {
      $('a').each((_, element) => {
        const item = $(element).attr('href');
        // console.log({ item });
        if (item) items.push(item);
      });
    } else {
      // Assume it's a content page if not an index
      content = $('body').text().trim();
    }
    return items;
  } catch (error) {
    if (error instanceof Error) {
      throw new ParsingError(
        `Failed to parse HTML source: ${error.message}`,
        { error: error.message, stack: error.stack }
      );
    }
    throw error;
  }
}

/**
 * Creates a new happy-dom window instance for DOM manipulation
 * 
 * @returns A new Window instance
 */
export function createWindow(): Window {
  return new Window();
}

/**
 * Processes HTML content using happy-dom to ensure proper DOM structure
 * 
 * @param html - HTML content to process
 * @returns Promise resolving to the processed HTML
 * @throws {ParsingError} if HTML processing fails
 */
export async function processHtml(html: string): Promise<string> {
  try {
    const window = new Window();
    const document = window.document;
    document.documentElement.innerHTML = html;
    
    return document.documentElement.outerHTML;
  } catch (error) {
    if (error instanceof Error) {
      throw new ParsingError(
        `Failed to process HTML: ${error.message}`,
        { error: error.message, stack: error.stack }
      );
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
