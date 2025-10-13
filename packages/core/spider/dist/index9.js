import { getSpider } from "./index4.js";
class BasicScraper {
  spider;
  options;
  constructor(options) {
    this.options = options;
  }
  /**
   * Initialize the spider adapter if needed
   */
  async initSpider() {
    if (!this.spider) {
      const spiderType = this.options.spider || "simple";
      this.spider = await getSpider({
        adapter: spiderType,
        cacheDir: this.options.cacheDir
      });
    }
    return this.spider;
  }
  /**
   * Get the scraper type
   */
  getType() {
    return "basic";
  }
  /**
   * Scrape content from a URL using basic fetching
   *
   * This method performs no browser interactions - it simply fetches
   * the page and extracts all links from the initial HTML.
   *
   * @param url - The URL to scrape
   * @param options - Optional scrape configuration
   * @returns Promise resolving to scrape results with metrics
   */
  async scrape(url, options) {
    const startTime = Date.now();
    const spider = await this.initSpider();
    const page = await spider.fetch(url, {
      headers: options?.headers,
      timeout: options?.timeout,
      cache: options?.cache,
      cacheExpiry: options?.cacheExpiry
    });
    const duration = Date.now() - startTime;
    const strategy = {
      type: this.getType(),
      spider: this.options.spider || "simple",
      config: {
        cacheDir: this.options.cacheDir
      },
      confidence: 1
      // Basic scraper is always confident (no detection needed)
    };
    const metrics = {
      duration,
      linkCount: page.links.length,
      interactionCount: 0,
      // No interactions in basic scraper
      complete: true
      // Basic scraper always completes (no partial results)
    };
    return {
      url: page.url,
      content: page.content,
      links: page.links,
      strategy,
      metrics,
      raw: page.raw
    };
  }
}
export {
  BasicScraper
};
//# sourceMappingURL=index9.js.map
