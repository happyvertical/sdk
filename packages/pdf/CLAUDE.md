# @have/pdf: PDF Processing Package

## Purpose and Responsibilities

The `@have/pdf` package provides comprehensive tools for working with PDF documents, designed with environment-aware provider selection and intelligent fallback strategies. It focuses on:

- Multi-provider PDF text extraction with automatic fallback
- OCR capabilities for image-based and scanned PDFs  
- Metadata extraction and document analysis
- Cross-platform support (Node.js and browser environments)
- Intelligent provider selection based on runtime environment
- Performance optimization for large document processing

This package is particularly useful for AI agents that need to analyze document content, extract information from PDFs, process document collections, and handle diverse PDF formats including both text-based and image-based documents.

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation for foundational libraries (unpdf, tesseract.js, and related OCR libraries) as they frequently add new features, performance improvements, and language support that can enhance PDF processing solutions.

## Key APIs

### Modern Factory-Based PDF Reader with Smart Processing

```typescript
import { getPDFReader } from '@have/pdf';

// Get a PDF reader with automatic provider selection
const reader = await getPDFReader();

// Get reader with specific configuration
const reader = await getPDFReader({
  provider: 'auto',       // 'auto', 'unpdf', 'pdfjs'
  enableOCR: true,        // Enable OCR fallback
  timeout: 30000,         // Processing timeout
  maxFileSize: 50 * 1024 * 1024 // 50MB limit
});

// NEW: Analyze PDF before processing for optimal strategy
const info = await reader.getInfo('/path/to/document.pdf');
console.log('PDF Analysis:', {
  pageCount: info.pageCount,
  hasEmbeddedText: info.hasEmbeddedText,
  recommendedStrategy: info.recommendedStrategy,
  estimatedProcessingTime: info.estimatedProcessingTime
});

// Process based on analysis recommendations
if (info.recommendedStrategy === 'text') {
  // Text-based PDF - fast extraction without OCR
  const text = await reader.extractText('/path/to/document.pdf', { skipOCRFallback: true });
} else if (info.recommendedStrategy === 'ocr') {
  // Image-based PDF - OCR required
  const text = await reader.extractText('/path/to/document.pdf'); // Will use OCR
} else {
  // Hybrid approach - try text first, OCR fallback
  const text = await reader.extractText('/path/to/document.pdf');
}

// Traditional approach (still works, but less efficient)
const text = await reader.extractText('/path/to/document.pdf', {
  pages: [1, 2, 3],        // Specific pages
  mergePages: true,        // Merge into single string
  preserveFormatting: true // Preserve formatting
});
```

### Smart PDF Analysis with getInfo()

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Quick document analysis without expensive processing
const info = await reader.getInfo('/path/to/document.pdf');

console.log('Document Analysis:', {
  pageCount: info.pageCount,
  hasEmbeddedText: info.hasEmbeddedText,        // Can extract text directly
  hasImages: info.hasImages,                    // Contains images
  recommendedStrategy: info.recommendedStrategy,// 'text', 'ocr', or 'hybrid'
  ocrRequired: info.ocrRequired,               // Definitely needs OCR
  estimatedTextLength: info.estimatedTextLength,// Rough text content size
  estimatedProcessingTime: info.estimatedProcessingTime,
  title: info.title,                           // Basic metadata
  author: info.author
});

// Make processing decisions based on analysis
if (info.recommendedStrategy === 'text') {
  console.log('✅ Text-based PDF - fast extraction available');
  const text = await reader.extractText('/path/to/document.pdf', { skipOCRFallback: true });
} else if (info.recommendedStrategy === 'ocr') {
  console.log('🔍 Image-based PDF - OCR processing required');
  console.log(`Estimated time: ${info.estimatedProcessingTime?.ocrProcessing}`);
  const text = await reader.extractText('/path/to/document.pdf');
} else {
  console.log('🔄 Hybrid PDF - contains both text and images');
  const text = await reader.extractText('/path/to/document.pdf');
}

// Batch processing with smart routing
const pdfFiles = ['doc1.pdf', 'doc2.pdf', 'doc3.pdf'];
for (const pdfFile of pdfFiles) {
  const info = await reader.getInfo(pdfFile);
  console.log(`${pdfFile}: ${info.recommendedStrategy} (${info.pageCount} pages)`);
  
  if (info.recommendedStrategy === 'text') {
    // Fast path for text-based PDFs
    const text = await reader.extractText(pdfFile, { skipOCRFallback: true });
  } else {
    // Slower path for image-based PDFs
    const text = await reader.extractText(pdfFile);
  }
}
```

### Comprehensive PDF Analysis

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Extract metadata
const metadata = await reader.extractMetadata('/path/to/document.pdf');
console.log(metadata.title, metadata.author, metadata.pageCount);

// Extract images for further processing
const images = await reader.extractImages('/path/to/document.pdf');
console.log(`Found ${images.length} images`);

// Check reader capabilities
const capabilities = await reader.checkCapabilities();
console.log('OCR available:', capabilities.canPerformOCR);
console.log('Supported languages:', capabilities.ocrLanguages);
```

### Direct OCR Processing

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Extract images first
const images = await reader.extractImages('/path/to/scanned.pdf');

// Perform OCR on extracted images
const ocrResult = await reader.performOCR(images, {
  language: 'eng',              // Language code
  confidenceThreshold: 60,      // Minimum confidence (0-100)
  outputFormat: 'text',         // 'text', 'json', 'hocr'
  improveResolution: true       // Enhance image quality
});

console.log('Extracted text:', ocrResult.text);
console.log('Average confidence:', ocrResult.confidence);
console.log('Detailed detections:', ocrResult.detections);
```

### Environment-Specific Provider Selection

```typescript
import { 
  getPDFReader, 
  getAvailableProviders, 
  isProviderAvailable,
  getProviderInfo 
} from '@have/pdf';

// Check available providers in current environment
const providers = getAvailableProviders();
console.log('Available providers:', providers); // ['unpdf'] in Node.js, ['pdfjs'] in browser

// Check specific provider availability
const isUnpdfAvailable = isProviderAvailable('unpdf');

// Get detailed provider information
const providerInfo = await getProviderInfo('unpdf');
console.log('Provider capabilities:', providerInfo.capabilities);
console.log('Dependencies status:', providerInfo.dependencies);

// Force specific provider
const unpdfReader = await getPDFReader({ provider: 'unpdf' }); // Node.js only
const pdfjsReader = await getPDFReader({ provider: 'pdfjs' }); // Browser only
```

### Multi-Language OCR Support

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Process multilingual documents
const chineseText = await reader.performOCR(images, {
  language: 'chi_sim',     // Simplified Chinese
  confidenceThreshold: 70
});

const germanText = await reader.performOCR(images, {
  language: 'deu',         // German
  outputFormat: 'json'     // Get structured output
});

// Combined language processing
const multiLangText = await reader.performOCR(images, {
  language: 'eng+chi_sim+deu', // Multiple languages
  confidenceThreshold: 50
});
```

### Dependency Validation and Error Handling

```typescript
import { getPDFReader } from '@have/pdf';

try {
  const reader = await getPDFReader();
  
  // Check dependencies before processing
  const deps = await reader.checkDependencies();
  if (!deps.available) {
    console.warn('Some dependencies missing:', deps.error);
    console.log('Details:', deps.details);
  }
  
  // Process with error handling
  const text = await reader.extractText('/path/to/document.pdf');
  if (!text) {
    console.log('No text extracted - may be image-based PDF');
  }
  
} catch (error) {
  if (error.name === 'PDFDependencyError') {
    console.error('Dependency issue:', error.message);
  } else if (error.name === 'PDFUnsupportedError') {
    console.error('Unsupported operation:', error.message);
  } else {
    console.error('General PDF error:', error);
  }
}
```

### Legacy Compatibility (Deprecated)

```typescript
// These functions are deprecated but maintained for backward compatibility
import { 
  extractTextFromPDF,     // Use reader.extractText() instead
  extractImagesFromPDF,   // Use reader.extractImages() instead
  performOCROnImages,     // Use reader.performOCR() instead
  checkOCRDependencies    // Use reader.checkDependencies() instead
} from '@have/pdf';

// Migrate to new factory-based approach for better features and performance
```

## Dependencies

The package uses different providers based on the runtime environment:

### Node.js Environment
- **unpdf**: Modern serverless-optimized PDF processing library for text, metadata, and image extraction
- **tesseract.js**: Zero-dependency OCR engine for fallback text extraction

### Browser Environment  
- **PDF.js** (planned): Browser-native PDF processing
- **tesseract.js**: Web-based OCR for browser environments

### Internal Workspace Dependencies
- No internal workspace dependencies - the PDF package is self-contained

### System Requirements

OCR functionality has different requirements based on the environment:

#### Node.js OCR Requirements
- **Node.js v22+**: Required for all operations
- **Memory**: Sufficient RAM for processing large images (2GB+ recommended)
- **Optional: EasyOCR Dependencies**: For enhanced OCR accuracy (falls back to Tesseract.js)

#### Browser OCR Requirements
- **Modern Browser**: With Canvas API support
- **WebAssembly**: For Tesseract.js processing
- **Memory**: Browser memory limits apply

### Platform-Specific Installation

**NixOS:**
```bash
nix-shell -p nodejs_22
# For enhanced OCR (optional):
nix-shell -p python3 python3Packages.easyocr
```

**Ubuntu/Debian:**
```bash
# Basic Node.js setup (required)
sudo apt-get install nodejs npm

# Enhanced OCR dependencies (optional)
sudo apt-get install python3 python3-pip
pip3 install easyocr
```

**macOS:**
```bash
# Basic setup
brew install node

# Enhanced OCR dependencies (optional)  
brew install python3
pip3 install easyocr
```

### Dependency Validation

The package includes comprehensive dependency checking:

```typescript
import { getPDFReader } from '@have/pdf';

const reader = await getPDFReader();

// Check all dependencies
const deps = await reader.checkDependencies();
console.log('PDF processing available:', deps.available);
console.log('Dependency details:', deps.details);

// Check specific capabilities
const capabilities = await reader.checkCapabilities();
console.log('Can extract text:', capabilities.canExtractText);
console.log('Can perform OCR:', capabilities.canPerformOCR);
console.log('Supported OCR languages:', capabilities.ocrLanguages);

// Graceful degradation example
if (!capabilities.canPerformOCR) {
  console.warn('OCR not available - text-based PDFs only');
}
```

## Development Guidelines

### Environment-Aware Development

- Design providers for both Node.js and browser environments
- Use environment detection to select appropriate providers automatically
- Implement graceful degradation when dependencies are unavailable
- Test across different runtime environments (Node.js, browsers, edge)

### PDF Processing Strategy

- Implement intelligent fallback: text extraction → OCR → error handling
- Stream large PDFs to manage memory usage effectively
- Handle different PDF versions and features gracefully
- Implement proper timeout mechanisms for long-running operations
- Cache results when appropriate to avoid repeated processing

### OCR Provider Architecture

- Design OCR providers with standardized interfaces
- Implement multi-provider fallback (EasyOCR → Tesseract.js)
- Pre-process images for optimal OCR accuracy
- Consider language-specific models for better results
- Handle confidence thresholds intelligently

### Error Handling and Resilience

- Use typed error classes (`PDFError`, `PDFUnsupportedError`, `PDFDependencyError`)
- Implement comprehensive dependency checking before operations
- Handle malformed, encrypted, or corrupted PDFs gracefully
- Provide meaningful error messages for different failure modes
- Log processing steps for debugging complex issues

### Performance Optimization

- Lazy-load heavy dependencies (OCR engines, large libraries)
- Process pages in parallel when possible
- Implement intelligent image preprocessing
- Use appropriate memory management for large documents
- Monitor and optimize OCR processing times

### Testing

The package includes comprehensive test coverage:

```bash
bun test                    # Run all tests
bun test:watch             # Watch mode for development
bun test --grep "factory"  # Test specific functionality
bun test --timeout 60000   # Extended timeout for OCR tests
```

Test categories:
- **Unit tests**: Individual provider functionality
- **Integration tests**: End-to-end PDF processing
- **Error handling tests**: Edge cases and failures
- **Performance tests**: Large file processing
- **Cross-environment tests**: Node.js and browser compatibility

### Building

Multi-target build process for different environments:

```bash
bun run build              # Build all targets
bun run build:node         # Node.js-specific build
bun run build:browser      # Browser-specific build  
bun run build:watch        # Watch mode for development
bun run clean              # Clean build artifacts
```

### Code Organization Best Practices

```typescript
// Preferred: Use factory pattern for provider selection
const reader = await getPDFReader({ provider: 'auto' });

// Avoid: Direct provider instantiation
// const provider = new UnpdfProvider(); // Don't do this

// Preferred: Environment-aware imports
import { getPDFReader } from '@have/pdf';           // Auto-selects
import { getPDFReader } from '@have/pdf/node';      // Node.js specific
import { getPDFReader } from '@have/pdf/browser';   // Browser specific

// Error handling patterns
try {
  const text = await reader.extractText(source);
} catch (error) {
  if (error instanceof PDFDependencyError) {
    // Handle missing dependencies
  } else if (error instanceof PDFUnsupportedError) {
    // Handle unsupported operations
  }
}
```

### OCR Optimization Guidelines

```typescript
// Optimize image preprocessing for better OCR results
const ocrResult = await reader.performOCR(images, {
  language: 'eng',
  improveResolution: true,      // Enable preprocessing
  confidenceThreshold: 70,      // Filter low-confidence results
  outputFormat: 'text'          // Choose appropriate format
});

// Multi-language processing strategy
const multilingualResult = await reader.performOCR(images, {
  language: 'eng+chi_sim+deu',  // Combine languages
  confidenceThreshold: 60,      // Lower threshold for multi-lang
});

// Batch processing for multiple documents
for (const document of documents) {
  try {
    const result = await reader.extractText(document, { timeout: 30000 });
    // Process result
  } catch (error) {
    console.warn(`Failed to process ${document}:`, error.message);
    continue; // Continue with next document
  }
}
```

## Documentation Links

Always reference the latest documentation when implementing PDF processing solutions, as these libraries frequently add new features, performance improvements, and language support:

### Core PDF Libraries

- **unpdf**: [npm Package](https://www.npmjs.com/package/unpdf) | [GitHub Repository](https://github.com/unjs/unpdf)
  - Modern, serverless-optimized PDF processing
  - Check for new extraction features and performance improvements
  - Monitor for additional format support and edge case handling

- **tesseract.js**: [npm Package](https://www.npmjs.com/package/tesseract.js) | [GitHub Repository](https://github.com/naptha/tesseract.js)
  - Browser and Node.js OCR capabilities
  - Review for new language support and accuracy improvements
  - Check for WebAssembly optimizations and memory leak fixes

### Enhanced OCR Libraries (Optional)

- **EasyOCR**: [GitHub Repository](https://github.com/JaidedAI/EasyOCR) | [Documentation](https://github.com/JaidedAI/EasyOCR/blob/master/README.md)
  - High-accuracy OCR with 80+ language support
  - Monitor for new model releases and language additions
  - Check system requirements and compatibility updates

### PDF.js (Browser Provider - Planned)

- **PDF.js**: [Official Documentation](https://mozilla.github.io/pdf.js/) | [GitHub Repository](https://github.com/mozilla/pdf.js)
  - Mozilla's PDF rendering engine
  - Review for new extraction APIs and browser compatibility
  - Monitor for performance improvements and new features

### Expert Agent Instructions

When working with @have/pdf:

1. **Always check latest documentation** before implementing solutions using WebFetch tool
2. **Verify OCR language support** - libraries frequently add new languages
3. **Review performance optimizations** - OCR and PDF processing improvements are ongoing
4. **Check dependency requirements** - system requirements may change with updates
5. **Monitor breaking changes** in major version updates
6. **Test cross-platform compatibility** - ensure solutions work in target environments

Example workflow:
```typescript
// Before implementing OCR solutions, check latest capabilities
const reader = await getPDFReader();
const capabilities = await reader.checkCapabilities();
const supportedLanguages = capabilities.ocrLanguages;

// Then implement with current best practices
const result = await reader.performOCR(images, {
  language: 'eng', // Use verified supported language
  confidenceThreshold: 70,
  improveResolution: true
});
```

This package provides enterprise-grade PDF processing capabilities designed for scalable AI agent workflows across multiple environments.