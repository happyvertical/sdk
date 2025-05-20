# @have/spider: Web Crawling and Content Extraction Package

## Purpose and Responsibilities

The `@have/spider` package (formerly known as "web") provides tools for crawling websites, extracting content, and processing web data. It is designed to:

- Navigate and interact with web pages programmatically
- Extract structured content from HTML pages
- Convert web content into clean, readable formats
- Handle different content types and structures
- Support both simple requests and browser-based interactions

This package is particularly useful for AI agents that need to process web content for analysis, search, or knowledge extraction.

## Key APIs

### Basic Web Scraping

```typescript
import { scrapeUrl } from '@have/spider';

// Extract content from a URL
const content = await scrapeUrl('https://example.com/article');

// The result includes extracted text, metadata, and other useful information
console.log(content.title);       // Page title
console.log(content.text);        // Main content text
console.log(content.description); // Meta description
console.log(content.links);       // Array of links found on the page
```

### Browser-Based Crawling

```typescript
import { Browser } from '@have/spider';

// Initialize a browser instance
const browser = await Browser.create();

// Navigate to a page
const page = await browser.newPage('https://example.com');

// Wait for specific content to load
await page.waitForSelector('.content-loaded');

// Extract content after JavaScript execution
const content = await page.extractContent();

// Take a screenshot
await page.screenshot({ path: '/path/to/screenshot.png' });

// Close the browser when done
await browser.close();
```

### HTML Parsing with Cheerio

```typescript
import { parseHtml } from '@have/spider';

// Parse HTML content
const $ = parseHtml('<html><body><div class="content">Hello</div></body></html>');

// Extract data using Cheerio selectors
const text = $('.content').text();
const links = $('a').map((i, el) => $(el).attr('href')).get();
```

### Readability Processing

```typescript
import { makeReadable } from '@have/spider';

// Convert HTML to a clean, readable format
const article = await makeReadable('<html>complex page html...</html>');

// Access the cleaned content
console.log(article.title);   // Extracted title
console.log(article.content); // Clean HTML content
console.log(article.textContent); // Plain text content
```

### Recursive Crawling

```typescript
import { crawlSite } from '@have/spider';

// Crawl a site with options
const results = await crawlSite('https://example.com', {
  maxDepth: 2,
  maxPages: 50,
  include: [/\/blog\//],
  exclude: [/\/author\//],
  delay: 1000
});

// Process the results
for (const page of results) {
  console.log(page.url, page.title, page.text);
}
```

## Dependencies

The package has the following dependencies:

- `@have/files`: For file system operations (saving content, screenshots)
- `@have/utils`: For utility functions
- `@mozilla/readability`: For extracting readable content from web pages
- `playwright`: For browser automation and JavaScript-rendered content
- `cheerio`: For HTML parsing and manipulation

## Development Guidelines

### Web Scraping Ethics and Performance

- Respect `robots.txt` directives
- Implement rate limiting to avoid overwhelming servers
- Use conditional requests with appropriate headers (If-Modified-Since)
- Cache results when appropriate
- Add proper user agent identification

### Browser Management

- Reuse browser instances when possible
- Close browser instances when done to prevent resource leaks
- Use headless mode for production environments
- Handle network errors and timeouts gracefully

### Content Extraction

- Normalize extracted content (whitespace, encoding)
- Preserve important metadata (title, author, date)
- Remove boilerplate elements (ads, navigation)
- Convert relative URLs to absolute URLs
- Handle different content types appropriately

### Testing

The package includes tests for verifying scraping behavior:

```bash
pnpm test        # Run tests once
pnpm test:watch  # Run tests in watch mode
```

Use mock servers or recorded responses for testing to avoid external dependencies.

### Building

Build the package with:

```bash
pnpm build       # Build once
pnpm build:watch # Build in watch mode
```

### Best Practices

- Implement proper error handling for network issues
- Use selectors that are resistant to minor HTML changes
- Cache responses to reduce load on target servers
- Set appropriate timeouts for page loading
- Clean up resources (especially browser instances) after use

This package provides the web interaction capabilities needed by AI agents to process online content effectively and responsibly.