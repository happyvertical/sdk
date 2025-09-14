/**
 * Sets rate limit for a specific domain
 *
 * @param domain - Domain to set limits for
 * @param limit - Maximum number of requests per interval
 * @param interval - Interval in milliseconds
 */
export declare function addRateLimit(domain: string, limit: number, interval: number): Promise<void>;
/**
 * Gets rate limit configuration for a domain
 *
 * @param domain - Domain to get limits for
 * @returns Rate limit configuration object with limit and interval properties
 */
export declare function getRateLimit(domain: string): Promise<{
    limit: number;
    interval: number;
}>;
/**
 * Fetches a URL and returns the response as text
 *
 * @param url - URL to fetch
 * @returns Promise resolving to the response body as a string
 */
export declare function fetchText(url: string): Promise<string>;
/**
 * Fetches a URL and returns the response as parsed JSON
 *
 * @param url - URL to fetch
 * @returns Promise resolving to the parsed JSON response
 */
export declare function fetchJSON(url: string): Promise<any>;
/**
 * Fetches a URL and returns the response as a Buffer
 *
 * @param url - URL to fetch
 * @returns Promise resolving to the response body as a Buffer
 */
export declare function fetchBuffer(url: string): Promise<Buffer>;
/**
 * Fetches a URL and saves the response to a file
 *
 * @param url - URL to fetch
 * @param filepath - Path to save the file to
 * @returns Promise that resolves when the file is saved
 */
export declare function fetchToFile(url: string, filepath: string): Promise<void>;
//# sourceMappingURL=fetch.d.ts.map