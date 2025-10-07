# @have/pdf

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Modern PDF processing utilities with text extraction and OCR support using unpdf and @have/ocr.

## Overview

The `@have/pdf` package provides comprehensive PDF processing capabilities for Node.js environments. It intelligently combines direct text extraction with OCR fallback for handling both text-based and image-based PDFs.

## Key Features

- **Text Extraction**: Direct text extraction from PDF documents using unpdf
- **OCR Integration**: Automatic OCR fallback for image-based PDFs using @have/ocr
- **Metadata Extraction**: Comprehensive PDF metadata (title, author, dates, etc.)
- **Image Extraction**: Extract images from PDFs for OCR or display
- **Smart Analysis**: Document analysis with processing strategy recommendations
- **Error Resilience**: Graceful handling of corrupted or malformed PDFs
- **Performance Optimization**: Intelligent provider selection and processing strategies

## Installation

```bash
# Install with bun (recommended)
bun add @have/pdf

# Or with npm
npm install @have/pdf

# Or with yarn
yarn add @have/pdf
```

## Quick Start

### Basic PDF Text Extraction

```typescript
import { getPDFReader } from '@have/pdf';

// Create a PDF reader instance
const reader = await getPDFReader();

// Extract text from a PDF file
const text = await reader.extractText('/path/to/document.pdf');
console.log(text);
```

### Smart PDF Processing with Analysis

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Analyze the PDF first to determine optimal processing strategy
const info = await reader.getInfo('/path/to/document.pdf');
console.log(`Strategy: ${info.recommendedStrategy}`);
console.log(`Pages: ${info.pageCount}`);
console.log(`Has text: ${info.hasEmbeddedText}`);
console.log(`Has images: ${info.hasImages}`);

// Extract text with strategy-aware processing
const text = await reader.extractText('/path/to/document.pdf');
if (text) {
  console.log(`Extracted ${text.length} characters`);
} else {
  console.log('No text could be extracted');
}
```

### Extract Metadata and Images

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Get comprehensive metadata
const metadata = await reader.extractMetadata('/path/to/document.pdf');
console.log(`Title: ${metadata.title}`);
console.log(`Author: ${metadata.author}`);
console.log(`Pages: ${metadata.pageCount}`);
console.log(`Created: ${metadata.creationDate}`);

// Extract images for OCR or display
const images = await reader.extractImages('/path/to/document.pdf');
console.log(`Found ${images.length} images`);
```

### OCR Processing

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Extract images from PDF
const images = await reader.extractImages('/path/to/scanned.pdf');

if (images.length > 0) {
  // Perform OCR on extracted images
  const ocrResult = await reader.performOCR(images, {
    language: 'eng',
    confidenceThreshold: 70
  });

  console.log('OCR Text:', ocrResult.text);
  console.log('Confidence:', ocrResult.confidence);
}
```

### Advanced Configuration

```typescript
import { getPDFReader } from '@have/pdf';

// Configure reader with specific options
const reader = await getPDFReader({
  provider: 'auto',           // Auto-select best provider
  enableOCR: true,            // Enable OCR fallback
  timeout: 30000,             // 30 second timeout
  maxFileSize: 50 * 1024 * 1024, // 50MB limit
  defaultOCROptions: {
    language: 'eng',
    confidenceThreshold: 70
  }
});
```

## Environment Support

Currently supports **Node.js only**:
- **Node.js**: Full PDF processing with unpdf + OCR capabilities
- **Browser**: Planned for future releases

## Dependencies

- **unpdf**: Modern PDF processing library for text, metadata, and image extraction
- **@have/ocr**: OCR capabilities with multiple provider support (tesseract.js, EasyOCR)

## System Requirements

### Basic PDF Processing
- Node.js 18+ (Node.js 24+ recommended)
- unpdf library (automatically installed)

### OCR Capabilities
- All basic PDF processing requirements
- Additional memory for image processing (2GB+ recommended)
- Optional: Enhanced OCR dependencies for better accuracy

## Error Handling

The package includes comprehensive error handling:

```typescript
import { getPDFReader } from '@have/pdf';

try {
  const reader = await getPDFReader();
  const text = await reader.extractText('/path/to/document.pdf');

  if (!text) {
    console.log('No text found - may be image-based PDF');
  }
} catch (error) {
  if (error.name === 'PDFDependencyError') {
    console.error('Missing dependencies:', error.message);
  } else if (error.name === 'PDFUnsupportedError') {
    console.error('Unsupported operation:', error.message);
  } else {
    console.error('PDF processing failed:', error);
  }
}
```

## Legacy Compatibility

The package maintains backward compatibility with legacy function exports:

```typescript
// Legacy functions (deprecated, use getPDFReader() instead)
import {
  extractTextFromPDF,
  extractImagesFromPDF,
  performOCROnImages,
  checkOCRDependencies
} from '@have/pdf';
```

## API Documentation

For complete API documentation including all methods, options, and examples, run:

```bash
npm run docs
```

Or view the generated documentation at `packages/pdf/docs/`.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.