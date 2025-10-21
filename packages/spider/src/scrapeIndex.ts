import { getScraper } from './shared/scraper-factory';
import type {
  ScrapeOptions,
  ScrapeResult,
  ScraperOptions,
} from './shared/types';

/**
 * Convenience function to scrape an index page for links
 *
 * This is a high-level wrapper around the scraper system that handles
 * common cases with sensible defaults. Use this when you want to extract
 * a list of document links from an index page.
 *
 * @param url - The URL of the index page to scrape
 * @param options - Optional configuration
 * @param options.scraper - Scraper configuration (defaults to basic scraper with simple spider)
 * @param options.scrape - Scrape operation options (timeout, cache, headers, etc.)
 * @returns Promise resolving to scrape results with links and metrics
 *
 * @example Basic usage
 * ```typescript
 * import { scrapeIndex } from '@happyvertical/spider';
 *
 * // Scrape a simple index page
 * const result = await scrapeIndex('https://example.com/docs');
 * console.log(`Found ${result.links.length} links`);
 * ```
 *
 * @example With tree expansion for hierarchical pages
 * ```typescript
 * import { scrapeIndex } from '@happyvertical/spider';
 *
 * // Scrape a page with collapsible sections
 * const result = await scrapeIndex('https://example.com/meetings', {
 *   scraper: {
 *     scraper: 'tree',
 *     maxIterations: 20,
 *     clickDelay: 500
 *   }
 * });
 * console.log(`Found ${result.links.length} links after ${result.metrics.interactionCount} interactions`);
 * ```
 *
 * @example With custom options
 * ```typescript
 * import { scrapeIndex } from '@happyvertical/spider';
 *
 * const result = await scrapeIndex('https://example.com/docs', {
 *   scraper: {
 *     scraper: 'basic',
 *     spider: 'dom', // Use DOM processing for complex pages
 *     cacheDir: '.cache/my-scraper'
 *   },
 *   scrape: {
 *     timeout: 60000,
 *     cache: true,
 *     cacheExpiry: 3600000, // 1 hour
 *     headers: {
 *       'User-Agent': 'MyBot/1.0'
 *     }
 *   }
 * });
 * ```
 */
export async function scrapeIndex(
  url: string,
  options?: {
    /**
     * Scraper configuration - defines HOW to extract content
     * Defaults to basic scraper with simple spider
     */
    scraper?: ScraperOptions;

    /**
     * Scrape operation options - timeout, cache, headers, etc.
     */
    scrape?: ScrapeOptions;
  },
): Promise<ScrapeResult> {
  // Default to basic scraper with simple spider
  const scraperOptions: ScraperOptions = options?.scraper || {
    scraper: 'basic',
    spider: 'simple',
  };

  const scraper = await getScraper(scraperOptions);
  return scraper.scrape(url, options?.scrape);
}
