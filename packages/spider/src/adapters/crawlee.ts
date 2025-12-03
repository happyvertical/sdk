import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import {
  isUrl,
  loadEnvConfig,
  NetworkError,
  ValidationError,
} from '@happyvertical/utils';
import { Configuration, PlaywrightCrawler } from 'crawlee';
import type {
  CacheProviderConfig,
  CrawleeAdapterOptions,
  FetchOptions,
  Link,
  Page,
  SpiderAdapter,
} from '../shared/types';

/**
 * Crawlee headless browser adapter for fetching web pages
 * Uses Playwright through Crawlee for full browser automation
 */
export class CrawleeAdapter implements SpiderAdapter {
  private cache?: CacheAdapter;
  private cacheDir: string;
  private cacheProviderConfig?: CacheProviderConfig;
  private headless: boolean;
  private userAgent?: string;

  constructor(options: CrawleeAdapterOptions) {
    this.cacheDir = options.cacheDir || '.cache/spider';
    this.cacheProviderConfig = options.cacheProvider;
    this.headless = options.headless !== false; // Default to true
    this.userAgent = options.userAgent;
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
    return `crawlee:${encodeURIComponent(url)}`;
  }

  /**
   * Expand all navigation/accordion elements and extract all links from a page
   *
   * This method is useful for pages with hidden content behind expandable elements.
   * It will click through accordion buttons, expand menus, and collect all links with metadata.
   *
   * @param page - Playwright page instance
   * @returns Array of extracted links with metadata
   *
   * @example
   * ```typescript
   * const spider = await getSpider({ adapter: 'crawlee' });
   * const page = await browser.newPage();
   * await page.goto('https://example.com');
   * const links = await spider.extractLinks(page);
   * ```
   */
  async extractLinks(page: any): Promise<Link[]> {
    // This logic runs in the browser context to expand navigation and collect links with metadata
    const allLinks = await page.evaluate(() => {
      // Use Map to avoid duplicate hrefs while preserving link metadata
      const linkMap = new Map<string, any>();
      const clickedElements = new Set<Element>();

      // Extract all current links with metadata
      const extractLinks = () => {
        document.querySelectorAll('a[href]').forEach((a) => {
          const link = a as HTMLAnchorElement;
          const href = link.href;

          // Only add if not already present (first occurrence wins)
          if (!linkMap.has(href)) {
            linkMap.set(href, {
              href,
              text: link.textContent?.trim() || '',
              title: link.title || undefined,
              ariaLabel: link.getAttribute('aria-label') || undefined,
              rel: link.rel || undefined,
              target: link.target || undefined,
              classes: link.className
                ? link.className.split(' ').filter((c) => c.trim())
                : undefined,
            });
          }
        });
      };

      // Click an element and wait for changes
      const clickAndWait = (element: Element) => {
        if (clickedElements.has(element)) return false;
        try {
          (element as HTMLElement).click();
          clickedElements.add(element);
          return true;
        } catch {
          return false;
        }
      };

      // Extract initial links
      extractLinks();

      // Click expandable elements iteratively
      for (let iteration = 0; iteration < 3; iteration++) {
        let clickedCount = 0;

        // Click semantic accordion elements
        const semanticSelectors = [
          'button[aria-expanded="false"]',
          '[role="button"][aria-expanded="false"]',
          '.accordion-header',
          '.accordion-button',
          'summary',
          '[data-toggle]',
        ];

        for (const selector of semanticSelectors) {
          document.querySelectorAll(selector).forEach((el) => {
            if (clickAndWait(el)) clickedCount++;
          });
        }

        // For hash links, only click if they're likely accordion triggers
        // (short text, no external URL patterns)
        document.querySelectorAll('a[href="#"]').forEach((link) => {
          const text = link.textContent?.trim() || '';
          // Skip if it looks like a skip link or has common nav patterns
          if (text.toLowerCase().includes('skip')) return;
          if (text.toLowerCase().includes('menu')) return;
          if (text.length > 100) return; // Likely not an accordion trigger

          if (clickAndWait(link)) clickedCount++;
        });

        // Extract links after this round of clicks
        extractLinks();

        // Stop if nothing was clicked
        if (clickedCount === 0) break;
      }

      return Array.from(linkMap.values());
    });

    return allLinks;
  }

  /**
   * Fetches a web page using headless browser and returns a standardized Page object
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
      userAgent: envUserAgent,
    } = config;

    // Prefer user-provided userAgent from constructor, fallback to env var
    const effectiveUserAgent = this.userAgent || envUserAgent;

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

    // Fetch the page with Crawlee
    let pageData: Page | null = null;
    let fetchError: Error | null = null;

    try {
      // Create a unique configuration for this crawler instance
      // This prevents storage conflicts when multiple crawlers run concurrently
      const crawlerConfig = new Configuration({
        storageClientOptions: {
          localDataDirectory: `${this.cacheDir}/crawlee-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        },
        persistStorage: false, // Don't persist storage between runs
      });

      const crawler = new PlaywrightCrawler(
        {
          headless: this.headless,
          launchContext: {
            launchOptions: {
              headless: this.headless,
              // Prevent macOS keychain password prompts
              args: ['--use-mock-keychain'],
            },
          },
          requestHandlerTimeoutSecs: Math.floor(timeout / 1000),
          preNavigationHooks: [
            async ({ page }) => {
              // Set custom user agent if provided
              if (effectiveUserAgent) {
                await page.setExtraHTTPHeaders({
                  'User-Agent': effectiveUserAgent,
                });
              }

              // Set custom headers
              if (Object.keys(headers).length > 0) {
                await page.setExtraHTTPHeaders(headers);
              }

              // Set timeout
              page.setDefaultNavigationTimeout(timeout);
              page.setDefaultTimeout(timeout);
            },
          ],
          requestHandler: async ({ page, request }) => {
            try {
              // Wait for page to be fully loaded including network requests
              await page.waitForLoadState('networkidle', { timeout });

              // Wait a bit for any initial animations
              await page.waitForTimeout(500);

              // Extract all links by expanding navigation elements
              const links = await this.extractLinks(page);

              // Get the final HTML content
              const content = await page.content();

              // Get the final URL after any redirects
              const finalUrl = page.url();

              pageData = {
                url: finalUrl,
                content,
                links,
                raw: {
                  requestUrl: request.url,
                  loadedUrl: finalUrl,
                },
              };
            } catch (error) {
              fetchError =
                error instanceof Error ? error : new Error(String(error));
            }
          },
          failedRequestHandler: async ({ request }, error) => {
            fetchError = new NetworkError(
              `Failed to crawl ${request.url}: ${error.message}`,
              {
                url: request.url,
                error: error.message,
              },
            );
          },
        },
        crawlerConfig,
      );

      // Run the crawler for this single URL
      await crawler.run([url]);

      // Always tear down the crawler to clean up resources
      await crawler.teardown();

      // Check if we got the page data
      if (fetchError) {
        throw fetchError;
      }

      if (!pageData) {
        throw new NetworkError(`Failed to fetch page: No data returned`, {
          url,
        });
      }

      // Cache the result if caching is enabled
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url);
        const ttl = Math.floor(cacheExpiry / 1000); // Convert to seconds
        await cacheAdapter.set(cacheKey, pageData, ttl);
      }

      return pageData;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new NetworkError(
          `Failed to fetch page with Crawlee: ${error.message}`,
          {
            url,
            error: error.message,
            stack: error.stack,
          },
        );
      }

      throw error;
    }
  }
}
