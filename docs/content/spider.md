---
id: spider
title: "@happyvertical/spider: Web Crawling and Content Extraction"
sidebar_label: "@happyvertical/spider"
sidebar_position: 9
---

# @happyvertical/spider

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Web scraping and content extraction with multiple adapters for different use cases.

## Overview

The `@happyvertical/spider` package provides a standardized interface for fetching and parsing web content through multiple adapters:

- **Simple**: Fast HTTP requests with cheerio parsing (best for static content)
- **DOM**: HTML processing with happy-dom for complex pages
- **Crawlee**: Full browser automation with Playwright (best for dynamic/JavaScript-heavy content)

All adapters implement the same `ISpiderAdapter` interface and return a standardized `Page` object, making it easy to switch between adapters based on your needs.

## Features

- **Provider Pattern**: Choose the right adapter for your use case
- **Standardized Interface**: All adapters implement `ISpiderAdapter`
- **Built-in Caching**: Automatic response caching with configurable expiry via `@happyvertical/cache`
- **Navigation Expansion**: Crawlee adapter automatically clicks accordions/expandable elements to discover hidden links
- **Link Extraction**: All adapters extract and return page links
- **Error Handling**: Comprehensive error types (`ValidationError`, `NetworkError`)
- **TypeScript Support**: Full type definitions for all APIs

## Installation

```bash
# Install with pnpm (recommended)
pnpm add @happyvertical/spider

# Or with npm
npm install @happyvertical/spider

# Or with bun
bun add @happyvertical/spider
```

## Quick Start

```typescript
import { getSpider } from '@happyvertical/spider';

// Create a spider adapter
const spider = await getSpider({ adapter: 'simple' });

// Fetch a page
const page = await spider.fetch('https://example.com');

console.log(page.url);      // Final URL after redirects
console.log(page.content);  // HTML content
console.log(page.links);    // Extracted links
```

## Adapters

### Simple Adapter (Fast HTTP)

Best for static HTML content where speed is critical. Uses undici for HTTP requests and cheerio for parsing.

```typescript
const spider = await getSpider({
  adapter: 'simple',
  cacheDir: '.cache/spider', // Optional: custom cache directory
});

const page = await spider.fetch('https://example.com/article', {
  headers: {
    'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot)',
  },
  timeout: 30000,      // 30 second timeout
  cache: true,         // Enable caching
  cacheExpiry: 300000, // 5 minutes cache expiry
});
```

**When to use:**
- Static HTML content
- Fast content extraction needed
- Minimal resource usage required
- Content doesn't rely on JavaScript

### DOM Adapter (happy-dom Processing)

Best for complex HTML that needs normalization but doesn't require a full browser.

```typescript
const spider = await getSpider({
  adapter: 'dom',
  cacheDir: '.cache/spider',
});

const page = await spider.fetch('https://example.com/complex', {
  cache: true,
  cacheExpiry: 600000, // 10 minutes
});
```

**When to use:**
- Malformed HTML that needs normalization
- Complex HTML structures
- DOM manipulation needed
- Still want better performance than full browser

### Crawlee Adapter (Playwright Browser Automation)

Best for JavaScript-heavy pages with dynamic content, AJAX loading, or expandable navigation elements.

```typescript
const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,                                    // Run in headless mode
  userAgent: 'MyBot/1.0 (+https://mysite.com/bot)', // Custom user agent
  cacheDir: '.cache/spider',
});

const page = await spider.fetch('https://example.com/dynamic', {
  timeout: 60000, // 60 seconds for slow sites
  cache: true,
});
```

**When to use:**
- JavaScript-rendered content
- AJAX/dynamic loading
- Pages with accordion/expandable navigation
- Need to interact with page elements
- PDF/document links hidden in collapsed sections

**Navigation Expansion**: The Crawlee adapter automatically:
- Waits for page to be fully loaded (networkidle state)
- Clicks expandable elements (accordions, dropdowns, `<details>` tags)
- Extracts links after each expansion iteration
- Handles `[aria-expanded="false"]`, `.accordion-*`, `<summary>`, etc.
- Runs up to 3 expansion iterations to discover hidden content

## API Reference

### Factory Function

#### `getSpider(options: SpiderAdapterOptions): Promise<ISpiderAdapter>`

Creates a spider adapter instance based on the provided options.

**Parameters:**
- `options`: Configuration object with discriminated union type
  - `adapter`: `'simple' | 'dom' | 'crawlee'` (required)
  - `cacheDir`: Custom cache directory (optional, default: `.cache/spider`)
  - `headless`: Browser headless mode - Crawlee only (optional, default: `true`)
  - `userAgent`: Custom user agent - Crawlee only (optional)

**Returns:** Promise resolving to `ISpiderAdapter` instance

### Adapter Interface

All adapters implement the `ISpiderAdapter` interface:

```typescript
interface ISpiderAdapter {
  fetch(url: string, options?: FetchOptions): Promise<Page>;
}
```

### Fetch Options

```typescript
interface FetchOptions {
  headers?: Record<string, string>; // Custom HTTP headers
  timeout?: number;                 // Request timeout in ms (default: 30000)
  cache?: boolean;                  // Enable caching (default: true)
  cacheExpiry?: number;             // Cache expiry in ms (default: 300000)
  userAgent?: string;               // Custom user agent string
  maxRequests?: number;             // Maximum number of requests allowed
}
```

### Environment Variable Configuration

The spider package supports configuration via environment variables using the `HAVE_SPIDER_*` pattern:

```bash
# Set timeout (milliseconds)
export HAVE_SPIDER_TIMEOUT=60000

# Set custom user agent
export HAVE_SPIDER_USER_AGENT="MyBot/1.0 (+https://mysite.com/bot)"

# Set maximum requests limit
export HAVE_SPIDER_MAX_REQUESTS=100
```

**Environment variables are merged with user options**, with user-provided values taking precedence:

```typescript
import { getSpider } from '@happyvertical/spider';

// Set environment variable
process.env.HAVE_SPIDER_TIMEOUT = '45000';
process.env.HAVE_SPIDER_USER_AGENT = 'EnvBot/1.0';

const spider = await getSpider({ adapter: 'simple' });

// Uses env var timeout (45000ms) and user agent
await spider.fetch(url);

// User options override env vars
await spider.fetch(url, {
  timeout: 30000, // This takes precedence over env var
});
```

**Supported Environment Variables:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `HAVE_SPIDER_TIMEOUT` | number | 30000 | Request timeout in milliseconds |
| `HAVE_SPIDER_USER_AGENT` | string | (see below) | Custom user agent string |
| `HAVE_SPIDER_MAX_REQUESTS` | number | unlimited | Maximum number of requests |

**Default User Agent** (when not set):
```
Mozilla/5.0 (compatible; HappyVertical Spider/2.0; +https://happyvertical.com/bot)
```

### Page Object

All adapters return a standardized `Page` object:

```typescript
interface Page {
  url: string;      // Final URL after redirects
  content: string;  // Full HTML content
  links: string[];  // Extracted links from page
  raw: any;         // Adapter-specific raw response data
}
```

## Usage Examples

### Content Extraction with Simple Adapter

```typescript
import { getSpider } from '@happyvertical/spider';
import * as cheerio from 'cheerio';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://news.example.com/article');

// Parse with cheerio
const $ = cheerio.load(page.content);

const article = {
  title: $('h1').first().text().trim(),
  content: $('article').text().trim(),
  author: $('.author').first().text().trim(),
  publishDate: $('time').attr('datetime'),
};

console.log(article);
```

### PDF Discovery with Crawlee Adapter

Real-world example: Extracting PDF links from a town council website with accordion navigation.

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,
  cacheDir: '.cache/council-pdfs',
});

const page = await spider.fetch(
  'https://townofbentley.ca/town-office/council/meetings-agendas/',
  {
    timeout: 60000,  // 60 seconds for slow sites
    cache: true,
    cacheExpiry: 3600000, // 1 hour
  },
);

// Filter PDF links
const pdfLinks = page.links.filter(link =>
  link.toLowerCase().endsWith('.pdf')
);

console.log(`Found ${pdfLinks.length} PDF documents`);
pdfLinks.forEach(link => console.log(link));
```

**Results from Bentley Town integration test:**
- Successfully extracts PDF links from accordion-based navigation
- Discovers 20+ meeting agendas and minutes (hidden until accordion is expanded)
- Cache provides 10x+ speedup on subsequent fetches

### Fallback Strategy

Use multiple adapters with fallback logic for resilience:

```typescript
import { getSpider } from '@happyvertical/spider';

async function robustFetch(url: string) {
  // Try Crawlee first for best quality
  try {
    const spider = await getSpider({ adapter: 'crawlee' });
    return await spider.fetch(url, { timeout: 30000 });
  } catch (error) {
    console.warn('Crawlee failed, falling back to simple adapter');

    // Fallback to simple adapter
    const spider = await getSpider({ adapter: 'simple' });
    return await spider.fetch(url, { timeout: 15000 });
  }
}

const page = await robustFetch('https://example.com');
```

### Batch Processing with Caching

```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({
  adapter: 'simple',
  cacheDir: '.cache/batch-spider',
});

const urls = [
  'https://example.com/page1',
  'https://example.com/page2',
  'https://example.com/page3',
];

// Parallel fetch with caching
const pages = await Promise.all(
  urls.map(url => spider.fetch(url, {
    cache: true,
    cacheExpiry: 600000, // 10 minutes
  }))
);

// Process all pages
pages.forEach(page => {
  console.log(`${page.url}: ${page.links.length} links found`);
});
```

## Error Handling

The package uses standardized error types from `@happyvertical/utils`:

```typescript
import { getSpider, ValidationError, NetworkError } from '@happyvertical/spider';

const spider = await getSpider({ adapter: 'simple' });

try {
  const page = await spider.fetch('https://example.com');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid URL or parameters:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network request failed:', error.message);
    // Implement retry logic
  } else {
    console.error('Unexpected error:', error);
  }
}
```

**Error Types:**
- `ValidationError`: Invalid URL or parameters
- `NetworkError`: HTTP failures, timeouts, connectivity issues

## Performance Characteristics

### Speed Comparison

Based on real-world testing (Bentley town council website):

| Adapter | First Fetch | Cached Fetch | Use Case |
|---------|-------------|--------------|----------|
| **Simple** | ~200ms | ~5ms | Static HTML, fastest |
| **DOM** | ~500ms | ~5ms | Complex HTML, normalized |
| **Crawlee** | ~8000ms | ~5ms | Dynamic content, JS rendering |

### Caching Strategy

All adapters use `@happyvertical/cache` with file-based storage:

- **Cache Keys**: Prefixed by adapter type (`simple:`, `dom:`, `crawlee:`)
- **Default Expiry**: 5 minutes (300,000ms)
- **Storage**: Structured cache files via `@happyvertical/cache`
- **Bypass**: Set `cache: false` in fetch options

**Cache Performance:**
- Cached fetches are typically 10-100x faster than network requests
- Crawlee benefits most (8000ms → ~5ms for Bentley town page)
- Cache files are automatically cleaned up based on TTL

### Resource Usage

| Adapter | Memory | CPU | Disk I/O | Best For |
|---------|--------|-----|----------|----------|
| **Simple** | Low | Low | Minimal | High-volume scraping |
| **DOM** | Medium | Medium | Moderate | Normalized HTML |
| **Crawlee** | High | High | Moderate | Accuracy over speed |

## Best Practices

### Ethical Web Scraping

- **Respect robots.txt**: Check and honor robots.txt rules
- **User-Agent**: Use descriptive User-Agent strings that identify your bot
- **Rate Limiting**: Implement delays between requests (not built-in, do this at app level)
- **Caching**: Use caching to minimize redundant requests
- **Error Handling**: Handle HTTP errors gracefully (404, 429, 500, etc.)

Example User-Agent pattern:
```typescript
const spider = await getSpider({
  adapter: 'simple',
});

const page = await spider.fetch(url, {
  headers: {
    'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot-info)',
  },
});
```

### Choosing the Right Adapter

**Use Simple Adapter when:**
- ✅ Content is static HTML
- ✅ Speed is critical
- ✅ Processing many pages
- ✅ Resource constraints exist

**Use DOM Adapter when:**
- ✅ HTML needs normalization
- ✅ Complex DOM structures
- ✅ Moderate performance needs
- ✅ No JavaScript rendering required

**Use Crawlee Adapter when:**
- ✅ JavaScript renders content
- ✅ AJAX/dynamic loading
- ✅ Navigation requires interaction
- ✅ Discovering hidden links (accordions, dropdowns)
- ✅ Accuracy > speed

### Performance Optimization

1. **Enable Caching**: Always use `cache: true` for repeated requests
2. **Set Appropriate Expiry**: Match cache expiry to content update frequency
3. **Use Simple Adapter First**: Try simple before falling back to Crawlee
4. **Batch Requests**: Use `Promise.all()` for parallel fetching
5. **Monitor Timeouts**: Adjust timeout based on site performance

```typescript
// Good: Parallel fetching with appropriate adapter
const spider = await getSpider({ adapter: 'simple' });
const pages = await Promise.all(
  urls.map(url => spider.fetch(url, {
    cache: true,
    cacheExpiry: 600000 // 10 min for news sites
  }))
);

// Better: Cache expiry matches content update frequency
const hourlyContent = { cacheExpiry: 3600000 };  // 1 hour
const dailyContent = { cacheExpiry: 86400000 };  // 24 hours
const staticContent = { cacheExpiry: 604800000 }; // 7 days
```

## Integration with Other @have Packages

The spider package integrates seamlessly with other SDK packages:

### With @happyvertical/pdf

Extract PDF links and download documents:

```typescript
import { getSpider } from '@happyvertical/spider';
import { downloadFile } from '@happyvertical/files';

const spider = await getSpider({ adapter: 'crawlee' });
const page = await spider.fetch('https://example.com/documents');

const pdfLinks = page.links.filter(link => link.endsWith('.pdf'));

// Download PDFs
for (const pdfUrl of pdfLinks) {
  await downloadFile(pdfUrl, './downloads/');
}
```

### With @happyvertical/ai

Extract content and send to AI for processing:

```typescript
import { getSpider } from '@happyvertical/spider';
import { getAI } from '@happyvertical/ai';
import * as cheerio from 'cheerio';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://news.example.com/article');

const $ = cheerio.load(page.content);
const articleText = $('article').text();

const ai = await getAI({ type: 'anthropic' });
const summary = await ai.chat([
  { role: 'user', content: `Summarize this article:\n\n${articleText}` }
]);

console.log(summary.content);
```

### With @happyvertical/content

Build a content mirror system:

```typescript
import { getSpider } from '@happyvertical/spider';
import { Contents } from '@happyvertical/content';

const spider = await getSpider({ adapter: 'crawlee' });
const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' }
});

// Mirror a page
const page = await spider.fetch('https://example.com/article');
await contents.mirror({
  url: page.url,
  html: page.content,
  context: 'research_articles',
});
```

## Migration from v1.x

The v2.0 refactoring introduces **breaking changes** to align with the provider pattern used across the SDK.

### Breaking Changes

| Old API (v1.x) | New API (v2.0) | Notes |
|----------------|----------------|-------|
| `fetchPageSource({ url, cheap: true })` | `getSpider({ adapter: 'simple' }).fetch(url)` | Simple HTTP |
| `fetchPageSource({ url, cheap: false })` | `getSpider({ adapter: 'dom' }).fetch(url)` | DOM processing |
| `parseIndexSource(html)` | `page.links` | Links extracted automatically |
| `createWindow()` | Use `happy-dom` directly | No longer exported |
| `processHtml(html)` | Use DOM adapter | Built-in normalization |

### Migration Examples

**Before (v1.x):**
```typescript
import { fetchPageSource, parseIndexSource } from '@happyvertical/spider';

const html = await fetchPageSource({
  url: 'https://example.com',
  cheap: true,
  cache: true,
});

const links = await parseIndexSource(html);
```

**After (v2.0):**
```typescript
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://example.com', {
  cache: true
});

const links = page.links; // Already extracted
```

**Before (v1.x - DOM processing):**
```typescript
const html = await fetchPageSource({
  url: 'https://example.com',
  cheap: false,
});
```

**After (v2.0):**
```typescript
const spider = await getSpider({ adapter: 'dom' });
const page = await spider.fetch('https://example.com');
```

**New in v2.0 (Crawlee adapter):**
```typescript
// Not available in v1.x
const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,
});

const page = await spider.fetch('https://example.com');
// Automatically expands accordions and discovers hidden links
```

## Dependencies

### Runtime Dependencies

- **@happyvertical/cache** - Caching infrastructure
- **@happyvertical/utils** - Utility functions, error types, validation
- **cheerio** - Server-side HTML parsing (jQuery-like API)
- **happy-dom** - Lightweight DOM implementation for HTML processing
- **undici** - High-performance HTTP client for Node.js
- **crawlee** - Web scraping and browser automation framework
- **playwright** - Browser automation library (Crawlee dependency)

### Development Dependencies

- **@types/cheerio** - TypeScript types for cheerio
- **vitest** - Testing framework

## Testing

The package includes comprehensive unit and integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests only
npm test -- crawlee.integration
```

**Integration Test Coverage:**
- ✅ Real-world PDF extraction (Bentley town council)
- ✅ Navigation expansion (accordions, dropdowns)
- ✅ Caching performance (10x+ speedup verification)
- ✅ Relative vs absolute link handling
- ✅ Error handling and timeouts

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/happyvertical/sdk/issues)
- **Documentation**: [SDK Docs](../../docs/)
- **Examples**: See `src/*.integration.test.ts` for real-world usage examples
