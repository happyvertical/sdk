import { getSpider } from '../shared/factory';
import type {
  BasicScraperOptions,
  ScrapeMetrics,
  ScrapeOptions,
  ScrapeResult,
  Scraper,
  ScraperStrategy,
  ScraperType,
  SpiderAdapter,
} from '../shared/types';

/**
 * Basic scraper - simple scraping with no interactions
 *
 * This scraper performs straightforward page fetching without any
 * browser interactions like clicking, scrolling, or waiting for AJAX.
 * It's the fastest and lightest option when you just need to extract
 * links from static HTML.
 *
 * @example
 * ```typescript
 * const scraper = new BasicScraper({
 *   scraper: 'basic',
 *   spider: 'simple', // Fast HTTP-only fetching
 *   cacheDir: '.cache/scraper'
 * });
 *
 * const result = await scraper.scrape('https://example.com');
 * console.log(`Found ${result.links.length} links`);
 * console.log(`Strategy: ${result.strategy.type} using ${result.strategy.spider}`);
 * ```
 */
export class BasicScraper implements Scraper {
  private spider?: SpiderAdapter;
  private options: BasicScraperOptions;

  constructor(options: BasicScraperOptions) {
    this.options = options;
  }

  /**
   * Initialize the spider adapter if needed
   */
  private async initSpider(): Promise<SpiderAdapter> {
    if (!this.spider) {
      const spiderType = this.options.spider || 'simple';
      this.spider = await getSpider({
        adapter: spiderType,
        cacheDir: this.options.cacheDir,
      });
    }
    return this.spider;
  }

  /**
   * Get the scraper type
   */
  getType(): ScraperType {
    return 'basic';
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
  async scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult> {
    const startTime = Date.now();
    const spider = await this.initSpider();

    // Fetch the page using the spider adapter
    const page = await spider.fetch(url, {
      headers: options?.headers,
      timeout: options?.timeout,
      cache: options?.cache,
      cacheExpiry: options?.cacheExpiry,
    });

    const duration = Date.now() - startTime;

    // Build strategy information
    const strategy: ScraperStrategy = {
      type: this.getType(),
      spider: this.options.spider || 'simple',
      config: {
        cacheDir: this.options.cacheDir,
      },
      confidence: 1.0, // Basic scraper is always confident (no detection needed)
    };

    // Build metrics
    const metrics: ScrapeMetrics = {
      duration,
      linkCount: page.links.length,
      interactionCount: 0, // No interactions in basic scraper
      complete: true, // Basic scraper always completes (no partial results)
    };

    // Convert Page to ScrapeResult
    return {
      url: page.url,
      content: page.content,
      links: page.links,
      strategy,
      metrics,
      raw: page.raw,
    };
  }
}
