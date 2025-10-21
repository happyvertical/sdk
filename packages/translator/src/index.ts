/**
 * Translator package entry point
 * Provides standardized translation interface
 */

import { loadEnvConfig } from '@happyvertical/utils';
import type {
  DeepLOptions,
  GoogleTranslateOptions,
  LanguageDetectionResult,
  LibreTranslateOptions,
  SupportedLanguage,
  TranslationProvider,
  TranslationResult,
  Translator,
  TranslatorOptions,
} from './shared/types';

// Export all types
export * from './shared/types';
export * from './shared/utils';

/**
 * Type guard for Google Translate options
 */
function _isGoogleTranslateOptions(
  options: TranslatorOptions,
): options is GoogleTranslateOptions {
  return options.provider === 'google';
}

/**
 * Type guard for DeepL options
 */
function _isDeepLOptions(options: TranslatorOptions): options is DeepLOptions {
  return options.provider === 'deepl';
}

/**
 * Type guard for LibreTranslate options
 */
function _isLibreTranslateOptions(
  options: TranslatorOptions,
): options is LibreTranslateOptions {
  return options.provider === 'libretranslate';
}

/**
 * Translator wrapper class that adds templateFunction to providers
 */
class TranslatorWrapper implements Translator {
  constructor(private provider: TranslationProvider) {}

  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    return this.provider.translate(text, targetLanguage, sourceLanguage);
  }

  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    return this.provider.detectLanguage(text);
  }

  async getSupportedLanguages(): Promise<SupportedLanguage[]> {
    return this.provider.getSupportedLanguages();
  }

  async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult[]> {
    return this.provider.translateBatch(texts, targetLanguage, sourceLanguage);
  }

  /**
   * Creates a pre-configured translation function
   * This is the key ergonomic feature that makes repeated translations simple
   */
  templateFunction(
    sourceLanguage?: string,
    targetLanguage: string = 'en',
  ): (text: string) => Promise<string> {
    return async (text: string): Promise<string> => {
      const result = await this.provider.translate(
        text,
        targetLanguage,
        sourceLanguage,
      );
      return result.translatedText;
    };
  }
}

/**
 * Factory function to create a translator instance
 *
 * Supports environment variable configuration using HAVE_TRANSLATOR_* pattern:
 * - HAVE_TRANSLATOR_PROVIDER: Translation provider ('google'|'deepl'|'libretranslate')
 *
 * Provider-specific API keys are loaded from their respective environment variables:
 * - GOOGLE_TRANSLATE_API_KEY: Google Translate API key
 * - DEEPL_API_KEY: DeepL API key
 *
 * @param options - Configuration options for the translation provider (optional if using env vars)
 * @returns Promise resolving to a translator that implements Translator
 *
 * @example
 * ```typescript
 * // Using explicit options
 * const translator = await getTranslator({
 *   provider: 'google',
 *   apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!
 * });
 *
 * // Using environment variables
 * // Set: HAVE_TRANSLATOR_PROVIDER=deepl
 * //      DEEPL_API_KEY=your_key_here
 * const translator = await getTranslator();
 *
 * // Mix of env vars and explicit options (explicit takes precedence)
 * // Set: HAVE_TRANSLATOR_PROVIDER=google
 * const translator = await getTranslator({
 *   apiKey: 'explicit_key' // Overrides env var
 * });
 *
 * // Use the translator
 * const result = await translator.translate('Hello, world!', 'es');
 *
 * // Use template function for repeated translations
 * const t = translator.templateFunction('en', 'es');
 * const greeting = await t('Hello');
 * const farewell = await t('Goodbye');
 * ```
 */
export async function getTranslator(
  options: Partial<TranslatorOptions> = {},
): Promise<Translator> {
  // Load configuration from environment variables with user options taking precedence
  const config: Record<string, any> = loadEnvConfig(
    options as Record<string, any>,
    {
      packageName: 'translator',
      schema: {
        provider: 'string',
        timeout: 'number',
        maxRetries: 'number',
      },
      allowUnknown: true,
    },
  );

  // Load provider-specific API keys from their respective env vars
  // This maintains backward compatibility with existing env var patterns
  if (!config.apiKey) {
    if (config.provider === 'google' && process.env.GOOGLE_TRANSLATE_API_KEY) {
      config.apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
    } else if (config.provider === 'deepl' && process.env.DEEPL_API_KEY) {
      config.apiKey = process.env.DEEPL_API_KEY;
    }
  }

  // Validate provider is set
  if (!config.provider) {
    throw new Error(
      'Translation provider not specified. Set HAVE_TRANSLATOR_PROVIDER environment variable or pass provider in options.',
    );
  }

  let provider: TranslationProvider;

  if (config.provider === 'google') {
    const { GoogleTranslateProvider } = await import('./providers/google.js');
    provider = new GoogleTranslateProvider(config as GoogleTranslateOptions);
  } else if (config.provider === 'deepl') {
    const { DeepLProvider } = await import('./providers/deepl.js');
    provider = new DeepLProvider(config as DeepLOptions);
  } else if (config.provider === 'libretranslate') {
    const { LibreTranslateProvider } = await import(
      './providers/libretranslate.js'
    );
    provider = new LibreTranslateProvider(config as LibreTranslateOptions);
  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  return new TranslatorWrapper(provider);
}
