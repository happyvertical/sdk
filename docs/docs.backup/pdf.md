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
import { getPDFReader } from '@have/pdf';

// Get a PDF reader instance
const reader = await getPDFReader();

// Extract text from PDF
const text = await reader.extractText('/path/to/document.pdf');
console.log(text);

// Get PDF metadata
const metadata = await reader.extractMetadata('/path/to/document.pdf');
console.log('Title:', metadata.title);
console.log('Author:', metadata.author);
console.log('Pages:', metadata.pageCount);
```

## Advanced Processing

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Analyze PDF before processing
const info = await reader.getInfo('/path/to/document.pdf');
console.log('Strategy:', info.recommendedStrategy); // 'text', 'ocr', or 'hybrid'
console.log('Pages:', info.pageCount);

// Extract text with automatic OCR fallback for scanned PDFs
const text = await reader.extractText('/path/to/scanned.pdf');

// Extract images for OCR processing
const images = await reader.extractImages('/path/to/document.pdf');

// Perform OCR on extracted images
if (images.length > 0) {
  const ocrResult = await reader.performOCR(images, {
    language: 'eng',
    confidenceThreshold: 70
  });
  console.log('OCR Text:', ocrResult.text);
}
```

## Integration Example

```typescript
import { getPDFReader } from '@have/pdf';
import path from 'path';

async function processPDFDocument(filePath: string) {
  const reader = await getPDFReader();

  // Extract text and metadata
  const text = await reader.extractText(filePath);
  const metadata = await reader.extractMetadata(filePath);

  return {
    title: metadata.title || path.basename(filePath, '.pdf'),
    content: text,
    author: metadata.author,
    pageCount: metadata.pageCount,
    createdAt: metadata.creationDate
  };
}
```

*Full documentation coming soon...*