import { ITranslationProvider, LanguageDetectionResult, LibreTranslateOptions, SupportedLanguage, TranslationResult } from '../shared/types';
/**
 * LibreTranslate provider implementation
 */
export declare class LibreTranslateProvider implements ITranslationProvider {
    private baseUrl;
    private apiKey?;
    private timeout;
    constructor(options: LibreTranslateOptions);
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
     * Note: LibreTranslate doesn't have native batch support,
     * so we translate texts sequentially
     */
    translateBatch(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult[]>;
    /**
     * Makes an HTTP request to LibreTranslate API
     */
    private fetchLibreTranslate;
    /**
     * Maps LibreTranslate errors to standardized error types
     */
    private mapError;
}
//# sourceMappingURL=libretranslate.d.ts.map