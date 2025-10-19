import { getCache } from "@have/cache";
import { loadEnvConfig, ValidationError, isUrl, NetworkError } from "@have/utils";
import * as cheerio from "cheerio";
import { request } from "undici";
class SimpleAdapter {
  cache;
  cacheDir;
  constructor(options) {
    this.cacheDir = options.cacheDir || ".cache/spider";
  }
  /**
   * Initialize the cache adapter if needed
   */
  async initCache() {
    if (!this.cache) {
      this.cache = await getCache({
        provider: "file",
        cacheDir: this.cacheDir
      });
    }
    return this.cache;
  }
  /**
   * Generate a cache key from a URL
   */
  getCacheKey(url) {
    return `simple:${encodeURIComponent(url)}`;
  }
  /**
   * Extract links from HTML using cheerio with metadata
   */
  extractLinks(html) {
    const $ = cheerio.load(html);
    const links = [];
    $("a").each((_, element) => {
      const $link = $(element);
      const href = $link.attr("href");
      if (href) {
        const classes = $link.attr("class");
        links.push({
          href,
          text: $link.text().trim() || "",
          title: $link.attr("title"),
          ariaLabel: $link.attr("aria-label"),
          rel: $link.attr("rel"),
          target: $link.attr("target"),
          classes: classes ? classes.split(" ").filter((c) => c.trim()) : void 0
        });
      }
    });
    return links;
  }
  /**
   * Fetches a web page and returns a standardized Page object
   */
  async fetch(url, options) {
    const config = loadEnvConfig(options || {}, {
      packageName: "spider",
      schema: {
        timeout: "number",
        maxRequests: "number",
        userAgent: "string"
      }
    });
    const {
      headers = {},
      timeout = 3e4,
      cache = true,
      cacheExpiry = 3e5,
      // 5 minutes default
      userAgent
    } = config;
    if (!url || typeof url !== "string") {
      throw new ValidationError("URL is required and must be a string", {
        url
      });
    }
    if (!isUrl(url)) {
      throw new ValidationError("Invalid URL format", { url });
    }
    if (cache) {
      const cacheAdapter = await this.initCache();
      const cacheKey = this.getCacheKey(url);
      const cached = await cacheAdapter.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    try {
      const defaultHeaders = {
        "User-Agent": userAgent || "Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        // Note: undici automatically handles gzip/deflate/br decompression
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        ...headers
      };
      const response = await request(url, {
        method: "GET",
        headers: defaultHeaders,
        headersTimeout: timeout,
        bodyTimeout: timeout
      });
      if (response.statusCode >= 400) {
        throw new NetworkError(
          `HTTP ${response.statusCode}: ${response.headers.status || "Request failed"}`,
          { url, statusCode: response.statusCode, headers: response.headers }
        );
      }
      const content = await response.body.text();
      const links = this.extractLinks(content);
      const page = {
        url,
        content,
        links,
        raw: {
          statusCode: response.statusCode,
          headers: response.headers
        }
      };
      if (cache) {
        const cacheAdapter = await this.initCache();
        const cacheKey = this.getCacheKey(url);
        const ttl = Math.floor(cacheExpiry / 1e3);
        await cacheAdapter.set(cacheKey, page, ttl);
      }
      return page;
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ValidationError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new NetworkError(`Failed to fetch page: ${error.message}`, {
          url,
          error: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }
}
export {
  SimpleAdapter
};
//# sourceMappingURL=simple-Db2j4w2d.js.map
