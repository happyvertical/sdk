---
id: ocr
title: "@happyvertical/ocr: Optical Character Recognition"
sidebar_label: "@happyvertical/ocr"
sidebar_position: 9
---

# @happyvertical/ocr: Optical Character Recognition

Standardized OCR interface with support for multiple providers including Tesseract.js and ONNX (PaddleOCR).

## Overview

The `@happyvertical/ocr` package provides unified text extraction from images across different OCR engines:

- **🔌 Multi-Provider Support**: Tesseract.js, ONNX (PaddleOCR), and Web OCR
- **🌍 Multi-Language**: Support for 100+ languages (Tesseract) or 7 core languages (ONNX)
- **🎯 High Accuracy**: ONNX provider offers superior accuracy using PaddleOCR PP-OCRv4
- **📦 Auto-Fallback**: Intelligent provider selection and automatic fallback
- **🔒 Type Safety**: Full TypeScript support with standardized results
- **⚡ Performance**: Lazy loading and worker pooling for efficiency

## Quick Start

```typescript
import { getOCR } from '@happyvertical/ocr';

// Create OCR factory with automatic provider selection
const ocrFactory = getOCR();

// Check if OCR is available
const available = await ocrFactory.isOCRAvailable();

// Process images
const images = [
  {
    data: imageBuffer,        // Buffer or Uint8Array
    format: 'png'            // Optional format hint
  }
];

const result = await ocrFactory.performOCR(images, {
  language: 'eng',           // Language code
  confidenceThreshold: 70,   // Filter low-confidence results
  outputFormat: 'text'       // 'text' or 'json'
});

console.log('Extracted text:', result.text);
console.log('Confidence:', result.confidence);
```

## Provider Selection

```typescript
// Auto-select best available provider
const autoOCR = getOCR(); // Automatically chooses ONNX (Node.js) or Tesseract (browser)

// Force specific provider
const onnxOCR = getOCR({ provider: 'onnx' });        // High accuracy (Node.js only)
const tesseractOCR = getOCR({ provider: 'tesseract' }); // Max compatibility
const webOCR = getOCR({ provider: 'web-ocr' });      // Browser optimized

// With fallback chain
const resilientOCR = getOCR({
  provider: 'onnx',
  fallbackProviders: ['tesseract']  // Try Tesseract if ONNX fails
});
```

## Language Support

```typescript
// Single language
const result = await ocrFactory.performOCR(images, {
  language: 'eng'  // English
});

// Multi-language OCR
const multiLang = await ocrFactory.performOCR(images, {
  language: 'eng+chi_sim+jpn+kor',  // English + Chinese + Japanese + Korean
  confidenceThreshold: 60            // Lower threshold for multi-language
});

// Get supported languages
const languages = await ocrFactory.getSupportedLanguages();
console.log('Supported languages:', languages);
```

## Advanced OCR Options

```typescript
// Get structured output with bounding boxes
const detailedResult = await ocrFactory.performOCR(images, {
  language: 'eng',
  confidenceThreshold: 80,
  outputFormat: 'json'  // Returns detections with bounding boxes
});

// Access individual text detections
detailedResult.detections?.forEach(detection => {
  console.log(`Text: "${detection.text}"`);
  console.log(`Confidence: ${detection.confidence}%`);

  if (detection.boundingBox) {
    const bbox = detection.boundingBox;
    console.log(`Position: (${bbox.x}, ${bbox.y})`);
    console.log(`Size: ${bbox.width}x${bbox.height}`);
  }
});

// Check processing metadata
console.log('Provider used:', detailedResult.metadata?.provider);
console.log('Processing time:', detailedResult.metadata?.processingTime + 'ms');
```

## Provider Comparison

### ONNX (PaddleOCR PP-OCRv4)
- **Environment**: Node.js only
- **Accuracy**: Highest (90%+)
- **Speed**: Fast (after initialization)
- **Languages**: 7 core (eng, chi_sim, chi_tra, jpn, kor, fra, deu)
- **Best For**: Production, high-accuracy needs, scanned documents

### Tesseract.js
- **Environment**: Node.js + Browser
- **Accuracy**: Good (70-85%)
- **Speed**: Moderate
- **Languages**: 100+ with auto-download
- **Best For**: Multi-language, cross-platform, development

### Web OCR
- **Environment**: Browser only
- **Accuracy**: Good (70-85%)
- **Speed**: Moderate
- **Languages**: 100+
- **Best For**: Client-side processing, privacy-sensitive apps

## Error Handling

```typescript
import {
  OCRError,
  OCRDependencyError,
  OCRProcessingError
} from '@happyvertical/ocr';

try {
  const result = await ocrFactory.performOCR(images);
} catch (error) {
  if (error instanceof OCRDependencyError) {
    console.error('OCR dependencies missing:', error.message);
    // Handle missing Tesseract.js or ONNX runtime
  } else if (error instanceof OCRProcessingError) {
    console.error('OCR processing failed:', error.message);
    // Handle corrupted image, timeout, etc.
  } else if (error instanceof OCRError) {
    console.error('OCR error:', error.message);
  }
}
```

## Cleanup Resources

```typescript
// Always cleanup when done (especially important for ONNX and Tesseract workers)
try {
  const result = await ocrFactory.performOCR(images);
  console.log('OCR completed:', result.text);
} finally {
  await ocrFactory.cleanup();  // Terminates workers, frees memory
}
```

*Full documentation coming soon...*
