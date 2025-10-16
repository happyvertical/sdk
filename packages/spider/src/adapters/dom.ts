import { getCache } from '@have/cache';
import type { ICacheAdapter } from '@have/cache';
import { getLogger, isUrl, NetworkError, ValidationError } from '@have/utils';
import * as cheerio from 'cheerio';
import { Window } from 'happy-dom';
import { request } from 'undici';
import type {
  DomAdapterOptions,
  FetchOptions,
  ISpiderAdapter,
  Link,
  Page,
} from '../shared/types';

/**
 * DOM processing adapter for fetching and normalizing web pages
 * Uses happy-dom to process HTML and cheerio for parsing
 */
export class DomAdapter implements ISpiderAdapter {
  private cache?: ICacheAdapter;
  private cacheDir: string;

  constructor(options: DomAdapterOptions) {
    this.cacheDir = options.cacheDir || '.cache/spider';
  }

  /**
   * Initialize the cache adapter if needed
   */
  private async initCache(): Promise<ICacheAdapter> {
    if (!this.cache) {
      this.cache = await getCache({
        provider: 'file',
        cacheDir: this.cacheDir,
      });
    }
    return this.cache;
  }

  /**
   * Generate a cache key from a URL
   */
  private getCacheKey(url: string): string {
    return `dom:${encodeURIComponent(url)}`;
  }

  /**
   * Process HTML with happy-dom to normalize structure
   */
  private processHtml(html: string): string {
    try {
      const window = new Window();
      const document = window.document;
      document.documentElement.innerHTML = html;
      return document.documentElement.outerHTML;
    } catch (error) {
      // If happy-dom fails, log warning and return original HTML
      getLogger().warn('happy-dom failed to parse HTML, using raw content', {
        error: error instanceof Error ? error.message : String(error),
      });
      return html;
    }
  }

  /**
   * Extract links from HTML using cheerio with metadata
   */
  private extractLinks(html: string): Link[] {
    const $ = cheerio.load(html);
    const links: Link[] = [];

    $('a').each((_, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      if (href) {
        const classes = $link.attr('class');
        links.push({
          href,
          text: $link.text().trim() || '',
          title: $link.attr('title'),
          ariaLabel: $link.attr('aria-label'),
          rel: $link.attr('rel'),
          target: $link.attr('target'),
          classes: classes
            ? classes.split(' ').filter((c) => c.trim())
            : undefined,
        });
      }
    });

    return links;
  }

  /**
   * Fetches a web page and returns a standardized Page object
   */
  async fetch(url: string, options?: FetchOptions): Promise<Page> {
    const {
      headers = {},
      timeout = 30000,
      cache = true,
      cacheExpiry = 300000, // 5 minutes default
    } = options || {};

    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new ValidationError('URL is required and must be a string', {
        url,
      });
    }

    if (!isUrl(url)) {
      throw new ValidationError('Invalid URL format', { url });
    }

    // Check cache if enabled
    if (cache) {
      const cacheAdapter = await this.initCache();
      const cacheKey = this.getCacheKey(url);
      const cached = await cacheAdapter.get<Page>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    // Fetch the page
    try {
      const defaultHeaders = {
        'User-Agent':
          'Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        // Note: undici automatically handles gzip/deflate/br decompression
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
          `HTTP ${response.statusCode}: ${response.headers.status || 'Request failed'}`,
          { url, statusCode: response.statusCode, headers: response.headers },
        );
      }

      const rawContent = await response.body.text();

      // Process HTML with happy-dom
      const processedContent = this.processHtml(rawContent);

      // Extract links from processed content
      const links = this.extractLinks(processedContent);

      const page: Page = {
        url,
        content: processedContent,
        links,
        raw: {
          statusCode: response.statusCode,
          headers: response.headers,
          rawContent, // Include original content before processing
        },
      };

      // Cache the result if caching is enabled
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url);
        const ttl = Math.floor(cacheExpiry / 1000); // Convert to seconds
        await cacheAdapter.set(cacheKey, page, ttl);
      }

      return page;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new NetworkError(`Failed to fetch page: ${error.message}`, {
          url,
          error: error.message,
          stack: error.stack,
        });
      }

      throw error;
    }
  }
}
