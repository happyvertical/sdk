---
id: spider
title: "@have/spider: Web Crawling and Content Extraction"
sidebar_label: "@have/spider"
sidebar_position: 4
---

# @have/spider: Web Crawling and Content Extraction

Web crawling and content parsing tools for extracting structured data from websites.

## Overview

The `@have/spider` package provides powerful web scraping capabilities:

- **🕷️ Web Crawling**: Intelligent website crawling and navigation
- **📄 Content Extraction**: Clean text and structured data extraction
- **🎯 Selector Engine**: CSS and XPath selector support
- **🚦 Rate Limiting**: Respectful crawling with built-in delays
- **🔄 Retry Logic**: Automatic retry with exponential backoff

## Quick Start

```typescript
import { scrapeDocument } from '@have/spider';

// Scrape content from a single page
const page = await scrapeDocument('https://example.com');
console.log(page.title);
console.log(page.content);
console.log(page.links);

// Scrape with options
const detailedPage = await scrapeDocument('https://example.com', {
  cache: true,
  cacheExpiry: 3600000 // 1 hour
});
```

## Content Extraction

```typescript
import { scrapeDocument, scrapeIndex } from '@have/spider';

// Scrape a single document/page
const page = await scrapeDocument('https://blog.example.com/article');
// Returns: { title, content, links, url, fetchedAt }

// Scrape an index page to get links
const index = await scrapeIndex('https://blog.example.com/articles');
// Returns: { title, links: [{ url, text }], url, fetchedAt }

// Process index and scrape all linked pages
const indexPage = await scrapeIndex('https://news.site.com');
const articles = await Promise.all(
  indexPage.links.map(link => scrapeDocument(link.url))
);
```

## Integration Example

```typescript
import { scrapeDocument, scrapeIndex } from '@have/spider';

async function scrapeWebContent(url: string) {
  // Scrape the page
  const page = await scrapeDocument(url, {
    cache: true,
    cacheExpiry: 3600000 // Cache for 1 hour
  });

  return {
    title: page.title,
    content: page.content,
    url: page.url,
    links: page.links,
    scrapedAt: page.fetchedAt
  };
}

// Scrape multiple pages from an index
async function scrapeArticleIndex(indexUrl: string) {
  const index = await scrapeIndex(indexUrl);

  const articles = await Promise.all(
    index.links.slice(0, 10).map(link => scrapeDocument(link.url))
  );

  return articles;
}
```

*Full documentation coming soon...*