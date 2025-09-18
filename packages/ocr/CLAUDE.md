# @have/ocr: Standardized OCR Interface Package

## Purpose and Responsibilities

The `@have/ocr` package provides a unified interface for Optical Character Recognition (OCR) operations with multi-provider support. It serves as the OCR abstraction layer for the HAVE SDK and handles:

- **Multi-Provider OCR**: Unified API for Tesseract.js and ONNX-based OCR engines (PaddleOCR PP-OCRv4)
- **Intelligent Fallback**: Automatic provider selection and fallback when primary providers fail
- **Cross-Platform Support**: Works in both Node.js and browser environments with appropriate providers
- **Environment Detection**: Automatically selects compatible OCR providers based on runtime environment
- **Performance Optimization**: Lazy loading of OCR dependencies and efficient provider management
- **Language Support**: Multi-language OCR with 80+ language support through various providers

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

// Prepare images for OCR
const images: OCRImage[] = [
  {
    data: imageBuffer,        // Buffer, Uint8Array, or string (base64)
    width: 1920,             // Optional: image dimensions
    height: 1080,
    format: 'png',           // Optional: image format
    metadata: { source: 'pdf-page-1' } // Optional: tracking metadata
  }
];

// Basic OCR processing
const result = await ocrFactory.performOCR(images);

// Advanced OCR with options
const advancedResult = await ocrFactory.performOCR(images, {
  language: 'eng+chi_sim',     // Multi-language support
  confidenceThreshold: 80,     // Filter low-confidence results
  improveResolution: true,     // Enhance image quality
  outputFormat: 'json',        // Get structured output
  timeout: 30000              // Processing timeout
});

// Process results with bounding boxes
if (advancedResult.detections) {
  for (const detection of advancedResult.detections) {
    console.log(`Text: "${detection.text}"`);
    console.log(`Confidence: ${detection.confidence}%`);
    if (detection.boundingBox) {
      console.log(`Position: (${detection.boundingBox.x}, ${detection.boundingBox.y})`);
    }
  }
}
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
  provider: 'tesseract',           // Force specific provider
  fallbackProviders: ['onnx'],     // Fallback chain
  defaultOptions: {
    language: 'eng',
    confidenceThreshold: 75,
    improveResolution: true,
    outputFormat: 'json'
  }
});

// Custom provider integration (example)
// customFactory.addProvider('custom-ocr', customOCRProvider);

// Process with progress tracking
const result = await customFactory.performOCR(images, {
  language: 'eng',
  timeout: 60000  // Extended timeout for large images
});

// Clean up resources when done
await customFactory.cleanup();
```

### Error Handling and Debugging

```typescript
import { OCRError, OCRDependencyError, OCRProcessingError } from '@have/ocr';

try {
  const result = await ocrFactory.performOCR(images);
  console.log('OCR successful:', result.text);
} catch (error) {
  if (error instanceof OCRDependencyError) {
    console.error('OCR dependencies missing:', error.message);
    console.log('Provider:', error.provider);
    // Handle dependency installation
  } else if (error instanceof OCRProcessingError) {
    console.error('OCR processing failed:', error.message);
    console.log('Provider:', error.provider);
    console.log('Context:', error.context);
    // Try fallback approach
  } else if (error instanceof OCRError) {
    console.error('General OCR error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

// Debug provider status
const providersInfo = await ocrFactory.getProvidersInfo();
for (const provider of providersInfo) {
  console.log(`${provider.name}:`, {
    available: provider.available,
    error: provider.dependencies.error,
    details: provider.dependencies.details
  });
}
```

## Dependencies

The package manages dependencies intelligently based on the runtime environment:

### Core Dependencies
- **@have/utils**: Shared utilities for the HAVE SDK
- **tesseract.js**: Cross-platform OCR engine (works in Node.js and browsers)

### Optional Provider Dependencies
- **ONNX Runtime**: High-performance inference engine (Node.js only)
  - Uses @gutenye/ocr-node with PaddleOCR PP-OCRv4 models
  - Automatically installed with the package
  - Requires `onnxruntime-node` and compatible OCR models
  - Currently placeholder implementation

### Environment Support

#### Node.js Environment
- **Tesseract.js**: Good accuracy, 100+ languages, pure JavaScript
- **ONNX**: High accuracy PaddleOCR PP-OCRv4 models, primarily English and Chinese

#### Browser Environment  
- **Tesseract.js**: WebAssembly-based OCR, works offline
- **Web OCR**: Browser-optimized OCR processing

## Development Guidelines

### Provider Architecture

When adding new OCR providers:

1. **Implement OCRProvider interface**: All providers must implement the standardized interface
2. **Handle dependencies gracefully**: Check dependencies without throwing errors
3. **Support multiple image formats**: Handle Buffer, Uint8Array, and string inputs
4. **Provide meaningful error messages**: Use typed error classes for different failure modes
5. **Implement cleanup methods**: Properly dispose of resources and worker processes

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

- **Lazy Loading**: OCR engines are loaded only when first used
- **Worker Management**: Tesseract.js workers are reused across operations
- **Memory Management**: Large images should be processed in chunks
- **Timeout Handling**: All OCR operations have configurable timeouts
- **Provider Fallback**: Failed providers automatically fall back to alternatives

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
# ONNX OCR is now available using PaddleOCR models
# High-performance OCR with bounding box detection

# The @gutenye/ocr-node package is automatically installed
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
    language: 'eng', // Supports eng, chi_sim, chi_tra, jpn, kor
    confidenceThreshold: 90 // High threshold for quality results
  });
  
  console.log('Text extracted:', result.text);
  console.log('Average confidence:', result.confidence);
  
  // ONNX provides detailed bounding box information
  result.detections?.forEach((detection, i) => {
    console.log(`Detection ${i + 1}: "${detection.text}" (${detection.confidence}%)`);
    if (detection.boundingBox) {
      console.log(`  Position: (${detection.boundingBox.x}, ${detection.boundingBox.y})`);
      console.log(`  Size: ${detection.boundingBox.width}x${detection.boundingBox.height}`);
    }
  });
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