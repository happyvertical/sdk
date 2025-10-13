import { DeepLOptions, ITranslationProvider, LanguageDetectionResult, SupportedLanguage, TranslationResult } from '../shared/types';
/**
 * DeepL provider implementation with in-memory caching
 */
export declare class DeepLProvider implements ITranslationProvider {
    private client;
    private timeout;
    private cache;
    constructor(options: DeepLOptions);
    /**
     * Initializes the memory cache for translation results
     */
    private initCache;
    /**
     * Generates a cache key for translation requests
     */
    private getCacheKey;
    /**
     * Translates text from source language to target language
     */
    translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult>;
    /**
     * Detects the language of the provided text
     * Note: DeepL doesn't have a dedicated language detection API,
     * so we translate to English and use the detected source language
     */
    detectLanguage(text: string): Promise<LanguageDetectionResult>;
    /**
     * Gets the list of languages supported by this provider
     */
    getSupportedLanguages(): Promise<SupportedLanguage[]>;
    /**
     * Translates multiple texts in a single batch operation
     */
    translateBatch(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult[]>;
    /**
     * Maps DeepL errors to standardized error types
     */
    private mapError;
}
//# sourceMappingURL=deepl.d.ts.map