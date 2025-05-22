# @have/spider

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Web crawling and content parsing tools for the HAVE SDK.

## Overview

The `@have/spider` package provides tools for crawling websites, extracting structured data, and parsing web content. It offers a simple and consistent API for web scraping tasks with built-in rate limiting, caching, and error handling.

## Features

- Web page crawling with customizable depth and breadth
- Content extraction with semantic understanding
- HTML parsing and DOM manipulation
- Table and list detection and extraction
- Automatic handling of pagination
- Rate limiting and respectful crawling
- Browser automation capabilities
- Response caching
- URL normalization and filtering

## Installation

```bash
# Install with npm
npm install @have/spider

# Or with yarn
yarn add @have/spider

# Or with pnpm
pnpm add @have/spider
```

## Usage

### Basic Web Scraping

```typescript
import { Spider } from '@have/spider';

// Create a new spider instance
const spider = new Spider();

// Fetch and parse a web page
const page = await spider.fetch('https://example.com');
console.log(page.title);
console.log(page.text);

// Extract structured content
const content = page.extract({
  title: '.page-title',
  description: 'meta[name="description"]',
  articles: {
    selector: 'article',
    multiple: true,
    extract: {
      title: 'h2',
      summary: '.summary',
      link: {
        selector: 'a.read-more',
        attr: 'href'
      }
    }
  }
});

console.log(content);
```

### Crawling Multiple Pages

```typescript
import { Spider } from '@have/spider';

// Create a spider with configuration
const spider = new Spider({
  maxConcurrent: 5,
  rateLimit: 1000, // 1 request per second
  userAgent: 'MyBot/1.0',
  timeout: 30000
});

// Crawl multiple pages starting from a URL
const results = await spider.crawl('https://example.com', {
  maxDepth: 2,
  followLinks: true,
  patterns: {
    allow: [/^https:\/\/example\.com\/blog\//],
    disallow: [/\/tag\//, /\/category\//]
  },
  extract: {
    title: 'h1',
    content: '.article-content',
    date: {
      selector: '.published-date',
      transform: (text) => new Date(text)
    }
  }
});

console.log(`Crawled ${results.length} pages`);
console.log(results);
```

### Using Headless Browser

```typescript
import { BrowserSpider } from '@have/spider';

// Create a spider with browser automation
const spider = await BrowserSpider.create({
  headless: true,
  // Additional browser options
});

// Navigate and interact with a page
await spider.goto('https://example.com/login');
await spider.type('#username', 'myusername');
await spider.type('#password', 'mypassword');
await spider.click('#login-button');
await spider.waitForNavigation();

// Extract content after interaction
const content = await spider.extract({
  title: 'h1',
  userInfo: '.user-profile',
  dashboard: {
    selector: '.dashboard-stats',
    extract: {
      visits: '.stat-visits',
      conversions: '.stat-conversions'
    }
  }
});

console.log(content);

// Close the browser when done
await spider.close();
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_spider.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.