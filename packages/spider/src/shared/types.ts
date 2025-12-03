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
   * @env HAVE_SPIDER_TIMEOUT
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

  /**
   * Custom user agent string
   * @env HAVE_SPIDER_USER_AGENT
   */
  userAgent?: string;

  /**
   * Maximum number of requests allowed
   * @env HAVE_SPIDER_MAX_REQUESTS
   */
  maxRequests?: number;
}

/**
 * Interface that all spider adapters must implement
 */
export interface SpiderAdapter {
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
 * Cache provider configuration
 * Allows selecting between file cache (local dev) and S3 cache (CI)
 */
export interface CacheProviderConfig {
  /** Provider type: 'file' for local, 's3' for cloud persistence */
  provider: 'file' | 's3';
  /** S3 bucket name (required if provider is 's3') */
  bucket?: string;
  /** S3 key prefix (default: 'cache/') */
  prefix?: string;
  /** AWS region (default: from AWS_REGION env var) */
  region?: string;
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
  /**
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
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
  /**
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
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
   * Cache provider configuration (optional, defaults to file)
   * Use this to enable S3 caching in CI environments
   */
  cacheProvider?: CacheProviderConfig;
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
// Scraper Types - Content Extraction Strategies
// ============================================================================

/**
 * Result from a scrape operation with metadata about the strategy used
 */
export interface ScrapeResult {
  /** The final URL after any redirects */
  url: string;

  /** Raw HTML content */
  content: string;

  /** Extracted links with metadata */
  links: Link[];

  /** Scraper strategy that was used */
  strategy: ScraperStrategy;

  /** Performance metrics */
  metrics: ScrapeMetrics;

  /** Raw response data */
  raw: any;
}

/**
 * Information about which scraping strategy was used
 */
export interface ScraperStrategy {
  /** Type of scraper used */
  type: ScraperType;

  /** Spider adapter used */
  spider: 'simple' | 'dom' | 'crawlee';

  /** Configuration used */
  config: Record<string, any>;

  /** Confidence score (0-1) of strategy effectiveness */
  confidence: number;
}

/**
 * Performance metrics from a scrape
 */
export interface ScrapeMetrics {
  /** Total execution time in ms */
  duration: number;

  /** Number of links found */
  linkCount: number;

  /** Number of interactions performed (clicks, scrolls, etc) */
  interactionCount: number;

  /** Whether the scraper believes it found all content */
  complete: boolean;
}

/**
 * Types of scraping strategies
 */
export type ScraperType =
  | 'basic' // No interactions, just scrape
  | 'tree' // Expand hierarchical trees/accordions
  | 'ajax' // Wait for async loads
  | 'scroll' // Infinite scroll
  | 'pagination' // Multi-page navigation
  | 'tabs' // Tab switching
  | 'hybrid'; // Multiple strategies combined

/**
 * Base interface all scrapers must implement
 */
export interface Scraper {
  /**
   * Scrape content from a URL
   */
  scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;

  /**
   * Get scraper type
   */
  getType(): ScraperType;
}

/**
 * Options for scrape operations
 */
export interface ScrapeOptions {
  /** Custom headers */
  headers?: Record<string, string>;

  /** Timeout in ms */
  timeout?: number;

  /** Use cache for fetched pages */
  cache?: boolean;

  /** Cache expiry time in ms */
  cacheExpiry?: number;

  /** Max time to spend scraping in ms */
  maxDuration?: number;

  /** Max interactions to perform */
  maxInteractions?: number;
}

/**
 * Options for basic scraper
 */
export interface BasicScraperOptions {
  scraper: 'basic';

  /** Which spider to use */
  spider?: 'simple' | 'dom' | 'crawlee';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;
}

/**
 * Options for tree scraper
 */
export interface TreeScraperOptions {
  scraper: 'tree';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;

  /** Max iterations for tree expansion */
  maxIterations?: number;

  /** Delay between clicks in ms */
  clickDelay?: number;

  /** Rate limit delay between page loads in ms (default: 1000ms) */
  rateLimit?: number;

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
 * Options for AJAX scraper
 */
export interface AjaxScraperOptions {
  scraper: 'ajax';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;

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
 * Options for scroll scraper
 */
export interface ScrollScraperOptions {
  scraper: 'scroll';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;

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
 * Options for pagination scraper
 */
export interface PaginationScraperOptions {
  scraper: 'pagination';

  /** Cache directory */
  cacheDir?: string;

  /** Cache provider configuration (optional, defaults to file) */
  cacheProvider?: CacheProviderConfig;

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
 * Discriminated union of all scraper options
 */
export type ScraperOptions =
  | BasicScraperOptions
  | TreeScraperOptions
  | AjaxScraperOptions
  | ScrollScraperOptions
  | PaginationScraperOptions;
