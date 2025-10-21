---
id: index
title: Happy Vertical SDK
sidebar_label: Introduction
sidebar_position: 1
slug: /
---

# Happy Vertical SDK

TypeScript packages for building AI-powered applications.

## @happyvertical/ai

Multi-provider AI client with builtin adapters for OpenAI, Anthropic, Gemini, Bedrock, and HuggingFace.

```typescript
import { getAI } from '@happyvertical/ai';

// Initialize with your preferred provider
const ai = await getAI({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o'
});

// Use consistent interface across all providers
const response = await ai.chat([
  { role: 'user', content: 'Explain quantum computing' }
]);
console.log(response.content);
```

[Full documentation →](/ai)

---

## @happyvertical/cache

Unified caching interface supporting Memory, File, and Redis backends with a consistent API.

```typescript
import { getCache } from '@happyvertical/cache';

// In-memory cache (fastest, non-persistent)
const cache = await getCache({
  type: 'memory',
  maxSize: 1000
});

// Use consistent API across all backends
await cache.set('user:123', { name: 'Alice', email: 'alice@example.com' });
const user = await cache.get('user:123');

// Set with TTL (time-to-live in seconds)
await cache.set('session:abc', sessionData, 3600); // Expires in 1 hour
```

[Full documentation →](/cache)

---

## @happyvertical/config

Centralized configuration management for SMRT modules with support for multiple configuration sources.

```typescript
import { loadConfig } from '@happyvertical/config';

// Auto-discover configuration
const config = await loadConfig('myapp');

// Config will be loaded from (in order of precedence):
// - package.json "myapp" property
// - .myapprc (JSON or YAML)
// - myapp.config.js
// - myapp.config.ts

console.log(config);
```

[Full documentation →](/config)

---

## @happyvertical/documents

Multi-part document processing with support for PDF, HTML, and Markdown formats.

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
```

[Full documentation →](/documents)

---

## @happyvertical/files

File system operations with local and remote provider support.

```typescript
import { getFilesystem } from '@happyvertical/files';

// Create a local filesystem instance
const fs = await getFilesystem({ type: 'local', basePath: '/app/data' });

// Read file content
const content = await fs.read('file.txt');

// Write file content
await fs.write('output.txt', 'Hello World');

// List directory contents
const fileList = await fs.list('.');

// List with filter
const markdownFiles = await fs.list('.', { filter: /\.md$/, recursive: true });
```

[Full documentation →](/files)

---

## @happyvertical/geo

Standardized geographical information interface supporting Google Maps and OpenStreetMap.

```typescript
import { getGeoAdapter } from '@happyvertical/geo';

// Create Google Maps adapter
const geo = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!,
  timeout: 10000,
  maxResults: 10
});

// Search for a location
const results = await geo.lookup('Eiffel Tower, Paris');

results.forEach(location => {
  console.log('Name:', location.name);
  console.log('Coordinates:', location.latitude, location.longitude);
});
```

[Full documentation →](/geo)

---

## @happyvertical/logger

Structured logging for HAVE SDK with signal adapter and observability support.

```typescript
import { createLogger } from '@happyvertical/logger';

// Create a logger instance
const logger = createLogger({
  name: 'my-app',
  level: 'info'
});

// Basic logging
logger.info('Application started');
logger.debug('Debug information', { userId: 123 });
logger.warn('Warning message', { code: 'WARN_001' });
logger.error('Error occurred', { error: err });

// Structured logging with context
logger.info('User action', {
  action: 'login',
  userId: 123,
  timestamp: new Date()
});
```

[Full documentation →](/logger)

---

## @happyvertical/ocr

Standardized OCR interface with support for multiple providers including Tesseract.js and ONNX (PaddleOCR).

```typescript
import { getOCR } from '@happyvertical/ocr';

// Create OCR factory with automatic provider selection
const ocrFactory = getOCR();

// Process images
const images = [
  {
    data: imageBuffer,        // Buffer or Uint8Array
    format: 'png'            // Optional format hint
  }
];

const result = await ocrFactory.performOCR(images, {
  language: 'eng',           // Language code
  confidenceThreshold: 70,   // Filter low-confidence results
  outputFormat: 'text'       // 'text' or 'json'
});

console.log('Extracted text:', result.text);
console.log('Confidence:', result.confidence);
```

[Full documentation →](/ocr)

---

## @happyvertical/pdf

PDF parsing and text extraction.

```typescript
import { getPDFReader } from '@happyvertical/pdf';

// Get a PDF reader instance
const reader = await getPDFReader();

// Extract text from PDF
const text = await reader.extractText('/path/to/document.pdf');

// Get PDF metadata
const metadata = await reader.extractMetadata('/path/to/document.pdf');
console.log('Title:', metadata.title);
console.log('Pages:', metadata.pageCount);
console.log('Author:', metadata.author);
```

[Full documentation →](/pdf)

---

## @happyvertical/spider

Web crawling and content extraction from websites.

```typescript
import { scrapeDocument, scrapeIndex } from '@happyvertical/spider';

// Scrape content from a single page
const page = await scrapeDocument('https://example.com');
console.log('Title:', page.title);
console.log('Content:', page.content);
console.log('Links:', page.links);

// Scrape an index page to get links
const index = await scrapeIndex('https://blog.example.com/articles');
console.log('Found links:', index.links.length);
```

[Full documentation →](/spider)

---

## @happyvertical/sql

Database interface with builtin adapters for SQLite, PostgreSQL, DuckDB, and JSON.

```typescript
import { getDatabase } from '@happyvertical/sql';

// Create SQLite database
const db = await getDatabase({
  type: 'sqlite',
  filename: './data.db'
});

// Execute queries
await db.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
await db.execute('INSERT INTO users (name) VALUES (?)', ['Alice']);

// Query data
const users = await db.query('SELECT * FROM users');
console.log(users);
```

[Full documentation →](/sql)

---

## @happyvertical/translator

Translation services integration supporting Google Translate, DeepL, and LibreTranslate.

```typescript
import { getTranslator } from '@happyvertical/translator';

// Create Google Translate client
const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!
});

// Translate with auto-detection
const result = await translator.translate('Hello, world!', 'es');

console.log('Original:', result.sourceText);      // "Hello, world!"
console.log('Translated:', result.translatedText); // "¡Hola, mundo!"
console.log('From:', result.sourceLanguage);       // "en"
console.log('To:', result.targetLanguage);         // "es"
```

[Full documentation →](/translator)

---

## @happyvertical/utils

Shared utilities and helpers.

```typescript
import { generateId, formatDate, slugify } from '@happyvertical/utils';

// Generate unique IDs
const id = generateId();

// Format dates
const formatted = formatDate(new Date(), 'YYYY-MM-DD');

// Create URL-friendly slugs
const slug = slugify('Hello World!'); // 'hello-world'
```

[Full documentation →](/utils)
