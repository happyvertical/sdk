# @have/pdf

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

PDF processing utilities for the HAVE SDK.

## Overview

The `@have/pdf` package provides tools for parsing, processing, and extracting data from PDF documents. It offers a simple and consistent API for working with PDF files in both browser and Node.js environments.

## Features

- PDF text extraction with layout preservation
- Metadata extraction (title, author, creation date, etc.)
- Page splitting and merging
- Image extraction
- Form field handling
- Structured data extraction
- Table detection and parsing
- Conversion to other formats (HTML, Markdown, etc.)

## Installation

```bash
# Install with npm
npm install @have/pdf

# Or with yarn
yarn add @have/pdf

# Or with pnpm
pnpm add @have/pdf
```

## Usage

### Basic Text Extraction

```typescript
import { PDFDocument } from '@have/pdf';

// Load a PDF from a file path (Node.js)
const doc = await PDFDocument.fromFile('/path/to/document.pdf');

// Or from a URL
const doc2 = await PDFDocument.fromURL('https://example.com/document.pdf');

// Extract text from the entire document
const text = await doc.extractText();
console.log(text);

// Extract text from specific pages
const page1Text = await doc.extractText({ pageNumbers: [0] }); // 0-indexed
console.log(page1Text);
```

### Metadata Extraction

```typescript
import { PDFDocument } from '@have/pdf';

const doc = await PDFDocument.fromFile('/path/to/document.pdf');

// Get document metadata
const metadata = await doc.getMetadata();
console.log(`Title: ${metadata.title}`);
console.log(`Author: ${metadata.author}`);
console.log(`Creation Date: ${metadata.creationDate}`);
console.log(`Page Count: ${metadata.pageCount}`);
```

### Converting PDF to Markdown

```typescript
import { PDFDocument } from '@have/pdf';

const doc = await PDFDocument.fromFile('/path/to/document.pdf');

// Convert to markdown
const markdown = await doc.toMarkdown();
console.log(markdown);

// Save to a file
import { writeFile } from 'fs/promises';
await writeFile('output.md', markdown);
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_pdf.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.