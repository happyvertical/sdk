import { GoogleTranslateOptions, ITranslationProvider, LanguageDetectionResult, SupportedLanguage, TranslationResult } from '../shared/types';
/**
 * Google Translate provider implementation with in-memory caching
 */
export declare class GoogleTranslateProvider implements ITranslationProvider {
    private client;
    private timeout;
    private cache;
    constructor(options: GoogleTranslateOptions);
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
     * Maps Google Translate errors to standardized error types
     */
    private mapError;
}
//# sourceMappingURL=google.d.ts.map