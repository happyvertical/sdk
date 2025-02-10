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

export function getCrawler() {}

interface CrawlResponse {
  task_id: string;
}

interface TaskStatus {
  status: string;
  [key: string]: any; // For additional fields in the response
}

interface ExtraParams {
  word_count_threshold?: number; // Min words per block
  only_text?: boolean; // Extract only text
  bypass_cache?: boolean; // Force fresh crawl
  process_iframes?: boolean; // Include iframe content
}

interface CrawlerParams {
  // Browser Configuration
  headless?: boolean;
  browser_type?: 'chromium' | 'firefox' | 'webkit';
  user_agent?: string;
  proxy?: string;

  // Performance & Behavior
  page_timeout?: number;
  verbose?: boolean;
  semaphore_count?: number;
  remove_overlay_elements?: boolean; // Remove popups

  // Anti-Detection Features
  simulate_user?: boolean;
  magic?: boolean;
  override_navigator?: boolean;

  // Session Management
  user_data_dir?: string;
  use_managed_browser?: boolean;
}

interface CrawlRequest {
  urls: string | string[];
  crawler_params?: CrawlerParams;
  extra?: ExtraParams;
  css_selector?: string; // CSS selector for targeting specific elements
}

class Crawler {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11235') {
    this.baseUrl = baseUrl;
  }

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

    const { task_id } = (await response.json()) as CrawlResponse;
    console.log(`Task ID: ${task_id}`);

    // Poll for result
    const startTime = Date.now();
    while (true) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Task ${task_id} timeout`);
      }

      const result = await fetch(`${this.baseUrl}/task/${task_id}`);
      const status = (await result.json()) as TaskStatus;

      if (status.status === 'completed') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
