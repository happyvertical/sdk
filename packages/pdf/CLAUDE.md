# @have/pdf: PDF Processing Package

## Purpose and Responsibilities

The `@have/pdf` package provides tools for working with PDF documents, focusing on:

- Extracting text and content from PDF files
- Converting PDFs to other formats (text, JSON)
- OCR capabilities for image-based PDFs
- Analyzing PDF structure and metadata
- Processing PDF documents for AI consumption

This package is particularly useful for AI agents that need to analyze document content, extract information from PDFs, or process document collections.

## Key APIs

### Basic PDF Text Extraction

```typescript
import { extractText } from '@have/pdf';

// Extract text from a PDF file
const text = await extractText('/path/to/document.pdf');

// Extract text with options
const textWithOptions = await extractText('/path/to/document.pdf', {
  pages: [1, 2, 3],        // Specific pages to extract
  includeMetadata: true,   // Include document metadata
  preserveFormatting: true // Attempt to preserve original formatting
});
```

### PDF Content Analysis

```typescript
import { analyzePdf } from '@have/pdf';

// Get detailed analysis of PDF content
const analysis = await analyzePdf('/path/to/document.pdf');

console.log(analysis.metadata);    // Document metadata
console.log(analysis.pageCount);   // Number of pages
console.log(analysis.structure);   // Document structure
console.log(analysis.textContent); // Extracted text
console.log(analysis.images);      // Information about embedded images
```

### OCR for Image-Based PDFs

```typescript
import { performOcr } from '@have/pdf';

// Extract text from image-based PDF using OCR
const result = await performOcr('/path/to/scanned-document.pdf', {
  language: 'eng',           // OCR language
  improveResolution: true,   // Enhance image before OCR
  outputFormat: 'text'       // Output format (text, json, hocr)
});

console.log(result.text);         // Extracted text
console.log(result.confidence);   // OCR confidence score
```

### PDF to JSON Conversion

```typescript
import { pdfToJson } from '@have/pdf';

// Convert PDF to structured JSON
const json = await pdfToJson('/path/to/document.pdf');

// The result includes structured content with layout information
console.log(json.pages);           // Array of page objects
console.log(json.pages[0].texts);  // Text elements on first page
console.log(json.pages[0].tables); // Detected tables on first page
```

### PDF Metadata Extraction

```typescript
import { extractMetadata } from '@have/pdf';

// Extract only metadata from a PDF
const metadata = await extractMetadata('/path/to/document.pdf');

console.log(metadata.title);       // Document title
console.log(metadata.author);      // Author
console.log(metadata.creationDate); // Creation date
console.log(metadata.keywords);    // Keywords
```

## Dependencies

The package has the following dependencies:

- `pdfjs-dist`: Mozilla's PDF.js for PDF parsing and rendering
- `tesseract.js`: For OCR capabilities
- `scribe.js-ocr`: Enhanced OCR processing
- `date-fns`: For date manipulation
- `pluralize`: For text processing utilities

## Development Guidelines

### PDF Processing Considerations

- PDFs can be large and complex; implement streaming where possible
- Handle different PDF versions and features gracefully
- Consider memory usage when processing large documents
- Implement timeout mechanisms for long-running operations

### OCR Strategy

- Use OCR only when necessary (image-based PDFs)
- Implement pre-processing to improve OCR results
- Consider language-specific OCR models for better accuracy
- Cache OCR results to avoid repeated processing

### Error Handling

- Handle malformed or password-protected PDFs
- Provide meaningful error messages for different failure modes
- Implement fallback strategies when primary extraction fails
- Validate PDF files before processing

### Testing

The package includes tests for verifying PDF processing:

```bash
bun test        # Run tests once
bun test:watch  # Run tests in watch mode
```

Tests use sample PDFs of different types and complexity.

### Building

Build the package with:

```bash
bun run build       # Build once
bun run build:watch # Build in watch mode
```

### Best Practices

- Log processing steps for debugging complex PDF issues
- Implement retry mechanisms for unreliable operations
- Use appropriate timeout values for processing operations
- Consider progressive enhancement (basic text extraction first, OCR as fallback)
- Normalize extracted text for consistent downstream processing
- Preserve document structure when possible for better analysis

This package provides specialized tools for working with PDF documents, making them accessible to AI agents and other components of the HAVE SDK.