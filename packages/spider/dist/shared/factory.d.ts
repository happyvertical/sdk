import { SpiderAdapter, SpiderAdapterOptions } from './types';
/**
 * Factory function to create a spider adapter instance
 *
 * @param options - Configuration options for the spider adapter
 * @returns Promise resolving to a spider adapter that implements SpiderAdapter
 *
 * @example
 * ```typescript
 * // Create simple HTTP adapter
 * const spider = await getSpider({ adapter: 'simple' });
 *
 * // Create DOM processing adapter
 * const domSpider = await getSpider({ adapter: 'dom' });
 *
 * // Create Crawlee headless browser adapter
 * const crawleeSpider = await getSpider({
 *   adapter: 'crawlee',
 *   headless: true,
 *   userAgent: 'MyBot/1.0'
 * });
 *
 * // Use the adapter
 * const page = await spider.fetch('https://example.com');
 * console.log(page.links);
 * ```
 */
export declare function getSpider(options: SpiderAdapterOptions): Promise<SpiderAdapter>;
//# sourceMappingURL=factory.d.ts.map