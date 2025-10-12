import { ValidationError } from '@have/utils';
import type { HarvesterOptions, IHarvester } from './types';

/**
 * Factory function to create harvester instances
 *
 * Harvesters define HOW to extract content from a page:
 * - basic: Simple scraping with no interactions
 * - tree: Expand hierarchical trees/accordions to reveal hidden content
 * - ajax: Wait for async content to load
 * - scroll: Handle infinite scroll
 * - pagination: Navigate through multiple pages
 * - tabs: Switch between tabs
 * - hybrid: Combine multiple strategies
 *
 * Each harvester internally chooses which spider adapter to use.
 *
 * @param options - Harvester configuration (discriminated union)
 * @returns Promise resolving to a harvester instance
 *
 * @example
 * ```typescript
 * // Basic harvester with simple spider
 * const harvester = await getHarvester({
 *   harvester: 'basic',
 *   spider: 'simple'
 * });
 *
 * // Tree harvester with custom selectors
 * const harvester = await getHarvester({
 *   harvester: 'tree',
 *   customSelectors: ['.my-tree-node'],
 *   maxIterations: 20
 * });
 * ```
 */
export async function getHarvester(
  options: HarvesterOptions,
): Promise<IHarvester> {
  if (!options || typeof options !== 'object') {
    throw new ValidationError('Harvester options are required', { options });
  }

  if (!('harvester' in options)) {
    throw new ValidationError('Harvester type must be specified', { options });
  }

  switch (options.harvester) {
    case 'basic': {
      const { BasicHarvester } = await import('../harvesters/basic');
      return new BasicHarvester(options);
    }

    case 'tree': {
      const { TreeHarvester } = await import('../harvesters/tree');
      return new TreeHarvester(options);
    }

    case 'ajax': {
      const { AjaxHarvester } = await import('../harvesters/ajax');
      return new AjaxHarvester(options);
    }

    case 'scroll': {
      const { ScrollHarvester } = await import('../harvesters/scroll');
      return new ScrollHarvester(options);
    }

    case 'pagination': {
      const { PaginationHarvester } = await import('../harvesters/pagination');
      return new PaginationHarvester(options);
    }

    default: {
      // TypeScript exhaustiveness check
      const unsupported = (options as any).harvester;
      throw new ValidationError(
        `Unsupported harvester type: ${unsupported}`,
        { options },
      );
    }
  }
}
