import { DomAdapterOptions, FetchOptions, SpiderAdapter, Page } from '../shared/types';
/**
 * DOM processing adapter for fetching and normalizing web pages
 * Uses happy-dom to process HTML and cheerio for parsing
 */
export declare class DomAdapter implements SpiderAdapter {
    private cache?;
    private cacheDir;
    constructor(options: DomAdapterOptions);
    /**
     * Initialize the cache adapter if needed
     */
    private initCache;
    /**
     * Generate a cache key from a URL
     */
    private getCacheKey;
    /**
     * Process HTML with happy-dom to normalize structure
     */
    private processHtml;
    /**
     * Extract links from HTML using cheerio with metadata
     */
    private extractLinks;
    /**
     * Fetches a web page and returns a standardized Page object
     */
    fetch(url: string, options?: FetchOptions): Promise<Page>;
}
//# sourceMappingURL=dom.d.ts.map