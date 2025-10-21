# Spider Package Specification

## Overview

The Spider package provides a standardized interface for fetching and parsing web content. It abstracts the underlying fetching and parsing mechanisms, allowing consuming applications to use a consistent API for interacting with web pages.

The primary goal is to fetch a web page, parse its content, and extract relevant information, such as links, text, or other data.

## Core Concepts

- **SpiderManager**: The main entry point and public interface of the package. It is initialized with a specific adapter and orchestrates the fetching and parsing of web content.
- **Adapter**: An adapter that conforms to the `ISpiderAdapter` interface. Each adapter is responsible for communicating with a specific backend service (e.g., a simple HTTP client, a headless browser) and transforming the response into a standardized `Page` format.
- **Page**: A standardized data structure representing a web page. It contains detailed information like the URL, content, and extracted links.
- **Caching**: The package will use `@happyvertical/cache` to cache responses, reducing redundant fetches and improving performance.

## Data Models

### Page

This is the standardized object returned from any fetch operation.

```typescript
interface Page {
  // The final URL of the page after any redirects.
  url: string;

  // The full HTML content of the page.
  content: string;

  // An array of links extracted from the page.
  links: string[];

  // The original, raw response from the adapter.
  // Useful for debugging or accessing adapter-specific data.
  raw: any;
}
```

## Adapter Interface

All adapters must implement this interface.

```typescript
interface ISpiderAdapter {
  /**
   * Fetches a web page and returns a standardized Page object.
   * @param url The URL of the page to fetch.
   * @param options Optional configuration for the fetch operation.
   * @returns A promise that resolves to a Page object.
   */
  fetch(url: string, options?: FetchOptions): Promise<Page>;
}

interface FetchOptions {
  // Custom headers to include in the request.
  headers?: Record<string, string>;

  // Request timeout in milliseconds.
  timeout?: number;

  // Whether to use the cache.
  cache?: boolean;

  // Cache expiry time in milliseconds.
  cacheExpiry?: number;
}
```

## Public API

The primary way to interact with this package is through the `getSpider` factory function.

### `getSpider(options)`

This function returns a standardized Spider Adapter that conforms to the `ISpiderAdapter` interface, based on the provided options.

```typescript
// The interface of the returned adapter.
// Note: This is structurally identical to the ISpiderAdapter interface.
interface ISpiderAdapter {
  fetch(url: string, options?: FetchOptions): Promise<Page>;
}

// Configuration options for the factory function.
// This allows for selecting and configuring the desired adapter.
type SpiderAdapterOptions =
  | {
      adapter: 'simple';
      // No specific options for the simple adapter
    }
  | {
      adapter: 'dom';
      // No specific options for the dom adapter
    }
  | {
      adapter: 'crawlee';
      // Crawlee-specific options can be added here
    };

function getSpider(options: SpiderAdapterOptions): ISpiderAdapter;
```

### Example Usage

This demonstrates how another package would use the `getSpider` factory.

```typescript
import { getSpider } from '@happyvertical/spider';

// The adapter is created by calling the factory with the desired adapter.
const spider = getSpider({
  adapter: 'crawlee',
});

async function crawlAndLogLinks(url: string) {
  try {
    const page = await spider.fetch(url, { cache: true, cacheExpiry: 300000 });

    console.log(`Fetched page: ${page.url}`);
    console.log('Found links:', page.links);

  } catch (error) {
    console.error('Failed to fetch page:', error);
  }
}

crawlAndLogLinks('https://example.com');
```

## Dependencies

- `@happyvertical/cache`
- `@happyvertical/files`
- `@happyvertical/utils`
- `cheerio`
- `happy-dom`
- `crawlee`
- `undici`

## Future Work

- **Robots.txt respect**: Add functionality to automatically fetch and respect `robots.txt` files.
- **Additional Parsers**: Extend the `Page` object to include more parsed data, such as text content, metadata, or structured data (e.g., JSON-LD).
- **Queueing System**: Integrate a queueing system (e.g., BullMQ) to manage and throttle crawl jobs.