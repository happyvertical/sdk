import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import {
  getLogger,
  isUrl,
  loadEnvConfig,
  NetworkError,
  ValidationError,
} from '@happyvertical/utils';
import * as cheerio from 'cheerio';
import { Window } from 'happy-dom';
import { request } from 'undici';
import type {
  CacheProviderConfig,
  DomAdapterOptions,
  FetchOptions,
  Link,
  Page,
  SpiderAdapter,
} from '../shared/types';

/**
 * DOM processing adapter for fetching and normalizing web pages
 * Uses happy-dom to process HTML and cheerio for parsing
 */
export class DomAdapter implements SpiderAdapter {
  private cache?: CacheAdapter;
  private cacheDir: string;
  private cacheProviderConfig?: CacheProviderConfig;

  constructor(options: DomAdapterOptions) {
    this.cacheDir = options.cacheDir || '.cache/spider';
    this.cacheProviderConfig = options.cacheProvider;
  }

  /**
   * Initialize the cache adapter if needed
   * Uses S3 if cacheProvider is configured, otherwise falls back to file
   */
  private async initCache(): Promise<CacheAdapter> {
    if (!this.cache) {
      if (this.cacheProviderConfig?.provider === 's3') {
        this.cache = await getCache({
          provider: 's3',
          bucket: this.cacheProviderConfig.bucket!,
          prefix: this.cacheProviderConfig.prefix || 'cache/',
          region: this.cacheProviderConfig.region,
        });
      } else {
        this.cache = await getCache({
          provider: 'file',
          cacheDir: this.cacheDir,
        });
      }
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
    // Load configuration from environment variables and merge with user options
    const config = loadEnvConfig<FetchOptions>(options || {}, {
      packageName: 'spider',
      schema: {
        timeout: 'number',
        maxRequests: 'number',
        userAgent: 'string',
      },
    });

    const {
      headers = {},
      timeout = 30000,
      cache = true,
      cacheExpiry = 300000, // 5 minutes default
      userAgent,
    } = config;

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
          userAgent ||
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
