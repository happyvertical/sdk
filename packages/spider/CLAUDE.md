# @have/spider: Web Crawling and Content Extraction Package

## Purpose and Responsibilities

The `@have/spider` package provides lightweight tools for web scraping and content extraction using fast, server-side libraries. It is designed to:

- Fetch web page source code efficiently with caching support
- Parse HTML content using cheerio (jQuery-like selectors)
- Process HTML using happy-dom for DOM manipulation
- Extract links and content from web pages
- Support both simple HTTP requests and DOM-based processing
- Provide foundation for AI agents that need to process web content

This package emphasizes performance and simplicity, using undici for fast HTTP requests and happy-dom for lightweight DOM processing without the overhead of a full browser.

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation for foundational libraries (@mozilla/readability, cheerio, happy-dom, undici) as they frequently add new features, selectors, and performance improvements that can enhance web scraping solutions.

## Key APIs

### Fetching Web Page Source

```typescript
import { fetchPageSource } from '@have/spider';

// Fetch page source with simple HTTP request (fast, cached)
const htmlContent = await fetchPageSource({
  url: 'https://example.com/article',
  cheap: true,        // Use simple HTTP fetch (default)
  cache: true,        // Use caching (default)
  cacheExpiry: 300000, // 5 minutes cache expiry
  timeout: 30000      // 30 second timeout
});

// Fetch with DOM processing (slower but handles complex HTML)
const processedHtml = await fetchPageSource({
  url: 'https://example.com/article',
  cheap: false,       // Use DOM processing with happy-dom
  headers: {
    'User-Agent': 'My Custom Bot 1.0'
  }
});
```

### Parsing HTML Content

```typescript
import { parseIndexSource } from '@have/spider';
import * as cheerio from 'cheerio';

// Extract links from an HTML page
const htmlSource = '<html><body><a href="/page1">Link 1</a><a href="/page2">Link 2</a></body></html>';
const links = await parseIndexSource(htmlSource);
console.log(links); // ['/page1', '/page2']

// Use cheerio directly for custom parsing
const $ = cheerio.load(htmlSource);
const text = $('.content').text();
const hrefs = $('a').map((i, el) => $(el).attr('href')).get();
```

### DOM Processing with Happy-DOM

```typescript
import { createWindow, processHtml } from '@have/spider';

// Create a DOM window for manipulation
const window = createWindow();
const document = window.document;
document.body.innerHTML = '<div>Hello World</div>';
console.log(document.querySelector('div')?.textContent); // "Hello World"

// Process HTML to ensure proper DOM structure
const cleanHtml = await processHtml('<div><p>Malformed HTML</div>');
console.log(cleanHtml); // Properly formatted HTML
```


## Dependencies

The package has the following dependencies:

- `@have/files`: For file system operations and caching functionality
- `@have/utils`: For utility functions, logging, error handling, and URL validation
- `@mozilla/readability`: For extracting readable content from web pages
- `cheerio`: For server-side HTML parsing and jQuery-like DOM manipulation
- `happy-dom`: For lightweight DOM implementation and HTML processing
- `undici`: For high-performance HTTP requests (Node.js official HTTP client)

## Development Guidelines

### Web Scraping Ethics and Performance

- Respect `robots.txt` directives and website terms of service
- Use built-in caching to avoid repeated requests to the same URLs
- Implement appropriate delays between requests when crawling multiple pages
- Use meaningful User-Agent strings to identify your application
- Handle rate limiting and HTTP error responses gracefully
- Consider using the `cheap: true` option for faster, simpler requests

### Caching Strategy

- The package automatically caches responses based on URL and options
- Cache files are stored using `@have/files` in a structured directory format
- Default cache expiry is 5 minutes (300,000ms) but can be customized
- Use different cache keys for `cheap` vs DOM-processed requests
- Clear cache when needed by deleting cached files

### Error Handling

- Always handle ValidationError for invalid URLs or parameters
- Catch NetworkError for HTTP failures, timeouts, and connectivity issues
- Handle ParsingError for HTML processing failures with happy-dom
- Use appropriate timeouts to prevent hanging requests
- Implement fallback strategies for failed requests

### Performance Optimization

- Use `cheap: true` for simple HTML fetching when DOM processing isn't needed
- Leverage undici's high-performance HTTP client for concurrent requests
- Cache frequently accessed content to reduce network overhead
- Use happy-dom instead of full browsers for better performance

### Testing

The package includes tests for verifying core functionality:

```bash
bun test        # Run tests once
bun test:watch  # Run tests in watch mode
```

Current tests verify:
- Page source fetching with caching (both cheap and DOM-processed modes)
- Happy-DOM window creation and HTML processing
- Error handling for various edge cases

### Building

Build the package with:

```bash
bun run build       # Build TypeScript to dist/
bun run build:watch # Build in watch mode
bun run clean       # Remove dist directory
bun run dev         # Run build and tests in watch mode
```

### Best Practices

- Always validate URLs before making requests using the built-in validation
- Use structured error handling with the specific error types (ValidationError, NetworkError, ParsingError)
- Leverage caching to improve performance and reduce server load
- Choose the appropriate fetching mode (`cheap` vs DOM processing) based on needs
- Set reasonable timeouts to prevent hanging operations
- Use cheerio for complex HTML parsing and extraction tasks
- Handle malformed HTML gracefully with happy-dom processing

## Documentation Links

Always reference the latest documentation when planning web scraping solutions, as these libraries frequently add new selectors, methods, and performance improvements:

### Core Libraries

- **@mozilla/readability**: [GitHub Repository](https://github.com/mozilla/readability)
  - Firefox's readability engine for extracting clean article content
  - Current version: 0.5.0 - Check for new extraction features and content parsing improvements
  - Use for converting complex web pages into clean, readable text
  
- **cheerio**: [Official Documentation](https://cheerio.js.org/) | [GitHub](https://github.com/cheeriojs/cheerio)
  - Server-side implementation of jQuery for HTML manipulation
  - Current version: 1.0.0 - Review for new selectors, traversal methods, and parsing optimizations
  - Best for extracting specific content using CSS selectors
  
- **happy-dom**: [GitHub Repository](https://github.com/capricorn86/happy-dom) | [Documentation](https://github.com/capricorn86/happy-dom/wiki/)
  - Lightweight DOM implementation optimized for server-side use
  - Current version: 18.0.1 - Monitor for new DOM API support and performance enhancements
  - Faster alternative to headless browsers for DOM manipulation
  
- **undici**: [Official Documentation](https://undici.nodejs.org) | [API Reference](https://github.com/nodejs/undici/blob/HEAD/docs/)
  - Official Node.js HTTP client with superior performance
  - Current version: 7.11.0 - Check for new request methods, connection pooling features, and performance updates
  - Replaces node-fetch and axios for better performance

### Expert Agent Instructions

When working with @have/spider:

1. **Always check latest documentation** before implementing solutions using WebFetch tool
2. **Understand the architecture** - This package prioritizes performance over browser compatibility
3. **Choose the right tool** - Use `cheap: true` for simple fetching, DOM processing for complex HTML
4. **Leverage caching** - Built-in caching reduces redundant requests and improves performance
5. **Handle errors properly** - Use the specific error types for robust error handling

### Common Patterns

```typescript
// Fast content extraction for AI processing
const html = await fetchPageSource({ url, cheap: true });
const $ = cheerio.load(html);
const content = $('article, main, .content').text();

// Robust HTML processing with fallbacks
try {
  const processedHtml = await fetchPageSource({ url, cheap: false });
  const cleanHtml = await processHtml(processedHtml);
} catch (error) {
  if (error instanceof NetworkError) {
    // Handle network issues
  } else if (error instanceof ParsingError) {
    // Fall back to simple fetch
    const simpleHtml = await fetchPageSource({ url, cheap: true });
  }
}
```

### Integration with Other HAVE Packages

- Combine with `@have/files` for persistent caching and content storage
- Use with `@have/ai` for processing extracted content with language models
- Integrate with `@have/smrt` for building intelligent web scraping agents

This package provides lightweight, performant web interaction capabilities that are ideal for AI agents processing web content at scale.