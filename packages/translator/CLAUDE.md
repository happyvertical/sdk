# @happyvertical/translator

Translation and language detection with provider abstraction. Factory: `getTranslator(options?)`.

## Providers

- **google** -- Google Cloud Translation API (`GOOGLE_TRANSLATE_API_KEY`)
- **deepl** -- DeepL API, free or pro endpoint (`DEEPL_API_KEY`)
- **libretranslate** -- Self-hosted LibreTranslate (optional `apiKey`, custom `apiUrl`)

## Key patterns

- `templateFunction(sourceLang?, targetLang?)` returns a reusable `(text) => Promise<string>` for repeated translations
- `translateBatch(texts, targetLang)` for bulk operations
- Env-var config via `HAVE_TRANSLATOR_PROVIDER` plus provider-specific API key env vars
- Uses `@happyvertical/cache` for caching and `loadEnvConfig` from `@happyvertical/utils`

## Gotchas

- Factory accepts `Partial<TranslatorOptions>` -- provider can come from env var alone
- DeepL `freeApi` option defaults to `false` (pro endpoint); set `true` for free-tier keys
- LibreTranslate defaults to `https://libretranslate.com` if no `apiUrl` given
- Language codes are ISO 639-1; unsupported codes throw `UnsupportedLanguageError`
