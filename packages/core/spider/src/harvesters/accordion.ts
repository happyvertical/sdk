import { Configuration, PlaywrightCrawler } from 'crawlee';
import type {
  AccordionHarvesterOptions,
  HarvestMetrics,
  HarvestOptions,
  HarvestResult,
  HarvesterStrategy,
  HarvesterType,
  IHarvester,
  Link,
} from '../shared/types';

/**
 * Accordion harvester - expand accordions to reveal hidden content
 *
 * This harvester handles pages where content is hidden in accordions,
 * collapsible sections, or expandable elements. It systematically clicks
 * through all expandable elements to reveal and extract all links.
 *
 * Handles both exclusive accordions (one-at-a-time) and independent
 * collapsible sections, as links are stored before moving to the next element.
 *
 * @example
 * ```typescript
 * const harvester = new AccordionHarvester({
 *   harvester: 'accordion',
 *   maxIterations: 10,
 *   clickDelay: 100,
 *   customSelectors: ['.my-accordion'],
 *   handleExclusive: true
 * });
 *
 * const result = await harvester.harvest('https://example.com/meetings');
 * console.log(`Found ${result.links.length} links after ${result.metrics.interactionCount} clicks`);
 * console.log(`Confidence: ${result.strategy.confidence}`);
 * ```
 */
export class AccordionHarvester implements IHarvester {
  private options: AccordionHarvesterOptions;
  private cacheDir: string;

  // Default accordion selectors (most common patterns)
  private readonly DEFAULT_SELECTORS = [
    '[role="button"][aria-expanded]',
    'button[aria-expanded]',
    '[data-accordion-trigger]',
    '[data-toggle="collapse"]',
    '.accordion-button',
    '.expand-button',
    'details summary',
    'li.directory.collapsed > a', // Directory/file browser accordions
    'li.collapsed > a', // Generic collapsed list items
  ];

  constructor(options: AccordionHarvesterOptions) {
    this.options = {
      maxIterations: 10,
      clickDelay: 100,
      handleExclusive: true,
      headless: true,
      ...options,
    };
    this.cacheDir = options.cacheDir || '.cache/spider';
  }

  /**
   * Get the harvester type
   */
  getType(): HarvesterType {
    return 'accordion';
  }

  /**
   * Extract all links from the current page state
   */
  private async extractCurrentLinks(page: any): Promise<Link[]> {
    return page.evaluate(() => {
      const linkMap = new Map<string, any>();
      document.querySelectorAll('a[href]').forEach((a) => {
        const link = a as HTMLAnchorElement;
        const href = link.href;
        if (!linkMap.has(href)) {
          linkMap.set(href, {
            href,
            text: link.textContent?.trim() || '',
            title: link.title || undefined,
            ariaLabel: link.getAttribute('aria-label') || undefined,
            rel: link.rel || undefined,
            target: link.target || undefined,
            classes: link.className
              ? link.className.split(' ').filter((c) => c.trim())
              : undefined,
          });
        }
      });
      return Array.from(linkMap.values());
    });
  }

  /**
   * Extract links from a page by expanding accordions
   *
   * This method uses Playwright's native click() to properly trigger events.
   * It systematically clicks expandable elements and extracts links after each click.
   *
   * @param page - Playwright page instance
   * @returns Promise resolving to array of links and interaction count
   */
  private async extractLinksWithAccordions(
    page: any,
  ): Promise<{ links: Link[]; interactionCount: number }> {
    const selectors = [
      ...this.DEFAULT_SELECTORS,
      ...(this.options.customSelectors || []),
    ];

    const linkMap = new Map<string, Link>();
    let interactionCount = 0;
    const clickedSelectors = new Set<string>();

    // Extract initial links
    const initialLinks = await this.extractCurrentLinks(page);
    initialLinks.forEach((link) => linkMap.set(link.href, link));
    let previousLinkCount = linkMap.size;

    // Iterate to find and click expandable elements
    // Each iteration re-queries the DOM to find newly revealed elements
    for (let iteration = 0; iteration < (this.options.maxIterations || 10); iteration++) {
      let clickedInIteration = 0;

      // Try each selector
      for (const selector of selectors) {
        // Find all matching elements
        const elements = await page.$$(selector);

        for (const element of elements) {
          // Generate a unique identifier for this element
          const elementId = await element.evaluate((el: Element, sel: string) => {
            // Create a unique path for this element
            const getPath = (el: Element): string => {
              if (el.id) return `#${el.id}`;
              const parent = el.parentElement;
              if (!parent) return el.tagName;
              const index = Array.from(parent.children).indexOf(el);
              return `${getPath(parent)} > ${el.tagName}:nth-child(${index + 1})`;
            };
            return `${sel}::${getPath(el)}`;
          }, selector);

          // Skip if already clicked
          if (clickedSelectors.has(elementId)) {
            continue;
          }

          // Check if element is visible
          const isVisible = await element.isVisible();
          if (!isVisible) {
            continue;
          }

          // Click the element using Playwright's native click (properly triggers JS events)
          try {
            await element.click();
            clickedSelectors.add(elementId);
            interactionCount++;
            clickedInIteration++;

            // Wait for any AJAX content to load
            try {
              await page.waitForLoadState('networkidle', {
                timeout: 3000,
              });
            } catch {
              // If network doesn't go idle, just wait a bit
              await page.waitForTimeout(this.options.clickDelay || 500);
            }

            // Extract links after click
            const newLinks = await this.extractCurrentLinks(page);
            newLinks.forEach((link) => linkMap.set(link.href, link));
          } catch (err) {
            // Element not clickable, skip
            continue;
          }
        }
      }

      // Check if we clicked anything or found new links in this iteration
      const currentLinkCount = linkMap.size;

      if (clickedInIteration === 0) {
        // No elements clicked in this iteration, we're done
        break;
      }

      if (currentLinkCount === previousLinkCount) {
        // No new links found despite clicking, we might be done
        // But continue one more iteration to be sure
      }

      previousLinkCount = currentLinkCount;
    }

    return {
      links: Array.from(linkMap.values()),
      interactionCount,
    };
  }

  /**
   * Old page.evaluate()-based implementation (keeping for reference)
   * This version didn't properly trigger JavaScript event handlers
   */
  private async extractLinksWithAccordionsOld(
    page: any,
  ): Promise<{ links: Link[]; interactionCount: number }> {
    const selectors = [
      ...this.DEFAULT_SELECTORS,
      ...(this.options.customSelectors || []),
    ];

    const result = await page.evaluate(
      ({
        selectors,
        maxIterations,
        clickDelay,
      }: {
        selectors: string[];
        maxIterations: number;
        clickDelay: number;
      }) => {
        const linkMap = new Map<string, any>();
        const clickedElements = new Set<Element>();
        let interactionCount = 0;
        let previousLinkCount = 0;

        // Extract all current links and store in map
        const extractLinks = () => {
          document.querySelectorAll('a[href]').forEach((a) => {
            const link = a as HTMLAnchorElement;
            const href = link.href;
            if (!linkMap.has(href)) {
              linkMap.set(href, {
                href,
                text: link.textContent?.trim() || '',
                title: link.title || undefined,
                ariaLabel: link.getAttribute('aria-label') || undefined,
                rel: link.rel || undefined,
                target: link.target || undefined,
                classes: link.className
                  ? link.className.split(' ').filter((c) => c.trim())
                  : undefined,
              });
            }
          });
        };

        // Initial extraction
        extractLinks();
        previousLinkCount = linkMap.size;

        // Iterate through expandable elements
        for (let iteration = 0; iteration < maxIterations; iteration++) {
          let foundNewElement = false;

          // Try each selector
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);

            for (const element of elements) {
              // Skip if already clicked
              if (clickedElements.has(element)) {
                continue;
              }

              // Check if element is visible and clickable
              const rect = element.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) {
                continue;
              }

              // Check if element is actually an accordion trigger
              const ariaExpanded = element.getAttribute('aria-expanded');
              const ariaControls = element.getAttribute('aria-controls');
              const isDirectory = element.parentElement?.classList.contains('directory') ||
                                  element.parentElement?.classList.contains('collapsed');

              // Skip elements that don't look like accordion triggers
              // Allow if: has aria-expanded, has aria-controls, is details summary, or is directory-style
              if (!ariaExpanded && !ariaControls && !selector.includes('details') && !isDirectory) {
                continue;
              }

              // Click the element
              try {
                (element as HTMLElement).click();
                clickedElements.add(element);
                interactionCount++;
                foundNewElement = true;

                // Wait for potential animations/transitions and content loading
                // Use a longer delay for directory-style accordions as they may load content async
                const waitTime = isDirectory ? Math.max(clickDelay, 500) : clickDelay;
                const start = Date.now();
                while (Date.now() - start < waitTime) {
                  // Busy wait (synchronous delay in browser context)
                }

                // Extract links after click
                extractLinks();
              } catch (err) {
                // Element not clickable or hidden, skip
                continue;
              }

              // Only click one element per iteration if handling exclusive accordions
              break;
            }

            if (foundNewElement) {
              break;
            }
          }

          // Check if we found new links
          const currentLinkCount = linkMap.size;
          if (currentLinkCount === previousLinkCount) {
            // No new links found, we're done
            break;
          }

          previousLinkCount = currentLinkCount;

          // If no new elements found to click, we're done
          if (!foundNewElement) {
            break;
          }
        }

        return {
          links: Array.from(linkMap.values()),
          interactionCount,
        };
      },
      {
        selectors,
        maxIterations: this.options.maxIterations || 10,
        clickDelay: this.options.clickDelay || 100,
      },
    );

    return result;
  }

  /**
   * Harvest content from a URL by expanding accordions
   *
   * This method launches a headless browser, navigates to the URL,
   * and systematically expands all accordion elements to extract
   * all hidden links.
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
    const timeout = options?.timeout || 30000;

    let harvestResult: HarvestResult | null = null;
    let harvestError: Error | null = null;

    try {
      // Create a unique configuration for this crawler instance
      const crawlerConfig = new Configuration({
        storageClientOptions: {
          localDataDirectory: `${this.cacheDir}/crawlee-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        },
        persistStorage: false, // Don't persist storage between runs
      });

      const crawler = new PlaywrightCrawler(
        {
          headless: this.options.headless,
          launchContext: {
            launchOptions: {
              headless: this.options.headless,
            },
          },
          requestHandlerTimeoutSecs: Math.floor(timeout / 1000),
          preNavigationHooks: [
            async ({ page }) => {
              // Set custom user agent if provided
              if (this.options.userAgent) {
                await page.setExtraHTTPHeaders({
                  'User-Agent': this.options.userAgent,
                });
              } else {
                await page.setExtraHTTPHeaders({
                  'User-Agent':
                    'Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)',
                });
              }

              // Set custom headers
              if (options?.headers && Object.keys(options.headers).length > 0) {
                await page.setExtraHTTPHeaders(options.headers);
              }

              // Set timeout
              page.setDefaultNavigationTimeout(timeout);
              page.setDefaultTimeout(timeout);
            },
          ],
          requestHandler: async ({ page, request }) => {
            try {
              // Wait for page to load
              await page.waitForLoadState('networkidle', { timeout });

              // Wait for any initial animations and lazy-loaded content
              await page.waitForTimeout(1000);

              // Extract links with accordion expansion
              const { links, interactionCount } =
                await this.extractLinksWithAccordions(page);

              // Get page content
              const content = await page.content();

              const duration = Date.now() - startTime;

              // Build strategy information
              const strategy: HarvesterStrategy = {
                type: this.getType(),
                spider: 'crawlee',
                config: {
                  maxIterations: this.options.maxIterations,
                  clickDelay: this.options.clickDelay,
                  customSelectors: this.options.customSelectors,
                  handleExclusive: this.options.handleExclusive,
                  headless: this.options.headless,
                },
                confidence:
                  interactionCount > 0
                    ? 0.9 // High confidence if we found accordions
                    : 0.5, // Lower confidence if no accordions found (might be wrong strategy)
              };

              // Build metrics
              const metrics: HarvestMetrics = {
                duration,
                linkCount: links.length,
                interactionCount,
                complete: true, // Accordion harvester always completes
              };

              harvestResult = {
                url: page.url(),
                content,
                links,
                strategy,
                metrics,
                raw: {
                  requestUrl: request.url,
                  loadedUrl: page.url(),
                  interactionCount,
                },
              };
            } catch (error) {
              harvestError =
                error instanceof Error ? error : new Error(String(error));
            }
          },
          failedRequestHandler: async ({ request }, error) => {
            harvestError = new Error(
              `Failed to harvest ${request.url}: ${error.message}`,
            );
          },
        },
        crawlerConfig,
      );

      // Run the crawler for this single URL
      await crawler.run([url]);

      // Always tear down the crawler to clean up resources
      await crawler.teardown();

      // Check if we got the result
      if (harvestError) {
        throw harvestError;
      }

      if (!harvestResult) {
        throw new Error('Accordion harvest failed - no result captured');
      }

      return harvestResult;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to harvest page with AccordionHarvester: ${error.message}`,
        );
      }
      throw error;
    }
  }
}
