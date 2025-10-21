# @happyvertical/pdf: PDF Processing Package

## Purpose and Responsibilities

The `@happyvertical/pdf` package provides comprehensive tools for working with PDF documents in Node.js environments, combining direct text extraction with intelligent OCR fallback. It focuses on:

- **Text Extraction**: Direct extraction from text-based PDFs using unpdf
- **OCR Integration**: Automatic fallback to OCR for image-based/scanned PDFs via @happyvertical/ocr
- **Smart Analysis**: Document analysis with processing strategy recommendations (text/ocr/hybrid)
- **Metadata Extraction**: Comprehensive PDF metadata (title, author, dates, encryption status)
- **Image Extraction**: Extract images for OCR processing or display
- **Error Resilience**: Graceful handling of corrupted, malformed, or encrypted PDFs

This package is particularly useful for AI agents that need to analyze document content, extract information from diverse PDF formats, and intelligently handle both text-based and image-based documents.

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation for foundational libraries (unpdf and @happyvertical/ocr) as they frequently add new features, performance improvements, and language support that can enhance PDF processing solutions.

## Current Implementation Status

- **Node.js**: ✅ Fully implemented with unpdf + OCR integration
- **Browser**: ⚠️ Planned for future releases (PDF.js provider stubbed but not implemented)
- **Environment Detection**: ✅ Automatic provider selection based on runtime

## Key APIs

### Modern Factory-Based PDF Reader with Smart Processing

```typescript
import { getPDFReader } from '@happyvertical/pdf';

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
import { getPDFReader } from '@happyvertical/pdf';

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

### Environment Variable Configuration

The @happyvertical/pdf package supports configuration via environment variables using the `HAVE_PDF_{FIELD}` naming pattern. Environment variables are automatically loaded and merged with user-provided options, with user options always taking precedence.

#### Supported Environment Variables

| Environment Variable | Type | Description | Example |
|---------------------|------|-------------|---------|
| `HAVE_PDF_ENABLE_OCR` | boolean | Enable OCR fallback for image-based PDFs | `true`, `false`, `1`, `0`, `yes`, `no` |
| `HAVE_PDF_TIMEOUT` | number | Processing timeout in milliseconds | `30000`, `60000` |
| `HAVE_PDF_PROVIDER` | string | PDF provider to use | `unpdf`, `pdfjs`, `auto` |
| `HAVE_PDF_MAX_FILE_SIZE` | number | Maximum file size in bytes | `52428800` (50MB) |

#### Usage Examples

```typescript
import { getPDFReader } from '@happyvertical/pdf';

// Set environment variables (in .env file or shell)
// HAVE_PDF_ENABLE_OCR=true
// HAVE_PDF_TIMEOUT=30000
// HAVE_PDF_PROVIDER=unpdf

// Create reader using environment variables
const reader = await getPDFReader();
// Uses: enableOCR=true, timeout=30000, provider='unpdf'

// Override environment variables with user options
const customReader = await getPDFReader({
  timeout: 60000, // Overrides HAVE_PDF_TIMEOUT
  provider: 'auto', // Overrides HAVE_PDF_PROVIDER
});
// Uses: enableOCR=true (from env), timeout=60000 (user), provider='auto' (user)

// Boolean environment variables support multiple formats
// HAVE_PDF_ENABLE_OCR=true  → true
// HAVE_PDF_ENABLE_OCR=1     → true
// HAVE_PDF_ENABLE_OCR=yes   → true
// HAVE_PDF_ENABLE_OCR=false → false
// HAVE_PDF_ENABLE_OCR=0     → false
```

#### Configuration Priority

Configuration is resolved in the following order (highest to lowest priority):

1. **User-provided options** (passed directly to `getPDFReader()`)
2. **Environment variables** (`HAVE_PDF_{FIELD}`)
3. **Default values** (defined in the package)

```typescript
// Example with priority demonstration
process.env.HAVE_PDF_TIMEOUT = '30000';
process.env.HAVE_PDF_ENABLE_OCR = 'true';

// User option overrides env var
const reader = await getPDFReader({ timeout: 60000 });
// Result: timeout=60000 (user), enableOCR=true (env)
```

#### Type Conversion

Environment variables are automatically converted to the correct type based on the schema:

- **boolean**: Accepts `true`, `false`, `1`, `0`, `yes`, `no` (case-insensitive)
- **number**: Converts string to number, logs warning if conversion fails
- **string**: Used as-is without conversion

```typescript
// Invalid type conversions are handled gracefully
process.env.HAVE_PDF_TIMEOUT = 'not-a-number';
const reader = await getPDFReader();
// Logs warning, skips invalid value, uses default
```

#### Best Practices

1. **Use environment variables for deployment configuration**: Set default values per environment (dev, staging, prod)
2. **Use user options for runtime configuration**: Override defaults based on specific use cases
3. **Validate critical settings**: Check capabilities and dependencies after creating reader
4. **Document environment variables**: Add comments in `.env.example` files

```typescript
// Good: Deployment-level config via env vars, runtime overrides via options
// .env file:
// HAVE_PDF_ENABLE_OCR=true
// HAVE_PDF_TIMEOUT=30000

// Runtime usage:
const reader = await getPDFReader();
const deps = await reader.checkDependencies();
if (!deps.available) {
  console.error('PDF processing unavailable:', deps.error);
}

// Special case: disable OCR for fast processing
const fastReader = await getPDFReader({ enableOCR: false });
```

### Comprehensive PDF Analysis

```typescript
import { getPDFReader } from '@happyvertical/pdf';

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
import { getPDFReader } from '@happyvertical/pdf';

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
} from '@happyvertical/pdf';

// Check available providers in current environment
const providers = getAvailableProviders();
console.log('Available providers:', providers); // ['unpdf'] in Node.js, [] in other environments

// Check specific provider availability
const isUnpdfAvailable = isProviderAvailable('unpdf');

// Get detailed provider information
const providerInfo = await getProviderInfo('unpdf');
console.log('Provider capabilities:', providerInfo.capabilities);
console.log('Dependencies status:', providerInfo.dependencies);

// Create reader (auto-selects unpdf in Node.js)
const reader = await getPDFReader({ provider: 'auto' }); // Recommended approach

// Force specific provider (Node.js only currently)
try {
  const unpdfReader = await getPDFReader({ provider: 'unpdf' });
} catch (error) {
  console.error('Provider not available:', error.message);
}
```

### Multi-Language OCR Support

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();

// Extract images first
const images = await reader.extractImages('/path/to/multilingual.pdf');

if (images.length > 0) {
  // Process multilingual documents (language support depends on OCR provider)
  const result = await reader.performOCR(images, {
    language: 'eng',         // English - most widely supported
    confidenceThreshold: 70
  });

  console.log('OCR Text:', result.text);
  console.log('Confidence:', result.confidence);

  // Check available languages through capabilities
  const capabilities = await reader.checkCapabilities();
  if (capabilities.ocrLanguages) {
    console.log('Available OCR languages:', capabilities.ocrLanguages);
  }
}
```

### Dependency Validation and Error Handling

```typescript
import { getPDFReader } from '@happyvertical/pdf';

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
} from '@happyvertical/pdf';

// IMPORTANT: Migrate to new factory-based approach for better features and performance
const reader = await getPDFReader();
const text = await reader.extractText('/path/to/document.pdf');
```

## Architecture and Code Organization

### Provider Architecture

The package uses a **provider pattern** with environment-aware selection:

```
src/
├── index.ts                 # Main entry point with legacy compatibility
├── shared/
│   ├── types.ts            # Comprehensive TypeScript interfaces and error classes
│   ├── base.ts             # BasePDFReader abstract class (ENOTSUP pattern)
│   └── factory.ts          # getPDFReader() factory with auto-detection
├── node/
│   ├── unpdf.ts            # UnpdfProvider - direct PDF processing
│   └── combined.ts         # CombinedNodeProvider - unpdf + OCR integration
└── browser/
    ├── pdfjs.ts            # PDF.js provider (planned, not implemented)
    ├── combined.ts         # Browser combined provider (planned)
    └── factory.ts          # Browser factory (planned)
```

### Key Classes and Their Roles

1. **BasePDFReader** (`src/shared/base.ts`)
   - Abstract base class for all providers
   - Default implementations throw `PDFUnsupportedError`
   - Provides helper methods: `normalizeSource()`, `validatePDFData()`, `normalizePages()`, etc.
   - Pattern: Only override methods the provider supports

2. **UnpdfProvider** (`src/node/unpdf.ts`)
   - Direct PDF processing using unpdf library
   - Handles: text extraction, metadata, image extraction
   - Does NOT support OCR (throws PDFUnsupportedError)
   - Lazy-loads unpdf to minimize bundle size

3. **CombinedNodeProvider** (`src/node/combined.ts`)
   - **Primary Node.js provider** - delegates to UnpdfProvider + @happyvertical/ocr
   - Intelligent fallback: tries text extraction first, then OCR if needed
   - `extractText()` with automatic OCR fallback (unless `skipOCRFallback: true`)
   - Combines capabilities from both unpdf and OCR providers

4. **Factory Functions** (`src/shared/factory.ts`)
   - `getPDFReader()` - Main entry point, auto-detects environment
   - `getAvailableProviders()` - Returns available providers for current environment
   - `isProviderAvailable()` - Check specific provider availability
   - `getProviderInfo()` - Get detailed provider capabilities and status
   - `initializeProviders()` - Warm up providers (called on module load)

### Type System

All types are defined in `src/shared/types.ts`:

- **Interfaces**: `PDFReader`, `PDFMetadata`, `PDFImage`, `PDFInfo`, `PDFCapabilities`, `ExtractTextOptions`
- **Error Classes**: `PDFError`, `PDFUnsupportedError`, `PDFDependencyError`
- **Re-exports from @happyvertical/ocr**: `OCROptions`, `OCRResult`, `DependencyCheckResult`

## Dependencies

### Runtime Dependencies

1. **unpdf** (external, npm)
   - Version: ^1.0.6
   - Purpose: PDF parsing, text extraction, metadata, image extraction
   - Node.js only, lazy-loaded for performance
   - Used by: `UnpdfProvider`

2. **@happyvertical/ocr** (internal workspace)
   - Version: workspace:*
   - Purpose: OCR processing with multiple provider support
   - Provides: OCR factory, language support, image preprocessing
   - Used by: `CombinedNodeProvider`

### System Requirements

- **Node.js 18+** (Node.js 24+ recommended)
- **Memory**: 2GB+ recommended for OCR processing
- **OCR Dependencies**: Managed by @happyvertical/ocr (see @happyvertical/ocr documentation)

### Dependency Validation Pattern

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();

// Check all dependencies
const deps = await reader.checkDependencies();
console.log('Available:', deps.available);
console.log('Details:', deps.details); // { unpdf: true, ocr: true, ocrProviders: 1 }

// Check specific capabilities
const capabilities = await reader.checkCapabilities();
console.log('Can extract text:', capabilities.canExtractText);
console.log('Can perform OCR:', capabilities.canPerformOCR);
console.log('OCR languages:', capabilities.ocrLanguages);

// Graceful degradation
if (!capabilities.canPerformOCR) {
  console.warn('OCR not available - text-based PDFs only');
}
```

## Development Guidelines

### Core Patterns and Conventions

1. **Factory Pattern for Provider Selection**
   - Always use `getPDFReader()` - never instantiate providers directly
   - Factory handles environment detection and provider initialization
   - Supports explicit provider selection for testing: `{ provider: 'unpdf' }`

2. **ENOTSUP Error Pattern** (borrowed from @happyvertical/files)
   - Base class methods throw `PDFUnsupportedError` by default
   - Providers only override methods they support
   - Consistent error handling across all unsupported operations

3. **Lazy Loading for Performance**
   - unpdf is lazy-loaded via dynamic import in `loadUnpdf()`
   - OCR factory is created but not initialized until first use
   - Minimizes startup time and bundle size

4. **Intelligent Fallback Strategy**
   - `CombinedNodeProvider.extractText()` tries direct extraction first
   - Falls back to OCR only if no text found and `skipOCRFallback !== true`
   - Logs fallback attempts for debugging: "No direct text found, attempting OCR fallback..."

5. **Source Normalization**
   - `normalizeSource()` converts file paths, ArrayBuffer, Uint8Array to Buffer (Node.js)
   - File reading handled in provider overrides (not base class)
   - Validates PDF magic bytes: `%PDF-`

### Error Handling Best Practices

```typescript
// Always use typed error classes
import { PDFError, PDFUnsupportedError, PDFDependencyError } from '@happyvertical/pdf';

// Throwing errors
throw new PDFDependencyError('unpdf', 'Failed to load library');
throw new PDFUnsupportedError('extractImages');
throw new PDFError('Invalid PDF data', 'EINVAL');

// Catching errors
try {
  const text = await reader.extractText(source);
} catch (error) {
  if (error instanceof PDFDependencyError) {
    // Handle missing dependencies
  } else if (error instanceof PDFUnsupportedError) {
    // Handle unsupported operations
  } else if (error instanceof PDFError) {
    // Handle general PDF errors
  }
}

// Graceful degradation - return null/empty instead of throwing
return null; // extractText() when no text found
return [];   // extractImages() when no images found
```

### Page Number Conventions

- **1-based indexing** (following PDF conventions)
- `normalizePages(pages, totalPages)` handles validation and filtering
- `isValidPageNumber(pageNumber, totalPages)` checks validity
- If `pages` option is undefined, extract all pages

### Text Merging Strategies

```typescript
// Controlled by mergePages option in ExtractTextOptions
mergePageTexts(pageTexts, mergePages?: boolean): string

// mergePages: true  → pages.join(' ')     # Continuous reading
// mergePages: false → pages.join('\n\n')  # Preserve page boundaries (default)
```

### Adding New Providers

When adding a new provider (e.g., PDF.js for browsers):

1. Extend `BasePDFReader` in appropriate directory (`src/browser/`)
2. Set `protected name = 'provider-name'` for error messages
3. Override only supported methods (let others throw PDFUnsupportedError)
4. Implement `normalizeSource()` if environment has specific file handling
5. Implement `checkCapabilities()` and `checkDependencies()`
6. Update factory logic in `src/shared/factory.ts`
7. Add environment detection logic
8. Update exports in `src/index.ts`

### Performance Optimization Patterns

1. **Lazy Loading**
   ```typescript
   private unpdf: any = null;
   private async loadUnpdf() {
     if (this.unpdf) return this.unpdf;
     this.unpdf = await import('unpdf');
     return this.unpdf;
   }
   ```

2. **Page Sampling for Analysis**
   ```typescript
   // getInfo() samples first 3 pages to determine strategy
   const pagesToSample = Math.min(3, pageCount);
   // Scales estimates to full document
   ```

3. **Parallel Processing**
   ```typescript
   // Process pages sequentially for predictable memory usage
   for (const pageNum of pagesToExtract) {
     const text = await extractPageText(pageNum);
     pageTexts.push(text);
   }
   ```

4. **Direct RGB Data Path**
   ```typescript
   // UnpdfProvider passes raw RGB data to OCR (no conversion overhead)
   if (image.channels === 3 && image.width && image.height) {
     format = 'rgb'; // OCR recognizes optimal path
   }
   ```

## Common Use Cases and Patterns

### 1. Basic Text Extraction (Text-Based PDFs)

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();
const text = await reader.extractText('/path/to/document.pdf');

if (text) {
  console.log(`Extracted ${text.length} characters`);
} else {
  console.log('No text found - may be image-based PDF');
}
```

### 2. Smart Processing with Analysis First

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();

// Analyze first to determine optimal strategy
const info = await reader.getInfo('/path/to/document.pdf');

console.log(`Strategy: ${info.recommendedStrategy}`); // 'text', 'ocr', or 'hybrid'
console.log(`Pages: ${info.pageCount}`);
console.log(`Has embedded text: ${info.hasEmbeddedText}`);
console.log(`OCR required: ${info.ocrRequired}`);

// Process based on recommendation
if (info.recommendedStrategy === 'text') {
  // Fast path - no OCR needed
  const text = await reader.extractText(source, { skipOCRFallback: true });
} else if (info.recommendedStrategy === 'ocr') {
  // OCR required path
  console.log(`Expected time: ${info.estimatedProcessingTime.ocrProcessing}`);
  const text = await reader.extractText(source); // Will use OCR
} else {
  // Hybrid approach
  const text = await reader.extractText(source);
}
```

### 3. OCR Processing for Scanned PDFs

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();

// Extract images first
const images = await reader.extractImages('/path/to/scanned.pdf');
console.log(`Found ${images.length} images`);

if (images.length > 0) {
  // Perform OCR
  const ocrResult = await reader.performOCR(images, {
    language: 'eng',
    confidenceThreshold: 70,
    improveResolution: true
  });

  console.log('OCR Text:', ocrResult.text);
  console.log('Confidence:', ocrResult.confidence);

  if (ocrResult.confidence < 60) {
    console.warn('Low confidence OCR result - review manually');
  }
}
```

### 4. Batch Processing with Error Handling

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();
const pdfFiles = ['doc1.pdf', 'doc2.pdf', 'doc3.pdf'];

for (const pdfFile of pdfFiles) {
  try {
    // Analyze first for routing
    const info = await reader.getInfo(pdfFile);
    console.log(`${pdfFile}: ${info.recommendedStrategy} (${info.pageCount} pages)`);

    // Process with appropriate strategy
    if (info.recommendedStrategy === 'text') {
      const text = await reader.extractText(pdfFile, { skipOCRFallback: true });
      console.log(`✅ ${pdfFile}: ${text?.length || 0} chars (fast path)`);
    } else {
      const text = await reader.extractText(pdfFile);
      console.log(`✅ ${pdfFile}: ${text?.length || 0} chars (OCR path)`);
    }
  } catch (error) {
    console.error(`❌ ${pdfFile}:`, error.message);
    continue; // Skip to next document
  }
}
```

### 5. Metadata Extraction

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();
const metadata = await reader.extractMetadata('/path/to/document.pdf');

console.log('Document Information:');
console.log(`  Title: ${metadata.title || 'Unknown'}`);
console.log(`  Author: ${metadata.author || 'Unknown'}`);
console.log(`  Pages: ${metadata.pageCount}`);
console.log(`  Created: ${metadata.creationDate?.toLocaleDateString()}`);
console.log(`  Modified: ${metadata.modificationDate?.toLocaleDateString()}`);
console.log(`  Encrypted: ${metadata.encrypted ? 'Yes' : 'No'}`);
console.log(`  Producer: ${metadata.producer || 'Unknown'}`);
```

### 6. Multi-Language OCR

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();

// Check available OCR languages first
const capabilities = await reader.checkCapabilities();
console.log('Available OCR languages:', capabilities.ocrLanguages);

// Process with multiple languages
const images = await reader.extractImages('/path/to/multilingual.pdf');
const result = await reader.performOCR(images, {
  language: 'eng+chi_sim+deu', // English + Chinese Simplified + German
  confidenceThreshold: 60       // Lower threshold for multi-language
});

console.log('Multilingual text:', result.text);
```

### 7. Dependency Checking and Graceful Degradation

```typescript
import { getPDFReader } from '@happyvertical/pdf';

const reader = await getPDFReader();

// Check dependencies before processing
const deps = await reader.checkDependencies();
const caps = await reader.checkCapabilities();

if (!deps.available) {
  console.error('PDF processing not available:', deps.error);
  process.exit(1);
}

console.log('Available features:');
console.log(`  Text extraction: ${caps.canExtractText ? '✅' : '❌'}`);
console.log(`  Metadata: ${caps.canExtractMetadata ? '✅' : '❌'}`);
console.log(`  Images: ${caps.canExtractImages ? '✅' : '❌'}`);
console.log(`  OCR: ${caps.canPerformOCR ? '✅' : '❌'}`);

if (caps.canPerformOCR) {
  console.log(`  OCR languages: ${caps.ocrLanguages?.join(', ')}`);
} else {
  console.warn('⚠️  OCR not available - text-based PDFs only');
}
```

## Testing

### Test Structure

```bash
src/
├── factory.test.ts          # Factory function tests
├── extraction.test.ts       # Text/image extraction tests
├── metadata.test.ts         # Metadata extraction tests
├── ocr-integration.test.ts  # OCR integration tests
├── capabilities.test.ts     # Capability checking tests
├── error-handling.test.ts   # Error scenario tests
└── legacy.test.ts          # Backward compatibility tests
```

### Running Tests

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode for development

# Specific test suites
npx vitest run --grep "factory"      # Factory tests
npx vitest run --grep "extraction"   # Extraction tests
npx vitest run --grep "ocr"          # OCR tests

# Extended timeout for OCR tests
npx vitest run --testTimeout 60000
```

### Build Commands

```bash
npm run build              # Build Node.js bundle
npm run build:watch        # Watch mode for development
npm run clean              # Clean dist/ and docs/
npm run clean:all          # Clean everything including node_modules
npm run dev                # Run build:watch + test:watch in parallel
```

### Documentation Generation

```bash
npm run docs               # Generate markdown docs to docs/
npm run docs:watch         # Watch mode for docs generation
```

## Important Gotchas and Considerations

### 1. Environment Detection Limitations

**Issue**: Factory auto-detection relies on `process.versions.node` and `window/document` globals.

```typescript
// May fail in edge environments (Cloudflare Workers, Deno, etc.)
const reader = await getPDFReader({ provider: 'auto' });

// Better: Explicitly specify provider when environment is known
const reader = await getPDFReader({ provider: 'unpdf' }); // Node.js
```

### 2. OCR Fallback Behavior

**Default Behavior**: `extractText()` automatically falls back to OCR if no text found.

```typescript
// This may trigger expensive OCR unexpectedly
const text = await reader.extractText(imagePDF); // Could take 30+ seconds

// Better: Check with getInfo() first for predictable performance
const info = await reader.getInfo(imagePDF);
if (info.recommendedStrategy === 'ocr') {
  console.log('Warning: OCR required, may take time');
}

// Or: Disable OCR fallback explicitly
const text = await reader.extractText(imagePDF, { skipOCRFallback: true });
```

### 3. Page Indexing (1-based, not 0-based)

**PDF Convention**: Pages use 1-based indexing.

```typescript
// WRONG - page 0 doesn't exist
const text = await reader.extractText(pdf, { pages: [0, 1, 2] }); // Page 0 ignored

// CORRECT - pages 1, 2, 3
const text = await reader.extractText(pdf, { pages: [1, 2, 3] });
```

### 4. Null vs Empty Array Returns

**Pattern**: Methods return `null` or `[]` for "nothing found" (not errors).

```typescript
// extractText() returns null when no text found
const text = await reader.extractText(imagePDF);
if (text === null) {
  console.log('No text extracted - not an error');
}

// extractImages() returns empty array when no images
const images = await reader.extractImages(textPDF);
if (images.length === 0) {
  console.log('No images found - not an error');
}
```

### 5. Memory Usage with Large PDFs

**Issue**: Large PDFs are loaded entirely into memory (no streaming yet).

```typescript
// Risk: 200MB PDF will use 200MB+ RAM
const text = await reader.extractText('huge-document.pdf');

// Better: Check file size first
const info = await reader.getInfo('huge-document.pdf');
if (info.fileSize && info.fileSize > 100 * 1024 * 1024) {
  console.warn('Large PDF - may cause memory issues');
}

// Consider: Process page-by-page for very large documents
const text = await reader.extractText(pdf, { pages: [1, 2, 3] });
```

### 6. unpdf Library Type Definitions

**Issue**: unpdf has loose type definitions (`any` in many places).

```typescript
// Type safety is limited with unpdf internals
private unpdf: any = null; // Can't strongly type unpdf objects

// Workaround: Trust but verify with runtime checks
const pdf = await unpdf.getDocumentProxy(buffer);
if (!pdf || typeof pdf.numPages !== 'number') {
  throw new Error('Invalid PDF object from unpdf');
}
```

### 7. OCR Language Support Varies by Provider

**Issue**: OCR language availability depends on @happyvertical/ocr provider selection.

```typescript
// Check languages before processing
const capabilities = await reader.checkCapabilities();
console.log('Available:', capabilities.ocrLanguages); // May be ['eng'] or ['eng', 'chi_sim', ...]

// Don't assume language is available
const hasGerman = capabilities.ocrLanguages?.includes('deu');
if (!hasGerman) {
  console.warn('German OCR not available');
}
```

### 8. Encrypted/Password-Protected PDFs

**Current Limitation**: Password-protected PDFs are not supported.

```typescript
// Will fail with invalid PDF data
const text = await reader.extractText('encrypted.pdf');

// Better: Check metadata first
const info = await reader.getInfo('document.pdf');
if (info.encrypted) {
  console.error('PDF is encrypted - cannot process');
}
```

### 9. Error Handling - Silent Failures in Some Cases

**Behavior**: Page-level errors are logged but don't stop processing.

```typescript
// If page 2 fails, pages 1 and 3 still processed
const text = await reader.extractText(pdf, { pages: [1, 2, 3] });
// Check console for warnings like: "Failed to extract text from page 2"

// The extracted text will have empty string for page 2
// This maintains page order but may be unexpected
```

### 10. Browser Support Status

**Current Status**: Browser providers are stubbed but not implemented.

```typescript
// This will throw in browser environments
const reader = await getPDFReader(); // Error: Unable to detect environment

// Workaround: Use only in Node.js environments
if (typeof process !== 'undefined' && process.versions?.node) {
  const reader = await getPDFReader();
}
```

### 11. Legacy Function Deprecation

**Deprecated but Not Removed**: Legacy functions still work but should be avoided.

```typescript
// OLD - Deprecated (still works but don't use in new code)
import { extractTextFromPDF } from '@happyvertical/pdf';
const text = await extractTextFromPDF('/path/to/pdf');

// NEW - Preferred pattern
import { getPDFReader } from '@happyvertical/pdf';
const reader = await getPDFReader();
const text = await reader.extractText('/path/to/pdf');
```

### 12. getInfo() Sampling Behavior

**Behavior**: `getInfo()` only samples first 3 pages for performance.

```typescript
// getInfo() samples pages 1-3, estimates for full document
const info = await reader.getInfo('1000-page-document.pdf');
console.log(info.estimatedTextLength); // Estimated, not exact

// For 100% accurate text length:
const text = await reader.extractText('document.pdf');
console.log(text.length); // Exact
```

## API Documentation

The @happyvertical/pdf package generates comprehensive API documentation in both HTML and markdown formats using TypeDoc:

### Generated Documentation Formats

**HTML Documentation** (recommended for browsing):
- Generated in `docs/` directory for public website
- Full API reference with interactive navigation
- Cross-linked type definitions and examples
- Accessible via development server at `http://localhost:3030/`

**Markdown Documentation** (great for development):
- Generated in `packages/pdf/docs/` directory
- Markdown format perfect for IDE integration
- Accessible via development server at `http://localhost:3030/packages/pdf/`

### Generating Documentation

```bash
# Generate documentation for this package
npm run docs

# Generate and watch for changes during development
npm run docs:watch

# Start development server to browse documentation
npm run dev  # Serves docs at http://localhost:3030
```

### Development Workflow

Documentation is automatically generated during the build process and can be viewed alongside development:

1. **During Development**: Use `npm run docs:watch` to regenerate docs as you code
2. **Local Browsing**: Access HTML docs at `http://localhost:3030/` or markdown at `http://localhost:3030/packages/pdf/`
3. **IDE Integration**: Point your editor to `packages/pdf/docs/` for offline markdown reference

The documentation includes complete API coverage, usage examples, and cross-references to related HAVE SDK packages.

## Documentation Links

Always reference the latest documentation when implementing PDF processing solutions, as these libraries frequently add new features, performance improvements, and language support:

### Core PDF Libraries

- **unpdf**: [npm Package](https://www.npmjs.com/package/unpdf) | [GitHub Repository](https://github.com/unjs/unpdf)
  - Modern, serverless-optimized PDF processing
  - Check for new extraction features and performance improvements
  - Monitor for additional format support and edge case handling

### Internal Dependencies

- **@happyvertical/ocr**: Internal workspace package providing OCR capabilities
  - Managed through workspace dependencies
  - Supports multiple OCR providers (tesseract.js, EasyOCR)
  - See @happyvertical/ocr package documentation for detailed OCR capabilities

### Future Browser Support (Planned)

- **PDF.js**: [Official Documentation](https://mozilla.github.io/pdf.js/) | [GitHub Repository](https://github.com/mozilla/pdf.js)
  - Mozilla's PDF rendering engine (planned for future browser support)
  - Will provide browser-native PDF processing capabilities

### Expert Agent Instructions

When working with @happyvertical/pdf:

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

## Quick Reference

### Essential Imports

```typescript
// Primary factory function
import { getPDFReader } from '@happyvertical/pdf';

// Type definitions
import type {
  PDFReader,
  PDFMetadata,
  PDFImage,
  PDFInfo,
  PDFCapabilities,
  ExtractTextOptions,
  OCROptions,
  OCRResult
} from '@happyvertical/pdf';

// Error classes
import {
  PDFError,
  PDFUnsupportedError,
  PDFDependencyError
} from '@happyvertical/pdf';

// Utility functions
import {
  getAvailableProviders,
  isProviderAvailable,
  getProviderInfo
} from '@happyvertical/pdf';
```

### Core Methods Cheat Sheet

```typescript
const reader = await getPDFReader();

// Document analysis (lightweight, fast)
const info = await reader.getInfo(source);
// Returns: PDFInfo with recommendedStrategy, pageCount, hasEmbeddedText, etc.

// Text extraction (with automatic OCR fallback)
const text = await reader.extractText(source, options?);
// Returns: string | null

// Metadata extraction
const metadata = await reader.extractMetadata(source);
// Returns: PDFMetadata (always returns object, never null)

// Image extraction
const images = await reader.extractImages(source);
// Returns: PDFImage[] (empty array if no images)

// OCR processing
const ocrResult = await reader.performOCR(images, options?);
// Returns: OCRResult with text, confidence, detections

// Capability checking
const capabilities = await reader.checkCapabilities();
// Returns: PDFCapabilities

// Dependency validation
const deps = await reader.checkDependencies();
// Returns: DependencyCheckResult
```

### Common Options

```typescript
// ExtractTextOptions
{
  pages?: number[];              // [1, 2, 3] - 1-based indexing
  mergePages?: boolean;          // true = ' ', false = '\n\n' (default)
  preserveFormatting?: boolean;  // Preserve original formatting
  includeMetadata?: boolean;     // Include metadata in extraction
  skipOCRFallback?: boolean;     // Disable automatic OCR fallback
}

// OCROptions
{
  language?: string;             // 'eng', 'eng+chi_sim', etc.
  confidenceThreshold?: number;  // 0-100, filter low confidence
  outputFormat?: string;         // 'text', 'json', 'hocr'
  improveResolution?: boolean;   // Enable image preprocessing
}

// PDFReaderOptions
{
  provider?: 'unpdf' | 'pdfjs' | 'auto';  // Default: 'auto'
  enableOCR?: boolean;                     // Default: true
  defaultOCROptions?: OCROptions;
  maxFileSize?: number;                    // In bytes
  timeout?: number;                        // In milliseconds
}
```

### Decision Tree for PDF Processing

```
1. Start → Call getInfo()
   ↓
2. Check info.recommendedStrategy
   ↓
   ├─ 'text' → Use extractText({ skipOCRFallback: true }) for fast path
   │
   ├─ 'ocr' → Warn about processing time, use extractText() (will use OCR)
   │
   └─ 'hybrid' → Use extractText() (tries text first, OCR if needed)

3. Handle null/empty results gracefully
   ↓
4. Check confidence for OCR results (< 60 = low confidence)
```

### Key Files Map

```
packages/pdf/
├── src/
│   ├── index.ts                    # Main entry + legacy exports
│   ├── shared/
│   │   ├── types.ts               # All interfaces & error classes
│   │   ├── base.ts                # BasePDFReader abstract class
│   │   └── factory.ts             # getPDFReader() + utilities
│   └── node/
│       ├── unpdf.ts               # Direct PDF processing
│       └── combined.ts            # unpdf + OCR (primary)
├── package.json                    # Dependencies & scripts
├── vite.config.ts                 # Build configuration
├── tsconfig.json                  # TypeScript configuration
├── CLAUDE.md                      # This file
└── README.md                      # Public documentation
```

### Performance Characteristics

| Operation | Speed | Memory | Notes |
|-----------|-------|--------|-------|
| `getInfo()` | Fast (< 1s) | Low | Samples first 3 pages |
| `extractText()` text-based | Fast (< 5s) | Medium | Direct unpdf extraction |
| `extractText()` image-based | Slow (10-60s+) | High | OCR fallback triggered |
| `extractMetadata()` | Fast (< 1s) | Low | Lightweight metadata only |
| `extractImages()` | Medium (1-10s) | Medium | Depends on image count |
| `performOCR()` | Slow (5-30s+) | High | Depends on image count/size |

### Troubleshooting Quick Checks

```typescript
// 1. Check provider availability
console.log('Providers:', getAvailableProviders()); // Should include 'unpdf' in Node.js

// 2. Verify dependencies
const reader = await getPDFReader();
const deps = await reader.checkDependencies();
console.log('Available:', deps.available, deps.details);

// 3. Check capabilities
const caps = await reader.checkCapabilities();
console.log('OCR:', caps.canPerformOCR, caps.ocrLanguages);

// 4. Validate PDF file
const info = await reader.getInfo('/path/to/pdf');
console.log('Valid:', info.pageCount > 0);
console.log('Encrypted:', info.encrypted);

// 5. Monitor memory usage
console.log('Memory:', process.memoryUsage());
const text = await reader.extractText(largePDF);
console.log('After extraction:', process.memoryUsage());
```