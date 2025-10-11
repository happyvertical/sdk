import { getSpider } from '../shared/factory';
import type {
  BasicHarvesterOptions,
  HarvestMetrics,
  HarvestOptions,
  HarvestResult,
  HarvesterStrategy,
  HarvesterType,
  IHarvester,
  ISpiderAdapter,
} from '../shared/types';

/**
 * Basic harvester - simple scraping with no interactions
 *
 * This harvester performs straightforward page fetching without any
 * browser interactions like clicking, scrolling, or waiting for AJAX.
 * It's the fastest and lightest option when you just need to extract
 * links from static HTML.
 *
 * @example
 * ```typescript
 * const harvester = new BasicHarvester({
 *   harvester: 'basic',
 *   spider: 'simple', // Fast HTTP-only fetching
 *   cacheDir: '.cache/harvester'
 * });
 *
 * const result = await harvester.harvest('https://example.com');
 * console.log(`Found ${result.links.length} links`);
 * console.log(`Strategy: ${result.strategy.type} using ${result.strategy.spider}`);
 * ```
 */
export class BasicHarvester implements IHarvester {
  private spider?: ISpiderAdapter;
  private options: BasicHarvesterOptions;

  constructor(options: BasicHarvesterOptions) {
    this.options = options;
  }

  /**
   * Initialize the spider adapter if needed
   */
  private async initSpider(): Promise<ISpiderAdapter> {
    if (!this.spider) {
      const spiderType = this.options.spider || 'simple';
      this.spider = await getSpider({
        adapter: spiderType,
        cacheDir: this.options.cacheDir,
      });
    }
    return this.spider;
  }

  /**
   * Get the harvester type
   */
  getType(): HarvesterType {
    return 'basic';
  }

  /**
   * Harvest content from a URL using basic fetching
   *
   * This method performs no browser interactions - it simply fetches
   * the page and extracts all links from the initial HTML.
   *
   * @param url - The URL to harvest
   * @param options - Optional harvest configuration
   * @returns Promise resolving to harvest results with metrics
   */
  async harvest(
    url: string,
    options?: HarvestOptions,
  ): Promise<HarvestResult> {
    const startTime = Date.now();
    const spider = await this.initSpider();

    // Fetch the page using the spider adapter
    const page = await spider.fetch(url, {
      headers: options?.headers,
      timeout: options?.timeout,
      cache: options?.cache,
      cacheExpiry: options?.cacheExpiry,
    });

    const duration = Date.now() - startTime;

    // Build strategy information
    const strategy: HarvesterStrategy = {
      type: this.getType(),
      spider: this.options.spider || 'simple',
      config: {
        cacheDir: this.options.cacheDir,
      },
      confidence: 1.0, // Basic harvester is always confident (no detection needed)
    };

    // Build metrics
    const metrics: HarvestMetrics = {
      duration,
      linkCount: page.links.length,
      interactionCount: 0, // No interactions in basic harvester
      complete: true, // Basic harvester always completes (no partial results)
    };

    // Convert Page to HarvestResult
    return {
      url: page.url,
      content: page.content,
      links: page.links,
      strategy,
      metrics,
      raw: page.raw,
    };
  }
}
