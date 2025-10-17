# @have/documents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Document processing for PDFs, HTML, and Markdown with hierarchical structure.

## Overview

`@have/documents` provides unified document processing with support for multiple formats. Documents are parsed into hierarchical parts with automatic image extraction and OCR capabilities.

## Features

- **Multi-format support**: Process PDFs, HTML, and Markdown documents
- **Hierarchical document parts**: Navigate structured content with nested sections
- **Image extraction with OCR**: Extract images and run OCR on scanned content
- **Automatic format detection**: Detects document type from URL or MIME type
- **Caching for performance**: Downloaded files are cached for faster reprocessing

## Installation

```bash
npm install @have/documents
```

```bash
pnpm add @have/documents
```

```bash
yarn add @have/documents
```

## Quick Start

```typescript
import { fetchDocument } from '@have/documents';

// Fetch and process a PDF
const doc = await fetchDocument('https://example.com/report.pdf', {
  extractImages: true,
  runOcr: true
});

// Access structured content
for (const part of doc.parts) {
  console.log(part.title);
  console.log(part.content);
}
```

## Usage Examples

### Process PDF with Images

```typescript
import { fetchDocument } from '@have/documents';

const doc = await fetchDocument('https://example.com/annual-report.pdf', {
  extractImages: true,
  runOcr: true,
  cacheDir: './cache'
});

console.log(`Document type: ${doc.type}`);
console.log(`Parts: ${doc.parts.length}`);
```

### Extract Structured Content

```typescript
import { fetchDocument } from '@have/documents';

const doc = await fetchDocument('https://example.com/document.pdf');

// Iterate through hierarchical parts
for (const part of doc.parts) {
  console.log(`Section: ${part.title}`);
  console.log(`Content: ${part.content}`);
  console.log(`Type: ${part.type}`);

  // Check for nested parts
  if (part.parts) {
    for (const subPart of part.parts) {
      console.log(`  Subsection: ${subPart.title}`);
    }
  }
}
```

### Access Document Parts and Images

```typescript
import { fetchDocument } from '@have/documents';

const doc = await fetchDocument('https://example.com/scan.pdf', {
  extractImages: true,
  runOcr: true
});

// Process each part
for (const part of doc.parts) {
  console.log(part.title);

  // Check for images with OCR text
  if (part.images) {
    for (const image of part.images) {
      console.log(`Image: ${image.url}`);
      console.log(`Alt text: ${image.altText}`);
      console.log(`OCR text: ${image.ocrText}`);

      if (image.metadata) {
        console.log(`Dimensions: ${image.metadata.width}x${image.metadata.height}`);
      }
    }
  }
}
```

## API Reference

### `fetchDocument(url, options?)`

Main factory function for fetching and processing documents.

**Parameters:**
- `url` (string): Document URL or file path (file://, http://, https://)
- `options` (FetchDocumentOptions): Processing options

**Returns:** `Promise<Document>`

**Options:**
- `cacheDir?: string` - Directory for caching files (default: OS temp dir)
- `extractImages?: boolean` - Extract images from document (default: true)
- `runOcr?: boolean` - Run OCR on images (default: true for PDFs)
- `spiderAdapter?: 'simple' | 'dom' | 'crawlee'` - HTML fetching adapter (default: 'simple')
- `type?: string` - Override MIME type detection

### Types

#### `Document`

```typescript
interface Document {
  url: string;              // Source URL
  type: string;             // MIME type
  parts: DocumentPart[];    // Hierarchical parts
  metadata?: Record<string, any>;
}
```

#### `DocumentPart`

```typescript
interface DocumentPart {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'html' | 'markdown';
  images?: DocumentImage[];
  metadata?: Record<string, any>;
  parts?: DocumentPart[];   // Nested parts
}
```

#### `DocumentImage`

```typescript
interface DocumentImage {
  id: string;
  url: string;
  localPath?: string;
  altText?: string;
  ocrText?: string;         // Text from OCR
  position?: number;
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
}
```

## License

MIT
