import { writeFile } from 'node:fs/promises';

/**
 * Rate limiter for controlling fetch request frequency by domain
 */
class RateLimiter {
  /**
   * Map of domains to their rate limit configurations
   */
  private domains: Map<
    string,
    {
      lastRequest: number;
      limit: number;
      interval: number;
      queue: number;
    }
  > = new Map();

  /**
   * Default maximum number of requests per interval
   */
  private defaultLimit = 6;
  
  /**
   * Default interval in milliseconds
   */
  private defaultInterval = 500;

  /**
   * Creates a new RateLimiter with default settings
   */
  constructor() {
    // Initialize with default settings
    this.domains.set('default', {
      lastRequest: 0,
      limit: this.defaultLimit,
      interval: this.defaultInterval,
      queue: 0,
    });
  }

  /**
   * Extracts the domain from a URL
   * 
   * @param url - URL to extract domain from
   * @returns Domain string or 'default' if the URL is invalid
   */
  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'default';
    }
  }

  /**
   * Waits until the next request can be made according to rate limits
   * 
   * @param url - URL to check rate limits for
   * @returns Promise that resolves when the request can proceed
   */
  async waitForNext(url: string): Promise<void> {
    const domain = this.getDomain(url);
    const now = Date.now();

    const domainConfig =
      this.domains.get(domain) || this.domains.get('default')!;

    // Wait if we're over the limit
    if (domainConfig.queue >= domainConfig.limit) {
      const timeToWait = Math.max(
        0,
        domainConfig.lastRequest + domainConfig.interval - now,
      );
      if (timeToWait > 0) {
        await new Promise((resolve) => setTimeout(resolve, timeToWait));
      }
      domainConfig.queue = 0;
    }

    domainConfig.lastRequest = now;
    domainConfig.queue++;
  }

  /**
   * Sets rate limit for a specific domain
   * 
   * @param domain - Domain to set limits for
   * @param limit - Maximum number of requests per interval
   * @param interval - Interval in milliseconds
   */
  setDomainLimit(domain: string, limit: number, interval: number) {
    this.domains.set(domain, {
      lastRequest: 0,
      limit,
      interval,
      queue: 0,
    });
  }

  /**
   * Gets rate limit configuration for a domain
   * 
   * @param domain - Domain to get limits for
   * @returns Rate limit configuration
   */
  getDomainLimit(domain: string) {
    return this.domains.get(domain) || this.domains.get('default')!;
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

/**
 * Sets rate limit for a specific domain
 * 
 * @param domain - Domain to set limits for
 * @param limit - Maximum number of requests per interval
 * @param interval - Interval in milliseconds
 */
export async function addRateLimit(
  domain: string,
  limit: number,
  interval: number,
) {
  rateLimiter.setDomainLimit(domain, limit, interval);
}

/**
 * Gets rate limit configuration for a domain
 * 
 * @param domain - Domain to get limits for
 * @returns Rate limit configuration object with limit and interval properties
 */
export async function getRateLimit(
  domain: string,
): Promise<{ limit: number; interval: number }> {
  const config = rateLimiter.getDomainLimit(domain);
  return {
    limit: config.limit,
    interval: config.interval,
  };
}

/**
 * Performs a fetch request with rate limiting
 * 
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Promise resolving to a Response object
 */
async function rateLimitedFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  await rateLimiter.waitForNext(url);
  return fetch(url, options);
}

/**
 * Fetches a URL and returns the response as text
 * 
 * @param url - URL to fetch
 * @returns Promise resolving to the response body as a string
 */
export async function fetchText(url: string): Promise<string> {
  const response = await rateLimitedFetch(url);
  return response.text();
}

/**
 * Fetches a URL and returns the response as parsed JSON
 * 
 * @param url - URL to fetch
 * @returns Promise resolving to the parsed JSON response
 */
export async function fetchJSON(url: string): Promise<any> {
  const response = await rateLimitedFetch(url);
  return response.json();
}

/**
 * Fetches a URL and returns the response as a Buffer
 * 
 * @param url - URL to fetch
 * @returns Promise resolving to the response body as a Buffer
 */
export async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await rateLimitedFetch(url);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Fetches a URL and saves the response to a file
 * 
 * @param url - URL to fetch
 * @param filepath - Path to save the file to
 * @returns Promise that resolves when the file is saved
 */
export async function fetchToFile(
  url: string,
  filepath: string,
): Promise<void> {
  const response = await rateLimitedFetch(url);
  const buffer = await response.arrayBuffer();
  await writeFile(filepath, Buffer.from(buffer));
}
