# @happyvertical/documents

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Document processing with hierarchical structure. Supports PDF documents with text extraction, Word (`.docx`) and PowerPoint (`.pptx`) files read through the optional Kreuzberg engine, automatic document management system detection (WordPress Download Manager, CivicWeb, DocuShare), and file caching. Uses `@happyvertical/spider` for web page analysis and `@happyvertical/pdf` for PDF text extraction.

## Installation

Install from the public npm registry:

```bash
npm install @happyvertical/documents
```

Anonymous installs also require the package's external `@happyvertical/ocr`, `@happyvertical/pdf`, and `@happyvertical/spider` dependencies to be available on public npm.

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
| `scraper` | `'basic' \| 'tree' \| 'crawlee'` | `'basic'` | Scraper strategy for content extraction. `crawlee` is a deprecated alias for `spider: 'crawlee'` with basic scraping. |
| `spider` | `'simple' \| 'dom' \| 'crawlee' \| 'crawl4ai'` | `'dom'` | Spider adapter for fetching web pages |
| `headers` | `Record<string, string>` | — | Custom HTTP headers for spider requests |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `maxDuration` | `number` | — | Max scraping time in milliseconds |
| `maxInteractions` | `number` | — | Max interactions for advanced scrapers |

### `Document` (class)

Base document handler. Manages downloading, caching, and local file path resolution. Used internally by processors; can also be used directly via `Document.create(url, options)`.

### `PDFProcessor`

Implements `DocumentProcessor`. Extracts text from PDF files, validates PDF headers (detects HTML cache poisoning), and caches processed results.

### `DOCXProcessor` and `PPTXProcessor`

Read Word and PowerPoint files through [Kreuzberg](https://www.npmjs.com/package/@kreuzberg/node) (`@kreuzberg/node`, an **optional** dependency; no LibreOffice). `fetchDocument` picks them from the `.docx` / `.pptx` extension or MIME type.

- **DOCX**: one `markdown` part per heading section, nested by heading level (text before the first heading is a leading part titled with the document title). Embedded images are attached to the first part.
- **PPTX**: one `text` part per slide, in order. `part.metadata.slide` is the 1-based slide number, `part.title` the first line of slide text, `part.notes` the speaker notes (absent when the slide has none) and `part.images` the pictures on that slide (`image.data` holds the bytes, `image.altText` the description).
- **Kreuzberg not installed**: `process()` resolves with `parts: []` and `document.unsupported = { code: 'dependency-missing', reason, dependency: '@kreuzberg/node' }` instead of throwing. Corrupt files still reject.

For bytes you already hold in memory use `extractOffice(source, 'docx' | 'pptx', { extractImages? })`, which takes a `Buffer`, `Uint8Array` or file path and returns `{ status: 'ok', format, title, parts, metadata }` or `{ status: 'unsupported', code, reason, dependency, format }`.

```typescript
import { extractOffice } from '@happyvertical/documents';

const result = await extractOffice(bytes, 'pptx');
if (result.status === 'unsupported') {
  console.warn(result.reason);
} else {
  for (const slide of result.parts) console.log(slide.metadata?.slide, slide.content, slide.notes);
}
```

### `getTitleFromUrl(url, defaultTitle?)`

Extracts a human-readable title from a URL by parsing the filename, removing extensions, and decoding URL-encoded characters.

### Types

```typescript
interface Document {
  url: string;
  type: string;
  parts: DocumentPart[];
  metadata?: Record<string, any>;
  unsupported?: { code: 'dependency-missing'; reason: string; dependency?: string };
}

interface DocumentPart {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'html' | 'markdown';
  images?: DocumentImage[];
  notes?: string; // speaker notes (PPTX slides)
  metadata?: Record<string, any>;
  parts?: DocumentPart[];
}

interface DocumentImage {
  id: string;
  url: string;
  localPath?: string;
  data?: Uint8Array; // in-memory bytes (Office documents)
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
