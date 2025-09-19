---
id: pdf
title: "@have/pdf: PDF Processing and Text Extraction"
sidebar_label: "@have/pdf"
sidebar_position: 5
---

# @have/pdf: PDF Processing and Text Extraction

Utilities for parsing and processing PDF documents with OCR fallback capabilities.

## Overview

The `@have/pdf` package provides comprehensive PDF processing:

- **📄 Text Extraction**: Extract text from PDF documents
- **🖼️ OCR Fallback**: Handle scanned PDFs with OCR
- **📊 Metadata Extraction**: Author, title, creation date, etc.
- **📋 Table Extraction**: Extract structured data from tables
- **🔍 Content Analysis**: Page analysis and structure detection

## Quick Start

```typescript
import { PDFProcessor } from '@have/pdf';

const pdf = new PDFProcessor();

// Extract text from PDF
const text = await pdf.extractText('/path/to/document.pdf');
console.log(text);

// Extract with metadata
const result = await pdf.extract('/path/to/document.pdf');
console.log(result.text);
console.log(result.metadata);
console.log(result.pages);
```

## Advanced Processing

```typescript
// Extract tables from PDF
const tables = await pdf.extractTables('/path/to/report.pdf');

// OCR for scanned documents
const ocrText = await pdf.extractWithOCR('/path/to/scanned.pdf');

// Page-by-page processing
const pages = await pdf.extractPages('/path/to/document.pdf');
pages.forEach((page, index) => {
  console.log(`Page ${index + 1}: ${page.text}`);
});
```

## Integration with Content

```typescript
import { Content } from '@have/content';
import { PDFProcessor } from '@have/pdf';

async function processPDFToContent(filePath: string): Promise<Content> {
  const pdf = new PDFProcessor();
  const extracted = await pdf.extract(filePath);

  const content = new Content({
    title: extracted.metadata.title || path.basename(filePath, '.pdf'),
    body: extracted.text,
    author: extracted.metadata.author,
    type: 'document',
    fileKey: filePath,
    source: 'pdf_upload',
    status: 'published'
  });

  await content.save();
  return content;
}
```

*Full documentation coming soon...*