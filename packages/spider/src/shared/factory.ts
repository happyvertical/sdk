import type {
  CrawleeAdapterOptions,
  DomAdapterOptions,
  SimpleAdapterOptions,
  SpiderAdapter,
  SpiderAdapterOptions,
} from './types';

/**
 * Type guard for Simple adapter options
 */
function isSimpleOptions(
  options: SpiderAdapterOptions,
): options is SimpleAdapterOptions {
  return options.adapter === 'simple';
}

/**
 * Type guard for DOM adapter options
 */
function isDomOptions(
  options: SpiderAdapterOptions,
): options is DomAdapterOptions {
  return options.adapter === 'dom';
}

/**
 * Type guard for Crawlee adapter options
 */
function isCrawleeOptions(
  options: SpiderAdapterOptions,
): options is CrawleeAdapterOptions {
  return options.adapter === 'crawlee';
}

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
export async function getSpider(
  options: SpiderAdapterOptions,
): Promise<SpiderAdapter> {
  if (isSimpleOptions(options)) {
    const { SimpleAdapter } = await import('../adapters/simple.js');
    return new SimpleAdapter(options);
  }

  if (isDomOptions(options)) {
    const { DomAdapter } = await import('../adapters/dom.js');
    return new DomAdapter(options);
  }

  if (isCrawleeOptions(options)) {
    const { CrawleeAdapter } = await import('../adapters/crawlee.js');
    return new CrawleeAdapter(options);
  }

  // This should never happen due to TypeScript's discriminated union
  throw new Error(`Unsupported adapter: ${(options as any).adapter}`);
}
