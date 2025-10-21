---
id: translator
title: "@happyvertical/translator: Translation Services"
sidebar_label: "@happyvertical/translator"
sidebar_position: 13
---

# @happyvertical/translator: Translation Services

Standardized translation interface supporting Google Translate, DeepL, and LibreTranslate.

## Overview

The `@happyvertical/translator` package provides unified access to translation services across multiple providers:

- **🌍 Multi-Provider Support**: Google Translate, DeepL, and LibreTranslate
- **🔄 Auto-Detection**: Automatic source language detection
- **📝 Batch Translation**: Translate multiple texts efficiently
- **🎯 High Accuracy**: Provider-specific optimizations for quality
- **🔒 Type Safety**: Full TypeScript support with standardized results
- **⚡ Performance**: Built-in caching support via @happyvertical/cache

## Quick Start

```typescript
import { getTranslator } from '@happyvertical/translator';

// Create Google Translate client
const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!,
  projectId: 'my-project'  // Optional
});

// Translate with auto-detection
const result = await translator.translate('Hello, world!', 'es');

console.log('Original:', result.sourceText);      // "Hello, world!"
console.log('Translated:', result.translatedText); // "¡Hola, mundo!"
console.log('From:', result.sourceLanguage);       // "en"
console.log('To:', result.targetLanguage);         // "es"
console.log('Confidence:', result.confidence);     // 0.98
```

## Provider Configuration

```typescript
// Google Translate
const googleTranslator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!,
  projectId: 'my-project'  // Optional
});

// DeepL
const deeplTranslator = await getTranslator({
  provider: 'deepl',
  apiKey: process.env.DEEPL_API_KEY!,
  freeApi: true  // Use free tier endpoint
});

// LibreTranslate
const libreTranslator = await getTranslator({
  provider: 'libretranslate',
  apiUrl: 'https://libretranslate.com',  // Optional: custom instance
  apiKey: process.env.LIBRETRANSLATE_API_KEY  // Optional
});
```

## Translation with Explicit Source Language

```typescript
// Translate from specific language
const result = await translator.translate(
  'Bonjour le monde',
  'en',    // Target language
  'fr'     // Source language (optional)
);

console.log(result.translatedText); // "Hello world"
console.log(result.detectedSourceLanguage); // false (not auto-detected)
```

## Language Detection

```typescript
// Detect language of text
const detection = await translator.detectLanguage('こんにちは');

console.log('Language:', detection.language);     // "ja"
console.log('Confidence:', detection.confidence); // 0.98

// Check alternative detections
if (detection.alternatives) {
  detection.alternatives.forEach(alt => {
    console.log(`${alt.language}: ${alt.confidence}`);
  });
}
```

## Batch Translation

```typescript
// Translate multiple texts at once
const texts = [
  'Hello',
  'How are you?',
  'Goodbye'
];

const results = await translator.translateBatch(texts, 'es');

results.forEach((result, i) => {
  console.log(`${texts[i]} → ${result.translatedText}`);
});

// Output:
// Hello → Hola
// How are you? → ¿Cómo estás?
// Goodbye → Adiós
```

## Supported Languages

```typescript
// Get list of supported languages
const languages = await translator.getSupportedLanguages();

languages.forEach(lang => {
  console.log(`${lang.code}: ${lang.name}`);
  if (lang.nativeName) {
    console.log(`  Native: ${lang.nativeName}`);
  }
});
```

## Template Function for Repeated Translations

```typescript
// Create a pre-configured translation function
const translateToSpanish = translator.templateFunction('en', 'es');

// Use it like a simple function
const greeting = await translateToSpanish('Hello, world!'); // "¡Hola, mundo!"
const farewell = await translateToSpanish('Goodbye!');      // "¡Adiós!"
const welcome = await translateToSpanish('Welcome');        // "Bienvenido"

// Auto-detect source language
const translateToFrench = translator.templateFunction(undefined, 'fr');
const result1 = await translateToFrench('Hola');   // Detects Spanish → "Bonjour"
const result2 = await translateToFrench('Hello');  // Detects English → "Bonjour"
```

## Translation Result

All translation methods return a standardized `TranslationResult`:

```typescript
interface TranslationResult {
  translatedText: string;      // The translated text
  sourceText: string;          // Original text
  sourceLanguage: string;      // Source language (ISO 639-1)
  targetLanguage: string;      // Target language (ISO 639-1)
  confidence?: number;         // Confidence score (0-1)
  alternatives?: string[];     // Alternative translations
  detectedSourceLanguage: boolean; // True if source was auto-detected
  raw: any;                    // Original provider response
}
```

## Provider Comparison

### Google Translate
- **Strengths**: Excellent quality, 100+ languages, extensive language pairs
- **API Key**: Required (paid with free tier)
- **Best For**: Production apps, high-quality translations

### DeepL
- **Strengths**: Superior quality for European languages, natural phrasing
- **API Key**: Required (free and pro tiers)
- **Best For**: European language pairs, professional translations

### LibreTranslate
- **Strengths**: Free, open-source, self-hostable
- **API Key**: Optional (depends on instance)
- **Best For**: Privacy-sensitive apps, self-hosted solutions

*Full documentation coming soon...*
