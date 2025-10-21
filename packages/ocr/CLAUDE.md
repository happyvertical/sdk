# @happyvertical/ocr: Standardized OCR Interface Package

## Purpose and Responsibilities

The `@happyvertical/ocr` package provides a unified interface for Optical Character Recognition (OCR) operations with multi-provider support. It serves as the OCR abstraction layer for the HAVE SDK and handles:

- **Multi-Provider OCR**: Unified API for Tesseract.js and ONNX-based OCR engines (PaddleOCR PP-OCRv4)
- **Intelligent Fallback**: Automatic provider selection and fallback when primary providers fail
- **Cross-Platform Support**: Works in both Node.js and browser environments with appropriate providers
- **Environment Detection**: Automatically selects compatible OCR providers based on runtime environment
- **Performance Optimization**: Lazy loading of OCR dependencies and efficient provider management
- **Language Support**: Multi-language OCR with 60+ languages (Tesseract) and 7 core languages (ONNX)

This package abstracts away the complexities of different OCR engines, allowing other packages to perform text extraction consistently regardless of the underlying OCR provider.

## Package Architecture

### Core Components

1. **Factory Pattern (`shared/factory.ts`)**
   - `OCRFactory` class: Main factory for managing providers with singleton support
   - `getOCR()` function: Convenience function returning global factory or creating new instances
   - Provider initialization with lazy loading and parallel dependency checks
   - Automatic environment detection (Node.js, browser, unknown)
   - Global factory instance with `resetOCRFactory()` for testing

2. **Type System (`shared/types.ts`)**
   - `OCRProvider` interface: Contract that all providers must implement
   - `OCROptions`, `OCRImage`, `OCRResult`: Core data structures
   - `OCRCapabilities`, `DependencyCheckResult`: Provider metadata
   - Error classes: `OCRError`, `OCRDependencyError`, `OCRProcessingError`, `OCRUnsupportedError`

3. **Provider Implementations**
   - `TesseractProvider` (Node.js): Cross-platform OCR using Tesseract.js with worker pooling
   - `ONNXGutenyeProvider` (Node.js only): High-accuracy OCR using PaddleOCR PP-OCRv4 models
   - `WebOCRProvider` (Browser only): Browser-optimized Tesseract.js with WebAssembly

### Provider Architecture Patterns

**Provider Loading Strategy:**
- Providers loaded dynamically based on environment detection
- Import failures handled gracefully (no errors thrown, just skipped)
- Parallel dependency checks for fast provider discovery
- Workers/instances cached per language to avoid reinitialization costs

**Priority Order (Auto-selection):**
- Node.js: `['onnx', 'tesseract']` - ONNX preferred for accuracy
- Browser: `['tesseract', 'web-ocr']` - Both use Tesseract.js
- Unknown: `['tesseract']` - Fallback to most compatible

**Factory Singleton Pattern:**
```typescript
// Global singleton (shared state)
const factory1 = getOCR();
const factory2 = getOCR(); // Returns same instance

// New instance with custom config
const custom = getOCR({ provider: 'onnx' }); // Creates new instance
```

### Image Format Handling

**ONNX Provider Format Pipeline:**
1. Input format detection using file signatures (magic numbers)
2. PNG/JPEG decoding to raw RGB using `pngjs`/`jpeg-js`
3. RGB to RGBA conversion for JPEG encoding
4. High-quality JPEG encoding (90%) for PaddleOCR processing

**Tesseract Provider Format Support:**
- Direct Buffer/Uint8Array processing
- Base64 string handling with automatic decoding
- Image signature validation (PNG: `0x89504E47`, JPEG: `0xFFD8FF`, BMP: `0x424D`, GIF: `0x474946`)
- Skips invalid or too-small buffers (<100 bytes)

## Key APIs

### Factory-Based OCR Interface

```typescript
import { getOCR } from '@happyvertical/ocr';

// Get OCR factory with automatic provider selection
const ocrFactory = getOCR();

// Get OCR factory with specific configuration
const ocrFactory = getOCR({
  provider: 'auto',           // 'auto', 'tesseract', 'onnx'
  fallbackProviders: ['tesseract'], // Fallback providers if primary fails
  defaultOptions: {
    language: 'eng',
    confidenceThreshold: 70
  }
});

// Check if OCR is available in current environment
const available = await ocrFactory.isOCRAvailable();

// Perform OCR on images
const result = await ocrFactory.performOCR(images, {
  language: 'eng',
  confidenceThreshold: 60,
  outputFormat: 'text'
});

console.log('Extracted text:', result.text);
console.log('Confidence:', result.confidence);
console.log('Processing time:', result.metadata?.processingTime);
```

### Image Processing and OCR

```typescript
import { getOCR } from '@happyvertical/ocr';
import type { OCRImage } from '@happyvertical/ocr';

const ocrFactory = getOCR();

// Prepare images for OCR - multiple input formats supported
const images: OCRImage[] = [
  {
    data: imageBuffer,        // Buffer, Uint8Array, or string (base64)
    width: 1920,             // Optional: image dimensions (required for raw RGB)
    height: 1080,
    channels: 3,             // Optional: color channels (3=RGB, 4=RGBA)
    format: 'png',           // Optional: image format hint
    metadata: { source: 'pdf-page-1' } // Optional: tracking metadata
  },
  {
    // Raw RGB data (for ONNX provider)
    data: rgbPixelBuffer,
    width: 800,
    height: 600,
    channels: 3              // RGB format
  },
  {
    // Base64 encoded image
    data: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
    format: 'png'
  }
];

// Basic OCR processing
const result = await ocrFactory.performOCR(images);

// Advanced OCR with options
const advancedResult = await ocrFactory.performOCR(images, {
  language: 'eng+chi_sim',     // Multi-language support
  confidenceThreshold: 80,     // Filter low-confidence results
  improveResolution: true,     // Enhance image quality (provider-dependent)
  outputFormat: 'json',        // Get structured output with bounding boxes
  timeout: 30000              // Processing timeout
});

// Process results with bounding boxes and confidence scores
if (advancedResult.detections) {
  console.log(`Found ${advancedResult.detections.length} text detections`);
  for (const detection of advancedResult.detections) {
    console.log(`Text: "${detection.text}"`);
    console.log(`Confidence: ${detection.confidence.toFixed(1)}%`);
    if (detection.boundingBox) {
      const bbox = detection.boundingBox;
      console.log(`Position: (${bbox.x}, ${bbox.y}), Size: ${bbox.width}x${bbox.height}`);
    }
  }
}

// Check processing metadata
console.log('Processing details:', {
  provider: advancedResult.metadata?.provider,
  processingTime: advancedResult.metadata?.processingTime + 'ms',
  language: advancedResult.metadata?.language,
  detectionCount: advancedResult.metadata?.detectionCount
});
```

### Provider Discovery and Management

```typescript
import { 
  getAvailableProviders, 
  isProviderAvailable, 
  getProviderInfo 
} from '@happyvertical/ocr';

// Check available providers in current environment
const providers = await getAvailableProviders();
console.log('Available OCR providers:', providers);
// Node.js: ['onnx', 'tesseract']
// Browser: ['tesseract', 'web-ocr']

// Check specific provider availability
const onnxAvailable = await isProviderAvailable('onnx');
const tesseractAvailable = await isProviderAvailable('tesseract');

// Get detailed provider information
const tesseractInfo = await getProviderInfo('tesseract');
console.log('Tesseract capabilities:', tesseractInfo?.capabilities);
console.log('Dependencies status:', tesseractInfo?.dependencies);

// Get all provider information
const ocrFactory = getOCR();
const allProviders = await ocrFactory.getProvidersInfo();
for (const provider of allProviders) {
  console.log(`${provider.name}: ${provider.available ? 'Available' : 'Unavailable'}`);
  if (provider.capabilities) {
    console.log(`  Languages: ${provider.capabilities.supportedLanguages.length}`);
    console.log(`  Max image size: ${provider.capabilities.maxImageSize || 'Unlimited'}`);
  }
}
```

### Multi-Language OCR

```typescript
const ocrFactory = getOCR();

// Single language OCR
const englishResult = await ocrFactory.performOCR(images, {
  language: 'eng'
});

// Multi-language OCR
const multilingualResult = await ocrFactory.performOCR(images, {
  language: 'eng+chi_sim+jpn+kor', // English + Chinese + Japanese + Korean
  confidenceThreshold: 60           // Lower threshold for multi-language
});

// Get supported languages from best provider
const supportedLanguages = await ocrFactory.getSupportedLanguages();
console.log('Supported languages:', supportedLanguages);

// Check provider-specific language support
const providers = await ocrFactory.getProvidersInfo();
for (const provider of providers) {
  if (provider.capabilities) {
    console.log(`${provider.name} supports:`, provider.capabilities.supportedLanguages.slice(0, 10));
    if (provider.name === 'tesseract') {
      console.log('Tesseract supports 60+ languages including European, Asian, and African languages');
    } else if (provider.name === 'onnx') {
      console.log('ONNX optimized for: eng, chi_sim, chi_tra, fra, deu, jpn, kor');
    }
  }
}
```

### Environment-Specific Usage

```typescript
const ocrFactory = getOCR();
const environment = ocrFactory.getEnvironment();

if (environment === 'node') {
  // Node.js environment - multiple providers available
  console.log('Running in Node.js - checking for available OCR providers');
  const tesseractAvailable = await isProviderAvailable('tesseract');
  const onnxAvailable = await isProviderAvailable('onnx');

  if (onnxAvailable) {
    // Use ONNX (PaddleOCR) OCR - higher accuracy
    const result = await ocrFactory.performOCR(images, {
      language: 'eng',
      confidenceThreshold: 90
    });
  } else if (tesseractAvailable) {
    // Fallback to Tesseract.js OCR
    const result = await ocrFactory.performOCR(images, {
      language: 'eng',
      confidenceThreshold: 80
    });
  }
} else if (environment === 'browser') {
  // Browser environment - Web OCR available
  console.log('Running in browser - using WebAssembly OCR');
  
  // Tesseract.js works in browsers
  const result = await ocrFactory.performOCR(images, {
    language: 'eng',
    confidenceThreshold: 70,
    outputFormat: 'text'
  });
}
```

### Advanced Configuration and Customization

```typescript
import { OCRFactory } from '@happyvertical/ocr';

// Create custom OCR factory with specific configuration
const customFactory = new OCRFactory({
  provider: 'onnx',               // Force specific provider
  fallbackProviders: ['tesseract'], // Fallback chain if primary fails
  defaultOptions: {
    language: 'eng',
    confidenceThreshold: 85,      // Higher threshold for ONNX
    improveResolution: false,     // ONNX handles optimization internally
    outputFormat: 'json',         // Get structured output with bounding boxes
    timeout: 45000               // Extended timeout for ONNX initialization
  },
  providerConfig: {
    // Provider-specific configurations can be added here
    onnx: {
      // ONNX-specific settings would go here
    },
    tesseract: {
      // Tesseract-specific settings would go here
    }
  }
});

// Check what providers are available and their capabilities
const providersInfo = await customFactory.getProvidersInfo();
for (const provider of providersInfo) {
  console.log(`Provider: ${provider.name}`);
  console.log(`Available: ${provider.available}`);
  if (provider.capabilities) {
    console.log(`Languages: ${provider.capabilities.supportedLanguages.length}`);
    console.log(`Image formats: ${provider.capabilities.supportedFormats?.join(', ')}`);
    console.log(`Max image size: ${provider.capabilities.maxImageSize || 'Unlimited'}`);
    console.log(`Bounding boxes: ${provider.capabilities.hasBoundingBoxes}`);
    console.log(`Confidence scores: ${provider.capabilities.hasConfidenceScores}`);
  }
}

// Process with different strategies based on image characteristics
const processWithAdaptiveStrategy = async (images: OCRImage[]) => {
  const result = await customFactory.performOCR(images, {
    language: 'eng',
    timeout: 60000,  // Extended timeout for large images
    confidenceThreshold: 70  // Adaptive threshold
  });

  // Check if result quality is sufficient
  if (result.confidence < 80 && result.metadata?.provider === 'onnx') {
    console.log('ONNX result quality low, trying Tesseract fallback');
    const fallbackFactory = new OCRFactory({ provider: 'tesseract' });
    const fallbackResult = await fallbackFactory.performOCR(images, {
      language: 'eng',
      confidenceThreshold: 60  // Lower threshold for Tesseract
    });
    return fallbackResult.confidence > result.confidence ? fallbackResult : result;
  }

  return result;
};

// Clean up resources when done (important for ONNX and Tesseract workers)
try {
  const result = await processWithAdaptiveStrategy(images);
  console.log('OCR completed:', result.text);
} finally {
  await customFactory.cleanup();
}
```

### Error Handling and Debugging

```typescript
import { OCRError, OCRDependencyError, OCRProcessingError, OCRUnsupportedError } from '@happyvertical/ocr';

try {
  const result = await ocrFactory.performOCR(images);
  console.log('OCR successful:', result.text);
} catch (error) {
  if (error instanceof OCRDependencyError) {
    console.error('OCR dependencies missing:', error.message);
    console.log('Provider:', error.provider);
    // Common causes: tesseract.js not installed, ONNX runtime missing
    // Handle dependency installation or use fallback provider
  } else if (error instanceof OCRProcessingError) {
    console.error('OCR processing failed:', error.message);
    console.log('Provider:', error.provider);
    console.log('Context:', error.context);
    // Common causes: corrupted image, unsupported format, timeout
    // Try fallback approach or different image preprocessing
  } else if (error instanceof OCRUnsupportedError) {
    console.error('Unsupported operation:', error.message);
    console.log('Provider:', error.provider);
    // Provider doesn't support requested feature (e.g., specific language)
  } else if (error instanceof OCRError) {
    console.error('General OCR error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

// Debug provider status with detailed information
const providersInfo = await ocrFactory.getProvidersInfo();
for (const provider of providersInfo) {
  console.log(`${provider.name}:`, {
    available: provider.available,
    error: provider.dependencies.error,
    details: provider.dependencies.details,
    capabilities: provider.capabilities ? {
      languages: provider.capabilities.supportedLanguages.length,
      formats: provider.capabilities.supportedFormats,
      maxImageSize: provider.capabilities.maxImageSize,
      hasBoundingBoxes: provider.capabilities.hasBoundingBoxes,
      hasConfidenceScores: provider.capabilities.hasConfidenceScores
    } : null
  });
}

// Test specific image formats and error handling
const testFormats = async () => {
  const formats = ['png', 'jpg', 'jpeg', 'bmp', 'tiff'];
  for (const format of formats) {
    try {
      // Test format support
      const result = await ocrFactory.performOCR(testImages, {
        language: 'eng'
      });
      console.log(`${format}: Supported - extracted ${result.text.length} characters`);
    } catch (error) {
      console.log(`${format}: ${error instanceof OCRProcessingError ? 'Processing failed' : 'Not supported'}`);
    }
  }
};
```

## Dependencies

The package manages dependencies intelligently based on the runtime environment:

### Core Dependencies
- **@happyvertical/utils**: Shared utilities for the HAVE SDK
- **tesseract.js**: Cross-platform OCR engine (works in Node.js and browsers)
  - Provides WebAssembly-based OCR processing
  - Automatic language model downloading and caching
  - Worker-based processing for non-blocking operations

### Optional Provider Dependencies
- **@gutenye/ocr-node**: PaddleOCR PP-OCRv4 ONNX models (Node.js only)
  - High-accuracy OCR using state-of-the-art PaddleOCR models
  - Automatically installed with the package
  - Provides bounding box detection with confidence scores
  - Supports English, Chinese (Simplified/Traditional), Japanese, Korean, French, German
- **jpeg-js & pngjs**: Image processing libraries for ONNX provider format conversion
  - Required for proper image format handling in ONNX pipeline
  - Automatic RGB/RGBA conversion and JPEG encoding

### Environment Support

#### Node.js Environment
- **Tesseract.js**: Good accuracy, 60+ languages, pure JavaScript/WebAssembly
  - Cross-platform compatibility, zero system dependencies
  - Word-level confidence scores and bounding boxes
  - Automatic language model downloading
  - Supports PNG, JPEG, BMP, TIFF, PBM, PGM, PPM formats
- **ONNX (@gutenye/ocr-node)**: Highest accuracy using PaddleOCR PP-OCRv4 models
  - Superior performance on both printed and handwritten text
  - 7 core languages with specialized training
  - Precise bounding box detection and confidence scoring
  - Automatic image format conversion (PNG/JPEG to RGB)

#### Browser Environment
- **Tesseract.js**: WebAssembly-based OCR with progress tracking
  - Client-side processing, no server dependencies
  - Supports File objects, base64, data URLs, canvas ImageData
  - Progressive model loading with memory management
- **Web OCR**: Browser-optimized Tesseract.js wrapper
  - Enhanced error handling for browser environments
  - WebAssembly and Web Workers compatibility checking
  - Automatic resource cleanup and memory management

## Development Guidelines

### Provider Implementation Checklist

When adding new OCR providers:

1. **Implement OCRProvider interface**: All providers must implement the standardized interface
   ```typescript
   interface OCRProvider {
     readonly name: string;
     performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult>;
     checkDependencies(): Promise<DependencyCheckResult>;
     checkCapabilities(): Promise<OCRCapabilities>;
     getSupportedLanguages(): string[];
     cleanup?(): Promise<void>;
   }
   ```

2. **Handle dependencies gracefully**: Check dependencies without throwing errors
   - Use `checkDependencies()` to verify availability
   - Return `{ available: false, error: string, details: {...} }` on failures
   - Never throw during dependency checks (factory handles unavailable providers)

3. **Support multiple image formats**: Handle Buffer, Uint8Array, string (base64), and raw RGB data
   - Validate image signatures using magic numbers
   - Skip invalid or too-small buffers gracefully
   - Document supported formats in `checkCapabilities()`

4. **Provide meaningful error messages**: Use typed error classes
   - `OCRDependencyError`: Dependencies missing or initialization failed
   - `OCRProcessingError`: OCR operation failed during processing
   - `OCRUnsupportedError`: Feature not supported by provider
   - `OCRError`: Base class for generic OCR errors

5. **Implement cleanup methods**: Properly dispose of resources
   - Terminate workers (Tesseract: `worker.terminate()`)
   - Clean up ONNX instances (if available)
   - Clear cached workers/instances from Maps
   - Handle cleanup failures gracefully (log warnings, don't throw)

6. **Image format validation**: Check file signatures before processing
   - PNG: `[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]`
   - JPEG: `[0xFF, 0xD8, 0xFF]`
   - BMP: `[0x42, 0x4D]`
   - GIF: `[0x47, 0x49, 0x46]`

7. **Confidence scoring**: Provide meaningful confidence scores (0-100)
   - Calculate average confidence across all detections
   - Filter detections below `confidenceThreshold` if specified
   - Return detection-level and overall confidence

8. **Bounding box support**: Return precise text positioning when available
   - Format: `{ x: number, y: number, width: number, height: number }`
   - Include in detections array with per-word or per-line granularity

9. **Language mapping**: Map common language codes to provider-specific codes
   - Example: `'en' → 'eng'`, `'zh-cn' → 'chi_sim'`, `'zh-tw' → 'chi_tra'`
   - Support multi-language format: `'eng+chi_sim+jpn'`

### Code Patterns and Conventions

**Worker/Instance Caching:**
```typescript
private workers: Map<string, any> = new Map();

private async getWorker(language = 'eng') {
  if (this.workers.has(language)) {
    return this.workers.get(language);
  }
  const worker = await createWorker(language);
  this.workers.set(language, worker);
  return worker;
}
```

**Lazy Module Loading:**
```typescript
private tesseract: any = null;

private async loadTesseract() {
  if (this.tesseract) {
    return this.tesseract;
  }
  const TesseractModule = await import('tesseract.js');
  this.tesseract = TesseractModule.default || TesseractModule;
  return this.tesseract;
}
```

**Image Signature Detection:**
```typescript
const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 &&
              buffer[2] === 0x4E && buffer[3] === 0x47;
const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
```

**Confidence Calculation:**
```typescript
const validDetections = allDetections.filter(d => d.confidence > 0);
const averageConfidence = validDetections.length > 0
  ? validDetections.reduce((sum, d) => sum + d.confidence, 0) / validDetections.length
  : 0;
```

**Graceful Error Handling:**
```typescript
try {
  // Process image
} catch (imageError: any) {
  console.warn('Provider failed for image:', imageError.message || imageError);
  continue; // Skip to next image, don't fail entire batch
}
```

### Common Implementation Gotchas

1. **ONNX Format Requirements**: PaddleOCR expects JPEG format after RGB conversion
   - Must convert PNG/JPEG → RGB → RGBA → JPEG (90% quality)
   - Direct RGB data requires width/height/channels metadata

2. **Tesseract Worker Lifecycle**: Workers are expensive to create
   - Cache per language, not per operation
   - Terminate during cleanup to free memory
   - Handle initialization failures gracefully

3. **Browser vs Node.js**: Different capabilities per environment
   - Use `globalThis` for environment detection, not `window` or `process`
   - Browser: Limited to WebAssembly-compatible formats
   - Node.js: Can use native image processing libraries

4. **Empty Result Handling**: Don't fail on empty text extraction
   - Return `{ text: '', confidence: 0, detections: [] }` for empty results
   - Factory handles fallback to alternative providers if configured

5. **Timeout Handling**: Different environments need different timeouts
   - Node.js: 30s default (ONNX initialization can take time)
   - Browser: 15s default (user experience considerations)
   - Make configurable via options

### File Structure Conventions

```
src/
├── index.ts                 # Package exports
├── shared/
│   ├── factory.ts          # OCRFactory and utility functions
│   └── types.ts            # Interfaces, types, error classes
├── node/
│   ├── tesseract.ts        # Tesseract.js provider (Node.js)
│   └── onnx-gutenye.ts     # ONNX provider using @gutenye/ocr-node
└── browser/
    └── web-ocr.ts          # Browser-optimized Tesseract.js
```

### Testing OCR Providers

```typescript
// Test provider availability
const provider = new MyOCRProvider();
const deps = await provider.checkDependencies();
if (!deps.available) {
  console.log('Provider not available:', deps.error);
}

// Test OCR capabilities
const capabilities = await provider.checkCapabilities();
console.log('Supported languages:', capabilities.supportedLanguages);
console.log('Max image size:', capabilities.maxImageSize);

// Test with sample images
const testImages: OCRImage[] = [/* test image data */];
const result = await provider.performOCR(testImages);
expect(result.text.length).toBeGreaterThan(0);
```

### Performance Considerations

- **Lazy Loading**: OCR engines are loaded only when first used to reduce startup time
- **Worker Management**: Tesseract.js workers are cached per language and reused across operations
- **Memory Management**: Large images are automatically processed with memory-efficient techniques
- **Timeout Handling**: All OCR operations have configurable timeouts (default 30s, browser 15s)
- **Provider Fallback**: Failed providers automatically fall back to alternatives in priority order
- **Image Format Optimization**:
  - ONNX provider automatically converts PNG/JPEG to optimized RGB format
  - Tesseract.js handles most formats natively with WebAssembly
  - Automatic image signature detection prevents processing of invalid data
- **Confidence Filtering**: Low-confidence results can be filtered to improve output quality
- **Progressive Processing**: Browser environments show progress updates for long OCR operations

### Cross-Platform Development

- **Environment Detection**: Use `globalThis` instead of `window` or `process` for compatibility
- **Conditional Imports**: Load platform-specific providers dynamically
- **Error Handling**: Provide graceful degradation when providers are unavailable
- **Testing**: Test in both Node.js and browser environments

## Installation and Setup

### Basic Installation

```bash
# Install the OCR package
bun add @happyvertical/ocr

# The package will work out of the box with Tesseract.js
```

### Environment Variable Configuration

The @happyvertical/ocr package supports configuration via environment variables using the pattern `HAVE_OCR_{FIELD}`:

**Supported Environment Variables:**

- `HAVE_OCR_PROVIDER` - OCR provider to use (`'auto'`, `'tesseract'`, `'onnx'`, `'web-ocr'`)
- `HAVE_OCR_LANGUAGE` - Default language for OCR (`'eng'`, `'eng+chi_sim'`, etc.)
- `HAVE_OCR_CONFIDENCE_THRESHOLD` - Minimum confidence threshold (0-100)
- `HAVE_OCR_TIMEOUT` - Processing timeout in milliseconds

**Example Configuration:**

```bash
# Set environment variables
export HAVE_OCR_PROVIDER=onnx
export HAVE_OCR_LANGUAGE=eng+chi_sim
export HAVE_OCR_CONFIDENCE_THRESHOLD=85
export HAVE_OCR_TIMEOUT=45000
```

```typescript
import { getOCR } from '@happyvertical/ocr';

// Factory automatically loads configuration from env vars
const factory = getOCR();
const result = await factory.performOCR(images);
// Uses: provider=onnx, language=eng+chi_sim, confidenceThreshold=85, timeout=45000
```

**Precedence Rules:**

1. User-provided options (highest priority)
2. Environment variables
3. Package defaults (lowest priority)

```typescript
// Environment variables are overridden by user options
process.env.HAVE_OCR_PROVIDER = 'onnx';
process.env.HAVE_OCR_LANGUAGE = 'eng';

const factory = getOCR({
  provider: 'tesseract', // Overrides HAVE_OCR_PROVIDER
  defaultOptions: {
    language: 'jpn', // Overrides HAVE_OCR_LANGUAGE
  },
});
// Uses: provider=tesseract, language=jpn
```

**Partial Override:**

```typescript
// Mix env vars with user options
process.env.HAVE_OCR_PROVIDER = 'onnx';
process.env.HAVE_OCR_CONFIDENCE_THRESHOLD = '80';
process.env.HAVE_OCR_TIMEOUT = '40000';

const factory = getOCR({
  defaultOptions: {
    language: 'chi_sim', // User-provided
    // confidenceThreshold and timeout come from env vars
  },
});
// Uses: provider=onnx (env), language=chi_sim (user),
//       confidenceThreshold=80 (env), timeout=40000 (env)
```

### Enhanced OCR with ONNX (Node.js only)

```bash
# ONNX OCR using PaddleOCR PP-OCRv4 models via @gutenye/ocr-node
# High-performance OCR with superior accuracy and bounding box detection

# The @gutenye/ocr-node package is automatically installed
# Includes jpeg-js and pngjs for image format conversion
# No additional setup required
```

```typescript
import { getOCR } from '@happyvertical/ocr';

// Use ONNX provider specifically for high-accuracy OCR
const onnxFactory = getOCR({ provider: 'onnx' });

// Check if ONNX provider is available
const available = await onnxFactory.isOCRAvailable();
if (available) {
  const result = await onnxFactory.performOCR(images, {
    language: 'eng', // Core languages: eng, chi_sim, chi_tra, fra, deu, jpn, kor
    confidenceThreshold: 85 // ONNX typically provides high confidence scores
  });

  console.log('Text extracted:', result.text);
  console.log('Average confidence:', result.confidence);
  console.log('Processing time:', result.metadata?.processingTime);

  // ONNX provides detailed bounding box information with high precision
  result.detections?.forEach((detection, i) => {
    console.log(`Detection ${i + 1}: \"${detection.text}\" (${detection.confidence.toFixed(1)}%)`);
    if (detection.boundingBox) {
      const bbox = detection.boundingBox;
      console.log(`  Position: (${bbox.x}, ${bbox.y})`);
      console.log(`  Size: ${bbox.width}x${bbox.height}`);
    }
  });

  // ONNX handles various input formats automatically
  // - Standard image files (PNG, JPEG) with automatic decoding
  // - Raw RGB data with dimensions for direct processing
  // - Automatic format conversion and optimization
}
```

### NixOS Setup

```bash
# Enter development environment
nix-shell -p nodejs

# Or add to your shell.nix or flake.nix
```

### Verification

```typescript
import { getOCR } from '@happyvertical/ocr';

const ocrFactory = getOCR();
const available = await ocrFactory.isOCRAvailable();
console.log('OCR available:', available);

const providers = await ocrFactory.getProvidersInfo();
console.log('Available providers:', providers.map(p => p.name));
```

## API Documentation

The @happyvertical/ocr package generates comprehensive API documentation in both HTML and markdown formats using TypeDoc:

### Generated Documentation Formats

**HTML Documentation** (recommended for browsing):
- Generated in `docs/` directory for public website
- Full API reference with interactive navigation
- Cross-linked type definitions and examples
- Accessible via development server at `http://localhost:3030/`

**Markdown Documentation** (great for development):
- Generated in `packages/ocr/docs/` directory
- Markdown format perfect for IDE integration
- Accessible via development server at `http://localhost:3030/packages/ocr/`

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
2. **Local Browsing**: Access HTML docs at `http://localhost:3030/` or markdown at `http://localhost:3030/packages/ocr/`
3. **IDE Integration**: Point your editor to `packages/ocr/docs/` for offline markdown reference

The documentation includes complete API coverage, usage examples, and cross-references to related HAVE SDK packages.

## Debugging and Troubleshooting

### Common Issues and Solutions

**Issue: "No OCR providers available"**
```typescript
// Diagnosis
const factory = getOCR();
const providersInfo = await factory.getProvidersInfo();
providersInfo.forEach(p => {
  console.log(`${p.name}: ${p.available ? 'Available' : 'Unavailable'}`);
  if (!p.available) {
    console.log(`  Error: ${p.dependencies.error}`);
    console.log(`  Details:`, p.dependencies.details);
  }
});

// Solution: Check if tesseract.js is installed
// npm install tesseract.js
// For ONNX: Ensure @gutenye/ocr-node is installed (should be in package.json)
```

**Issue: Empty OCR results despite valid images**
```typescript
// Check image format
const buffer = fs.readFileSync('image.png');
console.log('Image signature:', buffer.slice(0, 8).toString('hex'));
// PNG should be: 89504e470d0a1a0a
// JPEG should start with: ffd8ff

// Try with explicit format
const result = await factory.performOCR([
  { data: buffer, format: 'png' }
], {
  language: 'eng',
  confidenceThreshold: 0, // Remove filtering
  outputFormat: 'json'    // Get detailed detections
});

console.log('Detections:', result.detections);
```

**Issue: ONNX provider not working**
```typescript
// Check ONNX specifically
const onnxFactory = getOCR({ provider: 'onnx' });
const available = await onnxFactory.isOCRAvailable();

if (!available) {
  const info = await getProviderInfo('onnx');
  console.log('ONNX error:', info?.dependencies.error);
  // Common causes:
  // - @gutenye/ocr-node not installed
  // - ONNX Runtime dependencies missing
  // - Initialization timeout
}

// Test with simple image
const testResult = await onnxFactory.performOCR([testImage], {
  language: 'eng',
  timeout: 60000 // Increase timeout for initialization
});
```

**Issue: Worker/memory leaks**
```typescript
// Always cleanup in production
const factory = getOCR();
try {
  const result = await factory.performOCR(images);
  // Process result
} finally {
  await factory.cleanup(); // Terminates workers, frees memory
}

// For testing, reset global factory
import { resetOCRFactory } from '@happyvertical/ocr';
afterEach(() => {
  resetOCRFactory();
});
```

**Issue: Browser compatibility errors**
```typescript
// Check browser environment
const factory = getOCR();
const env = factory.getEnvironment();

if (env === 'browser') {
  // Verify WebAssembly support
  if (typeof WebAssembly === 'undefined') {
    console.error('Browser does not support WebAssembly');
  }

  // Check for Web Worker support
  if (typeof Worker === 'undefined') {
    console.error('Browser does not support Web Workers');
  }

  // Use web-ocr provider explicitly
  const webFactory = getOCR({ provider: 'web-ocr' });
}
```

### Performance Optimization Tips

1. **Reuse Factory Instances**: Global singleton is cached
   ```typescript
   // Good: Single factory instance
   const factory = getOCR();
   for (const batch of imageBatches) {
     await factory.performOCR(batch);
   }

   // Bad: New factory per call (wastes memory)
   for (const batch of imageBatches) {
     const factory = getOCR(); // Don't do this
     await factory.performOCR(batch);
   }
   ```

2. **Batch Processing**: Process multiple images in one call
   ```typescript
   // Efficient: Single OCR operation
   const result = await factory.performOCR([img1, img2, img3]);

   // Less efficient: Multiple separate calls
   const r1 = await factory.performOCR([img1]);
   const r2 = await factory.performOCR([img2]);
   const r3 = await factory.performOCR([img3]);
   ```

3. **Choose Right Provider**: Match provider to use case
   ```typescript
   // High accuracy needed (Node.js)
   const onnxFactory = getOCR({ provider: 'onnx' });

   // Maximum compatibility needed
   const tesseractFactory = getOCR({ provider: 'tesseract' });

   // Let factory decide (recommended)
   const autoFactory = getOCR(); // Auto-selects best available
   ```

4. **Optimize Image Sizes**: Resize large images before OCR
   ```typescript
   // Pre-process images if they're very large (>4000px)
   // OCR accuracy doesn't always improve with massive resolution
   const maxDimension = 2048;
   if (image.width > maxDimension || image.height > maxDimension) {
     // Resize using image processing library before passing to OCR
   }
   ```

### Logging and Diagnostics

**Enable verbose logging:**
```typescript
// Provider-level logging (console.log/warn/error used throughout)
// Set environment variable for more details
process.env.DEBUG = 'ocr:*';

// Check initialization
const factory = getOCR();
await factory.initializeProviders(); // Explicit initialization
const providers = factory.getAvailableProviderNames();
console.log('Loaded providers:', providers);

// Detailed provider info
const providersInfo = await factory.getProvidersInfo();
providersInfo.forEach(p => {
  console.log(`\n${p.name}:`);
  console.log('  Available:', p.available);
  console.log('  Dependencies:', p.dependencies);
  console.log('  Capabilities:', p.capabilities);
});
```

**Monitor OCR operations:**
```typescript
const startTime = Date.now();
const result = await factory.performOCR(images, { language: 'eng' });
console.log({
  processingTime: Date.now() - startTime,
  provider: result.metadata?.provider,
  confidence: result.confidence,
  textLength: result.text.length,
  detectionCount: result.detections?.length || 0,
  fallback: result.metadata?.fallbackFrom
});
```

## Expert Agent Instructions

When working with @happyvertical/ocr:

### Decision Framework

1. **Provider Selection Strategy**
   - **Use auto-selection** for most cases (intelligent defaults)
   - **Force ONNX** when accuracy is critical and Node.js environment confirmed
   - **Use Tesseract** when multi-language support (>7 languages) is needed
   - **Use web-ocr** explicitly only for browser-specific features

2. **Error Handling Strategy**
   - **Always wrap in try-catch**: OCR operations can fail for many reasons
   - **Check availability first**: Prevent runtime errors in production
   - **Use fallback providers**: Configure alternative providers for resilience
   - **Log detailed errors**: Use provider info to diagnose issues

3. **Performance Strategy**
   - **Cache factory instances**: Reuse global factory when possible
   - **Batch images**: Process multiple images in single call
   - **Cleanup resources**: Call cleanup() when done, especially in long-running apps
   - **Monitor processing time**: Log metadata for performance tracking

4. **Testing Strategy**
   - **Reset factory between tests**: Use `resetOCRFactory()` in test teardown
   - **Mock providers carefully**: Check dependencies return false for unavailable
   - **Test timeout handling**: Configure appropriate timeouts for each environment
   - **Verify cleanup**: Ensure workers are terminated after tests

### Implementation Checklist

Before committing OCR code:
- [ ] Provider availability checked before use
- [ ] Error handling with typed error classes
- [ ] Cleanup called in finally blocks or on exit
- [ ] Appropriate timeouts configured for environment
- [ ] Confidence thresholds adjusted for provider
- [ ] Logging includes provider and metadata
- [ ] Fallback providers configured if critical path
- [ ] Image formats validated before processing
- [ ] Tests reset global factory in teardown
- [ ] Documentation updated with examples

### Quick Reference

```typescript
// Standard pattern for production use
import { getOCR, OCRDependencyError, OCRError } from '@happyvertical/ocr';

const factory = getOCR({
  provider: 'auto',
  fallbackProviders: ['tesseract'],
  defaultOptions: {
    language: 'eng',
    confidenceThreshold: 70,
    timeout: 30000
  }
});

try {
  // Check availability
  if (!(await factory.isOCRAvailable())) {
    throw new Error('OCR not available');
  }

  // Process images
  const result = await factory.performOCR(images, {
    outputFormat: 'json' // Get detections with bounding boxes
  });

  // Log diagnostics
  console.log('OCR completed:', {
    provider: result.metadata?.provider,
    confidence: result.confidence,
    processingTime: result.metadata?.processingTime,
    detections: result.detections?.length
  });

  return result;

} catch (error) {
  if (error instanceof OCRDependencyError) {
    // Handle missing dependencies
    console.error('OCR dependencies missing:', error.message);
  } else if (error instanceof OCRError) {
    // Handle OCR processing errors
    console.error('OCR processing failed:', error.message);
  } else {
    // Handle unexpected errors
    console.error('Unexpected error:', error);
  }
  throw error;
} finally {
  // Cleanup (important for long-running processes)
  await factory.cleanup();
}
```

This package provides enterprise-grade OCR capabilities designed for scalable AI agent workflows across multiple environments with intelligent provider selection and fallback strategies.

## Integration with PDF Package

The @happyvertical/ocr package is designed to work seamlessly with the @happyvertical/pdf package for comprehensive document processing:

### PDF OCR Fallback Processing

```typescript
import { getOCR } from '@happyvertical/ocr';
import { processPDF } from '@happyvertical/pdf'; // Hypothetical PDF package integration

// Example of OCR fallback when PDF text extraction fails
const processDocumentWithOCRFallback = async (pdfBuffer: Buffer) => {
  try {
    // First, try text extraction from PDF
    const pdfResult = await processPDF(pdfBuffer, { extractText: true });

    if (pdfResult.text && pdfResult.text.trim().length > 0) {
      console.log('PDF text extraction successful');
      return pdfResult.text;
    }

    // If PDF text extraction fails or returns empty, use OCR on PDF pages
    console.log('PDF text extraction failed, falling back to OCR');

    const ocrFactory = getOCR();
    const pageImages = pdfResult.pageImages; // Assume PDF package provides page images

    const ocrResult = await ocrFactory.performOCR(pageImages, {
      language: 'eng',
      confidenceThreshold: 70,
      outputFormat: 'text'
    });

    console.log(`OCR fallback completed with ${ocrResult.confidence.toFixed(1)}% confidence`);
    return ocrResult.text;

  } catch (error) {
    console.error('Document processing failed:', error);
    throw error;
  }
};

// High-accuracy document processing with ONNX for scanned PDFs
const processScannedPDF = async (pdfBuffer: Buffer) => {
  const ocrFactory = getOCR({
    provider: 'onnx',  // Use high-accuracy ONNX for scanned documents
    fallbackProviders: ['tesseract']
  });

  // Convert PDF pages to images (handled by PDF package)
  const pageImages = await convertPDFToImages(pdfBuffer);

  const results = await Promise.all(
    pageImages.map(async (image, pageIndex) => {
      const result = await ocrFactory.performOCR([image], {
        language: 'eng+chi_sim',  // Multi-language for international documents
        confidenceThreshold: 80,
        outputFormat: 'json'       // Get bounding boxes for layout analysis
      });

      return {
        page: pageIndex + 1,
        text: result.text,
        confidence: result.confidence,
        detections: result.detections,
        processingTime: result.metadata?.processingTime
      };
    })
  );

  // Combine all page results
  const combinedText = results.map(r => r.text).join('\n\n');
  const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

  return {
    text: combinedText,
    confidence: averageConfidence,
    pages: results,
    metadata: {
      totalPages: results.length,
      processingTime: results.reduce((sum, r) => sum + (r.processingTime || 0), 0)
    }
  };
};
```

### PDF Processing Strategies

1. **Hybrid Text Extraction**: Try PDF text extraction first, fall back to OCR for scanned pages
2. **OCR-First for Scanned Documents**: Use OCR directly for known scanned/image-based PDFs
3. **Layout-Aware Processing**: Use bounding box information to preserve document structure
4. **Multi-Language Document Support**: Leverage OCR's multi-language capabilities for international documents

## Provider-Specific Features and Limitations

### Tesseract.js Provider

**Strengths:**
- Wide language support (60+ languages with automatic model download)
- Cross-platform compatibility (Node.js and browser)
- Good accuracy on machine-printed text
- Word-level confidence scores and bounding boxes
- Zero system dependencies

**Limitations:**
- Slower processing compared to ONNX
- Lower accuracy on handwritten text
- Requires internet connection for first-time language model download
- Memory usage can be high for large images

**Optimal Use Cases:**
- Multi-language document processing
- Browser-based OCR applications
- Systems without ONNX Runtime support
- Processing of clean, machine-printed text

### ONNX Provider (@gutenye/ocr-node)

**Strengths:**
- Highest accuracy using PaddleOCR PP-OCRv4 models
- Excellent performance on both printed and handwritten text
- Fast processing with ONNX Runtime optimization
- Precise bounding box detection
- Automatic image format conversion and optimization

**Limitations:**
- Node.js only (no browser support)
- Limited language support (7 core languages)
- Larger memory footprint
- Requires ONNX Runtime dependencies
- First initialization can be slow

**Optimal Use Cases:**
- High-accuracy document digitization
- Scanned document processing
- Production OCR pipelines
- Mixed printed/handwritten text
- Documents in core supported languages (English, Chinese, Japanese, Korean, French, German)

### Web OCR Provider

**Strengths:**
- Browser-optimized with progress tracking
- Client-side processing for privacy
- Memory-efficient with automatic cleanup
- Compatibility checking for WebAssembly and Web Workers

**Limitations:**
- Browser memory constraints limit image size
- Slower than Node.js implementations
- Network dependent for initial model downloads
- Limited to Tesseract.js capabilities

**Optimal Use Cases:**
- Client-side document processing
- Privacy-sensitive applications
- Offline-capable web applications
- Progressive web apps with OCR features

## Image Format Support and Processing

### Supported Image Formats

**All Providers:**
- PNG (with transparency support)
- JPEG/JPG (various quality levels)

**Tesseract.js Additional Formats:**
- BMP (bitmap)
- TIFF (multi-page support)
- PBM, PGM, PPM (Netpbm formats)
- WebP (browser environments)
- GIF (static images)

**ONNX Provider Processing:**
- Automatic PNG/JPEG decoding to RGB
- Raw RGB pixel data input support
- Intelligent format detection using file signatures
- Optimized JPEG encoding for OCR processing

### Image Processing Capabilities

**Automatic Format Detection:**
```typescript
// Image format is detected automatically from file signatures
const images = [
  { data: pngBuffer },      // Detected as PNG
  { data: jpegBuffer },     // Detected as JPEG
  { data: rawRGBData, width: 800, height: 600, channels: 3 }, // Raw RGB
  { data: 'data:image/png;base64,...' }  // Base64 data URL
];
```

**Quality Optimization:**
- ONNX provider automatically optimizes images for OCR processing
- Tesseract.js handles various quality levels and color spaces
- Automatic image validation prevents processing of corrupted data

**Memory Management:**
- Efficient processing of large images without memory overflow
- Automatic cleanup of intermediate processing buffers
- Stream-based processing for very large documents

## Key Takeaways for Efficient Coding

### Architecture at a Glance

**Three-Layer Design:**
1. **Factory Layer** (`shared/factory.ts`): Provider management, auto-selection, fallback
2. **Type Layer** (`shared/types.ts`): Interfaces, errors, data structures
3. **Provider Layer** (`node/`, `browser/`): Platform-specific OCR implementations

**Key Design Decisions:**
- **Lazy loading**: Providers loaded only when first used
- **Singleton factory**: Global instance for efficiency, custom instances for flexibility
- **Graceful degradation**: Import failures don't crash, just skip that provider
- **Parallel checks**: All providers checked simultaneously for fast initialization
- **Worker caching**: Workers/instances cached per language to avoid reinitialization

### Critical Implementation Details

**Magic Numbers for Format Detection:**
```typescript
PNG:  [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
JPEG: [0xFF, 0xD8, 0xFF]
BMP:  [0x42, 0x4D]
GIF:  [0x47, 0x49, 0x46]
```

**ONNX Processing Pipeline:**
```
Image Buffer → Decode (PNG/JPEG) → RGB → RGBA → JPEG (90%) → PaddleOCR
```

**Confidence Score Patterns:**
```typescript
// ONNX: detection.score or detection.mean (0-1 range, converted to 0-100)
// Tesseract: result.data.confidence (already 0-100)
// Average: sum of all valid confidences / count
```

**Error Classification:**
- `OCRDependencyError`: Can't initialize (missing dependencies)
- `OCRProcessingError`: Processing failed (timeout, invalid image, etc.)
- `OCRUnsupportedError`: Feature not supported (rare)
- `OCRError`: Generic base class

### Common Patterns Quick Reference

**Basic Usage (90% of cases):**
```typescript
import { getOCR } from '@happyvertical/ocr';
const factory = getOCR();
const result = await factory.performOCR(images);
```

**Production Pattern (with error handling):**
```typescript
try {
  const factory = getOCR({ provider: 'auto', fallbackProviders: ['tesseract'] });
  if (await factory.isOCRAvailable()) {
    const result = await factory.performOCR(images, { language: 'eng' });
    return result;
  }
} catch (error) {
  // Handle typed errors
} finally {
  await factory.cleanup();
}
```

**Debugging Pattern:**
```typescript
const providersInfo = await factory.getProvidersInfo();
providersInfo.forEach(p => {
  console.log(`${p.name}: ${p.available ? '✓' : '✗'} ${p.dependencies.error || ''}`);
});
```

### Provider Comparison Matrix

| Feature | ONNX | Tesseract | Web OCR |
|---------|------|-----------|---------|
| **Environment** | Node.js only | Node.js + Browser | Browser only |
| **Accuracy** | Highest (90%+) | Good (70-85%) | Good (70-85%) |
| **Speed** | Fast (after init) | Moderate | Moderate |
| **Languages** | 7 core | 100+ | 100+ |
| **Setup** | Auto (included) | Auto (npm) | Auto (browser) |
| **Bounding Boxes** | Yes (precise) | Yes (word-level) | Yes (word-level) |
| **Memory** | Higher | Moderate | Lower (browser constraints) |
| **Best For** | High-accuracy production | Multi-language, compatibility | Client-side, privacy |

### When to Use Which Provider

**Use ONNX when:**
- Accuracy is critical (>85% required)
- Processing scanned documents or handwritten text
- Running in Node.js environment
- Language is one of: eng, chi_sim, chi_tra, jpn, kor, fra, deu

**Use Tesseract when:**
- Need 100+ language support
- Cross-platform compatibility required
- Browser support needed
- ONNX dependencies unavailable

**Use Auto-selection when:**
- Not sure which provider is best
- Want intelligent fallback behavior
- Building for unknown deployment environment
- Following best practices (recommended default)

### Testing Gotchas

1. **Global Factory Reset**: Always call `resetOCRFactory()` in test teardown
2. **Async Cleanup**: Use `await factory.cleanup()` in finally blocks
3. **Timeout Configuration**: Set longer timeouts for ONNX tests (60-120s)
4. **Provider Mocking**: Mock at provider level, not factory level
5. **Image Fixtures**: Use small test images (<1MB) for fast tests