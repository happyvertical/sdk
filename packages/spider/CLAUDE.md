# @happyvertical/spider

## Purpose and Responsibilities

The spider package provides web scraping and content extraction through multiple adapters optimized for different use cases. It follows the standardized provider pattern to give developers the right tool for each scraping scenario, from simple static HTML to complex JavaScript-heavy pages.

## Key Features

- **Provider Pattern**: Three adapters for different use cases (Simple, DOM, Crawlee)
- **Standardized Interface**: All adapters implement ISpiderAdapter
- **Built-in Caching**: Automatic response caching via @happyvertical/cache
- **Navigation Expansion**: Crawlee adapter auto-expands accordions/dropdowns to discover hidden links
- **Link Extraction**: Automatic extraction of all page links
- **Environment Variable Configuration**: HAVE_SPIDER_* pattern for easy setup

## Architecture Overview

```
getSpider(options)
    ↓
Adapter Selection
    ├── Simple (fast HTTP + cheerio)
    ├── DOM (happy-dom processing + cheerio)
    └── Crawlee (Playwright browser automation)
    ↓
ISpiderAdapter Interface
    ├── fetch(url, options) → Page
    ├── Built-in caching (file-based)
    └── Standardized output (url, content, links, raw)
```

## Key APIs

### Basic Usage

```typescript
import { getSpider } from '@happyvertical/spider';

// Simple adapter (fast HTTP)
const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://example.com');

console.log(page.url);      // Final URL after redirects
console.log(page.content);  // HTML content
console.log(page.links);    // Extracted links
```

### WordPress Download Manager Detection

The `scrapeDocument()` function automatically detects WordPress Download Manager pages and extracts the actual download URLs:

```typescript
import { scrapeDocument } from '@happyvertical/spider';

// Automatically detects WordPress download pages
const doc = await scrapeDocument('https://example.com/download/meeting-minutes/');

if (doc.metadata.strategy === 'wordpress-pdf-link') {
  console.log('WordPress download detected');
  console.log('Download URL:', doc.url); // Extracted wpdmdl URL
  console.log('Is PDF:', doc.metadata.isPdf); // true
  console.log('Complete:', doc.metadata.complete); // false - needs separate fetch
}
```

**Important Caching Behavior (Fix for sdk#440):**

WordPress Download Manager URLs often return HTML tracking/analytics pages before redirecting to the actual file. The spider includes defensive checks to prevent infinite loops:

1. **First Fetch**: HTML page with `/download/` in URL → Detects WordPress → Extracts `?wpdmdl=` link
2. **Second Fetch**: URL with `?wpdmdl=` parameter → Skips WordPress detection (prevents loop)
3. **Result**: If `?wpdmdl=` URL returns HTML, it's treated as HTML (not marked as PDF)

**Debug Logging:**

Enable debug logging to troubleshoot WordPress detection:

```bash
export HAVE_DEBUG=true
# or
export DEBUG=spider
```

This will log:
- When WordPress pages are detected
- When WordPress detection is skipped (wpdmdl URLs)
- What download URLs are extracted

### Adapter Selection

```typescript
// Simple: Fast HTTP with cheerio (static content)
const simple = await getSpider({
  adapter: 'simple',
  cacheDir: '.cache/spider',
});

// DOM: happy-dom processing (complex HTML)
const dom = await getSpider({
  adapter: 'dom',
  cacheDir: '.cache/spider',
});

// Crawlee: Playwright browser automation (dynamic content)
const crawlee = await getSpider({
  adapter: 'crawlee',
  headless: true,
  userAgent: 'MyBot/1.0 (+https://mysite.com/bot)',
  cacheDir: '.cache/spider',
});
```

### Fetch Options

```typescript
const page = await spider.fetch('https://example.com', {
  headers: { 'User-Agent': 'MyBot/1.0' },
  timeout: 30000,      // 30 seconds
  cache: true,         // Enable caching
  cacheExpiry: 300000, // 5 minutes
});
```

### Environment Variable Configuration

```bash
# Configure via environment variables
export HAVE_SPIDER_TIMEOUT=60000
export HAVE_SPIDER_USER_AGENT="MyBot/1.0 (+https://mysite.com/bot)"
export HAVE_SPIDER_MAX_REQUESTS=100
```

```typescript
// Env vars are merged with options (user options take precedence)
process.env.HAVE_SPIDER_TIMEOUT = '45000';

const spider = await getSpider({ adapter: 'simple' });
await spider.fetch(url); // Uses 45000ms timeout from env

await spider.fetch(url, { timeout: 30000 }); // Overrides to 30000ms
```

### Page Object Structure

```typescript
interface Page {
  url: string;      // Final URL after redirects
  content: string;  // Full HTML content
  links: string[];  // Extracted links
  raw: any;         // Adapter-specific raw response
}
```

## Adapter Characteristics

### Simple Adapter
- **Speed**: ~200ms first fetch, ~5ms cached
- **Use Case**: Static HTML, high volume scraping
- **Dependencies**: undici, cheerio
- **Best For**: Fast content extraction, minimal resource usage

### DOM Adapter
- **Speed**: ~500ms first fetch, ~5ms cached
- **Use Case**: Complex/malformed HTML needing normalization
- **Dependencies**: happy-dom, cheerio
- **Best For**: DOM manipulation without full browser

### Crawlee Adapter
- **Speed**: ~8000ms first fetch, ~5ms cached
- **Use Case**: JavaScript-rendered content, dynamic loading
- **Dependencies**: crawlee, playwright
- **Best For**: Accordion navigation, hidden links, AJAX content
- **Special Feature**: Auto-expands `[aria-expanded="false"]`, accordions, `<details>` tags

## Dependencies

- **Internal**:
  - `@happyvertical/cache` - Caching infrastructure
  - `@happyvertical/utils` - Error types, validation

- **External**:
  - `cheerio` - HTML parsing (all adapters)
  - `undici` - HTTP client (Simple adapter)
  - `happy-dom` - DOM implementation (DOM adapter)
  - `crawlee` - Browser automation framework (Crawlee adapter)
  - `playwright` - Browser engine (Crawlee dependency)

## Development Guidelines

- All adapters must implement ISpiderAdapter interface completely
- Cache keys prefixed by adapter type (`simple:`, `dom:`, `crawlee:`)
- Default cache expiry: 5 minutes (300,000ms)
- Default timeout: 30 seconds (30,000ms)
- Links should be absolute URLs (relative URLs converted)
- Handle errors with ValidationError and NetworkError from @happyvertical/utils
- Respect robots.txt and use descriptive User-Agent strings

## Expert Agent Expertise

When working with spider:

1. **Adapter Selection**: Start with Simple, fallback to Crawlee if content missing
2. **Caching Strategy**: Crawlee benefits most (8000ms → 5ms), always enable caching
3. **Navigation Expansion**: Crawlee runs up to 3 iterations clicking expandable elements
4. **Performance**: Simple is 10x faster than DOM, 40x faster than Crawlee (uncached)
5. **Error Handling**: NetworkError for HTTP failures, ValidationError for bad inputs
6. **Real-World Testing**: Integration tests use Bentley town council site (accordion navigation)

## Common Patterns

```typescript
// PDF discovery with navigation expansion
import { getSpider } from '@happyvertical/spider';

const spider = await getSpider({
  adapter: 'crawlee',
  headless: true,
});

const page = await spider.fetch(
  'https://townofbentley.ca/town-office/council/meetings-agendas/',
  { timeout: 60000, cache: true }
);

const pdfLinks = page.links.filter(link => link.endsWith('.pdf'));
console.log(`Found ${pdfLinks.length} PDFs`);

// Fallback strategy for resilience
async function robustFetch(url: string) {
  try {
    // Try Crawlee first for best quality
    const spider = await getSpider({ adapter: 'crawlee' });
    return await spider.fetch(url, { timeout: 30000 });
  } catch (error) {
    // Fallback to simple adapter
    console.warn('Crawlee failed, using simple adapter');
    const spider = await getSpider({ adapter: 'simple' });
    return await spider.fetch(url, { timeout: 15000 });
  }
}

// Batch processing with caching
const spider = await getSpider({ adapter: 'simple' });
const urls = ['https://example.com/1', 'https://example.com/2'];

const pages = await Promise.all(
  urls.map(url => spider.fetch(url, {
    cache: true,
    cacheExpiry: 600000, // 10 minutes
  }))
);

// Integration with AI for content analysis
import { getAI } from '@happyvertical/ai';

const spider = await getSpider({ adapter: 'simple' });
const page = await spider.fetch('https://news.example.com/article');

const $ = cheerio.load(page.content);
const articleText = $('article').text();

const ai = await getAI({ type: 'anthropic' });
const summary = await ai.chat([
  { role: 'user', content: `Summarize: ${articleText}` }
]);
```

## Related Packages

- **@happyvertical/cache**: Powers built-in caching with file-based storage
- **@happyvertical/utils**: Provides error types and validation
- **@happyvertical/pdf**: Often used with spider to download extracted PDF links
- **@happyvertical/documents**: Uses spider for web page processing
- **@happyvertical/ai**: Commonly paired for content analysis
- **@happyvertical/content**: Uses spider for content mirroring
