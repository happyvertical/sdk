import { CrawleeAdapterOptions, FetchOptions, SpiderAdapter, Link, Page } from '../shared/types';
/**
 * Crawlee headless browser adapter for fetching web pages
 * Uses Playwright through Crawlee for full browser automation
 */
export declare class CrawleeAdapter implements SpiderAdapter {
    private cache?;
    private cacheDir;
    private headless;
    private userAgent?;
    constructor(options: CrawleeAdapterOptions);
    /**
     * Initialize the cache adapter if needed
     */
    private initCache;
    /**
     * Generate a cache key from a URL
     */
    private getCacheKey;
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
    extractLinks(page: any): Promise<Link[]>;
    /**
     * Fetches a web page using headless browser and returns a standardized Page object
     */
    fetch(url: string, options?: FetchOptions): Promise<Page>;
}
//# sourceMappingURL=crawlee.d.ts.map