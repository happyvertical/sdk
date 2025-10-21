/**
 * DeepL provider implementation
 */

import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import * as deepl from 'deepl-node';
import type {
  DeepLOptions,
  LanguageDetectionResult,
  SupportedLanguage,
  TranslationProvider,
  TranslationResult,
} from '../shared/types';
import {
  AuthenticationError,
  InvalidTextError,
  QuotaExceededError,
  TranslationError,
  UnsupportedLanguageError,
} from '../shared/types';
import { isValidText } from '../shared/utils';

/**
 * DeepL provider implementation with in-memory caching
 */
export class DeepLProvider implements TranslationProvider {
  private client: deepl.Translator;
  private timeout: number;
  private cache: CacheAdapter | null = null;

  constructor(options: DeepLOptions) {
    this.client = new deepl.Translator(options.apiKey, {
      serverUrl: options.freeApi ? 'https://api-free.deepl.com' : undefined,
    });
    this.timeout = options.timeout || 30000;

    // Initialize memory cache asynchronously
    this.initCache();
  }

  /**
   * Initializes the memory cache for translation results
   */
  private async initCache(): Promise<void> {
    try {
      this.cache = await getCache({
        provider: 'memory',
        namespace: 'translator:deepl',
        defaultTTL: 3600, // 1 hour cache
        maxSize: 10 * 1024 * 1024, // 10MB
        maxEntries: 1000,
        evictionPolicy: 'lru',
      });
    } catch (error) {
      // Cache initialization failure shouldn't break the provider
      console.warn('Failed to initialize translation cache:', error);
    }
  }

  /**
   * Generates a cache key for translation requests
   */
  private getCacheKey(type: string, ...parts: string[]): string {
    return `${type}:${parts.join(':')}`;
  }

  /**
   * Translates text from source language to target language
   */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult> {
    if (!isValidText(text)) {
      throw new InvalidTextError('Text cannot be empty', 'deepl');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(
      'translate',
      text,
      sourceLanguage || 'auto',
      targetLanguage,
    );
    if (this.cache) {
      const cached = await this.cache.get<TranslationResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const result = await this.client.translateText(
        text,
        (sourceLanguage as any) || null,
        targetLanguage as any,
      );

      const translationResult: TranslationResult = {
        translatedText: result.text,
        sourceText: text,
        sourceLanguage: result.detectedSourceLang.toLowerCase(),
        targetLanguage: targetLanguage.toLowerCase(),
        detectedSourceLanguage: !sourceLanguage,
        raw: result,
      };

      // Cache the result
      if (this.cache) {
        await this.cache.set(cacheKey, translationResult);
      }

      return translationResult;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Detects the language of the provided text
   * Note: DeepL doesn't have a dedicated language detection API,
   * so we translate to English and use the detected source language
   */
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    if (!isValidText(text)) {
      throw new InvalidTextError('Text cannot be empty', 'deepl');
    }

    // Check cache first
    const cacheKey = this.getCacheKey('detect', text);
    if (this.cache) {
      const cached = await this.cache.get<LanguageDetectionResult>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Translate to English to get source language detection
      const result = await this.client.translateText(
        text,
        null,
        'en-US' as any,
      );

      const detectionResult: LanguageDetectionResult = {
        language: result.detectedSourceLang.toLowerCase(),
        confidence: 1.0, // DeepL doesn't provide confidence scores
        raw: result,
      };

      // Cache the result
      if (this.cache) {
        await this.cache.set(cacheKey, detectionResult);
      }

      return detectionResult;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Gets the list of languages supported by this provider
   */
  async getSupportedLanguages(): Promise<SupportedLanguage[]> {
    // Check cache first (this data rarely changes)
    const cacheKey = this.getCacheKey('languages');
    if (this.cache) {
      const cached = await this.cache.get<SupportedLanguage[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const [sourceLanguages, targetLanguages] = await Promise.all([
        this.client.getSourceLanguages(),
        this.client.getTargetLanguages(),
      ]);

      // Combine source and target languages, removing duplicates
      const languageMap = new Map<string, SupportedLanguage>();

      for (const lang of sourceLanguages) {
        languageMap.set(lang.code.toLowerCase(), {
          code: lang.code.toLowerCase(),
          name: lang.name,
        });
      }

      for (const lang of targetLanguages) {
        const code = lang.code.toLowerCase();
        if (!languageMap.has(code)) {
          languageMap.set(code, {
            code,
            name: lang.name,
          });
        }
      }

      const result = Array.from(languageMap.values());

      // Cache for longer (24 hours) as language lists rarely change
      if (this.cache) {
        await this.cache.set(cacheKey, result, 86400);
      }

      return result;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Translates multiple texts in a single batch operation
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
  ): Promise<TranslationResult[]> {
    if (texts.length === 0) {
      return [];
    }

    try {
      const results = await this.client.translateText(
        texts,
        (sourceLanguage as any) || null,
        targetLanguage as any,
      );

      const resultsArray = Array.isArray(results) ? results : [results];

      return texts.map((text, index) => {
        const result = resultsArray[index];
        return {
          translatedText: result.text,
          sourceText: text,
          sourceLanguage: result.detectedSourceLang.toLowerCase(),
          targetLanguage: targetLanguage.toLowerCase(),
          detectedSourceLanguage: !sourceLanguage,
          raw: result,
        };
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Maps DeepL errors to standardized error types
   */
  private mapError(error: unknown): TranslationError {
    if (error instanceof deepl.DeepLError) {
      if (error.message.includes('401') || error.message.includes('403')) {
        return new AuthenticationError('deepl');
      }

      if (error.message.includes('429') || error.message.includes('quota')) {
        return new QuotaExceededError('deepl');
      }

      if (
        error.message.includes('language') ||
        error.message.includes('not supported')
      ) {
        const match = error.message.match(/language[:\s]+([a-z-]+)/i);
        const language = match ? match[1] : 'unknown';
        return new UnsupportedLanguageError(language, 'deepl');
      }

      return new TranslationError(error.message, 'DEEPL_ERROR', 'deepl');
    }

    const err = error as any;
    return new TranslationError(
      err?.message || 'Translation failed',
      err?.code || 'UNKNOWN_ERROR',
      'deepl',
    );
  }
}
