# @happyvertical/documents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Document processing with hierarchical structure. Currently supports PDF documents with text extraction, automatic document management system detection (WordPress Download Manager, CivicWeb, DocuShare), and file caching. Uses `@happyvertical/spider` for web page analysis and `@happyvertical/pdf` for PDF text extraction.

## Installation

```bash
npm install @happyvertical/documents
# or
pnpm add @happyvertical/documents
```

> Published to GitHub Packages (`npm.pkg.github.com`). Requires `@happyvertical/files`, `@happyvertical/pdf`, `@happyvertical/spider`, and `@happyvertical/utils` as workspace dependencies.

## Quick Start

```typescript
import { fetchDocument } from '@happyvertical/documents';

// Process a local PDF
const doc = await fetchDocument('file:///path/to/report.pdf');

for (const part of doc.parts) {
  console.log(part.title);
  console.log(part.content);
}

// Fetch a remote PDF (auto-detected from URL extension)
const remote = await fetchDocument('https://example.com/report.pdf');
console.log(remote.parts[0].content);
```

## Usage

### Document Management System Detection

When fetching web URLs, the package uses `@happyvertical/spider` to detect document management systems and extract direct PDF links:

```typescript
// WordPress Download Manager URL — spider detects the PDF link automatically
const doc = await fetchDocument(
  'https://example.com/download/meeting-minutes/',
  { scraper: 'basic', spider: 'dom' }
);
```

### Override MIME Type

```typescript
const doc = await fetchDocument('https://example.com/download?id=123', {
  type: 'application/pdf',
});
```

### Cache Control

```typescript
const doc = await fetchDocument('https://example.com/report.pdf', {
  cacheDir: './my-cache',
  cache: true,
  cacheExpiry: 600_000, // 10 minutes
});
```

## API Reference

### `fetchDocument(url, options?)`

Main factory function. Detects document format, selects the appropriate processor, and returns structured content.

- **url** `string` — Document URL or file path (`file://`, `http://`, `https://`)
- **options** `FetchDocumentOptions` — See below
- **Returns** `Promise<Document>`
- **Throws** if no processor is available for the detected MIME type

### `FetchDocumentOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `string` | auto-detected | Override MIME type detection |
| `extractImages` | `boolean` | `true` | Extract images from document (stub — currently returns `[]`) |
| `runOcr` | `boolean` | `true` for PDFs | Run OCR on extracted images (stub) |
| `cacheDir` | `string` | OS temp dir | Directory for caching downloaded files |
| `cache` | `boolean` | `true` | Enable/disable spider fetch caching |
| `cacheExpiry` | `number` | `300000` | Cache expiry in milliseconds |
| `scraper` | `'basic' \| 'crawlee'` | `'basic'` | Scraper type for content extraction |
| `spider` | `'simple' \| 'dom' \| 'crawlee'` | `'dom'` | Spider adapter for fetching web pages |
| `headers` | `Record<string, string>` | — | Custom HTTP headers for spider requests |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `maxDuration` | `number` | — | Max scraping time in milliseconds |
| `maxInteractions` | `number` | — | Max interactions for advanced scrapers |

### `Document` (class)

Base document handler. Manages downloading, caching, and local file path resolution. Used internally by processors; can also be used directly via `Document.create(url, options)`.

### `PDFProcessor`

Implements `DocumentProcessor`. Extracts text from PDF files, validates PDF headers (detects HTML cache poisoning), and caches processed results.

### `getTitleFromUrl(url, defaultTitle?)`

Extracts a human-readable title from a URL by parsing the filename, removing extensions, and decoding URL-encoded characters.

### Types

```typescript
interface Document {
  url: string;
  type: string;
  parts: DocumentPart[];
  metadata?: Record<string, any>;
}

interface DocumentPart {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'html' | 'markdown';
  images?: DocumentImage[];
  metadata?: Record<string, any>;
  parts?: DocumentPart[];
}

interface DocumentImage {
  id: string;
  url: string;
  localPath?: string;
  altText?: string;
  ocrText?: string;
  position?: number;
  metadata?: { width?: number; height?: number; format?: string };
}

interface DocumentProcessor {
  process(url: string, options?: FetchDocumentOptions): Promise<Document>;
  supports(type: string): boolean;
}
```

## License

MIT
