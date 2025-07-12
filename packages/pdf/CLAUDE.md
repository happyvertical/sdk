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

### PDF Print Information and Ink Coverage

```typescript
import { printInfo, PaperSizes, PaperTypes, PrintQualities } from '@have/pdf';

// Basic ink coverage calculation with default settings (plain paper, normal quality)
const info = await printInfo('/path/to/document.pdf');

console.log(info.rawInkCoverage.black);     // Raw black ink coverage percentage
console.log(info.estimatedInkUsage.black);  // Estimated ink usage with paper factors
console.log(info.rawTotalCoverage);         // Raw total coverage percentage
console.log(info.estimatedTotalUsage);      // Estimated total ink usage
console.log(info.pagesAnalyzed);            // Number of pages analyzed
console.log(info.paperType.name);           // Paper type used: "Plain Paper"
console.log(info.printQuality.name);        // Print quality: "Normal"

// Photo printing with glossy paper and photo quality
const photoInfo = await printInfo('/path/to/photo.pdf', {
  paperType: 'PHOTO_GLOSSY',
  printQuality: 'PHOTO',
  paperSize: PaperSizes.A4
});

console.log(photoInfo.usageFactors.overallMultiplier); // 0.84 (0.7 * 0.8 * 1.5)
console.log(photoInfo.estimatedTotalUsage);            // Adjusted for photo paper properties

// Draft printing on recycled paper for cost savings
const draftInfo = await printInfo('/path/to/document.pdf', {
  paperType: 'RECYCLED',
  printQuality: 'DRAFT',
  pages: [1, 2, 3] // Analyze specific pages only
});

console.log(draftInfo.estimatedTotalUsage); // Lower ink usage due to draft quality

// Custom material properties for specialized paper
const customInfo = await printInfo('/path/to/document.pdf', {
  customMaterialProperties: {
    absorptionMultiplier: 0.85,
    coatingFactor: 0.9,
    description: 'Premium matte photo paper'
  },
  printQuality: 'HIGH'
});

// Available paper types and their properties
console.log(PaperTypes.PLAIN);        // Standard office paper
console.log(PaperTypes.PHOTO_GLOSSY);  // Glossy photo paper (less ink usage)
console.log(PaperTypes.PHOTO_MATTE);   // Matte photo paper
console.log(PaperTypes.CARDSTOCK);     // Heavy cardstock (more ink usage)
console.log(PaperTypes.PREMIUM);       // Premium office paper
console.log(PaperTypes.RECYCLED);      // Recycled paper (higher absorption)

// Available print qualities
console.log(PrintQualities.DRAFT);     // 70% ink usage
console.log(PrintQualities.NORMAL);    // 100% ink usage (baseline)
console.log(PrintQualities.HIGH);      // 130% ink usage
console.log(PrintQualities.PHOTO);     // 150% ink usage
```

#### Understanding Ink Usage Calculation

The library provides both **raw ink coverage** (from Ghostscript) and **estimated ink usage** (adjusted for paper and quality):

```typescript
const result = await printInfo('/path/to/document.pdf', {
  paperType: 'CARDSTOCK',
  printQuality: 'HIGH'
});

// Raw values: What Ghostscript measures from the PDF
console.log(result.rawInkCoverage);    // Base CMYK percentages
console.log(result.rawTotalCoverage);  // Sum of raw CMYK values

// Estimated values: Adjusted for real-world printing
console.log(result.estimatedInkUsage);   // Adjusted CMYK values
console.log(result.estimatedTotalUsage); // Realistic ink consumption estimate

// Usage factors applied
console.log(result.usageFactors.absorptionMultiplier); // 1.2 (cardstock absorbs more)
console.log(result.usageFactors.coatingFactor);        // 1.1 (surface properties)
console.log(result.usageFactors.qualityMultiplier);    // 1.3 (high quality uses more)
console.log(result.usageFactors.overallMultiplier);    // 1.72 (1.2 * 1.1 * 1.3)
```

## Dependencies

The package has the following dependencies:

- `unpdf`: Modern PDF processing library for text and image extraction
- `@gutenye/ocr-node`: OCR capabilities using PaddleOCR + ONNX Runtime
- `node-gs`: Node.js wrapper for Ghostscript (used for accurate ink coverage calculation)

### System Requirements

The package requires the following system dependencies:

**For OCR functionality:**
- **C++ Standard Library**: `libstdc++.so.6` (usually pre-installed)
- **ONNX Runtime**: Compatible environment for machine learning inference

**For ink coverage calculation:**
- **Ghostscript**: `gs` command-line tool for PDF processing

#### Platform-Specific Installation

**Ubuntu/Debian:**
```bash
sudo apt-get install libstdc++6 libc6-dev build-essential ghostscript
```

**NixOS:**
```bash
nix-shell -p onnxruntime stdenv.cc.cc.lib gcc ghostscript
# Or add to configuration.nix:
# environment.systemPackages = with pkgs; [ onnxruntime stdenv.cc.cc.lib gcc ghostscript ];
```

**macOS:**
```bash
xcode-select --install  # For build tools
brew install ghostscript  # For PDF ink coverage
```

#### Dependency Validation

Use the built-in dependency check to verify OCR availability:

```typescript
import { checkOCRDependencies } from '@have/pdf';

const deps = await checkOCRDependencies();
if (deps.available) {
  console.log('OCR functionality is available');
} else {
  console.warn('OCR dependencies missing:', deps.error);
}
```

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