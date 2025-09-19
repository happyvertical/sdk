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
import { WebScraperTool } from '@have/spider';

const scraper = new WebScraperTool();

// Extract content from a URL
const content = await scraper.extractContent('https://example.com');
console.log(content.title);
console.log(content.text);

// Extract specific elements
const headlines = await scraper.extractElements('https://news.site.com', 'h2.headline');
```

## Content Extraction

```typescript
// Basic content extraction
const result = await scraper.extractContent(url);
// Returns: { title, text, links, images, metadata }

// Custom extraction with selectors
const customData = await scraper.extract(url, {
  title: 'h1',
  price: '.price',
  description: '.product-description',
  images: 'img[src]'
});

// Extract multiple pages
const urls = ['https://site.com/page1', 'https://site.com/page2'];
const results = await scraper.extractMultiple(urls);
```

## Integration with Content Module

```typescript
import { Content } from '@have/content';
import { WebScraperTool } from '@have/spider';

async function scrapeToContent(url: string): Promise<Content> {
  const scraper = new WebScraperTool();
  const scraped = await scraper.extractContent(url);

  const content = new Content({
    title: scraped.title,
    body: scraped.text,
    url: url,
    source: 'web_scraping',
    status: 'published'
  });

  await content.save();
  return content;
}
```

*Full documentation coming soon...*