import { BasicScraperOptions, ScrapeOptions, ScrapeResult, ScraperType, IScraper } from '../shared/types';
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
export declare class BasicScraper implements IScraper {
    private spider?;
    private options;
    constructor(options: BasicScraperOptions);
    /**
     * Initialize the spider adapter if needed
     */
    private initSpider;
    /**
     * Get the scraper type
     */
    getType(): ScraperType;
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
    scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
//# sourceMappingURL=basic.d.ts.map