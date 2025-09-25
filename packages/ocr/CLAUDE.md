# @have/ocr: Standardized OCR Interface Package

## Purpose and Responsibilities

The `@have/ocr` package provides a unified interface for Optical Character Recognition (OCR) operations with multi-provider support. It serves as the OCR abstraction layer for the HAVE SDK and handles:

- **Multi-Provider OCR**: Unified API for Tesseract.js and ONNX-based OCR engines (PaddleOCR PP-OCRv4)
- **Intelligent Fallback**: Automatic provider selection and fallback when primary providers fail
- **Cross-Platform Support**: Works in both Node.js and browser environments with appropriate providers
- **Environment Detection**: Automatically selects compatible OCR providers based on runtime environment
- **Performance Optimization**: Lazy loading of OCR dependencies and efficient provider management
- **Language Support**: Multi-language OCR with 60+ languages (Tesseract) and 7 core languages (ONNX)

This package abstracts away the complexities of different OCR engines, allowing other packages to perform text extraction consistently regardless of the underlying OCR provider.

## Key APIs

### Factory-Based OCR Interface

```typescript
import { getOCR } from '@have/ocr';

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
import { getOCR } from '@have/ocr';
import type { OCRImage } from '@have/ocr';

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
} from '@have/ocr';

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
import { OCRFactory } from '@have/ocr';

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
import { OCRError, OCRDependencyError, OCRProcessingError, OCRUnsupportedError } from '@have/ocr';

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
- **@have/utils**: Shared utilities for the HAVE SDK
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

### Provider Architecture

When adding new OCR providers:

1. **Implement OCRProvider interface**: All providers must implement the standardized interface
2. **Handle dependencies gracefully**: Check dependencies without throwing errors using checkDependencies()
3. **Support multiple image formats**: Handle Buffer, Uint8Array, string (base64), and raw RGB data
4. **Provide meaningful error messages**: Use typed error classes (OCRError, OCRDependencyError, OCRProcessingError)
5. **Implement cleanup methods**: Properly dispose of resources, workers, and ONNX Runtime instances
6. **Image format validation**: Check file signatures before processing to avoid errors
7. **Confidence scoring**: Provide meaningful confidence scores (0-100) for quality assessment
8. **Bounding box support**: Return precise text positioning when available
9. **Language mapping**: Map common language codes to provider-specific codes

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
bun add @have/ocr

# The package will work out of the box with Tesseract.js
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
import { getOCR } from '@have/ocr';

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
import { getOCR } from '@have/ocr';

const ocrFactory = getOCR();
const available = await ocrFactory.isOCRAvailable();
console.log('OCR available:', available);

const providers = await ocrFactory.getProvidersInfo();
console.log('Available providers:', providers.map(p => p.name));
```

## API Documentation

The @have/ocr package generates comprehensive API documentation in both HTML and markdown formats using TypeDoc:

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

## Expert Agent Instructions

When working with @have/ocr:

1. **Always check provider availability** before implementing OCR solutions
2. **Choose appropriate providers** based on accuracy requirements and environment constraints
3. **Handle multiple languages** by using provider-specific language codes
4. **Implement proper error handling** with typed error classes
5. **Consider performance implications** of different providers and image sizes
6. **Test across environments** to ensure compatibility

Example workflow:
```typescript
// Check environment and available providers
const factory = getOCR();
const env = factory.getEnvironment();
const available = await factory.isOCRAvailable();

if (!available) {
  console.log('No OCR providers available');
  return;
}

// Get best provider info
const providers = await factory.getProvidersInfo();
const bestProvider = providers.find(p => p.available);
console.log(`Using OCR provider: ${bestProvider?.name}`);

// Process with appropriate configuration
const result = await factory.performOCR(images, {
  language: env === 'browser' ? 'eng' : 'eng+chi_sim', // More languages in Node.js
  confidenceThreshold: env === 'browser' ? 60 : 80,   // Lower threshold in browser
  timeout: env === 'browser' ? 15000 : 30000          // Shorter timeout in browser
});
```

This package provides enterprise-grade OCR capabilities designed for scalable AI agent workflows across multiple environments with intelligent provider selection and fallback strategies.

## Integration with PDF Package

The @have/ocr package is designed to work seamlessly with the @have/pdf package for comprehensive document processing:

### PDF OCR Fallback Processing

```typescript
import { getOCR } from '@have/ocr';
import { processPDF } from '@have/pdf'; // Hypothetical PDF package integration

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