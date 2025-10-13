import { writeFile } from "node:fs/promises";
class RateLimiter {
  /**
   * Map of domains to their rate limit configurations
   * Each domain tracks: lastRequest time, request limit, interval, and current queue size
   */
  domains = /* @__PURE__ */ new Map();
  /**
   * Default maximum number of requests per interval
   * Applied to domains that don't have specific limits configured
   */
  defaultLimit = 6;
  /**
   * Default interval in milliseconds (500ms)
   * Time window for the request limit enforcement
   */
  defaultInterval = 500;
  /**
   * Creates a new RateLimiter with default settings
   * Initializes with a 'default' domain configuration used as fallback
   */
  constructor() {
    this.domains.set("default", {
      lastRequest: 0,
      limit: this.defaultLimit,
      interval: this.defaultInterval,
      queue: 0
    });
  }
  /**
   * Extracts the domain from a URL for rate limiting purposes
   *
   * @param url - URL to extract domain from
   * @returns Domain string (hostname) or 'default' if the URL is invalid
   *
   * @internal
   */
  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "default";
    }
  }
  /**
   * Waits until the next request can be made according to rate limits
   *
   * This method implements the core rate limiting logic. It checks if the
   * current request would exceed the domain's rate limit and delays if necessary.
   *
   * @param url - URL to check rate limits for (domain extracted automatically)
   * @returns Promise that resolves when the request can proceed safely
   *
   * @internal
   */
  async waitForNext(url) {
    const domain = this.getDomain(url);
    const now = Date.now();
    const domainConfig = this.domains.get(domain) || this.domains.get("default");
    if (domainConfig.queue >= domainConfig.limit) {
      const timeToWait = Math.max(
        0,
        domainConfig.lastRequest + domainConfig.interval - now
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
  setDomainLimit(domain, limit, interval) {
    this.domains.set(domain, {
      lastRequest: 0,
      limit,
      interval,
      queue: 0
    });
  }
  /**
   * Gets rate limit configuration for a domain
   *
   * @param domain - Domain to get limits for
   * @returns Rate limit configuration
   */
  getDomainLimit(domain) {
    return this.domains.get(domain) || this.domains.get("default");
  }
}
const rateLimiter = new RateLimiter();
async function addRateLimit(domain, limit, interval) {
  rateLimiter.setDomainLimit(domain, limit, interval);
}
async function getRateLimit(domain) {
  const config = rateLimiter.getDomainLimit(domain);
  return {
    limit: config.limit,
    interval: config.interval
  };
}
async function rateLimitedFetch(url, options) {
  await rateLimiter.waitForNext(url);
  return fetch(url, options);
}
async function fetchText(url) {
  const response = await rateLimitedFetch(url);
  return response.text();
}
async function fetchJSON(url) {
  const response = await rateLimitedFetch(url);
  return response.json();
}
async function fetchBuffer(url) {
  const response = await rateLimitedFetch(url);
  return Buffer.from(await response.arrayBuffer());
}
async function fetchToFile(url, filepath) {
  const response = await rateLimitedFetch(url);
  const buffer = await response.arrayBuffer();
  await writeFile(filepath, Buffer.from(buffer));
}
export {
  addRateLimit,
  fetchBuffer,
  fetchJSON,
  fetchText,
  fetchToFile,
  getRateLimit
};
//# sourceMappingURL=index5.js.map
