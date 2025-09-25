# @have/spider

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Lightweight web scraping and content extraction tools for the HAVE SDK.

## Overview

The `@have/spider` package provides fast, lightweight tools for web scraping and HTML content extraction. It uses high-performance libraries like undici for HTTP requests, cheerio for HTML parsing, and happy-dom for DOM manipulation, offering efficient server-side web content processing without the overhead of a full browser.

## Features

- Fast web page fetching with undici HTTP client
- HTML parsing and manipulation with cheerio (jQuery-like API)
- Lightweight DOM processing with happy-dom
- Built-in intelligent caching system
- Link extraction from web pages
- Two fetching modes: simple HTTP and DOM-processed
- Comprehensive error handling with specific error types
- TypeScript support with full type definitions

## Installation

```bash
# Install with bun (recommended)
bun add @have/spider

# Or with npm
npm install @have/spider
```

## Usage

### Fetching Web Page Content

```typescript
import { fetchPageSource } from '@have/spider';

// Simple fast fetch (recommended for most use cases)
const html = await fetchPageSource({
  url: 'https://example.com/article',
  cheap: true,        // Use fast HTTP fetch
  cache: true,        // Enable caching
  cacheExpiry: 300000, // 5 minutes cache
  timeout: 30000      // 30 second timeout
});

// DOM-processed fetch for complex HTML
const processedHtml = await fetchPageSource({
  url: 'https://example.com/complex-page',
  cheap: false,       // Use DOM processing with happy-dom
  headers: {
    'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot)'
  }
});
```

### Parsing HTML and Extracting Links

```typescript
import { parseIndexSource } from '@have/spider';
import * as cheerio from 'cheerio';

// Extract all links from a page
const html = await fetchPageSource({ url: 'https://example.com', cheap: true });
const links = await parseIndexSource(html);
console.log(links); // ['/page1.html', '/page2.html', 'https://external.com']

// Use cheerio for advanced HTML parsing
const $ = cheerio.load(html);
const title = $('title').text();
const articles = $('.article').map((i, el) => ({
  title: $(el).find('h2').text(),
  link: $(el).find('a').attr('href'),
  summary: $(el).find('.summary').text()
})).get();
```

### DOM Manipulation

```typescript
import { createWindow, processHtml } from '@have/spider';

// Create a happy-dom window for manipulation
const window = createWindow();
const document = window.document;

document.body.innerHTML = '<div id="content">Hello World</div>';
const contentDiv = document.getElementById('content');
console.log(contentDiv?.textContent); // "Hello World"

// Process and normalize HTML
const malformedHtml = '<div><p>Unclosed paragraph<div>Nested incorrectly</div>';
const cleanHtml = await processHtml(malformedHtml);
console.log(cleanHtml); // Properly structured HTML
```

## API Reference

### Core Functions

#### `fetchPageSource(options: FetchPageSourceOptions): Promise<string>`
Fetches HTML source from a web page with caching support.

**Options:**
- `url: string` - The URL to fetch (required)
- `cheap: boolean` - Use simple HTTP fetch (true) or DOM processing (false)
- `cache?: boolean` - Enable caching (default: true)
- `cacheExpiry?: number` - Cache expiry in milliseconds (default: 300000)
- `headers?: Record<string, string>` - Custom HTTP headers
- `timeout?: number` - Request timeout in milliseconds (default: 30000)

#### `parseIndexSource(html: string): Promise<string[]>`
Extracts all href attributes from anchor tags in HTML.

#### `createWindow(): Window`
Creates a new happy-dom Window instance for DOM manipulation.

#### `processHtml(html: string): Promise<string>`
Processes HTML through happy-dom to normalize structure and fix malformed content.

### Error Types

- `ValidationError` - Thrown for invalid URLs or parameters
- `NetworkError` - Thrown for HTTP failures, timeouts, connectivity issues
- `ParsingError` - Thrown for HTML processing failures

## Performance Characteristics

### Fetching Modes

**Cheap Mode (`cheap: true`)**
- Uses undici HTTP client directly
- Fastest performance for simple HTML extraction
- Minimal memory usage
- No DOM processing overhead
- Best for content extraction with cheerio

**DOM Mode (`cheap: false`)**
- Processes HTML through happy-dom
- Handles complex HTML structures
- Normalizes malformed HTML
- Higher memory usage and slower performance
- Best for HTML that needs DOM manipulation

### Caching Strategy

- Automatic response caching based on URL and fetch mode
- Separate cache files for cheap vs DOM-processed requests
- Configurable cache expiry (default 5 minutes)
- Cache files stored using @have/files in structured directories
- Cache bypass available via `cache: false` option

## Dependencies

- **@have/files** - File system operations and caching
- **@have/utils** - Utility functions, logging, and error handling
- **cheerio** - Server-side jQuery implementation for HTML parsing
- **happy-dom** - Lightweight DOM implementation for HTML processing
- **undici** - High-performance HTTP client for Node.js

## Integration Examples

### Content Extraction for AI Processing

```typescript
import { fetchPageSource } from '@have/spider';
import * as cheerio from 'cheerio';

async function extractArticleContent(url: string) {
  // Fast fetch for AI content processing
  const html = await fetchPageSource({ url, cheap: true });
  const $ = cheerio.load(html);

  return {
    title: $('h1, .title, [data-testid="headline"]').first().text().trim(),
    content: $('article, main, .content, .post-content').text().trim(),
    author: $('[rel="author"], .author, .byline').first().text().trim(),
    publishDate: $('time, .date, .published').first().attr('datetime') ||
                 $('time, .date, .published').first().text().trim()
  };
}
```

### Error Handling with Fallbacks

```typescript
import { fetchPageSource, NetworkError, ParsingError } from '@have/spider';

async function robustFetch(url: string) {
  try {
    // Try DOM processing first for best quality
    return await fetchPageSource({ url, cheap: false, timeout: 15000 });
  } catch (error) {
    if (error instanceof NetworkError || error instanceof ParsingError) {
      // Fall back to simple fetch
      try {
        return await fetchPageSource({ url, cheap: true, timeout: 10000 });
      } catch (fallbackError) {
        console.error(`Failed to fetch ${url}:`, fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}
```

## Best Practices

### Ethical Web Scraping

- Always respect robots.txt files
- Use meaningful User-Agent strings that identify your application
- Implement appropriate delays between requests to avoid overloading servers
- Cache responses to minimize redundant requests
- Handle HTTP error responses gracefully
- Consider rate limiting for crawling multiple pages

### Performance Optimization

- Use `cheap: true` for simple content extraction when DOM processing isn't needed
- Leverage built-in caching to reduce network overhead and improve response times
- Set appropriate timeouts to prevent hanging requests
- Use cheerio for complex HTML parsing and extraction tasks
- Process content in batches when handling multiple URLs

### Error Resilience

- Always handle ValidationError for invalid URLs or parameters
- Implement retry logic with exponential backoff for NetworkError
- Use fallback strategies (cheap mode) when DOM processing fails
- Validate extracted content for completeness before processing

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.