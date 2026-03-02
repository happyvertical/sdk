# @happyvertical/translator

Standardized translation interface supporting Google Translate, DeepL, and LibreTranslate. Uses a factory/adapter pattern with a unified `Translator` interface across all providers. Google and DeepL providers include automatic in-memory caching via `@happyvertical/cache`.

## Installation

```bash
pnpm add @happyvertical/translator
# Requires GitHub Packages registry for @happyvertical scope
```

## Quick Start

### Environment Variables

```bash
export HAVE_TRANSLATOR_PROVIDER=deepl
export DEEPL_API_KEY=your_key
```

```typescript
import { getTranslator } from '@happyvertical/translator';

const translator = await getTranslator();
const result = await translator.translate('Hello, world!', 'es');
console.log(result.translatedText); // "¡Hola, mundo!"
```

### Explicit Options

```typescript
// Google Translate
const translator = await getTranslator({
  provider: 'google',
  apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!,
});

// DeepL
const translator = await getTranslator({
  provider: 'deepl',
  apiKey: process.env.DEEPL_API_KEY!,
  freeApi: true,
});

// LibreTranslate (no API key required for public instances)
const translator = await getTranslator({
  provider: 'libretranslate',
  apiUrl: 'https://libretranslate.com',
});
```

## Template Function

Create pre-configured translation functions for repeated use:

```typescript
const t = translator.templateFunction('en', 'es');

const greeting = await t('Hello, world!'); // "¡Hola, mundo!"
const farewell = await t('Goodbye!');       // "¡Adiós!"
```

## API

### `getTranslator(options?): Promise<Translator>`

Factory function. Reads `HAVE_TRANSLATOR_*` environment variables, merged with explicit options (explicit wins).

### `Translator` Interface

```typescript
interface Translator {
  translate(text: string, targetLang: string, sourceLang?: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<LanguageDetectionResult>;
  getSupportedLanguages(): Promise<SupportedLanguage[]>;
  translateBatch(texts: string[], targetLang: string, sourceLang?: string): Promise<TranslationResult[]>;
  templateFunction(sourceLang?: string, targetLang?: string): (text: string) => Promise<string>;
}
```

### `TranslationResult`

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

### `LanguageDetectionResult`

```typescript
interface LanguageDetectionResult {
  language: string;
  confidence: number;
  alternatives?: Array<{ language: string; confidence: number }>;
  raw: any;
}
```

### Error Classes

All extend `TranslationError`:

- `TranslationError` — base error with `code` and `provider` fields
- `UnsupportedLanguageError` — invalid language code
- `QuotaExceededError` — provider quota limit hit
- `AuthenticationError` — bad or missing API key
- `InvalidTextError` — empty or invalid input text

### Environment Variables

| Variable | Description |
|----------|-------------|
| `HAVE_TRANSLATOR_PROVIDER` | `google`, `deepl`, or `libretranslate` |
| `HAVE_TRANSLATOR_TIMEOUT` | Request timeout in ms |
| `HAVE_TRANSLATOR_MAX_RETRIES` | Max retry attempts |
| `HAVE_TRANSLATOR_API_URL` | LibreTranslate instance URL |
| `HAVE_TRANSLATOR_FREE_API` | DeepL free tier (`true`/`false`) |
| `HAVE_TRANSLATOR_PROJECT_ID` | Google Cloud project ID |
| `GOOGLE_TRANSLATE_API_KEY` | Google Translate API key |
| `DEEPL_API_KEY` | DeepL API key |

### Utility Exports

- `LANGUAGE_NAMES` — map of ISO 639-1 codes to English names
- `isValidLanguageCode(code)` — validates 2-letter language codes
- `getLanguageName(code)` — looks up language name from code
- `normalizeConfidence(score)` — normalizes scores to 0–1 range
- `isValidText(text)` — checks text is non-empty
- `truncateText(text, maxLength)` — truncates with ellipsis

## License

ISC
