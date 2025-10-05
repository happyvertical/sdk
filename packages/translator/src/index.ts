/**
 * Translator package entry point
 * Provides standardized translation interface
 */

import type {
  DeepLOptions,
  GoogleTranslateOptions,
  ITranslationProvider,
  ITranslator,
  LanguageDetectionResult,
  LibreTranslateOptions,
  SupportedLanguage,
  TranslationResult,
  TranslatorOptions,
} from './shared/types';

// Export all types
export * from './shared/types';
export * from './shared/utils';

/**
 * Type guard for Google Translate options
 */
function isGoogleTranslateOptions(
  options: TranslatorOptions,
): options is GoogleTranslateOptions {
  return options.provider === 'google';
}

/**
 * Type guard for DeepL options
 */
function isDeepLOptions(options: TranslatorOptions): options is DeepLOptions {
  return options.provider === 'deepl';
}

/**
 * Type guard for LibreTranslate options
 */
function isLibreTranslateOptions(
  options: TranslatorOptions,
): options is LibreTranslateOptions {
  return options.provider === 'libretranslate';
}

/**
 * Translator wrapper class that adds templateFunction to providers
 */
class TranslatorWrapper implements ITranslator {
  constructor(private provider: ITranslationProvider) {}

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
 * @param options - Configuration options for the translation provider
 * @returns Promise resolving to a translator that implements ITranslator
 *
 * @example
 * ```typescript
 * // Create Google Translate translator
 * const translator = await getTranslator({
 *   provider: 'google',
 *   apiKey: process.env.GOOGLE_TRANSLATE_API_KEY!
 * });
 *
 * // Create DeepL translator
 * const deeplTranslator = await getTranslator({
 *   provider: 'deepl',
 *   apiKey: process.env.DEEPL_API_KEY!
 * });
 *
 * // Create LibreTranslate translator
 * const libreTranslator = await getTranslator({
 *   provider: 'libretranslate'
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
  options: TranslatorOptions,
): Promise<ITranslator> {
  let provider: ITranslationProvider;

  if (isGoogleTranslateOptions(options)) {
    const { GoogleTranslateProvider } = await import('./providers/google.js');
    provider = new GoogleTranslateProvider(options);
  } else if (isDeepLOptions(options)) {
    const { DeepLProvider } = await import('./providers/deepl.js');
    provider = new DeepLProvider(options);
  } else if (isLibreTranslateOptions(options)) {
    const { LibreTranslateProvider } = await import(
      './providers/libretranslate.js'
    );
    provider = new LibreTranslateProvider(options);
  } else {
    // This should never happen due to TypeScript's discriminated union
    throw new Error(`Unsupported provider: ${(options as any).provider}`);
  }

  return new TranslatorWrapper(provider);
}
