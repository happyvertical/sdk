import path from 'path';
import { chromium } from 'playwright-core';
import type { Browser } from 'playwright-core';
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
   * Whether to use a simple HTTP fetch instead of a browser
   */
  cheap: boolean;
  
  /**
   * Browser instance to use for fetching (required if cheap is false)
   */
  browser?: Browser;
  
  /**
   * Whether to use cached content if available
   */
  cache?: boolean;
  
  /**
   * Cache expiry time in milliseconds
   */
  cacheExpiry?: number;
}

/**
 * Fetches the HTML source of a web page using either a simple HTTP request or a headless browser
 * 
 * @param options - Configuration options for the fetch operation
 * @returns Promise resolving to the HTML content of the page
 * @throws {ValidationError} if the URL is invalid or browser is missing when required
 * @throws {NetworkError} if there are network-related failures
 */
export async function fetchPageSource(
  options: FetchPageSourceOptions,
): Promise<string> {
  const { url, cheap = true, browser, cacheExpiry = 300000 } = options;

  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new ValidationError('URL is required and must be a string', { url });
  }

  if (!isUrl(url)) {
    throw new ValidationError('Invalid URL format', { url });
  }

  // Validate browser requirement for non-cheap mode
  if (!cheap && !browser) {
    throw new ValidationError('Browser instance is required when cheap mode is disabled', { cheap, browser });
  }

  if (cheap || !browser) {
    const cachedFile = path.join(urlPath(url), '.cheap', urlFilename(url));
    const cached = await getCached(cachedFile, cacheExpiry);
    if (cached) {
      getLogger().info('Using cached page source', { url, cacheFile: cachedFile });
      return cached;
    }

    // const response = await fetch(url);
    // const content = await response.text();

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
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const content = await page.content();
      await setCached(cachedFile, content);
      return content;
    } finally {
      await page.close();
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new NetworkError(
        `Failed to fetch page source with browser: ${error.message}`,
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
 * Creates and launches a headless Chromium browser instance
 * 
 * @returns Promise resolving to a Browser instance
 * @throws {NetworkError} if browser launch fails
 */
export async function getBrowser(): Promise<Browser> {
  try {
    const browser = await chromium.launch({
      headless: true,
    });
    return browser;
  } catch (error) {
    if (error instanceof Error) {
      throw new NetworkError(
        `Failed to launch browser: ${error.message}`,
        { error: error.message, stack: error.stack }
      );
    }
    throw error;
  }
}

export default {
  fetchPageSource,
  parseIndexSource,
  getBrowser,
};
