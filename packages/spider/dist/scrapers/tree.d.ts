import { Scraper, ScrapeOptions, ScrapeResult, ScraperType, TreeScraperOptions } from '../shared/types';
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
export declare class TreeScraper implements Scraper {
    private options;
    private cacheDir;
    private cache?;
    private readonly DEFAULT_SELECTORS;
    constructor(options: TreeScraperOptions);
    /**
     * Get the scraper type
     */
    getType(): ScraperType;
    /**
     * Initialize the cache adapter if needed
     */
    private initCache;
    /**
     * Generate a cache key from a URL and scrape options
     *
     * Cache key includes URL, maxIterations, and clickDelay to differentiate
     * results with different expansion parameters.
     */
    private getCacheKey;
    /**
     * Extract all links from the current page state
     */
    private extractCurrentLinks;
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
    private extractLinksWithTreeExpansion;
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
    scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
//# sourceMappingURL=tree.d.ts.map