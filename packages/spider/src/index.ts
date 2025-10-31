/**
 * @happyvertical/spider - Web scraping and content extraction
 *
 * This package provides a standardized interface for fetching and parsing web content
 * with two main use cases: extracting link indexes and extracting document content.
 *
 * ## Quick Start
 *
 * ### Scraping an index page for links
 * ```typescript
 * import { scrapeIndex } from '@happyvertical/spider';
 *
 * const result = await scrapeIndex('https://example.com/meetings');
 * console.log(`Found ${result.links.length} links`);
 * ```
 *
 * ### Extracting document content
 * ```typescript
 * import { scrapeDocument } from '@happyvertical/spider';
 *
 * const doc = await scrapeDocument('https://example.com/article');
 * console.log(doc.text); // Extracted content
 * console.log(doc.metadata.title); // Page title
 * ```
 *
 * ## Spider Adapters
 * Different fetching mechanisms (HOW to fetch):
 * - **Simple**: Fast HTTP requests with cheerio parsing
 * - **DOM**: HTML processing with happy-dom for complex pages
 * - **Crawlee**: Full browser automation with Playwright
 *
 * ## Scraper Strategies
 * Different content extraction strategies (HOW to extract):
 * - **Basic**: Simple scraping with no interactions
 * - **Tree**: Expand hierarchical trees/accordions to reveal hidden content
 * - **AJAX**: Wait for async content to load (coming soon)
 * - **Scroll**: Handle infinite scroll (coming soon)
 * - **Pagination**: Navigate through multiple pages (coming soon)
 *
 * ## Advanced Usage
 *
 * ### Using specific scraper strategies
 * ```typescript
 * import { scrapeIndex } from '@happyvertical/spider';
 *
 * // Use tree scraper for pages with collapsible sections
 * const result = await scrapeIndex('https://example.com/meetings', {
 *   scraper: {
 *     scraper: 'tree',
 *     maxIterations: 20,
 *     clickDelay: 500
 *   }
 * });
 * ```
 *
 * ### Direct factory usage
 * ```typescript
 * import { getScraper } from '@happyvertical/spider';
 *
 * const scraper = await getScraper({
 *   scraper: 'tree',
 *   maxIterations: 10
 * });
 *
 * const result = await scraper.scrape('https://example.com');
 * console.log(`Made ${result.metrics.interactionCount} interactions`);
 * ```
 *
 * ### Spider adapter usage
 * ```typescript
 * import { getSpider } from '@happyvertical/spider';
 *
 * const spider = await getSpider({ adapter: 'simple' });
 * const page = await spider.fetch('https://example.com');
 * console.log(page.links);
 * ```
 */

export {
  type DocumentLinkOptions,
  type DocumentResult,
  findDocumentLinks,
  scrapeDocument,
} from './scrapeDocument';
// Export convenience functions (recommended API)
export { scrapeIndex } from './scrapeIndex';

// Export factory functions (advanced usage)
export { getSpider } from './shared/factory';
export { getScraper } from './shared/scraper-factory';

// Export all types
export * from './shared/types';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
