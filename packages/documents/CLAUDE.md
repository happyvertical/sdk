# @happyvertical/documents

## Purpose and Responsibilities

The documents package provides high-level document processing that combines PDF extraction, web scraping, and OCR into a unified interface. It produces structured, hierarchical document representations with images, text, and metadata.

## Key Features

- **Unified Interface**: Process PDFs, HTML, and URLs consistently
- **Hierarchical Structure**: Documents → Parts → Sections → Images
- **Multi-Format Support**: PDFs, web pages, HTML files
- **Image Extraction**: Automatic image extraction with base64 encoding
- **Format Detection**: Automatic detection of document type
- **Dependency Integration**: Orchestrates @happyvertical/pdf, spider, ocr, files

## Architecture Overview

```
fetchDocument(url/path/html)
    ↓
Format Detection
    ├── PDF → getPDFReader() → OCR fallback
    ├── URL → getSpider() → HTML extraction
    └── HTML → Direct parsing
    ↓
Document Structure (hierarchical)
    └── Document
        └── Parts[]
            └── Sections[]
                └── Images[]
```

## Key APIs

### Basic Usage

```typescript
import { fetchDocument } from '@happyvertical/documents';

// From URL
const doc = await fetchDocument('https://example.com/page');

// From local PDF
const doc = await fetchDocument('/path/to/file.pdf');

// From HTML string
const doc = await fetchDocument('<html><body>Content</body></html>', {
  documentType: 'html'
});

// Access structure
console.log(doc.title);
console.log(doc.parts[0].sections[0].content);
console.log(doc.parts[0].images[0].src); // base64 data
```

### Document Structure

```typescript
interface Document {
  source: string;
  title?: string;
  parts: DocumentPart[];
  metadata?: Record<string, any>;
}

interface DocumentPart {
  sections: DocumentSection[];
  images: DocumentImage[];
}

interface DocumentSection {
  content: string;
  level?: number;
  style?: Record<string, any>;
}

interface DocumentImage {
  src: string; // base64 data URL
  alt?: string;
  width?: number;
  height?: number;
}
```

### Options

```typescript
const doc = await fetchDocument(url, {
  documentType: 'pdf' | 'html' | 'url', // Auto-detected if omitted
  extractImages: true, // Include images (default: true)
  pdfOptions: {}, // Pass-through to getPDFReader
  spiderOptions: {}, // Pass-through to getSpider
});
```

## Dependencies

- **Internal**:
  - `@happyvertical/files` - File operations
  - `@happyvertical/pdf` - PDF processing
  - `@happyvertical/spider` - Web scraping
  - `@happyvertical/ocr` - OCR fallback
  - `@happyvertical/utils` - Utilities

## Development Guidelines

- Always maintain hierarchical structure (Document → Part → Section/Image)
- Base64-encode images for portability
- Preserve document metadata when available
- Handle errors gracefully (return partial documents if needed)
- Support both local files and remote URLs

## Expert Agent Expertise

When working with documents:

1. **Format Detection**: Relies on file extension and content sniffing
2. **PDF Processing**: Uses @happyvertical/pdf with OCR fallback
3. **Web Scraping**: Uses @happyvertical/spider for clean content extraction
4. **Image Handling**: Extracts and encodes images as base64 data URLs
5. **Error Recovery**: Partial documents better than complete failure

## Common Patterns

```typescript
// Extract all text from any document
async function extractAllText(source: string): Promise<string> {
  const doc = await fetchDocument(source);
  return doc.parts
    .flatMap(part => part.sections)
    .map(section => section.content)
    .join('\n\n');
}

// Get all images from document
async function extractAllImages(source: string): Promise<string[]> {
  const doc = await fetchDocument(source, { extractImages: true });
  return doc.parts
    .flatMap(part => part.images)
    .map(img => img.src);
}

// Process document with AI
async function analyzeDocument(source: string) {
  const doc = await fetchDocument(source);
  const text = extractAllText(source);

  const ai = await getAI();
  const analysis = await ai.chat([
    { role: 'user', content: `Analyze this document:\n\n${text}` }
  ]);

  return analysis;
}
```

## Related Packages

- **@happyvertical/pdf**: Core PDF processing
- **@happyvertical/spider**: Web content extraction
- **@happyvertical/ocr**: OCR for scanned documents
- **@happyvertical/files**: File system operations
- **@happyvertical/ai**: Often used for document analysis
