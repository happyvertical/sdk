import { ValidationError } from '@happyvertical/utils';
import type { Scraper, ScraperOptions } from './types';

/**
 * Factory function to create scraper instances
 *
 * Scrapers define HOW to extract content from a page:
 * - basic: Simple scraping with no interactions
 * - tree: Expand hierarchical trees/accordions to reveal hidden content
 * - ajax: Wait for async content to load
 * - scroll: Handle infinite scroll
 * - pagination: Navigate through multiple pages
 * - tabs: Switch between tabs
 * - hybrid: Combine multiple strategies
 *
 * Each scraper internally chooses which spider adapter to use.
 *
 * @param options - Scraper configuration (discriminated union)
 * @returns Promise resolving to a scraper instance
 *
 * @example
 * ```typescript
 * // Basic scraper with simple spider
 * const scraper = await getScraper({
 *   scraper: 'basic',
 *   spider: 'simple'
 * });
 *
 * // Tree scraper with custom selectors
 * const scraper = await getScraper({
 *   scraper: 'tree',
 *   customSelectors: ['.my-tree-node'],
 *   maxIterations: 20
 * });
 * ```
 */
export async function getScraper(options: ScraperOptions): Promise<Scraper> {
  if (!options || typeof options !== 'object') {
    throw new ValidationError('Scraper options are required', { options });
  }

  if (!('scraper' in options)) {
    throw new ValidationError('Scraper type must be specified', { options });
  }

  switch (options.scraper) {
    case 'basic': {
      const { BasicScraper } = await import('../scrapers/basic');
      return new BasicScraper(options);
    }

    case 'tree': {
      const { TreeScraper } = await import('../scrapers/tree');
      return new TreeScraper(options);
    }
    default: {
      // TypeScript exhaustiveness check
      const unsupported = (options as any).scraper;
      throw new ValidationError(
        `Unsupported scraper type: ${unsupported}. Only 'basic' and 'tree' are currently implemented.`,
        { options },
      );
    }
  }
}
