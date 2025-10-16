import { getCache } from "@have/cache";
import { Configuration, PlaywrightCrawler } from "crawlee";
class TreeScraper {
  options;
  cacheDir;
  cache;
  // Default tree/expandable element selectors
  DEFAULT_SELECTORS = [
    '[role="button"][aria-expanded]',
    "button[aria-expanded]",
    "[data-accordion-trigger]",
    '[data-toggle="collapse"]',
    ".accordion-button",
    ".expand-button",
    "details summary",
    "li.directory.collapsed > a",
    // Directory/file browser trees
    "li.collapsed > a"
    // Generic collapsed list items
  ];
  constructor(options) {
    this.options = {
      maxIterations: 10,
      clickDelay: 100,
      handleExclusive: true,
      headless: true,
      ...options
    };
    this.cacheDir = options.cacheDir || ".cache/spider";
  }
  /**
   * Get the scraper type
   */
  getType() {
    return "tree";
  }
  /**
   * Initialize the cache adapter if needed
   */
  async initCache() {
    if (!this.cache) {
      this.cache = await getCache({
        provider: "file",
        cacheDir: this.cacheDir
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
  getCacheKey(url, _options) {
    const maxIterations = this.options.maxIterations || 10;
    const clickDelay = this.options.clickDelay || 100;
    return `tree:${encodeURIComponent(url)}:${maxIterations}:${clickDelay}`;
  }
  /**
   * Extract all links from the current page state
   */
  async extractCurrentLinks(page) {
    return page.evaluate(() => {
      const linkMap = /* @__PURE__ */ new Map();
      document.querySelectorAll("a[href]").forEach((a) => {
        const link = a;
        const href = link.href;
        if (!linkMap.has(href)) {
          linkMap.set(href, {
            href,
            text: link.textContent?.trim() || "",
            title: link.title || void 0,
            ariaLabel: link.getAttribute("aria-label") || void 0,
            rel: link.rel || void 0,
            target: link.target || void 0,
            classes: link.className ? link.className.split(" ").filter((c) => c.trim()) : void 0
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
  async extractLinksWithTreeExpansion(page) {
    const selectors = [
      ...this.DEFAULT_SELECTORS,
      ...this.options.customSelectors || []
    ];
    const linkMap = /* @__PURE__ */ new Map();
    let interactionCount = 0;
    const clickedSelectors = /* @__PURE__ */ new Set();
    const initialLinks = await this.extractCurrentLinks(page);
    for (const link of initialLinks) {
      linkMap.set(link.href, link);
    }
    let consecutiveEmptyIterations = 0;
    const maxConsecutiveEmpty = 2;
    for (let iteration = 0; iteration < (this.options.maxIterations || 10); iteration++) {
      let clickedInIteration = 0;
      for (const selector of selectors) {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const elementId = await element.evaluate(
            (el, sel) => {
              const getPath = (el2) => {
                if (el2.id) return `#${el2.id}`;
                const parent = el2.parentElement;
                if (!parent) return el2.tagName;
                const index = Array.from(parent.children).indexOf(el2);
                return `${getPath(parent)} > ${el2.tagName}:nth-child(${index + 1})`;
              };
              return `${sel}::${getPath(el)}`;
            },
            selector
          );
          if (clickedSelectors.has(elementId)) {
            continue;
          }
          const isVisible = await element.isVisible();
          if (!isVisible) {
            continue;
          }
          try {
            await element.click();
            clickedSelectors.add(elementId);
            interactionCount++;
            clickedInIteration++;
            try {
              await page.waitForLoadState("networkidle", {
                timeout: 3e3
              });
            } catch {
              await page.waitForTimeout(this.options.clickDelay || 500);
            }
            const newLinks = await this.extractCurrentLinks(page);
            for (const link of newLinks) {
              linkMap.set(link.href, link);
            }
            break;
          } catch (_err) {
          }
        }
        if (clickedInIteration > 0) {
          break;
        }
      }
      if (clickedInIteration === 0) {
        consecutiveEmptyIterations++;
        if (consecutiveEmptyIterations >= maxConsecutiveEmpty) {
          break;
        }
      } else {
        consecutiveEmptyIterations = 0;
      }
    }
    return {
      links: Array.from(linkMap.values()),
      interactionCount
    };
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
  async scrape(url, options) {
    const startTime = Date.now();
    const timeout = options?.timeout || 3e4;
    const cache = options?.cache !== false;
    const cacheExpiry = options?.cacheExpiry || 3e5;
    if (cache) {
      const cacheAdapter = await this.initCache();
      const cacheKey = this.getCacheKey(url, options);
      const cached = await cacheAdapter.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    const rateLimit = this.options.rateLimit !== void 0 ? this.options.rateLimit : 1e3;
    if (rateLimit > 0) {
      await new Promise((resolve) => setTimeout(resolve, rateLimit));
    }
    let scrapeResult = null;
    let scrapeError = null;
    try {
      const crawlerConfig = new Configuration({
        storageClientOptions: {
          localDataDirectory: `${this.cacheDir}/crawlee-${Date.now()}-${Math.random().toString(36).substring(7)}`
        },
        persistStorage: false
        // Don't persist storage between runs
      });
      const crawler = new PlaywrightCrawler(
        {
          headless: this.options.headless,
          launchContext: {
            launchOptions: {
              headless: this.options.headless
            }
          },
          requestHandlerTimeoutSecs: Math.floor(timeout / 1e3),
          preNavigationHooks: [
            async ({ page }) => {
              if (this.options.userAgent) {
                await page.setExtraHTTPHeaders({
                  "User-Agent": this.options.userAgent
                });
              } else {
                await page.setExtraHTTPHeaders({
                  "User-Agent": "Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)"
                });
              }
              if (options?.headers && Object.keys(options.headers).length > 0) {
                await page.setExtraHTTPHeaders(options.headers);
              }
              page.setDefaultNavigationTimeout(timeout);
              page.setDefaultTimeout(timeout);
            }
          ],
          requestHandler: async ({ page, request }) => {
            try {
              await page.waitForLoadState("networkidle", { timeout });
              await page.waitForTimeout(1e3);
              const { links, interactionCount } = await this.extractLinksWithTreeExpansion(page);
              const content = await page.content();
              const duration = Date.now() - startTime;
              const strategy = {
                type: this.getType(),
                spider: "crawlee",
                config: {
                  maxIterations: this.options.maxIterations,
                  clickDelay: this.options.clickDelay,
                  customSelectors: this.options.customSelectors,
                  handleExclusive: this.options.handleExclusive,
                  headless: this.options.headless
                },
                confidence: interactionCount > 0 ? 0.9 : 0.5
                // Lower confidence if no tree structure found (might be wrong strategy)
              };
              const metrics = {
                duration,
                linkCount: links.length,
                interactionCount,
                complete: true
                // Tree scraper always completes
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
                  interactionCount
                }
              };
            } catch (error) {
              scrapeError = error instanceof Error ? error : new Error(String(error));
            }
          },
          failedRequestHandler: async ({ request }, error) => {
            scrapeError = new Error(
              `Failed to scrape ${request.url}: ${error.message}`
            );
          }
        },
        crawlerConfig
      );
      await crawler.run([url]);
      await crawler.teardown();
      if (scrapeError) {
        throw scrapeError;
      }
      if (!scrapeResult) {
        throw new Error("Tree scrape failed - no result captured");
      }
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url, options);
        const ttl = Math.floor(cacheExpiry / 1e3);
        await cacheAdapter.set(cacheKey, scrapeResult, ttl);
      }
      return scrapeResult;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to scrape page with TreeScraper: ${error.message}`
        );
      }
      throw error;
    }
  }
}
export {
  TreeScraper
};
//# sourceMappingURL=tree-ChA3QSJ6.js.map
