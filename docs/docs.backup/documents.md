---
id: documents
title: "@happyvertical/documents: Document Processing"
sidebar_label: "@happyvertical/documents"
sidebar_position: 5
---

# @happyvertical/documents: Document Processing

Multi-part document processing with support for PDF, HTML, and Markdown formats.

## Overview

The `@happyvertical/documents` package provides comprehensive document processing capabilities:

- **📄 Multi-Format Support**: Process PDFs, HTML, and Markdown documents
- **🔍 Text Extraction**: Extract text content from various document formats
- **🖼️ OCR Integration**: Fallback to OCR for scanned PDFs using @happyvertical/ocr
- **🕷️ Web Scraping**: Extract content from HTML using @happyvertical/spider
- **📊 Structured Output**: Standardized document representation across formats
- **🔗 Cross-Format**: Convert between document formats

## Quick Start

```typescript
import { processDocument } from '@happyvertical/documents';

// Process a PDF document
const pdfDoc = await processDocument({
  path: '/path/to/document.pdf',
  type: 'pdf'
});

console.log('Title:', pdfDoc.title);
console.log('Content:', pdfDoc.content);
console.log('Pages:', pdfDoc.pages);

// Process HTML content
const htmlDoc = await processDocument({
  content: '<html><body><h1>Title</h1><p>Content...</p></body></html>',
  type: 'html'
});

// Process Markdown
const mdDoc = await processDocument({
  path: '/path/to/README.md',
  type: 'markdown'
});
```

## Document Structure

All processed documents return a standardized structure:

```typescript
interface Document {
  id: string;                    // Unique document identifier
  title?: string;                // Extracted document title
  content: string;               // Main text content
  metadata: {
    type: 'pdf' | 'html' | 'markdown';
    pageCount?: number;          // For PDFs
    author?: string;
    createdAt?: Date;
    modifiedAt?: Date;
  };
  pages?: Page[];                // For multi-page documents
  raw: any;                      // Original format-specific data
}
```

## PDF Processing

```typescript
import { processPDF } from '@happyvertical/documents';

// Basic PDF processing
const doc = await processPDF('/path/to/document.pdf');

// With OCR fallback for scanned PDFs
const scannedDoc = await processPDF('/path/to/scanned.pdf', {
  useOCR: true,              // Enable OCR fallback
  ocrLanguage: 'eng'         // OCR language
});

// Extract images from PDF
const pdfWithImages = await processPDF('/path/to/document.pdf', {
  extractImages: true
});

console.log('Images:', pdfWithImages.images);
```

## HTML Processing

```typescript
import { processHTML } from '@happyvertical/documents';

// Process HTML file
const htmlDoc = await processHTML('/path/to/page.html');

// Process HTML string
const htmlFromString = await processHTML({
  content: htmlString,
  baseUrl: 'https://example.com'  // For resolving relative URLs
});

// Extract specific elements
const article = await processHTML(htmlString, {
  selector: 'article',         // Extract only article content
  removeSelectors: ['.ads', '.sidebar']  // Remove unwanted elements
});
```

## Markdown Processing

```typescript
import { processMarkdown } from '@happyvertical/documents';

// Process Markdown file
const mdDoc = await processMarkdown('/path/to/README.md');

// Parse frontmatter
const mdWithFrontmatter = await processMarkdown(mdContent, {
  parseFrontmatter: true
});

console.log('Frontmatter:', mdWithFrontmatter.metadata.frontmatter);
console.log('Content:', mdWithFrontmatter.content);

// Convert to HTML
const html = await processMarkdown(mdContent, {
  outputFormat: 'html'
});
```

*Full documentation coming soon...*
