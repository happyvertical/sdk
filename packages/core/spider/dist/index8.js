import { getCache } from "@have/cache";
import { ValidationError, isUrl, NetworkError } from "@have/utils";
import * as cheerio from "cheerio";
import { Configuration, PlaywrightCrawler } from "crawlee";
class CrawleeAdapter {
  cache;
  cacheDir;
  headless;
  userAgent;
  constructor(options) {
    this.cacheDir = options.cacheDir || ".cache/spider";
    this.headless = options.headless !== false;
    this.userAgent = options.userAgent;
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
   * Generate a cache key from a URL
   */
  getCacheKey(url) {
    return `crawlee:${encodeURIComponent(url)}`;
  }
  /**
   * Extract links from HTML using cheerio with metadata
   */
  extractLinksFromHtml(html) {
    const $ = cheerio.load(html);
    const links = [];
    $("a").each((_, element) => {
      const $link = $(element);
      const href = $link.attr("href");
      if (href) {
        const classes = $link.attr("class");
        links.push({
          href,
          text: $link.text().trim() || "",
          title: $link.attr("title"),
          ariaLabel: $link.attr("aria-label"),
          rel: $link.attr("rel"),
          target: $link.attr("target"),
          classes: classes ? classes.split(" ").filter((c) => c.trim()) : void 0
        });
      }
    });
    return links;
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
  async extractLinks(page) {
    const allLinks = await page.evaluate(() => {
      const linkMap = /* @__PURE__ */ new Map();
      const clickedElements = /* @__PURE__ */ new Set();
      const extractLinks = () => {
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
      };
      const clickAndWait = (element) => {
        if (clickedElements.has(element)) return false;
        try {
          element.click();
          clickedElements.add(element);
          return true;
        } catch {
          return false;
        }
      };
      extractLinks();
      for (let iteration = 0; iteration < 3; iteration++) {
        let clickedCount = 0;
        const semanticSelectors = [
          'button[aria-expanded="false"]',
          '[role="button"][aria-expanded="false"]',
          ".accordion-header",
          ".accordion-button",
          "summary",
          "[data-toggle]"
        ];
        for (const selector of semanticSelectors) {
          document.querySelectorAll(selector).forEach((el) => {
            if (clickAndWait(el)) clickedCount++;
          });
        }
        document.querySelectorAll('a[href="#"]').forEach((link) => {
          const text = link.textContent?.trim() || "";
          if (text.toLowerCase().includes("skip")) return;
          if (text.toLowerCase().includes("menu")) return;
          if (text.length > 100) return;
          if (clickAndWait(link)) clickedCount++;
        });
        extractLinks();
        if (clickedCount === 0) break;
      }
      return Array.from(linkMap.values());
    });
    return allLinks;
  }
  /**
   * Fetches a web page using headless browser and returns a standardized Page object
   */
  async fetch(url, options) {
    const {
      headers = {},
      timeout = 3e4,
      cache = true,
      cacheExpiry = 3e5
      // 5 minutes default
    } = options || {};
    if (!url || typeof url !== "string") {
      throw new ValidationError("URL is required and must be a string", {
        url
      });
    }
    if (!isUrl(url)) {
      throw new ValidationError("Invalid URL format", { url });
    }
    if (cache) {
      const cacheAdapter = await this.initCache();
      const cacheKey = this.getCacheKey(url);
      const cached = await cacheAdapter.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    let pageData = null;
    let fetchError = null;
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
          headless: this.headless,
          launchContext: {
            launchOptions: {
              headless: this.headless
            }
          },
          requestHandlerTimeoutSecs: Math.floor(timeout / 1e3),
          preNavigationHooks: [
            async ({ page }) => {
              if (this.userAgent) {
                await page.setExtraHTTPHeaders({
                  "User-Agent": this.userAgent
                });
              }
              if (Object.keys(headers).length > 0) {
                await page.setExtraHTTPHeaders(headers);
              }
              page.setDefaultNavigationTimeout(timeout);
              page.setDefaultTimeout(timeout);
            }
          ],
          requestHandler: async ({ page, request }) => {
            try {
              await page.waitForLoadState("networkidle", { timeout });
              await page.waitForTimeout(500);
              const links = await this.extractLinks(page);
              const content = await page.content();
              const finalUrl = page.url();
              pageData = {
                url: finalUrl,
                content,
                links,
                raw: {
                  requestUrl: request.url,
                  loadedUrl: finalUrl
                }
              };
            } catch (error) {
              fetchError = error instanceof Error ? error : new Error(String(error));
            }
          },
          failedRequestHandler: async ({ request }, error) => {
            fetchError = new NetworkError(
              `Failed to crawl ${request.url}: ${error.message}`,
              {
                url: request.url,
                error: error.message
              }
            );
          }
        },
        crawlerConfig
      );
      await crawler.run([url]);
      await crawler.teardown();
      if (fetchError) {
        throw fetchError;
      }
      if (!pageData) {
        throw new NetworkError(`Failed to fetch page: No data returned`, {
          url
        });
      }
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url);
        const ttl = Math.floor(cacheExpiry / 1e3);
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
            stack: error.stack
          }
        );
      }
      throw error;
    }
  }
}
export {
  CrawleeAdapter
};
//# sourceMappingURL=index8.js.map
