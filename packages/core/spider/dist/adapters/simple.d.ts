import { FetchOptions, ISpiderAdapter, Page, SimpleAdapterOptions } from '../shared/types';
/**
 * Simple HTTP adapter for fetching web pages
 * Uses undici for fast HTTP requests and cheerio for parsing
 */
export declare class SimpleAdapter implements ISpiderAdapter {
    private cache?;
    private cacheDir;
    constructor(options: SimpleAdapterOptions);
    /**
     * Initialize the cache adapter if needed
     */
    private initCache;
    /**
     * Generate a cache key from a URL
     */
    private getCacheKey;
    /**
     * Extract links from HTML using cheerio with metadata
     */
    private extractLinks;
    /**
     * Fetches a web page and returns a standardized Page object
     */
    fetch(url: string, options?: FetchOptions): Promise<Page>;
}
//# sourceMappingURL=simple.d.ts.map