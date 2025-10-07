/**
 * @have/spider - Web scraping and HTML content extraction
 *
 * This package provides a standardized interface for fetching and parsing web content.
 * It supports multiple adapters for different use cases:
 * - Simple: Fast HTTP requests with cheerio parsing
 * - DOM: HTML processing with happy-dom for complex pages
 * - Crawlee: Full browser automation with Playwright
 *
 * @example
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
 */

// Export factory function
export * from './shared/factory';

// Export all types
export * from './shared/types';
