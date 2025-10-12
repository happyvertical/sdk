/**
 * Represents a link extracted from a web page with metadata
 */
export interface Link {
  /**
   * The URL the link points to (absolute or relative)
   */
  href: string;

  /**
   * The visible text content of the link
   */
  text: string;

  /**
   * The title attribute (hover text)
   */
  title?: string;

  /**
   * The aria-label attribute for accessibility
   */
  ariaLabel?: string;

  /**
   * The rel attribute (e.g., "nofollow", "external")
   */
  rel?: string;

  /**
   * The target attribute (e.g., "_blank")
   */
  target?: string;

  /**
   * CSS classes applied to the link
   */
  classes?: string[];
}

/**
 * Standardized data structure representing a web page
 */
export interface Page {
  /**
   * The final URL of the page after any redirects
   */
  url: string;

  /**
   * The full HTML content of the page
   */
  content: string;

  /**
   * An array of links extracted from the page with metadata
   */
  links: Link[];

  /**
   * The original raw response from the adapter
   * Useful for debugging or accessing adapter-specific data
   */
  raw: any;
}

/**
 * Options for fetch operations
 */
export interface FetchOptions {
  /**
   * Custom headers to include in the request
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * Whether to use the cache
   * @default true
   */
  cache?: boolean;

  /**
   * Cache expiry time in milliseconds
   * @default 300000 (5 minutes)
   */
  cacheExpiry?: number;
}

/**
 * Interface that all spider adapters must implement
 */
export interface ISpiderAdapter {
  /**
   * Fetches a web page and returns a standardized Page object
   *
   * @param url - The URL of the page to fetch
   * @param options - Optional configuration for the fetch operation
   * @returns Promise resolving to a Page object
   */
  fetch(url: string, options?: FetchOptions): Promise<Page>;
}

/**
 * Options for simple HTTP adapter
 */
export interface SimpleAdapterOptions {
  adapter: 'simple';
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
}

/**
 * Options for DOM processing adapter
 */
export interface DomAdapterOptions {
  adapter: 'dom';
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
}

/**
 * Options for Crawlee headless browser adapter
 */
export interface CrawleeAdapterOptions {
  adapter: 'crawlee';
  /**
   * Default cache directory for storing fetched pages
   * @default '.cache/spider'
   */
  cacheDir?: string;
  /**
   * Whether to run browser in headless mode
   * @default true
   */
  headless?: boolean;
  /**
   * Custom user agent string
   */
  userAgent?: string;
}

/**
 * Discriminated union of all spider adapter options
 */
export type SpiderAdapterOptions =
  | SimpleAdapterOptions
  | DomAdapterOptions
  | CrawleeAdapterOptions;

// ============================================================================
// Harvester Types - Content Extraction Strategies
// ============================================================================

/**
 * Result from a harvest operation with metadata about the strategy used
 */
export interface HarvestResult {
  /** The final URL after any redirects */
  url: string;

  /** Raw HTML content */
  content: string;

  /** Extracted links with metadata */
  links: Link[];

  /** Harvester strategy that was used */
  strategy: HarvesterStrategy;

  /** Performance metrics */
  metrics: HarvestMetrics;

  /** Raw response data */
  raw: any;
}

/**
 * Information about which harvesting strategy was used
 */
export interface HarvesterStrategy {
  /** Type of harvester used */
  type: HarvesterType;

  /** Spider adapter used */
  spider: 'simple' | 'dom' | 'crawlee';

  /** Configuration used */
  config: Record<string, any>;

  /** Confidence score (0-1) of strategy effectiveness */
  confidence: number;
}

/**
 * Performance metrics from a harvest
 */
export interface HarvestMetrics {
  /** Total execution time in ms */
  duration: number;

  /** Number of links found */
  linkCount: number;

  /** Number of interactions performed (clicks, scrolls, etc) */
  interactionCount: number;

  /** Whether the harvester believes it found all content */
  complete: boolean;
}

/**
 * Types of harvesting strategies
 */
export type HarvesterType =
  | 'basic' // No interactions, just scrape
  | 'tree' // Expand hierarchical trees/accordions
  | 'ajax' // Wait for async loads
  | 'scroll' // Infinite scroll
  | 'pagination' // Multi-page navigation
  | 'tabs' // Tab switching
  | 'hybrid'; // Multiple strategies combined

/**
 * Base interface all harvesters must implement
 */
export interface IHarvester {
  /**
   * Harvest content from a URL
   */
  harvest(url: string, options?: HarvestOptions): Promise<HarvestResult>;

  /**
   * Get harvester type
   */
  getType(): HarvesterType;
}

/**
 * Options for harvest operations
 */
export interface HarvestOptions {
  /** Custom headers */
  headers?: Record<string, string>;

  /** Timeout in ms */
  timeout?: number;

  /** Use cache for fetched pages */
  cache?: boolean;

  /** Cache expiry time in ms */
  cacheExpiry?: number;

  /** Max time to spend harvesting in ms */
  maxDuration?: number;

  /** Max interactions to perform */
  maxInteractions?: number;
}

/**
 * Options for basic harvester
 */
export interface BasicHarvesterOptions {
  harvester: 'basic';

  /** Which spider to use */
  spider?: 'simple' | 'dom' | 'crawlee';

  /** Cache directory */
  cacheDir?: string;
}

/**
 * Options for tree harvester
 */
export interface TreeHarvesterOptions {
  harvester: 'tree';

  /** Cache directory */
  cacheDir?: string;

  /** Max iterations for tree expansion */
  maxIterations?: number;

  /** Delay between clicks in ms */
  clickDelay?: number;

  /** Custom tree node selectors */
  customSelectors?: string[];

  /** Handle exclusive expansion (one-at-a-time) */
  handleExclusive?: boolean;

  /** Whether to run browser in headless mode */
  headless?: boolean;

  /** Custom user agent string */
  userAgent?: string;
}

/**
 * Options for AJAX harvester
 */
export interface AjaxHarvesterOptions {
  harvester: 'ajax';

  /** Cache directory */
  cacheDir?: string;

  /** Max time to wait for content in ms */
  maxWaitTime?: number;

  /** How to detect completion */
  completionStrategy?: 'link-count' | 'network-idle' | 'custom-selector';

  /** Selector to wait for (if using custom-selector) */
  waitForSelector?: string;

  /** Whether to run browser in headless mode */
  headless?: boolean;

  /** Custom user agent string */
  userAgent?: string;
}

/**
 * Options for scroll harvester
 */
export interface ScrollHarvesterOptions {
  harvester: 'scroll';

  /** Cache directory */
  cacheDir?: string;

  /** Max scrolls to perform */
  maxScrolls?: number;

  /** Delay between scrolls in ms */
  scrollDelay?: number;

  /** How to detect no more content */
  endDetection?: 'link-count' | 'scroll-position' | 'sentinel';

  /** Sentinel selector (if using sentinel detection) */
  sentinelSelector?: string;

  /** Whether to run browser in headless mode */
  headless?: boolean;

  /** Custom user agent string */
  userAgent?: string;
}

/**
 * Options for pagination harvester
 */
export interface PaginationHarvesterOptions {
  harvester: 'pagination';

  /** Cache directory */
  cacheDir?: string;

  /** Max pages to crawl */
  maxPages?: number;

  /** Selector for next button */
  nextSelector?: string;

  /** Follow numbered page links */
  followPageNumbers?: boolean;

  /** Whether to run browser in headless mode */
  headless?: boolean;

  /** Custom user agent string */
  userAgent?: string;
}

/**
 * Discriminated union of all harvester options
 */
export type HarvesterOptions =
  | BasicHarvesterOptions
  | TreeHarvesterOptions
  | AjaxHarvesterOptions
  | ScrollHarvesterOptions
  | PaginationHarvesterOptions;
