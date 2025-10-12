import { getCache } from '@have/cache';
import type { ICacheAdapter } from '@have/cache';
import { Configuration, PlaywrightCrawler } from 'crawlee';
import type {
  TreeScraperOptions,
  ScrapeMetrics,
  ScrapeOptions,
  ScrapeResult,
  ScraperStrategy,
  ScraperType,
  IScraper,
  Link,
} from '../shared/types';

/**
 * Tree scraper - expand hierarchical tree structures to reveal hidden content
 *
 * This scraper handles pages with nested, hierarchical content structures
 * like directory browsers, file trees, or multi-level accordions. It
 * systematically expands tree nodes to reveal all nested content.
 *
 * Optimized for deep hierarchical structures like jQuery File Tree where
 * clicking one element reveals new expandable elements (years → months → files).
 *
 * @example
 * ```typescript
 * const scraper = new TreeScraper({
 *   scraper: 'tree',
 *   maxIterations: 20,
 *   clickDelay: 500,
 *   customSelectors: ['.my-tree-node'],
 *   handleExclusive: true
 * });
 *
 * const result = await scraper.scrape('https://example.com/meetings');
 * console.log(`Found ${result.links.length} links after ${result.metrics.interactionCount} clicks`);
 * console.log(`Confidence: ${result.strategy.confidence}`);
 * ```
 */
export class TreeScraper implements IScraper {
  private options: TreeScraperOptions;
  private cacheDir: string;
  private cache?: ICacheAdapter;

  // Default tree/expandable element selectors
  private readonly DEFAULT_SELECTORS = [
    '[role="button"][aria-expanded]',
    'button[aria-expanded]',
    '[data-accordion-trigger]',
    '[data-toggle="collapse"]',
    '.accordion-button',
    '.expand-button',
    'details summary',
    'li.directory.collapsed > a', // Directory/file browser trees
    'li.collapsed > a', // Generic collapsed list items
  ];

  constructor(options: TreeScraperOptions) {
    this.options = {
      maxIterations: 10,
      clickDelay: 100,
      handleExclusive: true,
      headless: true,
      ...options,
    };
    this.cacheDir = options.cacheDir || '.cache/spider';
  }

  /**
   * Get the scraper type
   */
  getType(): ScraperType {
    return 'tree';
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
   * Generate a cache key from a URL and scrape options
   *
   * Cache key includes URL, maxIterations, and clickDelay to differentiate
   * results with different expansion parameters.
   */
  private getCacheKey(url: string, options?: ScrapeOptions): string {
    const maxIterations = this.options.maxIterations || 10;
    const clickDelay = this.options.clickDelay || 100;
    return `tree:${encodeURIComponent(url)}:${maxIterations}:${clickDelay}`;
  }

  /**
   * Extract all links from the current page state
   */
  private async extractCurrentLinks(page: any): Promise<Link[]> {
    return page.evaluate(() => {
      const linkMap = new Map<string, any>();
      document.querySelectorAll('a[href]').forEach((a) => {
        const link = a as HTMLAnchorElement;
        const href = link.href;
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
      return Array.from(linkMap.values());
    });
  }

  /**
   * Extract links from a page by expanding hierarchical tree structures
   *
   * This method uses Playwright's native click() to properly trigger events.
   * It systematically clicks expandable tree nodes and extracts links after each click.
   * Optimized for deep hierarchical trees (e.g., years → months → files).
   *
   * @param page - Playwright page instance
   * @returns Promise resolving to array of links and interaction count
   */
  private async extractLinksWithTreeExpansion(
    page: any,
  ): Promise<{ links: Link[]; interactionCount: number }> {
    const selectors = [
      ...this.DEFAULT_SELECTORS,
      ...(this.options.customSelectors || []),
    ];

    const linkMap = new Map<string, Link>();
    let interactionCount = 0;
    const clickedSelectors = new Set<string>();

    // Extract initial links
    const initialLinks = await this.extractCurrentLinks(page);
    initialLinks.forEach((link) => linkMap.set(link.href, link));

    // Keep expanding until no more expandable elements are found
    // This handles deep hierarchical structures (trees) by continuously
    // re-querying for newly revealed expandable elements
    let consecutiveEmptyIterations = 0;
    const maxConsecutiveEmpty = 2; // Stop after 2 iterations with no clicks

    for (let iteration = 0; iteration < (this.options.maxIterations || 10); iteration++) {
      let clickedInIteration = 0;

      // Try each selector, clicking ALL matching elements we find
      for (const selector of selectors) {
        // Re-query DOM to find newly revealed elements
        const elements = await page.$$(selector);

        for (const element of elements) {
          // Generate a unique identifier for this element
          const elementId = await element.evaluate((el: Element, sel: string) => {
            // Create a unique path for this element
            const getPath = (el: Element): string => {
              if (el.id) return `#${el.id}`;
              const parent = el.parentElement;
              if (!parent) return el.tagName;
              const index = Array.from(parent.children).indexOf(el);
              return `${getPath(parent)} > ${el.tagName}:nth-child(${index + 1})`;
            };
            return `${sel}::${getPath(el)}`;
          }, selector);

          // Skip if already clicked
          if (clickedSelectors.has(elementId)) {
            continue;
          }

          // Check if element is visible
          const isVisible = await element.isVisible();
          if (!isVisible) {
            continue;
          }

          // Click the element using Playwright's native click (properly triggers JS events)
          try {
            await element.click();
            clickedSelectors.add(elementId);
            interactionCount++;
            clickedInIteration++;

            // Wait for any AJAX content to load
            try {
              await page.waitForLoadState('networkidle', {
                timeout: 3000,
              });
            } catch {
              // If network doesn't go idle, just wait a bit
              await page.waitForTimeout(this.options.clickDelay || 500);
            }

            // Extract links after each click (not just at the end)
            const newLinks = await this.extractCurrentLinks(page);
            newLinks.forEach((link) => linkMap.set(link.href, link));

            // After clicking, immediately re-query this selector to find
            // any newly revealed elements at the same level or deeper
            // This enables proper hierarchical expansion
            break; // Break to re-query and find newly revealed elements
          } catch (err) {
            // Element not clickable, skip
            continue;
          }
        }

        // If we clicked something with this selector, restart selector loop
        // to check for newly revealed elements
        if (clickedInIteration > 0) {
          break;
        }
      }

      // Track consecutive iterations with no clicks
      if (clickedInIteration === 0) {
        consecutiveEmptyIterations++;
        if (consecutiveEmptyIterations >= maxConsecutiveEmpty) {
          // No elements found for multiple iterations, we're done
          break;
        }
      } else {
        // Reset counter when we click something
        consecutiveEmptyIterations = 0;
      }
    }

    return {
      links: Array.from(linkMap.values()),
      interactionCount,
    };
  }

  /**
   * Old page.evaluate()-based implementation (keeping for reference)
   * This version didn't properly trigger JavaScript event handlers
   */
  private async extractLinksWithTreeExpansionOld(
    page: any,
  ): Promise<{ links: Link[]; interactionCount: number }> {
    const selectors = [
      ...this.DEFAULT_SELECTORS,
      ...(this.options.customSelectors || []),
    ];

    const result = await page.evaluate(
      ({
        selectors,
        maxIterations,
        clickDelay,
      }: {
        selectors: string[];
        maxIterations: number;
        clickDelay: number;
      }) => {
        const linkMap = new Map<string, any>();
        const clickedElements = new Set<Element>();
        let interactionCount = 0;
        let previousLinkCount = 0;

        // Extract all current links and store in map
        const extractLinks = () => {
          document.querySelectorAll('a[href]').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const href = link.href;
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

        // Initial extraction
        extractLinks();
        previousLinkCount = linkMap.size;

        // Iterate through expandable elements
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          let foundNewElement = false;

          // Try each selector
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);

            for (const element of elements) {
              // Skip if already clicked
              if (clickedElements.has(element)) {
                continue;
              }

              // Check if element is visible and clickable
              const rect = element.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) {
                continue;
              }

              // Check if element is actually an accordion trigger
              const ariaExpanded = element.getAttribute('aria-expanded');
              const ariaControls = element.getAttribute('aria-controls');
              const isDirectory = element.parentElement?.classList.contains('directory') ||
                                  element.parentElement?.classList.contains('collapsed');

              // Skip elements that don't look like accordion triggers
              // Allow if: has aria-expanded, has aria-controls, is details summary, or is directory-style
              if (!ariaExpanded && !ariaControls && !selector.includes('details') && !isDirectory) {
                continue;
              }

              // Click the element
              try {
                (element as HTMLElement).click();
                clickedElements.add(element);
                interactionCount++;
                foundNewElement = true;

                // Wait for potential animations/transitions and content loading
                // Use a longer delay for directory-style accordions as they may load content async
                const waitTime = isDirectory ? Math.max(clickDelay, 500) : clickDelay;
                const start = Date.now();
                while (Date.now() - start < waitTime) {
                  // Busy wait (synchronous delay in browser context)
                }

                // Extract links after click
                extractLinks();
              } catch (err) {
                // Element not clickable or hidden, skip
                continue;
              }

              // Only click one element per iteration if handling exclusive accordions
              break;
            }

            if (foundNewElement) {
              break;
            }
          }

          // Check if we found new links
          const currentLinkCount = linkMap.size;
          if (currentLinkCount === previousLinkCount) {
            // No new links found, we're done
            break;
          }

          previousLinkCount = currentLinkCount;

          // If no new elements found to click, we're done
          if (!foundNewElement) {
            break;
          }
        }

        return {
          links: Array.from(linkMap.values()),
          interactionCount,
        };
      },
      {
        selectors,
        maxIterations: this.options.maxIterations || 10,
        clickDelay: this.options.clickDelay || 100,
      },
    );

    return result;
  }

  /**
   * Scrape content from a URL by expanding hierarchical tree structures
   *
   * This method launches a headless browser, navigates to the URL,
   * and systematically expands all tree nodes to extract all hidden links.
   * Optimized for deep hierarchical structures like directory browsers.
   *
   * @param url - The URL to scrape
   * @param options - Optional scrape configuration
   * @returns Promise resolving to scrape results with metrics
   */
  async scrape(
    url: string,
    options?: ScrapeOptions,
  ): Promise<ScrapeResult> {
    const startTime = Date.now();
    const timeout = options?.timeout || 30000;
    const cache = options?.cache !== false; // Default to true
    const cacheExpiry = options?.cacheExpiry || 300000; // 5 minutes default

    // Check cache if enabled
    if (cache) {
      const cacheAdapter = await this.initCache();
      const cacheKey = this.getCacheKey(url, options);
      const cached = await cacheAdapter.get<ScrapeResult>(cacheKey);

      if (cached) {
        return cached;
      }
    }

    // Rate limiting: delay before page load to be respectful to servers
    const rateLimit = this.options.rateLimit !== undefined
      ? this.options.rateLimit
      : 1000; // Default 1000ms
    if (rateLimit > 0) {
      await new Promise(resolve => setTimeout(resolve, rateLimit));
    }

    let scrapeResult: ScrapeResult | null = null;
    let scrapeError: Error | null = null;

    try {
      // Create a unique configuration for this crawler instance
      const crawlerConfig = new Configuration({
        storageClientOptions: {
          localDataDirectory: `${this.cacheDir}/crawlee-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        },
        persistStorage: false, // Don't persist storage between runs
      });

      const crawler = new PlaywrightCrawler(
        {
          headless: this.options.headless,
          launchContext: {
            launchOptions: {
              headless: this.options.headless,
            },
          },
          requestHandlerTimeoutSecs: Math.floor(timeout / 1000),
          preNavigationHooks: [
            async ({ page }) => {
              // Set custom user agent if provided
              if (this.options.userAgent) {
                await page.setExtraHTTPHeaders({
                  'User-Agent': this.options.userAgent,
                });
              } else {
                await page.setExtraHTTPHeaders({
                  'User-Agent':
                    'Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)',
                });
              }

              // Set custom headers
              if (options?.headers && Object.keys(options.headers).length > 0) {
                await page.setExtraHTTPHeaders(options.headers);
              }

              // Set timeout
              page.setDefaultNavigationTimeout(timeout);
              page.setDefaultTimeout(timeout);
            },
          ],
          requestHandler: async ({ page, request }) => {
            try {
              // Wait for page to load
              await page.waitForLoadState('networkidle', { timeout });

              // Wait for any initial animations and lazy-loaded content
              await page.waitForTimeout(1000);

              // Extract links with tree expansion
              const { links, interactionCount } =
                await this.extractLinksWithTreeExpansion(page);

              // Get page content
              const content = await page.content();

              const duration = Date.now() - startTime;

              // Build strategy information
              const strategy: ScraperStrategy = {
                type: this.getType(),
                spider: 'crawlee',
                config: {
                  maxIterations: this.options.maxIterations,
                  clickDelay: this.options.clickDelay,
                  customSelectors: this.options.customSelectors,
                  handleExclusive: this.options.handleExclusive,
                  headless: this.options.headless,
                },
                confidence:
                  interactionCount > 0
                    ? 0.9 // High confidence if we found expandable tree nodes
                    : 0.5, // Lower confidence if no tree structure found (might be wrong strategy)
              };

              // Build metrics
              const metrics: ScrapeMetrics = {
                duration,
                linkCount: links.length,
                interactionCount,
                complete: true, // Tree scraper always completes
              };

              scrapeResult = {
                url: page.url(),
                content,
                links,
                strategy,
                metrics,
                raw: {
                  requestUrl: request.url,
                  loadedUrl: page.url(),
                  interactionCount,
                },
              };
            } catch (error) {
              scrapeError =
                error instanceof Error ? error : new Error(String(error));
            }
          },
          failedRequestHandler: async ({ request }, error) => {
            scrapeError = new Error(
              `Failed to scrape ${request.url}: ${error.message}`,
            );
          },
        },
        crawlerConfig,
      );

      // Run the crawler for this single URL
      await crawler.run([url]);

      // Always tear down the crawler to clean up resources
      await crawler.teardown();

      // Check if we got the result
      if (scrapeError) {
        throw scrapeError;
      }

      if (!scrapeResult) {
        throw new Error('Tree scrape failed - no result captured');
      }

      // Cache the result if caching is enabled
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url, options);
        const ttl = Math.floor(cacheExpiry / 1000); // Convert to seconds
        await cacheAdapter.set(cacheKey, scrapeResult, ttl);
      }

      return scrapeResult;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to scrape page with TreeScraper: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
