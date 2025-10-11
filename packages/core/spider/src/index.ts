/**
 * @have/spider - Web scraping and HTML content extraction
 *
 * This package provides a standardized interface for fetching and parsing web content.
 *
 * ## Spider Adapters
 * Different fetching mechanisms (HOW to fetch):
 * - Simple: Fast HTTP requests with cheerio parsing
 * - DOM: HTML processing with happy-dom for complex pages
 * - Crawlee: Full browser automation with Playwright
 *
 * ## Harvesters
 * Different content extraction strategies (HOW to extract):
 * - Basic: Simple scraping with no interactions
 * - Accordion: Expand accordions to reveal hidden content
 * - AJAX: Wait for async content to load (coming soon)
 * - Scroll: Handle infinite scroll (coming soon)
 * - Pagination: Navigate through multiple pages (coming soon)
 *
 * @example Spider Usage
 * ```typescript
 * import { getSpider } from '@have/spider';
 *
 * // Create a simple HTTP adapter
 * const spider = await getSpider({ adapter: 'simple' });
 *
 * // Fetch a page
 * const page = await spider.fetch('https://example.com');
 * console.log(page.links);
 * ```
 *
 * @example Harvester Usage
 * ```typescript
 * import { getHarvester } from '@have/spider';
 *
 * // Create an accordion harvester
 * const harvester = await getHarvester({
 *   harvester: 'accordion',
 *   maxIterations: 10
 * });
 *
 * // Harvest a page with accordion expansion
 * const result = await harvester.harvest('https://example.com/meetings');
 * console.log(`Found ${result.links.length} links`);
 * console.log(`Made ${result.metrics.interactionCount} interactions`);
 * ```
 */

// Export factory functions
export * from './shared/factory';
export * from './shared/harvester-factory';

// Export all types
export * from './shared/types';
