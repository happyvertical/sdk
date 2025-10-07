# Translator Package Specification

## Overview

The Translator package provides a standardized interface for interacting with various translation service providers (e.g., Google Translate, DeepL, LibreTranslate). It abstracts the provider-specific implementations, allowing consuming packages to use a consistent API for language translation and detection.

The primary goal is to translate text between languages and detect source languages, returning a rich, standardized `TranslationResult` object in return.

## Core Concepts

- **Translator**: The main entry point and public interface of the package. It is initialized with a specific provider and orchestrates the translation operations.
- **Provider**: An adapter that conforms to the `ITranslationProvider` interface. Each provider is responsible for communicating with a specific backend service (e.g., Google Translate API) and transforming the response into the standardized `TranslationResult` format.
- **TranslationResult**: A standardized data structure representing a translation operation. It contains the translated text, source and target languages, confidence scores, and alternative translations when available.

## Data Models

### TranslationResult

This is the standardized object returned from any translation.

```typescript
interface TranslationResult {
  // The translated text.
  translatedText: string;

  // The original source text.
  sourceText: string;

  // The detected or specified source language (ISO 639-1 code).
  sourceLanguage: string;

  // The target language (ISO 639-1 code).
  targetLanguage: string;

  // Confidence score for the translation (0-1), if available.
  confidence?: number;

  // Alternative translations, if available.
  alternatives?: string[];

  // Whether the source language was automatically detected.
  detectedSourceLanguage: boolean;

  // The original, raw response from the provider.
  // Useful for debugging or accessing provider-specific data.
  raw: any;
}
```

### LanguageDetectionResult

This is the standardized object returned from language detection.

```typescript
interface LanguageDetectionResult {
  // The detected language (ISO 639-1 code).
  language: string;

  // Confidence score for the detection (0-1).
  confidence: number;

  // Alternative detected languages with confidence scores, if available.
  alternatives?: Array<{
    language: string;
    confidence: number;
  }>;

  // The original, raw response from the provider.
  raw: any;
}
```

### SupportedLanguage

This represents a language supported by the provider.

```typescript
interface SupportedLanguage {
  // ISO 639-1 language code (e.g., 'en', 'es', 'fr').
  code: string;

  // Human-readable language name in English.
  name: string;

  // Native name of the language (optional).
  nativeName?: string;
}
```

## Provider Interface

All providers must implement this interface.

```typescript
interface ITranslationProvider {
  /**
   * Translates text from source language to target language.
   * @param text The text to translate.
   * @param targetLanguage The target language code (ISO 639-1).
   * @param sourceLanguage Optional source language code. If not provided, auto-detect.
   * @returns A promise that resolves to a TranslationResult object.
   */
  translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult>;

  /**
   * Detects the language of the provided text.
   * @param text The text to analyze.
   * @returns A promise that resolves to a LanguageDetectionResult object.
   */
  detectLanguage(text: string): Promise<LanguageDetectionResult>;

  /**
   * Gets the list of languages supported by this provider.
   * @returns A promise that resolves to an array of SupportedLanguage objects.
   */
  getSupportedLanguages(): Promise<SupportedLanguage[]>;

  /**
   * Translates multiple texts in a single batch operation.
   * @param texts Array of texts to translate.
   * @param targetLanguage The target language code (ISO 639-1).
   * @param sourceLanguage Optional source language code. If not provided, auto-detect.
   * @returns A promise that resolves to an array of TranslationResult objects.
   */
  translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult[]>;
}
```

## Public API

The primary way to interact with this package is through the `getTranslator` factory function.

### `getTranslator(options)`

This function returns a standardized Translator that conforms to the `ITranslator` interface, based on the provided options.

```typescript
// The interface of the returned translator.
// Note: This extends the ITranslationProvider interface with convenience methods.
interface ITranslator {
  translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<LanguageDetectionResult>;
  getSupportedLanguages(): Promise<SupportedLanguage[]>;
  translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult[]>;

  /**
   * Creates a pre-configured translation function for repeated translations.
   * @param sourceLanguage Optional source language code (ISO 639-1). If undefined, auto-detects.
   * @param targetLanguage Optional target language code (ISO 639-1). Defaults to 'en'.
   * @returns A function that translates text with the pre-configured languages.
   */
  templateFunction(
    sourceLanguage?: string,
    targetLanguage?: string
  ): (text: string) => Promise<string>;
}

// Configuration options for the factory function.
// This allows for selecting and configuring the desired provider.
type TranslatorOptions =
  | {
      provider: 'google';
      apiKey: string;
      projectId?: string;
    }
  | {
      provider: 'deepl';
      apiKey: string;
      freeApi?: boolean; // Whether to use free or pro API endpoint
    }
  | {
      provider: 'libretranslate';
      apiUrl?: string; // Custom instance URL
      apiKey?: string; // Optional for some instances
    };

function getTranslator(options: TranslatorOptions): ITranslator;
```

### Example Usage

This demonstrates how other packages would use the `getTranslator` factory.

```typescript
import { getTranslator } from '@have/translator';

// The translator is created by calling the factory with the desired provider and config.
const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
});

async function translateContent(text: string, targetLang: string) {
  try {
    const result = await translator.translate(text, targetLang);

    console.log('Original:', result.sourceText);
    console.log('Translated:', result.translatedText);
    console.log('From:', result.sourceLanguage);
    console.log('To:', result.targetLanguage);

    if (result.alternatives && result.alternatives.length > 0) {
      console.log('Alternatives:', result.alternatives);
    }

    // Here, consuming packages could save the translation
    // db.translations.create({ ...result });
  } catch (error) {
    console.error('Translation failed:', error);
  }
}

// Translate with auto-detection
await translateContent('Hello, world!', 'es');

// Translate with explicit source language
const result = await translator.translate('Bonjour le monde', 'en', 'fr');
console.log(result.translatedText); // "Hello world"

// Detect language
const detection = await translator.detectLanguage('こんにちは');
console.log(detection.language); // "ja"
console.log(detection.confidence); // 0.98

// Get supported languages
const languages = await translator.getSupportedLanguages();
languages.forEach(lang => {
  console.log(`${lang.code}: ${lang.name} (${lang.nativeName})`);
});

// Batch translation
const texts = [
  'Hello',
  'How are you?',
  'Goodbye'
];
const results = await translator.translateBatch(texts, 'es');
results.forEach((result, i) => {
  console.log(`${texts[i]} -> ${result.translatedText}`);
});
```

### Template Function - Convenient Repeated Translations

The `templateFunction` method creates a pre-configured translation function that's perfect for repeated translations with the same language pair. This is especially useful in web applications where you want to translate multiple strings to a user's preferred language.

```typescript
import { getTranslator } from '@have/translator';

const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
});

// Create a translation function for Spanish site
const translate = translator.templateFunction('en', 'es');

// Use it like a simple function throughout your app
const greeting = await translate('Hello, world!'); // "Hola, mundo!"
const farewell = await translate('Goodbye!'); // "¡Adiós!"
const welcome = await translate('Welcome'); // "Bienvenido"

// Auto-detect source language (undefined as first parameter)
const translateToFrench = translator.templateFunction(undefined, 'fr');
const result1 = await translateToFrench('Hola'); // Detects Spanish: "Bonjour"
const result2 = await translateToFrench('Hello'); // Detects English: "Bonjour"
const result3 = await translateToFrench('Ciao'); // Detects Italian: "Bonjour"

// Default to English target (second parameter defaults to 'en')
const translateToEnglish = translator.templateFunction('ja');
const english = await translateToEnglish('こんにちは'); // "Hello"

// Real-world web app example
async function setupSiteTranslations(userLanguage: string) {
  // Create a translation function bound to user's language preference
  const t = translator.templateFunction('en', userLanguage);

  // Use throughout the application
  return {
    navigation: {
      home: await t('Home'),
      about: await t('About'),
      contact: await t('Contact'),
      settings: await t('Settings'),
    },
    messages: {
      welcome: await t('Welcome back!'),
      logout: await t('Logout'),
      save: await t('Save'),
      cancel: await t('Cancel'),
    },
  };
}

// Usage in a web application
const userLang = 'ja'; // From user preferences
const translations = await setupSiteTranslations(userLang);
console.log(translations.navigation.home); // "ホーム"
console.log(translations.messages.welcome); // "お帰りなさい！"
```

**Benefits of Template Function:**
- **Concise**: No need to repeat language codes for every translation
- **Performance**: Can be cached and reused throughout the application lifecycle
- **Clean Code**: Reads more naturally as `translate(text)` instead of `translate(text, 'es', 'en')`
- **Type Safe**: Returns a strongly-typed function
- **Flexible**: Supports auto-detection and defaults for common use cases

## Future Work

- **Additional Providers**: Implement providers for other services like Microsoft Translator, Amazon Translate, OpenAI GPT translation, etc.
- **Caching**: Implement a caching layer (e.g., Redis) to reduce redundant API calls to providers and improve performance.
- **Glossaries**: Add support for custom glossaries and terminology management.
- **Formality Control**: Support formality levels (formal/informal) where providers support it (e.g., DeepL).
- **Document Translation**: Extend the interface to support document translation (PDF, HTML, etc.).
- **Translation Memory**: Implement translation memory for consistent terminology across translations.
- **Quality Estimation**: Add quality estimation and confidence scoring across all providers.
- **Language Pairs**: Optimize for specific language pair support and limitations.
- **Character/Token Counting**: Add utilities to estimate translation costs before making requests.
