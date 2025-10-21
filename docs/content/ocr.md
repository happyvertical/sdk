---
id: ocr
title: "@happyvertical/ocr: Optical Character Recognition"
sidebar_label: "@happyvertical/ocr"
sidebar_position: 7
---

# @happyvertical/ocr

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Standardized OCR interface with multi-provider support for Node.js and browser environments. Part of the HAVE SDK ecosystem.

## Overview

The `@happyvertical/ocr` package provides a unified interface for Optical Character Recognition (OCR) operations with intelligent provider selection and automatic fallback. It abstracts away the complexities of different OCR engines, allowing consistent text extraction regardless of the underlying OCR provider.

## Features

- **Multi-Provider Support**: Unified API for Tesseract.js and ONNX-based OCR engines (PaddleOCR PP-OCRv4)
- **Intelligent Fallback**: Automatic provider selection and fallback when primary providers fail
- **Cross-Platform**: Works in both Node.js and browser environments with appropriate providers
- **Environment Detection**: Automatically selects compatible OCR providers based on runtime environment
- **Performance Optimized**: Lazy loading of OCR dependencies and efficient provider management
- **Multi-Language Support**: 60+ languages with Tesseract, 7 core languages with ONNX
- **Bounding Box Detection**: Word-level and line-level text positioning
- **Confidence Scoring**: Per-detection and overall confidence scores (0-100)
- **Format Support**: PNG, JPEG, BMP, TIFF, raw RGB data, and base64 strings

## Installation

```bash
# npm
npm install @happyvertical/ocr

# pnpm
pnpm add @happyvertical/ocr

# yarn
yarn add @happyvertical/ocr

# bun
bun add @happyvertical/ocr
```

The package includes Tesseract.js by default and ONNX provider (@gutenye/ocr-node) for high-accuracy OCR.

## Quick Start

```typescript
import { getOCR } from '@happyvertical/ocr';

// Get OCR factory with automatic provider selection
const ocrFactory = getOCR();

// Check if OCR is available
const available = await ocrFactory.isOCRAvailable();

if (available) {
  // Perform OCR on images
  const result = await ocrFactory.performOCR([
    { data: imageBuffer, format: 'png' }
  ], {
    language: 'eng',
    confidenceThreshold: 70
  });

  console.log('Extracted text:', result.text);
  console.log('Confidence:', result.confidence);
  console.log('Processing time:', result.metadata?.processingTime);
}
```

## Providers

### ONNX Provider (Node.js)

High-accuracy OCR using PaddleOCR PP-OCRv4 models with ONNX Runtime. Provides superior performance on both printed and handwritten text.

**Features:**
- Highest accuracy (90%+)
- Precise bounding box detection
- Automatic image format conversion
- 7 core languages: English, Chinese (Simplified/Traditional), Japanese, Korean, French, German

**Example:**
```typescript
import { getOCR } from '@happyvertical/ocr';

const onnxFactory = getOCR({ provider: 'onnx' });

const result = await onnxFactory.performOCR(images, {
  language: 'eng',
  confidenceThreshold: 85,
  outputFormat: 'json'  // Get detailed bounding boxes
});

// Access bounding box information
result.detections?.forEach((detection) => {
  console.log(`Text: "${detection.text}"`);
  console.log(`Confidence: ${detection.confidence.toFixed(1)}%`);
  if (detection.boundingBox) {
    const bbox = detection.boundingBox;
    console.log(`Position: (${bbox.x}, ${bbox.y})`);
    console.log(`Size: ${bbox.width}x${bbox.height}`);
  }
});
```

### Tesseract Provider (Node.js)

Cross-platform OCR using Tesseract.js with WebAssembly. Good accuracy on machine-printed text with wide language support.

**Features:**
- 60+ languages with automatic model downloading
- Word-level confidence scores and bounding boxes
- Zero system dependencies
- Works in Node.js and browsers

**Example:**
```typescript
import { getOCR } from '@happyvertical/ocr';

const tesseractFactory = getOCR({ provider: 'tesseract' });

const result = await tesseractFactory.performOCR(images, {
  language: 'eng+chi_sim+jpn',  // Multi-language support
  confidenceThreshold: 70
});

console.log('Text extracted:', result.text);
console.log('Languages used:', result.metadata?.language);
```

### Web OCR Provider (Browser)

Browser-optimized Tesseract.js with progress tracking and memory management for client-side OCR processing.

**Features:**
- Client-side processing for privacy
- Progress tracking for user feedback
- Automatic resource cleanup
- WebAssembly and Web Worker compatibility checking

**Example:**
```typescript
import { getOCR } from '@happyvertical/ocr';

const webFactory = getOCR({ provider: 'web-ocr' });

const result = await webFactory.performOCR(images, {
  language: 'eng',
  confidenceThreshold: 70,
  outputFormat: 'text'
});

console.log('Browser OCR completed:', result.text);
```

## Advanced Usage

### Multi-Language OCR

```typescript
import { getOCR } from '@happyvertical/ocr';

const ocrFactory = getOCR();

// Single language
const englishResult = await ocrFactory.performOCR(images, {
  language: 'eng'
});

// Multiple languages
const multilingualResult = await ocrFactory.performOCR(images, {
  language: 'eng+chi_sim+jpn+kor',
  confidenceThreshold: 60
});

// Get supported languages from active provider
const supportedLanguages = await ocrFactory.getSupportedLanguages();
console.log('Supported languages:', supportedLanguages);
```

### Environment-Specific Configuration

```typescript
import { getOCR } from '@happyvertical/ocr';

const ocrFactory = getOCR();
const environment = ocrFactory.getEnvironment();

if (environment === 'node') {
  // Node.js environment - multiple providers available
  const result = await ocrFactory.performOCR(images, {
    language: 'eng',
    confidenceThreshold: 85
  });
} else if (environment === 'browser') {
  // Browser environment - use Web OCR
  const result = await ocrFactory.performOCR(images, {
    language: 'eng',
    confidenceThreshold: 70
  });
}
```

### Custom Factory Configuration

```typescript
import { OCRFactory } from '@happyvertical/ocr';

const customFactory = new OCRFactory({
  provider: 'onnx',                   // Force specific provider
  fallbackProviders: ['tesseract'],   // Fallback chain
  defaultOptions: {
    language: 'eng',
    confidenceThreshold: 85,
    outputFormat: 'json',
    timeout: 45000
  }
});

// Check provider availability and capabilities
const providersInfo = await customFactory.getProvidersInfo();
for (const provider of providersInfo) {
  console.log(`Provider: ${provider.name}`);
  console.log(`Available: ${provider.available}`);
  if (provider.capabilities) {
    console.log(`Languages: ${provider.capabilities.supportedLanguages.length}`);
    console.log(`Bounding boxes: ${provider.capabilities.hasBoundingBoxes}`);
  }
}

// Process images
try {
  const result = await customFactory.performOCR(images);
  console.log('OCR completed:', result.text);
} finally {
  await customFactory.cleanup();  // Important for resource cleanup
}
```

### Error Handling

```typescript
import {
  OCRError,
  OCRDependencyError,
  OCRProcessingError,
  OCRUnsupportedError
} from '@happyvertical/ocr';

try {
  const result = await ocrFactory.performOCR(images);
  console.log('OCR successful:', result.text);
} catch (error) {
  if (error instanceof OCRDependencyError) {
    console.error('OCR dependencies missing:', error.message);
    console.log('Provider:', error.provider);
  } else if (error instanceof OCRProcessingError) {
    console.error('OCR processing failed:', error.message);
    console.log('Provider:', error.provider);
    console.log('Context:', error.context);
  } else if (error instanceof OCRUnsupportedError) {
    console.error('Unsupported operation:', error.message);
    console.log('Provider:', error.provider);
  } else if (error instanceof OCRError) {
    console.error('General OCR error:', error.message);
  }
}
```

## Writing Custom Providers

You can extend the OCR package with custom providers by implementing the `OCRProvider` interface:

```typescript
import {
  OCRProvider,
  OCRImage,
  OCRResult,
  OCROptions,
  DependencyCheckResult,
  OCRCapabilities
} from '@happyvertical/ocr';

export class MyOCRProvider implements OCRProvider {
  readonly name = 'my-provider';

  async performOCR(images: OCRImage[], options?: OCROptions): Promise<OCRResult> {
    // Process images and return OCR results
    const text = ''; // Extract text from images
    const confidence = 0; // Calculate average confidence
    const detections = []; // Optional: word/line detections with bounding boxes

    return {
      text,
      confidence,
      detections,
      metadata: {
        provider: this.name,
        processingTime: 0,
        language: options?.language || 'eng',
        detectionCount: detections.length
      }
    };
  }

  async checkDependencies(): Promise<DependencyCheckResult> {
    // Check if provider is available
    try {
      // Verify dependencies are installed and functional
      return {
        available: true,
        details: { version: '1.0.0' }
      };
    } catch (error: any) {
      return {
        available: false,
        error: error.message,
        details: { reason: 'Dependencies not installed' }
      };
    }
  }

  async checkCapabilities(): Promise<OCRCapabilities> {
    // Return provider capabilities
    return {
      supportedLanguages: ['eng', 'spa', 'fra'],
      supportedFormats: ['png', 'jpeg'],
      maxImageSize: 4096,
      hasBoundingBoxes: true,
      hasConfidenceScores: true
    };
  }

  getSupportedLanguages(): string[] {
    return ['eng', 'spa', 'fra'];
  }

  async cleanup?(): Promise<void> {
    // Optional: Clean up resources
    // Terminate workers, clear caches, etc.
  }
}
```

### Registering Custom Providers

```typescript
import { OCRFactory } from '@happyvertical/ocr';
import { MyOCRProvider } from './my-ocr-provider';

// Create factory with custom provider
const factory = new OCRFactory({
  provider: 'my-provider'
});

// Manually register provider
await factory.registerProvider(new MyOCRProvider());

// Use custom provider
const result = await factory.performOCR(images);
```

### Implementation Guidelines

When implementing a custom provider:

1. **Handle dependencies gracefully**: Never throw during `checkDependencies()` - return `{ available: false }` instead
2. **Support multiple image formats**: Handle Buffer, Uint8Array, string (base64), and raw RGB data
3. **Provide meaningful error messages**: Use typed error classes (OCRDependencyError, OCRProcessingError, OCRUnsupportedError)
4. **Implement cleanup methods**: Properly dispose of resources (workers, instances, caches)
5. **Validate image formats**: Check file signatures before processing
6. **Calculate confidence scores**: Provide meaningful confidence scores (0-100)
7. **Return bounding boxes**: Include precise text positioning when available
8. **Map language codes**: Support common language code formats

## API Reference

For complete API documentation, see the generated TypeDoc documentation:

```bash
# Generate documentation
npm run docs

# View in browser
npm run dev  # Opens http://localhost:3030
```

Documentation is available in both HTML and Markdown formats in the `docs/` directory.

## License

MIT
