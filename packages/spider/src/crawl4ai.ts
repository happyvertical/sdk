// request = {
//   "urls": "https://example.com",
//   "crawler_params": {
//       # Browser Configuration
//       "headless": True,                    # Run in headless mode
//       "browser_type": "chromium",          # chromium/firefox/webkit
//       "user_agent": "custom-agent",        # Custom user agent
//       "proxy": "http://proxy:8080",        # Proxy configuration

//       # Performance & Behavior
//       "page_timeout": 30000,               # Page load timeout (ms)
//       "verbose": True,                     # Enable detailed logging
//       "semaphore_count": 5,               # Concurrent request limit

//       # Anti-Detection Features
//       "simulate_user": True,               # Simulate human behavior
//       "magic": True,                       # Advanced anti-detection
//       "override_navigator": True,          # Override navigator properties

//       # Session Management
//       "user_data_dir": "./browser-data",   # Browser profile location
//       "use_managed_browser": True,         # Use persistent browser
//   }
// }

import { getLogger, NetworkError, TimeoutError } from '@have/utils';

/**
 * Factory function to create a Crawler instance
 * 
 * @returns A new Crawler instance
 */
export function getCrawler() {}

/**
 * Response from the crawler service after submitting a crawl request
 */
interface CrawlResponse {
  /**
   * Unique identifier for the crawl task
   */
  task_id: string;
}

/**
 * Status of a crawler task
 */
interface TaskStatus {
  /**
   * Current status of the task (e.g., "pending", "running", "completed")
   */
  status: string;
  
  /**
   * Additional fields in the response
   */
  [key: string]: any;
}

/**
 * Additional parameters for controlling content extraction
 */
interface ExtraParams {
  /**
   * Minimum number of words required for a text block to be included
   */
  word_count_threshold?: number;
  
  /**
   * Whether to extract only text content (no HTML)
   */
  only_text?: boolean;
  
  /**
   * Whether to bypass cache and force a fresh crawl
   */
  bypass_cache?: boolean;
  
  /**
   * Whether to process content within iframes
   */
  process_iframes?: boolean;
}

/**
 * Parameters for configuring the browser crawler
 */
interface CrawlerParams {
  /**
   * Browser Configuration
   */
  
  /**
   * Whether to run in headless mode
   */
  headless?: boolean;
  
  /**
   * Type of browser to use
   */
  browser_type?: 'chromium' | 'firefox' | 'webkit';
  
  /**
   * Custom user agent string
   */
  user_agent?: string;
  
  /**
   * Proxy configuration URL
   */
  proxy?: string;

  /**
   * Performance & Behavior
   */
  
  /**
   * Page load timeout in milliseconds
   */
  page_timeout?: number;
  
  /**
   * Whether to enable detailed logging
   */
  verbose?: boolean;
  
  /**
   * Maximum number of concurrent requests
   */
  semaphore_count?: number;
  
  /**
   * Whether to remove overlay elements like popups
   */
  remove_overlay_elements?: boolean;

  /**
   * Anti-Detection Features
   */
  
  /**
   * Whether to simulate human behavior
   */
  simulate_user?: boolean;
  
  /**
   * Whether to enable advanced anti-detection features
   */
  magic?: boolean;
  
  /**
   * Whether to override navigator properties
   */
  override_navigator?: boolean;

  /**
   * Session Management
   */
  
  /**
   * Path to browser profile directory
   */
  user_data_dir?: string;
  
  /**
   * Whether to use a persistent browser instance
   */
  use_managed_browser?: boolean;
}

/**
 * Request data for initiating a crawl
 */
interface CrawlRequest {
  /**
   * URL or array of URLs to crawl
   */
  urls: string | string[];
  
  /**
   * Browser and crawler configuration parameters
   */
  crawler_params?: CrawlerParams;
  
  /**
   * Additional parameters for content extraction
   */
  extra?: ExtraParams;
  
  /**
   * CSS selector for targeting specific elements
   */
  css_selector?: string;
}

/**
 * Client for interacting with the crawler service
 */
class Crawler {
  /**
   * Base URL of the crawler service
   */
  private baseUrl: string;

  /**
   * Creates a new Crawler instance
   * 
   * @param baseUrl - Base URL of the crawler service
   */
  constructor(baseUrl: string = 'http://localhost:11235') {
    this.baseUrl = baseUrl;
  }

  /**
   * Submits a crawl request and waits for its completion
   * 
   * @param requestData - Crawl request configuration
   * @param timeout - Maximum time to wait for completion in milliseconds
   * @returns Promise resolving to the task status with crawl results
   * @throws {TimeoutError} if the task times out
   * @throws {NetworkError} if there are network-related failures
   */
  async submitAndWait(
    requestData: CrawlRequest,
    timeout: number = 300000,
  ): Promise<TaskStatus> {
    // Submit crawl job
    const response = await fetch(`${this.baseUrl}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new NetworkError(
        `Failed to submit crawl request: ${response.status} ${response.statusText}`,
        { 
          url: `${this.baseUrl}/crawl`,
          status: response.status,
          statusText: response.statusText,
          requestData 
        }
      );
    }

    const responseData = await response.json() as CrawlResponse;
    if (!responseData.task_id) {
      throw new NetworkError(
        'Invalid response: missing task_id',
        { responseData, url: `${this.baseUrl}/crawl` }
      );
    }

    const { task_id } = responseData;
    getLogger().info(`Crawler task submitted`, { taskId: task_id, urls: requestData.urls });

    // Poll for result
    const startTime = Date.now();
    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new TimeoutError(
          `Crawler task timed out`,
          { 
            taskId: task_id, 
            timeout, 
            elapsedTime: Date.now() - startTime 
          }
        );
      }

      const result = await fetch(`${this.baseUrl}/task/${task_id}`);
      
      if (!result.ok) {
        throw new NetworkError(
          `Failed to fetch task status: ${result.status} ${result.statusText}`,
          { 
            taskId: task_id,
            url: `${this.baseUrl}/task/${task_id}`,
            status: result.status,
            statusText: result.statusText 
          }
        );
      }

      const status = (await result.json()) as TaskStatus;

      if (status.status === 'completed') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
