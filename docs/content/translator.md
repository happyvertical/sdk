---
id: translator
title: "@happyvertical/translator: Translation Services"
sidebar_label: "@happyvertical/translator"
sidebar_position: 11
---

# @happyvertical/translator

Standardized translation interface supporting multiple providers (Google Translate, DeepL, LibreTranslate).

## Features

- 🌍 **Multi-Provider Support**: Google Translate, DeepL, and LibreTranslate with unified API
- 🎯 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔄 **Translation**: Translate text between languages with auto-detection
- 🔍 **Language Detection**: Identify the language of any text
- 📦 **Batch Operations**: Translate multiple texts in one request
- ⚡ **Template Function**: Create reusable translation functions
- 🎨 **Factory Pattern**: Clean provider initialization with type guards

## Installation

```bash
npm install @happyvertical/translator
# or
pnpm add @happyvertical/translator
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-translator-context
```

This copies the package's `CLAUDE.md` documentation and `.claude-meta.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Quick Start

### Using Environment Variables (Recommended)

The translator package supports configuration via environment variables using the `HAVE_TRANSLATOR_*` pattern:

```bash
# Set the provider
export HAVE_TRANSLATOR_PROVIDER=deepl

# Provider-specific API keys
export DEEPL_API_KEY=your_deepl_api_key_here

# Optional: Additional configuration
export HAVE_TRANSLATOR_TIMEOUT=60000
export HAVE_TRANSLATOR_MAX_RETRIES=3
```

```typescript
import { getTranslator } from '@happyvertical/translator';

// No options needed - uses environment variables
const translator = await getTranslator();

const result = await translator.translate('Hello, world!', 'es');
console.log(result.translatedText); // "¡Hola, mundo!"
```

### Using Explicit Options

You can also pass configuration explicitly (which takes precedence over environment variables):

#### Google Translate

```typescript
import { getTranslator } from '@happyvertical/translator';

const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!
});

const result = await translator.translate('Hello, world!', 'es');
console.log(result.translatedText); // "¡Hola, mundo!"
```

#### DeepL

```typescript
const translator = await getTranslator({
  provider: 'deepl',
  apiKey: process.env.DEEPL_API_KEY!,
  freeApi: false // Use pro API
});

const result = await translator.translate('Hello', 'fr', 'en');
console.log(result.translatedText); // "Bonjour"
```

#### LibreTranslate

```typescript
const translator = await getTranslator({
  provider: 'libretranslate'
});

const result = await translator.translate('Hola', 'en');
console.log(result.translatedText); // "Hello"
```

### Mixing Environment Variables and Options

Environment variables and explicit options can be mixed. Explicit options always take precedence:

```bash
export HAVE_TRANSLATOR_PROVIDER=google
export HAVE_TRANSLATOR_TIMEOUT=30000
```

```typescript
// Provider from env, custom timeout from options
const translator = await getTranslator({
  timeout: 60000 // Overrides HAVE_TRANSLATOR_TIMEOUT
});
```

## Template Function - The Key Feature

Create pre-configured translation functions for clean, ergonomic code:

```typescript
const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!
});

// Create a translation function for your site's language
const t = translator.templateFunction('en', 'es');

// Use it throughout your app
const greeting = await t('Hello, world!'); // "¡Hola, mundo!"
const farewell = await t('Goodbye!'); // "¡Adiós!"
const welcome = await t('Welcome'); // "Bienvenido"

// Auto-detect source language
const tAuto = translator.templateFunction(undefined, 'fr');
await tAuto('Hello'); // "Bonjour"
await tAuto('Hola'); // "Bonjour"

// Web app example
async function setupTranslations(userLang: string) {
  const t = translator.templateFunction('en', userLang);
  
  return {
    nav: {
      home: await t('Home'),
      settings: await t('Settings'),
    },
    messages: {
      welcome: await t('Welcome back!'),
    }
  };
}
```

## API Reference

### `getTranslator(options?)`

Factory function to create a translator instance.

**Parameters:**
- `options` (optional): Configuration object. If omitted, uses environment variables.

**Environment Variables:**

The following environment variables are supported:

```bash
# Core Configuration (HAVE_TRANSLATOR_* pattern)
HAVE_TRANSLATOR_PROVIDER=google|deepl|libretranslate  # Required (or pass in options)
HAVE_TRANSLATOR_TIMEOUT=30000                          # Optional: Request timeout in ms
HAVE_TRANSLATOR_MAX_RETRIES=3                          # Optional: Max retry attempts

# Provider-Specific API Keys (backward compatible)
GOOGLE_TRANSLATE_API_KEY=your_google_api_key           # For Google Translate
DEEPL_API_KEY=your_deepl_api_key                       # For DeepL

# Provider-Specific Options (use explicit options instead)
# These use the HAVE_TRANSLATOR_* prefix and snake_case → camelCase conversion
HAVE_TRANSLATOR_API_URL=https://custom.libretranslate.com  # LibreTranslate custom instance
HAVE_TRANSLATOR_FREE_API=true                               # DeepL free tier
HAVE_TRANSLATOR_PROJECT_ID=my-gcp-project                   # Google Cloud project ID
```

**Options Object:**

```typescript
// Google Translate
{
  provider: 'google';
  apiKey: string;            // Or set GOOGLE_TRANSLATE_API_KEY
  projectId?: string;
  timeout?: number;          // Or set HAVE_TRANSLATOR_TIMEOUT
  maxRetries?: number;       // Or set HAVE_TRANSLATOR_MAX_RETRIES
}

// DeepL
{
  provider: 'deepl';
  apiKey: string;            // Or set DEEPL_API_KEY
  freeApi?: boolean;
  timeout?: number;          // Or set HAVE_TRANSLATOR_TIMEOUT
  maxRetries?: number;       // Or set HAVE_TRANSLATOR_MAX_RETRIES
}

// LibreTranslate
{
  provider: 'libretranslate';
  apiUrl?: string;           // Or set HAVE_TRANSLATOR_API_URL
  apiKey?: string;
  timeout?: number;          // Or set HAVE_TRANSLATOR_TIMEOUT
  maxRetries?: number;       // Or set HAVE_TRANSLATOR_MAX_RETRIES
}
```

**Configuration Priority:**
1. Explicit options (highest priority)
2. Environment variables (HAVE_TRANSLATOR_*)
3. Provider-specific env vars (GOOGLE_TRANSLATE_API_KEY, DEEPL_API_KEY)
4. Default values (lowest priority)

### ITranslator Interface

```typescript
interface ITranslator {
  translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<LanguageDetectionResult>;
  getSupportedLanguages(): Promise<SupportedLanguage[]>;
  translateBatch(texts: string[], targetLang: string, sourceLang?: string): Promise<TranslationResult[]>;
  templateFunction(sourceLang?: string, targetLang?: string): (text: string) => Promise<string>;
}
```

### TranslationResult

```typescript
interface TranslationResult {
  translatedText: string;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  confidence?: number;
  alternatives?: string[];
  detectedSourceLanguage: boolean;
  raw: any;
}
```

## Error Handling

```typescript
import {
  TranslationError,
  UnsupportedLanguageError,
  QuotaExceededError,
  AuthenticationError,
  InvalidTextError
} from '@happyvertical/translator';

try {
  const result = await translator.translate('Hello', 'es');
} catch (error) {
  if (error instanceof UnsupportedLanguageError) {
    console.error('Language not supported');
  } else if (error instanceof QuotaExceededError) {
    console.error('Translation quota exceeded');
  } else if (error instanceof AuthenticationError) {
    console.error('Authentication failed');
  }
}
```

## Usage Examples

### Batch Translation

```typescript
const texts = ['Hello', 'How are you?', 'Goodbye'];
const results = await translator.translateBatch(texts, 'es');

results.forEach((result, i) => {
  console.log(`${texts[i]} -> ${result.translatedText}`);
});
```

### Language Detection

```typescript
const detection = await translator.detectLanguage('こんにちは');
console.log(detection.language); // "ja"
console.log(detection.confidence); // 0.98
```

### Get Supported Languages

```typescript
const languages = await translator.getSupportedLanguages();
languages.forEach(lang => {
  console.log(`${lang.code}: ${lang.name}`);
});
```

## Provider Comparison

| Feature | Google Translate | DeepL | LibreTranslate |
|---------|-----------------|-------|----------------|
| API Key Required | ✅ Yes | ✅ Yes | ❌ No (optional) |
| Quality | Excellent | Premium | Good |
| Languages | 100+ | 30+ | 30+ |
| Cost | Paid | Paid (free tier) | Free |
| Batch Support | ✅ Yes | ✅ Yes | Sequential |

## Best Practices

### API Key Management
- Store keys securely in environment variables
- Never commit keys to version control
- Use different keys for dev/prod

### Performance
- Use `templateFunction` for repeated translations
- Use batch operations when translating multiple texts
- Consider caching translations

### LibreTranslate
- Public instance may have rate limits
- Consider self-hosting for production
- Read usage policies

## Testing

```bash
# Run all tests
npm test

# Run with API keys
GOOGLE_TRANSLATE_API_KEY=xxx DEEPL_API_KEY=xxx npm test
```

## License

ISC
