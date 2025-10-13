import { ITranslator, TranslatorOptions } from './shared/types';
export * from './shared/types';
export * from './shared/utils';
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
export declare function getTranslator(options: TranslatorOptions): Promise<ITranslator>;
//# sourceMappingURL=index.d.ts.map