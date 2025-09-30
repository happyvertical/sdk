# @have/spider: Web Crawling and Content Extraction Package

## Purpose and Responsibilities

The `@have/spider` package provides lightweight tools for web scraping and content extraction using fast, server-side libraries. It is designed to:

- Fetch web page source code efficiently with intelligent caching support
- Parse HTML content using cheerio (jQuery-like selectors on the server)
- Process HTML using happy-dom for lightweight DOM manipulation
- Extract links and content from web pages without browser overhead
- Support both simple HTTP requests (cheap mode) and DOM-based processing
- Provide foundation for AI agents that need to process web content at scale

This package emphasizes performance and simplicity over browser compatibility, using undici for fast HTTP requests and happy-dom for lightweight DOM processing without the overhead of a full browser.

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation for foundational libraries (@mozilla/readability, cheerio, happy-dom, undici) as they frequently add new features, selectors, and performance improvements that can enhance web scraping solutions.

## Architecture Overview

### Package Structure
- **Single Entry Point**: All functionality exported from `src/index.ts`
- **Node.js Only**: Built for Node.js runtime (no browser support)
- **ES Modules**: Pure ESM with no CommonJS compatibility
- **Minimal API Surface**: Only 4 exported functions plus 1 interface
- **Zero Configuration**: Works out of the box with sensible defaults

### Build Configuration
- **Vite**: Uses Vite for fast builds with `vite-plugin-dts` for type declarations
- **Preserve Modules**: Maintains source structure in dist/ for clean imports
- **External Dependencies**: All dependencies are external (not bundled)
- **TypeScript**: Targets ES2022 with strict type checking
- **Source Maps**: Enabled for debugging

## Core API Reference

### 1. `fetchPageSource(options)` - Primary Fetching Function

The workhorse function for retrieving web content. Returns HTML as a string.

**Two Operating Modes:**

#### Cheap Mode (Recommended Default)
```typescript
import { fetchPageSource } from '@have/spider';

// Fast HTTP-only fetch - ideal for 95% of use cases
const html = await fetchPageSource({
  url: 'https://example.com/article',
  cheap: true,        // Fast undici HTTP request
  cache: true,        // Intelligent disk caching (default)
  cacheExpiry: 300000, // 5 minutes (default)
  timeout: 30000      // 30 seconds (default)
});
```

**When to use cheap mode:**
- Extracting content with cheerio afterwards
- Simple HTML structures
- Maximum performance needed
- AI content processing pipelines
- Crawling large numbers of pages

#### DOM Mode (For Complex HTML)
```typescript
// DOM processing - handles malformed HTML, normalizes structure
const processedHtml = await fetchPageSource({
  url: 'https://example.com/complex-app',
  cheap: false,       // Process through happy-dom
  headers: {
    'User-Agent': 'MyBot/1.0 (+https://mysite.com/bot)'
  }
});
```

**When to use DOM mode:**
- HTML needs normalization
- Malformed HTML requires fixing
- Need proper DOM structure validation
- More forgiving parsing needed

**Key Implementation Details:**
- Validates URLs using `isUrl()` from @have/utils before fetching
- Separate cache keys for cheap vs DOM mode (stored in `.cheap/` subdirectory for cheap mode)
- Default User-Agent: `'Mozilla/5.0 (compatible; HAppyVertical Spider/1.0)'`
- DOM mode attempts happy-dom processing but falls back to raw HTML if parsing fails
- Uses `@have/files` functions (`getCached`, `setCached`) for disk caching
- Cache files organized by URL path structure for easy inspection

**Error Handling:**
- Throws `ValidationError` for invalid/empty URLs
- Throws `NetworkError` for HTTP failures (4xx, 5xx), timeouts, connectivity issues
- Logs warnings when happy-dom fails in DOM mode but continues with raw HTML

### 2. `parseIndexSource(html)` - Link Extraction

Specialized function for extracting all links from HTML using cheerio.

```typescript
import { parseIndexSource } from '@have/spider';

const htmlSource = '<html><body><a href="/page1">Link 1</a><a href="/page2">Link 2</a></body></html>';
const links = await parseIndexSource(htmlSource);
console.log(links); // ['/page1', '/page2']
```

**Key Implementation Details:**
- Uses cheerio's `load()` to parse HTML
- Extracts `href` attributes from all `<a>` tags via `$('a')`
- Returns empty array if no links found
- Returns relative and absolute URLs as-is (no normalization)
- Validates input is a non-empty string

**Error Handling:**
- Throws `ValidationError` if html is null, undefined, or not a string
- Throws `ParsingError` if cheerio fails to parse HTML

**Common Pattern - URL Normalization:**
```typescript
const html = await fetchPageSource({ url: baseUrl, cheap: true });
const links = await parseIndexSource(html);

// Normalize relative URLs to absolute
const absoluteLinks = links.map(link =>
  link.startsWith('http') ? link : new URL(link, baseUrl).href
);
```

### 3. `createWindow()` - DOM Environment

Creates a happy-dom Window instance for server-side DOM manipulation.

```typescript
import { createWindow } from '@have/spider';

const window = createWindow();
const document = window.document;

// Manipulate DOM
document.body.innerHTML = '<div id="content">Hello World</div>';
const element = document.getElementById('content');
console.log(element?.textContent); // "Hello World"

// Create elements programmatically
const newDiv = document.createElement('div');
newDiv.textContent = 'New content';
document.body.appendChild(newDiv);

// Extract final HTML
const html = document.documentElement.outerHTML;
```

**Key Implementation Details:**
- Returns a new `Window` instance from happy-dom
- No parameters, no configuration
- Window includes full DOM API: document, createElement, querySelector, etc.
- Lightweight compared to full browser environments
- No external network access or JavaScript execution

**Use Cases:**
- Programmatic HTML generation
- DOM manipulation without a browser
- Content extraction with DOM APIs
- Removing unwanted elements (scripts, ads)
- Testing HTML manipulation logic

### 4. `processHtml(html)` - HTML Normalization

Processes HTML through happy-dom to normalize structure and fix malformed content.

```typescript
import { processHtml } from '@have/spider';

// Fix malformed HTML
const malformed = '<div><p>Unclosed paragraph<div>Nested incorrectly</div>';
const clean = await processHtml(malformed);
// Returns properly nested and closed HTML

// Normalize partial HTML
const partial = '<h1>Title</h1><p>Content</p>';
const full = await processHtml(partial);
// Returns complete HTML structure with html, head, body tags
```

**Key Implementation Details:**
- Creates temporary Window instance
- Sets HTML via `document.documentElement.innerHTML`
- Returns normalized HTML via `document.documentElement.outerHTML`
- Automatically adds missing html/head/body tags
- Fixes improper nesting and unclosed tags

**Error Handling:**
- Throws `ParsingError` if happy-dom cannot parse the HTML
- Severe malformation may cause parsing to fail

**Common Pattern - Clean Before Processing:**
```typescript
const raw = await fetchPageSource({ url, cheap: true });
const normalized = await processHtml(raw);
const $ = cheerio.load(normalized);
// Now work with properly structured HTML
```


## Dependencies and Integrations

### Internal HAVE SDK Dependencies

#### `@have/files`
**Used for:** Caching functionality
- `getCached(filePath, expiry)` - Retrieve cached content if not expired
- `setCached(filePath, content)` - Store content to cache file
- `fetchText(url)` - Simple HTTP fetch for cheap mode (delegates to undici internally)

**Integration points:**
- Cache files stored using @have/files directory structure
- Cheap mode uses `fetchText()` for HTTP requests
- Cache expiry handled by `getCached()`

#### `@have/utils`
**Used for:** Validation, logging, and error handling
- `isUrl(url)` - Validates URL format before fetching
- `urlPath(url)` - Generates cache directory path from URL
- `urlFilename(url)` - Generates cache filename from URL
- `getLogger()` - Returns configured logger instance
- `ValidationError` - Thrown for invalid inputs
- `NetworkError` - Thrown for HTTP/network failures
- `ParsingError` - Thrown for HTML parsing failures

**Integration points:**
- All URL validation before HTTP requests
- Cache file path generation
- Structured logging for debugging
- Consistent error types across SDK

### External Dependencies

#### `cheerio` (^1.0.0)
**Purpose:** Server-side jQuery implementation for HTML parsing
**Used in:** `parseIndexSource()` function
**Key features used:**
- `cheerio.load(html)` - Parse HTML into queryable object
- jQuery-like selectors: `$('a')`, `$('.class')`, `$('#id')`
- Attribute extraction: `$(el).attr('href')`

**Why cheerio?**
- Fast HTML parsing and querying
- Familiar jQuery API
- No browser overhead
- Battle-tested with 1.7M+ dependent projects

#### `happy-dom` (^18.0.1)
**Purpose:** Lightweight DOM implementation for server-side HTML processing
**Used in:** `createWindow()`, `processHtml()`, and DOM mode of `fetchPageSource()`
**Key features used:**
- `new Window()` - Create DOM environment
- `document.documentElement.innerHTML` - Parse/set HTML
- `document.documentElement.outerHTML` - Extract processed HTML
- Standard DOM APIs (createElement, getElementById, querySelector, etc.)

**Why happy-dom?**
- Lightweight alternative to JSDOM
- Fast HTML normalization
- Supports modern DOM APIs
- No heavy browser dependencies
- Handles malformed HTML gracefully

#### `undici` (^7.11.0)
**Purpose:** High-performance HTTP/1.1 client
**Used in:** DOM mode of `fetchPageSource()`, and indirectly in cheap mode via @have/files
**Key features used:**
- `request(url, options)` - Make HTTP requests
- Header customization
- Timeout configuration (headersTimeout, bodyTimeout)
- Response streaming

**Why undici?**
- Official Node.js HTTP client
- Superior performance vs node-fetch/axios
- Built-in connection pooling
- Modern fetch-compatible API
- Better resource management

#### `@mozilla/readability` (^0.5.0)
**Status:** Listed as dependency but **not currently used** in implementation
**Potential use:** Future enhancement for article content extraction
**Capabilities:**
- Firefox's readability algorithm
- Extract clean article content from HTML
- Remove ads, navigation, boilerplate
- Preserve important formatting

**Future integration opportunity:** Could be combined with `fetchPageSource()` to provide article extraction API

## Common Usage Patterns

### Pattern 1: AI Content Extraction Pipeline
**Use case:** Extract article content for AI processing

```typescript
import { fetchPageSource } from '@have/spider';
import * as cheerio from 'cheerio';

async function extractForAI(url: string) {
  // Fast fetch with caching
  const html = await fetchPageSource({ url, cheap: true });
  const $ = cheerio.load(html);

  // Extract relevant content
  return {
    title: $('h1').first().text().trim(),
    content: $('article, main, .content').text().trim(),
    links: $('a').map((_, el) => $(el).attr('href')).get(),
  };
}
```

### Pattern 2: Robust Fetch with Fallback
**Use case:** Try DOM mode, fall back to cheap mode on failure

```typescript
import { fetchPageSource, NetworkError, ParsingError } from '@have/spider';

async function robustFetch(url: string): Promise<string> {
  try {
    // Try DOM processing first
    return await fetchPageSource({ url, cheap: false, timeout: 15000 });
  } catch (error) {
    if (error instanceof NetworkError || error instanceof ParsingError) {
      // Fall back to simple fetch
      return await fetchPageSource({ url, cheap: true, timeout: 10000 });
    }
    throw error;
  }
}
```

### Pattern 3: Crawl Index Pages
**Use case:** Extract and normalize links for crawling

```typescript
import { fetchPageSource, parseIndexSource } from '@have/spider';

async function discoverPages(indexUrl: string) {
  const html = await fetchPageSource({ url: indexUrl, cheap: true });
  const links = await parseIndexSource(html);

  // Normalize to absolute URLs
  return links
    .filter(link => !link.startsWith('#')) // Remove anchors
    .map(link => new URL(link, indexUrl).href) // Absolute URLs
    .filter(link => new URL(link).origin === new URL(indexUrl).origin); // Same origin
}
```

### Pattern 4: Content Cleaning Pipeline
**Use case:** Clean HTML for processing

```typescript
import { fetchPageSource, processHtml, createWindow } from '@have/spider';

async function cleanContent(url: string): Promise<string> {
  const raw = await fetchPageSource({ url, cheap: true });
  const normalized = await processHtml(raw);

  // Additional cleaning with DOM
  const window = createWindow();
  window.document.documentElement.innerHTML = normalized;

  // Remove unwanted elements
  const scripts = window.document.querySelectorAll('script, style, nav, footer');
  scripts.forEach(el => el.remove());

  return window.document.body.innerHTML;
}
```

### Pattern 5: Batch Crawling with Rate Limiting
**Use case:** Crawl multiple pages responsibly

```typescript
import { fetchPageSource } from '@have/spider';

async function batchCrawl(urls: string[], delayMs: number = 1000) {
  const results = [];

  for (const url of urls) {
    try {
      const html = await fetchPageSource({ url, cheap: true });
      results.push({ url, html, error: null });
    } catch (error) {
      results.push({ url, html: null, error });
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return results;
}
```

## Development Guidelines

### Caching Strategy Deep Dive

**Cache Directory Structure:**
```
.cache/
└── [domain]/
    └── [path]/
        ├── .cheap/
        │   └── [filename]      # Cheap mode cache
        └── [filename]          # DOM mode cache
```

**Cache Key Generation:**
- Uses `urlPath()` to create directory structure from URL
- Uses `urlFilename()` to generate unique filename from URL
- Cheap mode adds `.cheap/` subdirectory to differentiate
- Same URL with different modes = different cache files

**Cache Expiry:**
- Default: 5 minutes (300,000ms)
- Checked on read via `getCached(file, expiry)`
- Stale cache automatically refetched
- No automatic cleanup (manual deletion required)

**Cache Best Practices:**
- Use longer expiry for stable content (docs, archives)
- Use shorter expiry for dynamic content (news, feeds)
- Disable cache (`cache: false`) for testing or one-off requests
- Consider cache warming for frequently accessed URLs

### Error Handling Strategy

**Error Type Decision Tree:**

```typescript
try {
  const html = await fetchPageSource({ url, cheap: true });
} catch (error) {
  if (error instanceof ValidationError) {
    // Invalid URL or parameters - fix the input
    console.error('Invalid input:', error.message);
  } else if (error instanceof NetworkError) {
    // HTTP failure, timeout, connectivity - retry with backoff
    console.error('Network issue:', error.message);
    // Implement exponential backoff retry
  } else if (error instanceof ParsingError) {
    // HTML parsing failed - try different mode or skip
    console.error('Parsing failed:', error.message);
  }
}
```

**Recommended Retry Logic:**
```typescript
async function fetchWithRetry(
  url: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchPageSource({ url, cheap: true });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error; // Don't retry validation errors
      }

      if (i === maxRetries - 1) throw error; // Last attempt

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Performance Optimization Guidelines

**Mode Selection Decision Tree:**

```
Is HTML malformed or needs normalization?
├─ YES → Use cheap: false (DOM mode)
└─ NO  → Is content simple HTML?
           ├─ YES → Use cheap: true (Cheap mode)
           └─ NO  → Try cheap: true first, fallback to false
```

**Performance Characteristics:**

| Aspect | Cheap Mode | DOM Mode |
|--------|-----------|----------|
| Speed | ~50-200ms | ~200-800ms |
| Memory | ~1-5MB | ~5-20MB |
| CPU | Minimal | Moderate |
| Parsing | Raw HTML | Normalized HTML |
| Best for | Content extraction | HTML manipulation |

**Optimization Checklist:**
- ✅ Use cheap mode for 95% of cases
- ✅ Enable caching for repeated requests
- ✅ Set reasonable timeouts (30s default is good)
- ✅ Use cheerio for content extraction (don't need DOM APIs)
- ✅ Process content in batches with delays
- ✅ Consider connection pooling for many requests
- ✅ Monitor cache hit rate

### Web Scraping Ethics

**Respectful Scraping Checklist:**
- ✅ Check robots.txt before scraping: `GET /robots.txt`
- ✅ Use descriptive User-Agent with contact info
- ✅ Implement rate limiting (1-5 seconds between requests)
- ✅ Respect HTTP status codes (especially 429 Rate Limit)
- ✅ Cache aggressively to minimize requests
- ✅ Handle errors gracefully without hammering server
- ✅ Consider using official APIs when available
- ✅ Don't scrape personal or sensitive data

**User-Agent Best Practices:**
```typescript
const html = await fetchPageSource({
  url: 'https://example.com',
  cheap: true,
  headers: {
    'User-Agent': 'MyBotName/1.0 (+https://mybotsite.com/info; contact@mybotsite.com)'
  }
});
```

**Rate Limiting Implementation:**
```typescript
class RateLimiter {
  private lastRequest = 0;
  private minDelay = 1000; // 1 second

  async throttle() {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequest;

    if (timeSinceLast < this.minDelay) {
      await new Promise(resolve =>
        setTimeout(resolve, this.minDelay - timeSinceLast)
      );
    }

    this.lastRequest = Date.now();
  }

  async fetch(url: string) {
    await this.throttle();
    return fetchPageSource({ url, cheap: true });
  }
}
```

### Testing Strategy

**Test Suite Organization:**
The package uses Vitest with tests in `src/index.spec.ts`

**Test Coverage:**
```bash
npm test        # Run tests once (vitest run)
npm run test:watch  # Watch mode (vitest)
```

**What's Tested:**
- ✅ `fetchPageSource()` - Both cheap and DOM modes with caching
- ✅ Custom headers and timeout handling
- ✅ Cache enable/disable functionality
- ✅ URL validation and error throwing
- ✅ `parseIndexSource()` - Link extraction from various HTML structures
- ✅ `createWindow()` - Window instance creation and DOM manipulation
- ✅ `processHtml()` - HTML normalization and processing

**Test Patterns:**
```typescript
// Testing with real URLs (integration tests)
it('should fetch page source cheaply with caching', async () => {
  const source = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: true,
  });

  const cached = await fetchPageSource({
    url: 'https://www.google.com',
    cheap: true,
  });

  expect(source).toBeDefined();
  expect(cached).toBe(source); // Verify caching works
});

// Testing error cases
it('should throw ValidationError for invalid URL', async () => {
  await expect(
    fetchPageSource({ url: '', cheap: true })
  ).rejects.toThrow(ValidationError);
});
```

**Testing Best Practices:**
- Use real URLs sparingly (integration tests)
- Test error paths with invalid inputs
- Verify caching behavior
- Test both operating modes (cheap/DOM)
- Mock external dependencies for unit tests

### Building and Development

**Build Commands:**
```bash
npm run build       # Build TypeScript to dist/ (vite build)
npm run build:watch # Build in watch mode
npm run clean       # Remove dist/ and docs/ directories
npm run dev         # Parallel: build:watch + test:watch
```

**Build Output:**
- Location: `dist/` directory
- Format: ES modules only
- Structure: Preserves source module structure
- Files: `index.js` + `index.d.ts` (+ source maps)
- External: All dependencies remain external (not bundled)

**Type Declarations:**
- Generated via `vite-plugin-dts`
- Uses `tsconfig.build.json` for build-specific config
- Output: `dist/index.d.ts`
- Excludes: Test files, existing .d.ts files

**Development Workflow:**
1. Make changes to `src/index.ts`
2. Tests run automatically in watch mode (`npm run dev`)
3. Build updates automatically
4. Type definitions regenerated
5. Iterate on feedback

### Code Quality Standards

**TypeScript Configuration:**
- Target: ES2022
- Strict mode enabled
- Full type safety required
- No implicit any
- Extends from root tsconfig

**Import Patterns:**
```typescript
// ✅ Correct: Import from @have/spider
import { fetchPageSource, parseIndexSource } from '@have/spider';
import type { FetchPageSourceOptions } from '@have/spider';

// ✅ Correct: Import external dependencies
import * as cheerio from 'cheerio';
import { Window } from 'happy-dom';

// ❌ Wrong: Direct imports from dist
import { fetchPageSource } from '@have/spider/dist/index';

// ❌ Wrong: Importing from node_modules path
import { fetchPageSource } from '../node_modules/@have/spider';
```

**Error Handling Patterns:**
```typescript
// ✅ Correct: Use SDK error types
import { ValidationError, NetworkError, ParsingError } from '@have/utils';

if (!url) {
  throw new ValidationError('URL is required', { url });
}

// ✅ Correct: Proper error context
try {
  const response = await request(url);
} catch (error) {
  throw new NetworkError(`Failed to fetch: ${error.message}`, {
    url,
    originalError: error
  });
}

// ❌ Wrong: Generic errors
throw new Error('Invalid URL');
```

**Logging Patterns:**
```typescript
// ✅ Correct: Use structured logging
import { getLogger } from '@have/utils';

getLogger().info('Using cached page source', {
  url,
  cacheFile: cachedFile,
});

getLogger().warn('happy-dom failed to parse HTML', {
  url,
  error: error.message
});

// ❌ Wrong: Console.log
console.log('Cache hit for', url);
```

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "Cache not working / Always fetching"
**Symptoms:** Same URL fetches multiple times despite caching enabled

**Causes & Solutions:**
1. Different modes use different cache keys
   - Solution: Use same `cheap` value for related requests
2. Cache expired based on `cacheExpiry`
   - Solution: Increase `cacheExpiry` for stable content
3. Cache directory permissions
   - Solution: Check write permissions on cache directory

**Debug:**
```typescript
import { getLogger } from '@have/utils';
getLogger().setLevel('debug'); // Enable debug logging

const html = await fetchPageSource({ url, cheap: true, cache: true });
// Check logs for "Using cached page source" message
```

#### Issue: "NetworkError: Request timeout"
**Symptoms:** Requests fail with timeout error

**Causes & Solutions:**
1. Slow server response
   - Solution: Increase timeout: `{ timeout: 60000 }` (60 seconds)
2. Network connectivity issues
   - Solution: Implement retry logic with exponential backoff
3. Server blocking requests
   - Solution: Add appropriate User-Agent header and rate limiting

**Debug:**
```typescript
try {
  const html = await fetchPageSource({
    url,
    cheap: true,
    timeout: 60000, // Increase timeout
    headers: {
      'User-Agent': 'MyBot/1.0 (+contact@mysite.com)'
    }
  });
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network details:', error.context);
  }
}
```

#### Issue: "ParsingError: Failed to parse HTML"
**Symptoms:** HTML processing fails with ParsingError

**Causes & Solutions:**
1. Severely malformed HTML
   - Solution: Use cheap mode instead of DOM mode
2. happy-dom incompatible event handlers
   - Solution: fetchPageSource already falls back to raw HTML in DOM mode
3. Invalid characters in HTML
   - Solution: Pre-process HTML or use cheerio directly

**Workaround:**
```typescript
try {
  const clean = await processHtml(malformedHtml);
} catch (error) {
  if (error instanceof ParsingError) {
    // Use raw HTML without processing
    const $ = cheerio.load(malformedHtml);
    // Continue with cheerio parsing
  }
}
```

#### Issue: "ValidationError: Invalid URL format"
**Symptoms:** URL validation fails even with seemingly valid URL

**Causes & Solutions:**
1. Missing protocol (http:// or https://)
   - Solution: Add protocol: `https://example.com`
2. Whitespace in URL
   - Solution: Trim URL: `url.trim()`
3. Special characters not encoded
   - Solution: Use `encodeURIComponent()` for query params

**Fix:**
```typescript
function normalizeUrl(url: string): string {
  url = url.trim();
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  return url;
}

const html = await fetchPageSource({
  url: normalizeUrl(userInput),
  cheap: true
});
```

#### Issue: "Empty content returned"
**Symptoms:** HTML string is empty or missing expected content

**Causes & Solutions:**
1. JavaScript-rendered content (SPA)
   - Solution: @have/spider doesn't execute JavaScript - content must be in initial HTML
   - Alternative: Use a headless browser or API endpoint
2. Content behind authentication
   - Solution: Provide authentication headers or cookies
3. Content loaded via AJAX
   - Solution: Find the actual API endpoint and fetch directly

**Detection:**
```typescript
const html = await fetchPageSource({ url, cheap: true });

if (!html || html.length < 100) {
  console.warn('Suspiciously short HTML - may be JavaScript-rendered');
  // Consider alternative approaches
}

const $ = cheerio.load(html);
if ($('body').text().trim().length === 0) {
  console.warn('No visible content found');
}
```

### Performance Issues

#### Slow Fetching
**Solutions:**
- Use cheap mode: `{ cheap: true }`
- Enable caching: `{ cache: true }`
- Reduce timeout: `{ timeout: 15000 }`
- Check network connection
- Consider parallel requests for multiple URLs

#### High Memory Usage
**Solutions:**
- Use cheap mode instead of DOM mode
- Don't store large numbers of HTML strings in memory
- Process and extract only needed data
- Clear references to allow garbage collection

#### Rate Limiting / 429 Errors
**Solutions:**
- Implement delays between requests (1-5 seconds)
- Use the RateLimiter pattern from examples
- Respect Retry-After header in 429 responses
- Consider using official APIs instead

### Integration Issues

#### TypeScript Import Errors
```typescript
// ❌ Wrong
import fetchPageSource from '@have/spider';

// ✅ Correct
import { fetchPageSource } from '@have/spider';
```

#### Module Resolution Errors
- Ensure `"type": "module"` in package.json
- Use `.js` extensions in imports if required by setup
- Check tsconfig.json `moduleResolution: "bundler"` or `"node16"`

#### Dependency Conflicts
- Use `workspace:*` for internal @have packages
- Run `pnpm install` to sync dependencies
- Check for peer dependency warnings

## Advanced Topics

### Custom Content Extraction with Cheerio

**Extracting Structured Data:**
```typescript
import { fetchPageSource } from '@have/spider';
import * as cheerio from 'cheerio';

async function extractProductData(url: string) {
  const html = await fetchPageSource({ url, cheap: true });
  const $ = cheerio.load(html);

  return {
    name: $('[itemprop="name"]').text().trim(),
    price: $('[itemprop="price"]').attr('content'),
    currency: $('[itemprop="priceCurrency"]').attr('content'),
    description: $('[itemprop="description"]').text().trim(),
    images: $('[itemprop="image"]')
      .map((_, el) => $(el).attr('src'))
      .get(),
    availability: $('[itemprop="availability"]').attr('href')
  };
}
```

**JSON-LD Extraction:**
```typescript
async function extractJsonLd(url: string) {
  const html = await fetchPageSource({ url, cheap: true });
  const $ = cheerio.load(html);

  const jsonLdScripts = $('script[type="application/ld+json"]');

  return jsonLdScripts
    .map((_, el) => {
      try {
        return JSON.parse($(el).html() || '');
      } catch {
        return null;
      }
    })
    .get()
    .filter(Boolean);
}
```

### Integration with @have/ai

**Content Extraction for AI Processing:**
```typescript
import { fetchPageSource } from '@have/spider';
import { createAI } from '@have/ai';
import * as cheerio from 'cheerio';

async function summarizeArticle(url: string) {
  // Fetch and extract content
  const html = await fetchPageSource({ url, cheap: true });
  const $ = cheerio.load(html);

  const content = {
    title: $('h1').first().text().trim(),
    body: $('article, main, .content').text().trim().slice(0, 5000)
  };

  // Process with AI
  const ai = createAI({ provider: 'openai' });
  const summary = await ai.complete({
    prompt: `Summarize this article:\n\nTitle: ${content.title}\n\n${content.body}`,
    maxTokens: 150
  });

  return summary;
}
```

### Building a Web Crawler

**Complete Crawler Example:**
```typescript
import { fetchPageSource, parseIndexSource } from '@have/spider';

class SimpleCrawler {
  private visited = new Set<string>();
  private queue: string[] = [];

  constructor(
    private baseUrl: string,
    private maxPages: number = 100,
    private delayMs: number = 1000
  ) {}

  async crawl() {
    this.queue.push(this.baseUrl);

    while (this.queue.length > 0 && this.visited.size < this.maxPages) {
      const url = this.queue.shift()!;

      if (this.visited.has(url)) continue;
      this.visited.add(url);

      try {
        console.log(`Crawling: ${url}`);
        const html = await fetchPageSource({ url, cheap: true });

        // Process content
        await this.processPage(url, html);

        // Discover new links
        const links = await parseIndexSource(html);
        const absoluteLinks = links
          .map(link => {
            try {
              return new URL(link, url).href;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .filter(link => {
            const linkUrl = new URL(link!);
            const baseUrlObj = new URL(this.baseUrl);
            return linkUrl.origin === baseUrlObj.origin;
          });

        this.queue.push(...absoluteLinks);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      } catch (error) {
        console.error(`Failed to crawl ${url}:`, error);
      }
    }

    return Array.from(this.visited);
  }

  private async processPage(url: string, html: string) {
    // Implement your page processing logic
    // E.g., extract data, save to database, etc.
  }
}

// Usage
const crawler = new SimpleCrawler('https://example.com', 50, 2000);
const crawledUrls = await crawler.crawl();
```

## API Documentation

The @have/spider package generates comprehensive API documentation using TypeDoc:

**Documentation Generation:**
```bash
npm run docs          # Generate markdown docs to docs/
npm run docs:watch    # Watch mode for development
```

**Output Location:**
- `packages/spider/docs/` - Markdown documentation
- Organized by module with cross-references
- Includes all public APIs, interfaces, and types

**Documentation includes:**
- Function signatures with parameter descriptions
- Return types and async behavior
- Error types that can be thrown
- Code examples for each function
- Integration patterns with other packages

## Quick Reference

### Exported Functions
| Function | Purpose | Returns | Throws |
|----------|---------|---------|--------|
| `fetchPageSource(options)` | Fetch HTML from URL | `Promise<string>` | ValidationError, NetworkError |
| `parseIndexSource(html)` | Extract links from HTML | `Promise<string[]>` | ValidationError, ParsingError |
| `createWindow()` | Create DOM environment | `Window` | - |
| `processHtml(html)` | Normalize HTML structure | `Promise<string>` | ParsingError |

### Exported Types
| Type | Purpose |
|------|---------|
| `FetchPageSourceOptions` | Configuration for fetchPageSource() |

### Error Types (from @have/utils)
| Error | When Thrown |
|-------|-------------|
| `ValidationError` | Invalid URL or parameters |
| `NetworkError` | HTTP failures, timeouts |
| `ParsingError` | HTML processing failures |

### Default Values
| Option | Default | Notes |
|--------|---------|-------|
| `cheap` | `true` | Fast HTTP fetch |
| `cache` | `true` | Enable caching |
| `cacheExpiry` | `300000` | 5 minutes in ms |
| `timeout` | `30000` | 30 seconds in ms |
| `headers` | Standard browser headers | Merged with custom headers |

### Decision Matrix

**When to use cheap mode vs DOM mode:**
| Scenario | Mode | Reason |
|----------|------|--------|
| Extract content with cheerio | `cheap: true` | Fastest, no DOM overhead |
| Malformed HTML needs fixing | `cheap: false` | DOM normalization |
| Simple HTML structure | `cheap: true` | Optimal performance |
| Need DOM manipulation | `cheap: false` | Access to DOM APIs |
| Scraping many pages | `cheap: true` | Lower memory/CPU |
| Unsure which to use | `cheap: true` | Start fast, upgrade if needed |

### Performance Targets
| Operation | Cheap Mode | DOM Mode |
|-----------|-----------|----------|
| Simple fetch | 50-200ms | 200-800ms |
| With cache hit | <5ms | <5ms |
| Memory per request | 1-5MB | 5-20MB |
| Throughput | ~50-100 req/sec | ~10-25 req/sec |

## External Documentation Links

Always reference the latest documentation when planning web scraping solutions, as these libraries frequently add new selectors, methods, and performance improvements:

### Core Libraries

- **cheerio** ^1.0.0: [Official Documentation](https://cheerio.js.org/) | [GitHub](https://github.com/cheeriojs/cheerio)
  - Server-side jQuery for HTML parsing
  - Used by `parseIndexSource()` and recommended for custom extraction
  - Check docs for: New selectors, traversal methods, performance optimizations

- **happy-dom** ^18.0.1: [GitHub](https://github.com/capricorn86/happy-dom) | [Wiki](https://github.com/capricorn86/happy-dom/wiki/)
  - Lightweight DOM for server-side use
  - Used by `createWindow()`, `processHtml()`, and DOM mode fetching
  - Check docs for: New DOM APIs, performance enhancements, compatibility updates

- **undici** ^7.11.0: [Official Docs](https://undici.nodejs.org) | [API Reference](https://github.com/nodejs/undici/blob/HEAD/docs/)
  - Official Node.js HTTP client
  - Used for all HTTP requests in the package
  - Check docs for: Connection pooling, new request methods, performance features

- **@mozilla/readability** ^0.5.0: [GitHub](https://github.com/mozilla/readability)
  - Firefox's content extraction algorithm
  - Currently unused - available for future article extraction features
  - Check docs for: Article extraction patterns, content cleaning strategies

### Internal Dependencies

- **@have/files**: File system operations and caching
- **@have/utils**: Validation, logging, error handling

### Expert Agent Reminders

When working with @have/spider:

1. ✅ **Default to cheap mode** - Use `cheap: true` for 95% of cases
2. ✅ **Enable caching** - Dramatically improves performance for repeated requests
3. ✅ **Use cheerio for extraction** - More performant than DOM APIs for content extraction
4. ✅ **Handle errors specifically** - Catch ValidationError, NetworkError, ParsingError separately
5. ✅ **Implement rate limiting** - Be respectful when crawling multiple pages
6. ✅ **Check latest library docs** - Libraries evolve with new features and optimizations
7. ✅ **Test with real URLs** - Validate extraction patterns against actual web content

### Integration with Other HAVE Packages

**Recommended Combinations:**

| Package | Integration Purpose | Example Use Case |
|---------|-------------------|------------------|
| `@have/ai` | Process extracted content | Summarize articles, extract entities |
| `@have/files` | Store scraped data | Save HTML, cache results, organize content |
| `@have/smrt` | Build intelligent agents | Content monitoring bots, data extraction agents |
| `@have/sql` | Store structured data | Save extracted content to database |

**Example Multi-Package Integration:**
```typescript
import { fetchPageSource } from '@have/spider';
import { createAI } from '@have/ai';
import { Database } from '@have/sql';
import * as cheerio from 'cheerio';

async function monitorAndAnalyze(url: string) {
  // Fetch content
  const html = await fetchPageSource({ url, cheap: true });
  const $ = cheerio.load(html);
  const content = $('article').text();

  // Analyze with AI
  const ai = createAI({ provider: 'openai' });
  const analysis = await ai.complete({
    prompt: `Analyze this content: ${content}`,
  });

  // Store results
  const db = await Database.create({ type: 'sqlite', path: './data.db' });
  await db.execute(
    'INSERT INTO analyses (url, content, analysis, created_at) VALUES (?, ?, ?, ?)',
    [url, content.slice(0, 1000), analysis, new Date().toISOString()]
  );
}
```

## Summary

The `@have/spider` package is a high-performance, minimalist web scraping toolkit designed for AI agents and content extraction pipelines. It provides:

- **Simple API**: Just 4 functions covering all web scraping needs
- **Two Modes**: Fast HTTP (`cheap: true`) or DOM processing (`cheap: false`)
- **Smart Caching**: Automatic disk caching with configurable expiry
- **Server-Optimized**: No browser overhead, pure Node.js performance
- **Integration-Ready**: Works seamlessly with other @have packages

**Key Strengths:**
- Extremely fast content fetching (50-200ms typical)
- Minimal memory footprint (1-5MB per request)
- Battle-tested libraries (cheerio, undici, happy-dom)
- Comprehensive error handling
- TypeScript-first with full type safety

**Ideal For:**
- AI content extraction pipelines
- Web crawling and indexing
- Content monitoring systems
- Data extraction tasks
- Link discovery and analysis

**Not Suitable For:**
- JavaScript-rendered SPAs (no JS execution)
- Sites requiring browser-like behavior
- Complex user interactions
- Sites with heavy anti-bot protection

For these advanced cases, consider using a headless browser solution or official APIs.

---

**Package Version:** 0.4.1
**Last Updated:** This documentation reflects the current implementation
**Related Packages:** @have/files, @have/utils, @have/ai, @have/smrt