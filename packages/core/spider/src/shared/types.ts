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
