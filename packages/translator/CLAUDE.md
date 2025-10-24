# @happyvertical/translator

## Purpose and Responsibilities

The translator package provides a unified interface for translation services with multiple provider implementations (DeepL, Google Translate, LibreTranslate). It offers both simple one-off translations and ergonomic template functions for localization.

## Key Features

- **Multiple Providers**: DeepL, Google Translate, LibreTranslate
- **Template Functions**: Create typed translation functions for specific languages
- **Batch Translation**: Translate multiple strings efficiently
- **Auto-Detection**: Automatically detect source language
- **Environment Variable Configuration**: Easy setup from env vars

## Architecture Overview

```
Translator Interface
    ├── DeepLTranslator
    ├── GoogleTranslator
    └── LibreTranslateTranslator
```

## Key APIs

### Basic Translation

```typescript
import { getTranslator } from '@happyvertical/translator';

const translator = await getTranslator({ type: 'deepl', apiKey: 'your-key' });

// Translate text
const result = await translator.translate('Hello, world!', 'en', 'es');
console.log(result); // "¡Hola, mundo!"

// Auto-detect source language
const result2 = await translator.translate('Bonjour', 'auto', 'en');
```

### Template Functions (Recommended Pattern)

```typescript
// Create language-specific translation functions
const toSpanish = translator.template('es');
const toFrench = translator.template('fr');
const toGerman = translator.template('de');

// Use them directly
const spanish = await toSpanish('Hello, world!');
const french = await toFrench('Hello, world!');
const german = await toGerman('Hello, world!');
```

### Batch Translation

```typescript
const texts = ['Hello', 'Goodbye', 'Thank you'];
const results = await Promise.all(texts.map(text => toSpanish(text)));
```

## Providers

### DeepL (Recommended)
- High quality translations
- Requires API key (free tier available)
- Supports 30+ languages
```typescript
const translator = await getTranslator({ type: 'deepl', apiKey: 'your-key' });
```

### Google Translate
- Wide language support (100+ languages)
- Free tier available with limitations
```typescript
const translator = await getTranslator({ type: 'google', apiKey: 'your-key' });
```

### LibreTranslate
- Open-source, self-hosted option
- No API key required if self-hosted
```typescript
const translator = await getTranslator({
  type: 'libretranslate',
  apiUrl: 'https://your-instance.com',
  apiKey: 'optional-key'
});
```

## Environment Variable Configuration

```bash
export HAVE_TRANSLATOR_TYPE=deepl
export HAVE_TRANSLATOR_API_KEY=your-deepl-key

# Or for LibreTranslate
export HAVE_TRANSLATOR_TYPE=libretranslate
export HAVE_TRANSLATOR_API_URL=https://libretranslate.com
```

## Dependencies

- **Internal**: None
- **External**:
  - Provider-specific SDKs (deepl-node, @google-cloud/translate, etc.)
  - `node-fetch` for LibreTranslate

## Development Guidelines

- All providers must implement the Translator interface completely
- Source language 'auto' means auto-detection
- Target language must be explicit (never 'auto')
- Return translated text directly, not objects
- Handle rate limits and errors gracefully

## Expert Agent Expertise

When working with translator:

1. **Provider Selection**: DeepL for quality, Google for coverage, LibreTranslate for privacy
2. **Template Pattern**: Use `template()` for repeated translations to same language
3. **Batch Optimization**: Send multiple texts in parallel for better performance
4. **Language Codes**: Use ISO 639-1 codes (en, es, fr, de, etc.)
5. **Error Handling**: Translation failures should degrade gracefully

## Common Patterns

```typescript
// Localization helper
async function localizeContent(content: string, language: string) {
  const cache = await getCache();
  const cacheKey = `translation:${language}:${hash(content)}`;

  // Try cache first
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  // Translate and cache
  const translator = await getTranslator();
  const toLang = translator.template(language);
  const translated = await toLang(content);

  await cache.set(cacheKey, translated, 86400); // 24h TTL
  return translated;
}
```

## Related Packages

- **@happyvertical/cache**: Cache translations to reduce API calls
- **@happyvertical/documents**: May translate extracted content
